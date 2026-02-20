// Zoo Animal MCP Server using McpServer with Streamable HTTP transport
// Based on examples from: https://github.com/modelcontextprotocol/typescript-sdk
// This provides the same zoo animal tools but accessible via HTTP endpoints

import { config } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { URLSearchParams } from "url";
import path from "path";
import ZOO_ANIMALS from "./animals.js";

// Load environment variables from .env file
config();

// Create single global MCP server instance
const mcpServer = new McpServer({
  name: "zoo-animal-mcp-server",
  version: "1.0.0",
});

// Tool: get_animals_by_species
mcpServer.registerTool(
  "get_animals_by_species",
  {
    title: "Get Animals by Species",
    description:
      "Retrieves all animals of a specific species from the zoo. Useful for aggregates like counting penguins or finding the oldest lion.",
    inputSchema: {
      species: z
        .string()
        .describe("Species name, e.g., 'lion' or 'penguin'")
        .default("all"),
    },
  },
  async ({ species }, { authInfo }) => {
    console.info(
      `>>> 🛠️ Tool: 'get_animals_by_species' called for '${species}' by user: ${
        authInfo?.userId || "anonymous"
      }`
    );

    // Check if user has required scope
    if (!authInfo?.scopes || !authInfo.scopes.includes("list_animals")) {
      return {
        content: [
          {
            type: "text",
            text: "Unauthorized: User lacks permission to list animals. Required scope: list_animals",
          },
        ],
      };
    }

    // If no species specified or "all", return all animals
    if (!species || species === "all") {
      return {
        content: [{ type: "text", text: JSON.stringify(ZOO_ANIMALS, null, 2) }],
      };
    }

    const matches = ZOO_ANIMALS.filter(
      (animal) => animal.species.toLowerCase() === String(species).toLowerCase()
    );

    return {
      content: [{ type: "text", text: JSON.stringify(matches, null, 2) }],
    };
  }
);

// Tool: get_animal_details
mcpServer.registerTool(
  "get_animal_details",
  {
    title: "Get Animal Details",
    description: "Retrieves the details of a specific animal by its name.",
    inputSchema: {
      name: z.string().describe("Animal name, e.g., 'Leo'").default(""),
    },
  },
  async ({ name }, { authInfo }) => {
    console.info(
      `>>> 🛠️ Tool: 'get_animal_details' called for '${name}' by user: ${
        authInfo?.userId || "anonymous"
      }`
    );

    // Check if user has required scope
    if (!authInfo?.scopes || !authInfo.scopes.includes("read_animals")) {
      return {
        content: [
          {
            type: "text",
            text: "Unauthorized: User lacks permission to read animal details. Required scope: read_animals",
          },
        ],
      };
    }

    // If no name specified, return a helpful message
    if (!name) {
      return {
        content: [
          {
            type: "text",
            text:
              "Please provide an animal name. Available animals: " +
              ZOO_ANIMALS.map((a) => a.name).join(", "),
          },
        ],
      };
    }

    const animal = ZOO_ANIMALS.find(
      (a) => a.name.toLowerCase() === String(name).toLowerCase()
    );

    if (!animal) {
      return {
        content: [
          {
            type: "text",
            text:
              `Animal '${name}' not found. Available animals: ` +
              ZOO_ANIMALS.map((a) => a.name).join(", "),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(animal, null, 2) }],
    };
  }
);

// OAuth Configuration
const OAUTH_CONFIG = {
  clientId: process.env.OAUTH_CLIENT_ID || "zoo-animal-mcp-client",
  clientSecret: process.env.OAUTH_CLIENT_SECRET || "your-client-secret",
  allowedRedirectUris: process.env.ALLOWED_REDIRECT_URIS
    ? process.env.ALLOWED_REDIRECT_URIS.split(",").map((uri) => uri.trim())
    : [
        process.env.OAUTH_REDIRECT_URI || "http://localhost:3000/callback",
        "http://localhost:6274/oauth/callback",
        "http://localhost:6274/oauth/callback/debug",
        // VS Code redirect URIs for development
        "https://vscode.dev/redirect",
        "https://insiders.vscode.dev/redirect",
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:33418",
        "http://127.0.0.1:33418",
        "https://claude.ai/api/mcp/auth_callback",
      ],
  authorizationUrl:
    process.env.AUTHORIZATION_URL || "http://localhost:3000/authorize",
  tokenUrl: process.env.TOKEN_URL || "http://localhost:3000/token",
  scopes: ["read_animals", "list_animals"],
  jwtSecret: process.env.JWT_SECRET || "your-jwt-secret-key",
};

// In-memory storage for OAuth flows (use database in production)
const authorizationCodes = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();
const registeredClients = new Map();

// Create Express app
const app = express();

// CORS middleware to allow cross-origin requests
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, mcp-session-id, mcp-protocol-version"
  );
  res.header("Access-Control-Expose-Headers", "mcp-session-id");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Normalize redirect URIs by trimming trailing slashes for comparison
function normalizeUri(uri) {
  if (!uri || typeof uri !== "string") return uri;
  return uri.replace(/\/+$/, "");
}

// Store active transport sessions
const transports = new Map(); // sessionId -> transport

// Helper to get base URL dynamically
function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

// Helper to create/connect a transport for a session
async function getOrCreateTransport(sessionId) {
  if (transports.has(sessionId)) {
    return transports.get(sessionId);
  }

  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    eventSourceEnabled: true,
  });

  transport.sessionId = sessionId;
  transport.onclose = () => {
    console.log(`🗑️ Transport closed for session: ${sessionId}`);
    transports.delete(sessionId);
  };

  await mcpServer.connect(transport);
  transports.set(sessionId, transport);
  console.log(`✅ Created new transport for session: ${sessionId}`);

  return transport;
}

// OAuth Helper Functions
function generateAuthorizationCode() {
  return randomUUID();
}

function generateAccessToken(userId, scopes) {
  return jwt.sign(
    {
      sub: userId,
      scopes: scopes,
      type: "access_token",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
    },
    OAUTH_CONFIG.jwtSecret
  );
}

function generateRefreshToken(userId) {
  return jwt.sign(
    {
      sub: userId,
      type: "refresh_token",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    },
    OAUTH_CONFIG.jwtSecret
  );
}

function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, OAUTH_CONFIG.jwtSecret);
    if (decoded.type !== "access_token") {
      throw new Error("Invalid token type");
    }
    return decoded;
  } catch (error) {
    return null;
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  req.user = {
    id: decoded.sub,
    scopes: decoded.scopes,
  };
  next();
}

// OAuth Discovery Endpoints

// OAuth Authorization Server Metadata (RFC 8414)
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  console.log(`📋 GET /.well-known/oauth-authorization-server from ${req.ip}`);
  const base = getBaseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    jwks_uri: `${base}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: OAUTH_CONFIG.scopes,
    // Support public clients using PKCE with no client authentication
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    subject_types_supported: ["public"],
  });
});

// OAuth Protected Resource Metadata (RFC 8707)
app.get("/.well-known/oauth-protected-resource", (req, res) => {
  console.log(`📋 GET /.well-known/oauth-protected-resource from ${req.ip}`);
  const base = getBaseUrl(req);
  res.json({
    resource: base,
    authorization_servers: [base],
    scopes_supported: OAUTH_CONFIG.scopes,
    bearer_methods_supported: ["header"],
    resource_documentation: `${base}/`,
  });
});

// MCP-specific OAuth Protected Resource endpoint
app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
  console.log(
    `📋 GET /.well-known/oauth-protected-resource/mcp from ${req.ip}`
  );
  const base = getBaseUrl(req);
  res.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: OAUTH_CONFIG.scopes,
    scopes_required: OAUTH_CONFIG.scopes,
    bearer_methods_supported: ["header"],
    resource_documentation: `${base}/`,
    mcp_capabilities: {
      tools: ["get_animals_by_species", "get_animal_details"],
      protocol_version: "2024-11-05",
    },
  });
});

// OpenID Configuration (for compatibility)
app.get("/.well-known/openid_configuration", (req, res) => {
  console.log(`📋 GET /.well-known/openid_configuration from ${req.ip}`);
  const base = getBaseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    userinfo_endpoint: `${base}/tokeninfo`,
    jwks_uri: `${base}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
    scopes_supported: [...OAUTH_CONFIG.scopes, "openid"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
  });
});

// JWKS endpoint (placeholder - in production, use proper key management)
app.get("/.well-known/jwks.json", (req, res) => {
  console.log(`📋 GET /.well-known/jwks.json from ${req.ip}`);
  res.json({
    keys: [
      {
        kty: "oct",
        use: "sig",
        kid: "mcp-server-key",
        alg: "HS256",
        // Note: In production, never expose the actual secret
        // This is just for demo purposes
      },
    ],
  });
});

// OAuth Authorization Endpoint
app.get("/authorize", (req, res) => {
  console.log(`🔐 GET /authorize from ${req.ip} with params:`, req.query);
  // Serve the login form
  res.sendFile(path.join(process.cwd(), "authorize.html"));
});

// Handle login form submission
app.post("/authorize", express.json(), (req, res) => {
  console.log(
    `🔐 POST /authorize from ${req.ip} - Login attempt for: ${req.body?.username}`
  );

  const {
    username,
    password,
    client_id,
    redirect_uri,
    response_type,
    scope,
    state,
    code_challenge,
    code_challenge_method,
  } = req.body;

  // Validate required parameters
  if (!client_id || !redirect_uri || response_type !== "code") {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing or invalid required parameters",
    });
  }

  // Validate client_id - check both hardcoded config and registered clients
  const isHardcodedClient = client_id === OAUTH_CONFIG.clientId;
  const registeredClient = registeredClients.get(client_id);
  const isRegisteredClient = !!registeredClient;

  if (!isHardcodedClient && !isRegisteredClient) {
    return res.status(400).json({
      error: "invalid_client",
      error_description: "Invalid client_id",
    });
  }

  // For registered clients, validate redirect_uri against client's registered URIs
  if (
    isRegisteredClient &&
    !registeredClient.redirectUris.some((u) => normalizeUri(u) === normalizeUri(redirect_uri))
  ) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: `Invalid redirect_uri for this client. Allowed URIs: ${registeredClient.redirectUris.join(
        ", "
      )}`,
    });
  }

  // For hardcoded client, validate redirect_uri against allowed list
  if (
    isHardcodedClient &&
    !OAUTH_CONFIG.allowedRedirectUris.some((u) => normalizeUri(u) === normalizeUri(redirect_uri))
  ) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: `Invalid redirect_uri. Allowed URIs: ${OAUTH_CONFIG.allowedRedirectUris.join(
        ", "
      )}`,
    });
  }

  // Validate credentials
  const validCredentials = [
    { username: "johndoe", password: "pass" },
    { username: "janedohe", password: "pass" },
  ];

  const isValidUser = validCredentials.some(
    (cred) => cred.username === username && cred.password === password
  );

  if (!isValidUser) {
    console.log(`❌ Invalid login attempt for user: ${username}`);
    return res.status(401).json({
      error: "invalid_credentials",
      error_description: "Invalid username or password",
    });
  }

  console.log(`✅ Valid login for user: ${username}`);

  // Generate authorization code
  const authCode = generateAuthorizationCode();
  const userId = username; // Use username as user ID

  // Store authorization code with PKCE details
  authorizationCodes.set(authCode, {
    clientId: client_id,
    redirectUri: redirect_uri,
    scope: scope || OAUTH_CONFIG.scopes.join(" "),
    userId: userId,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  console.log(
    `✅ Generated authorization code: ${authCode} for user: ${userId}`
  );

  // Return authorization code
  res.json({
    code: authCode,
    state: state,
  });
});

// OAuth Token Endpoint
app.post("/token", (req, res) => {
  console.log(
    `🎫 POST /token from ${req.ip} with grant_type:`,
    req.body?.grant_type
  );
  const {
    grant_type,
    code,
    redirect_uri,
    client_id,
    client_secret,
    code_verifier,
    refresh_token,
  } = req.body;

  console.log("🎫 Token request received:", { grant_type, code, client_id });

  if (grant_type === "authorization_code") {
    // Validate required parameters
    if (!code || !redirect_uri || !client_id) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Missing required parameters",
      });
    }

    // Validate client_id - check both hardcoded config and registered clients
    const isHardcodedClient = client_id === OAUTH_CONFIG.clientId;
    const registeredClient = registeredClients.get(client_id);
    const isRegisteredClient = !!registeredClient;

    if (!isHardcodedClient && !isRegisteredClient) {
      return res.status(400).json({
        error: "invalid_client",
        error_description: "Invalid client_id",
      });
    }

    // Retrieve and validate authorization code first to check PKCE
    const authData = authorizationCodes.get(code);
    if (!authData) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid or expired authorization code",
      });
    }

    // For PKCE flows (public clients), client_secret is optional
    // For non-PKCE flows (confidential clients), client_secret is required
    if (!authData.codeChallenge) {
      // Non-PKCE flow - require client_secret
      const expectedSecret = isRegisteredClient
        ? registeredClient.clientSecret
        : OAUTH_CONFIG.clientSecret;
      if (client_secret !== expectedSecret) {
        return res.status(400).json({
          error: "invalid_client",
          error_description:
            "Invalid client credentials - client_secret required for non-PKCE flows",
        });
      }
    } else {
      // PKCE flow - client_secret is optional but if provided, must be correct
      if (client_secret) {
        const expectedSecret = isRegisteredClient
          ? registeredClient.clientSecret
          : OAUTH_CONFIG.clientSecret;
        if (client_secret !== expectedSecret) {
          return res.status(400).json({
            error: "invalid_client",
            error_description: "Invalid client_secret",
          });
        }
      }
    }

    // Check if code has expired
    if (Date.now() > authData.expiresAt) {
      authorizationCodes.delete(code);
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Authorization code has expired",
      });
    }

    // Validate redirect_uri matches
    if (redirect_uri !== authData.redirectUri) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Redirect URI mismatch",
      });
    }

    // Validate PKCE if used
    if (authData.codeChallenge) {
      if (!code_verifier) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Code verifier required",
        });
      }

      const hash = createHash("sha256")
        .update(code_verifier)
        .digest("base64url");
      if (hash !== authData.codeChallenge) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid code verifier",
        });
      }
    }

    // Generate tokens
    const scopes = authData.scope.split(" ");
    const accessToken = generateAccessToken(authData.userId, scopes);
    const refreshToken = generateRefreshToken(authData.userId);

    // Store tokens
    accessTokens.set(accessToken, {
      userId: authData.userId,
      scopes: scopes,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    refreshTokens.set(refreshToken, {
      userId: authData.userId,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Clean up authorization code (one-time use)
    authorizationCodes.delete(code);

    console.log(`✅ Generated access token for user: ${authData.userId}`);

    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600, // 1 hour
      refresh_token: refreshToken,
      scope: authData.scope,
    });
  } else if (grant_type === "refresh_token") {
    // Handle refresh token
    if (!refresh_token) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Missing refresh token",
      });
    }

    const refreshData = refreshTokens.get(refresh_token);
    if (!refreshData || Date.now() > refreshData.expiresAt) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid or expired refresh token",
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken(
      refreshData.userId,
      OAUTH_CONFIG.scopes
    );
    accessTokens.set(accessToken, {
      userId: refreshData.userId,
      scopes: OAUTH_CONFIG.scopes,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: OAUTH_CONFIG.scopes.join(" "),
    });
  } else {
    res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Grant type not supported",
    });
  }
});

// OAuth Dynamic Client Registration Endpoint
app.post("/register", (req, res) => {
  console.log(`📝 POST /register from ${req.ip} - Client registration request`);
  console.log("📝 Registration request body:", req.body);

  try {
    const {
      redirect_uris,
      client_name,
      client_uri,
      logo_uri,
      scope,
      grant_types,
      response_types,
      token_endpoint_auth_method,
      contacts,
    } = req.body;

    // Validate required parameters
    if (
      !redirect_uris ||
      !Array.isArray(redirect_uris) ||
      redirect_uris.length === 0
    ) {
      return res.status(400).json({
        error: "invalid_request",
        error_description:
          "redirect_uris is required and must be a non-empty array",
      });
    }

    // Validate redirect URIs against allowed list (allow optional trailing slash)
    const allowed = new Set(
      (OAUTH_CONFIG.allowedRedirectUris || []).map((u) => normalizeUri(u))
    );
    const invalidUris = redirect_uris.filter(
      (uri) => !allowed.has(normalizeUri(uri))
    );
    if (invalidUris.length > 0) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: `Invalid redirect URIs: ${invalidUris.join(
          ", "
        )}. Allowed URIs: ${OAUTH_CONFIG.allowedRedirectUris.join(", ")}`,
      });
    }

    // Generate client credentials
    const clientId = randomUUID();
    const clientSecret = randomUUID(); // In production, use a more secure method

    const now = Math.floor(Date.now() / 1000);

    // Store client information
    const clientInfo = {
      clientId,
      clientSecret,
      redirectUris: redirect_uris,
      clientName: client_name || "MCP Client",
      clientUri: client_uri,
      logoUri: logo_uri,
      scope: scope || OAUTH_CONFIG.scopes.join(" "),
      grantTypes: grant_types || ["authorization_code"],
      responseTypes: response_types || ["code"],
      tokenEndpointAuthMethod:
        token_endpoint_auth_method || "client_secret_post",
      contacts: contacts || [],
      clientIdIssuedAt: now,
      clientSecretExpiresAt: 0, // 0 means no expiration
      createdAt: new Date().toISOString(),
    };

    registeredClients.set(clientId, clientInfo);

    console.log(
      `✅ Registered new client: ${clientId} (${client_name || "MCP Client"})`
    );

    // Return client information according to OAuth 2.0 Dynamic Client Registration spec
    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: now,
      client_secret_expires_at: 0, // 0 means no expiration
      redirect_uris: redirect_uris,
      client_name: client_name || "MCP Client",
      client_uri: client_uri,
      logo_uri: logo_uri,
      scope: scope || OAUTH_CONFIG.scopes.join(" "),
      grant_types: grant_types || ["authorization_code"],
      response_types: response_types || ["code"],
      token_endpoint_auth_method:
        token_endpoint_auth_method || "client_secret_post",
      contacts: contacts || [],
    });
  } catch (error) {
    console.error("❌ Error processing registration request:", error);
    res.status(500).json({
      error: "server_error",
      error_description: "Internal server error during client registration",
    });
  }
});

// OAuth Callback Endpoint (for demo purposes)
app.get("/callback", (req, res) => {
  console.log(`🔄 GET /callback from ${req.ip} with params:`, req.query);
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).json({
      error: error,
      error_description: "Authorization failed",
    });
  }

  res.json({
    message: "Authorization successful",
    authorization_code: code,
    state: state,
    next_step: "Exchange this code for an access token at /token endpoint",
  });
});

// Token Info Endpoint (for debugging)
app.get("/tokeninfo", authenticateToken, (req, res) => {
  console.log(`🔍 GET /tokeninfo from ${req.ip} for user: ${req.user?.id}`);
  res.json({
    user_id: req.user.id,
    scopes: req.user.scopes,
    client_id: OAUTH_CONFIG.clientId,
  });
});

// Protected MCP endpoint - now uses single server instance
app.post("/mcp", authenticateToken, async (req, res) => {
  console.log(
    `📨 POST /mcp from ${req.ip} - Method: ${req.body?.method}, Session: ${req.headers["mcp-session-id"]}`
  );
  console.log("📨 Received MCP request:", req.body);

  try {
    const body = req.body;
    const rpcId = body && body.id !== undefined ? body.id : null;

    const headerVal = req.headers["mcp-session-id"];
    const clientSessionId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    const isInit = body && body.method === "initialize";
    let sessionId = clientSessionId;

    if (isInit || !sessionId) {
      sessionId = randomUUID();
    }

    res.setHeader("Mcp-Session-Id", sessionId);

    const transport = await getOrCreateTransport(sessionId);

    // Attach auth info to request for MCP SDK to use
    req.auth = {
      userId: req.user.id,
      scopes: req.user.scopes,
    };

    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error("❌ Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

// Handle GET requests for SSE streams - now requires authentication
app.get("/mcp", authenticateToken, async (req, res) => {
  console.log(
    `📡 GET /mcp (SSE) from ${req.ip} - Session: ${req.headers["mcp-session-id"]}`
  );
  const headerVal = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(headerVal) ? headerVal[0] : headerVal;

  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  console.log(`📡 Establishing SSE stream for session ${sessionId}`);

  const transport = transports.get(sessionId);

  // Attach auth info to request for MCP SDK to use
  req.authInfo = {
    userId: req.user.id,
    scopes: req.user.scopes,
  };

  await transport.handleRequest(req, res);
});

// Handle DELETE requests for session termination - now requires authentication
app.delete("/mcp", authenticateToken, async (req, res) => {
  console.log(
    `🗑️ DELETE /mcp from ${req.ip} - Session: ${req.headers["mcp-session-id"]}`
  );
  const headerVal = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(headerVal) ? headerVal[0] : headerVal;

  if (sessionId && transports.has(sessionId)) {
    console.log(`🗑️ Cleaning up session: ${sessionId}`);
    transports.delete(sessionId);
    res.status(204).end();
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  console.log(`🏥 GET /health from ${req.ip}`);
  res.json({
    status: "healthy",
    server: "zoo-animal-mcp-server",
    version: "1.0.0",
    activeSessions: transports.size,
  });
});

// Registered clients endpoint (for debugging)
app.get("/clients", (req, res) => {
  console.log(`👥 GET /clients from ${req.ip}`);
  const clients = Array.from(registeredClients.entries()).map(
    ([clientId, clientInfo]) => ({
      client_id: clientId,
      client_name: clientInfo.clientName,
      redirect_uris: clientInfo.redirectUris,
      scope: clientInfo.scope,
      created_at: clientInfo.createdAt,
    })
  );

  res.json({
    registered_clients: clients,
    total_count: clients.length,
  });
});

// Server info endpoint
app.get("/", (req, res) => {
  console.log(`ℹ️ GET / from ${req.ip}`);
  const base = getBaseUrl(req);
  res.json({
    name: "Zoo Animal MCP Server",
    version: "1.0.0",
    description:
      "MCP server providing zoo animal tools via Streamable HTTP with Dynamic Client Registration",
    endpoints: {
      mcp: `${base}/mcp`,
      health: `${base}/health`,
      authorize: `${base}/authorize`,
      token: `${base}/token`,
      register: `${base}/register`,
      callback: `${base}/callback`,
      tokeninfo: `${base}/tokeninfo`,
    },
    oauth: {
      authorization_url: `${base}/authorize`,
      token_url: `${base}/token`,
      registration_url: `${base}/register`,
      client_id: OAUTH_CONFIG.clientId,
      scopes: OAUTH_CONFIG.scopes,
      registered_clients: registeredClients.size,
    },
    tools: ["get_animals_by_species", "get_animal_details"],
    activeSessions: transports.size,
    registeredClients: registeredClients.size,
  });
});

// Main function to start the server
async function main() {
  try {
    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      console.log(`🚀 MCP server (Streamable HTTP) started on port ${port}`);
      console.log(`📡 MCP endpoint: http://localhost:${port}/mcp`);
      console.log(`🏥 Health check: http://localhost:${port}/health`);
      console.log(`🔐 OAuth endpoints:`);
      console.log(`   Authorize: http://localhost:${port}/authorize`);
      console.log(`   Token: http://localhost:${port}/token`);
      console.log(`   Register: http://localhost:${port}/register`);
      console.log(`ℹ️  Server info: http://localhost:${port}/`);
    });
  } catch (error) {
    console.error("❌ MCP server failed to start:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down MCP server...");

  // Close all active transports
  for (const [sessionId, transport] of transports) {
    try {
      console.log(`🔄 Closing transport for session ${sessionId}...`);
      await transport.close();
    } catch (error) {
      console.error(
        `❌ Error closing transport for session ${sessionId}:`,
        error
      );
    }
  }

  // Clear the transports map
  transports.clear();

  console.log("✅ Server shutdown complete");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down MCP server...");

  // Close all active transports
  for (const [sessionId, transport] of transports) {
    try {
      console.log(`🔄 Closing transport for session ${sessionId}...`);
      await transport.close();
    } catch (error) {
      console.error(
        `❌ Error closing transport for session ${sessionId}:`,
        error
      );
    }
  }

  // Clear the transports map
  transports.clear();

  console.log("✅ Server shutdown complete");
  process.exit(0);
});

// Start the server
main().catch((err) => {
  console.error("❌ MCP server failed to start:", err);
  process.exit(1);
});

// Catch-all endpoint to log unexpected requests
app.use((req, res, next) => {
  console.log(
    `❓ ${req.method} ${req.path} from ${req.ip} - UNEXPECTED ENDPOINT`
  );
  console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   Body:`, JSON.stringify(req.body, null, 2));
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});
