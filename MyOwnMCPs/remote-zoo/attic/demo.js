import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory stores (demo-only)
const authCodes = new Map(); // code -> { client_id, scope, code_challenge, method, createdAt }
const accessTokens = new Map(); // token -> { client_id, scopes, createdAt }
const transports = new Map(); // sessionId -> transport

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS and exposed headers for MCP
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
  res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Utility: base URL
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// OAuth discovery endpoints
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    authorization_servers: [
      {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
      },
    ],
  });
});

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['demo'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['plain', 'S256'],
  });
});

// Static login page
app.get('/authorize', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'auth.html'));
});

// Simple login handler (form POST)
app.post('/auth', (req, res) => {
  const { username, password, state, redirect_uri, client_id, code_challenge, code_challenge_method } = req.body;
  if (username === 'johndoe' && password === 'pass') {
    const code = uuidv4();
    authCodes.set(code, {
      client_id: client_id || 'demo-client',
      scopes: ['demo'],
      code_challenge: code_challenge || 'demo',
      code_challenge_method: code_challenge_method || 'plain',
      createdAt: Date.now(),
    });

    // Redirect to callback with code and state if provided
    const base = getBaseUrl(req);
    const cb = new URL('/callback', base);
    cb.searchParams.set('code', code);
    if (state) cb.searchParams.set('state', state);
    if (redirect_uri) cb.searchParams.set('redirect_uri', redirect_uri);
    res.redirect(cb.toString());
  } else {
    res.status(401).send('Invalid credentials');
  }
});

// Callback displays the code for manual copy in this demo
app.get('/callback', (req, res) => {
  const { code, state } = req.query;
  if (!code || !authCodes.has(code)) {
    return res.status(400).send('Invalid or missing code.');
  }
  res.type('html').send(
    `<html><body>
      <h2>Login successful</h2>
      <p>Your authorization code is:</p>
      <pre>${code}</pre>
      ${state ? `<p>state: ${state}</p>` : ''}
      <p>Exchange it by POSTing JSON to <code>/token</code> with fields: grant_type=authorization_code, code, code_verifier.</p>
    </body></html>`
  );
});

// Token endpoint: exchange code for token (demo PKCE checks)
app.post('/token', (req, res) => {
  const { grant_type, code, code_verifier } = req.body || {};
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  const codeData = authCodes.get(code);
  if (!codeData) {
    return res.status(400).json({ error: 'invalid_grant' });
  }
  // Minimal PKCE check (plain or S256 not fully implemented for demo)
  const expected = codeData.code_challenge || 'demo';
  if (!code_verifier || code_verifier !== expected) {
    return res.status(401).json({ error: 'invalid_code_verifier' });
  }

  authCodes.delete(code);
  const token = uuidv4();
  accessTokens.set(token, {
    client_id: codeData.client_id,
    scopes: codeData.scopes,
    createdAt: Date.now(),
  });
  res.json({
    token_type: 'Bearer',
    access_token: token,
    scope: codeData.scopes.join(' '),
    expires_in: 60 * 60 * 24, // 24h demo
  });
});

// Dynamic client registration (no-op demo)
app.post('/register', (req, res) => {
  return res.status(201).json({ client_id: uuidv4(), token_endpoint_auth_method: 'none' });
});

// Auth helper
function authenticateToken(req, res, rpcId = null) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const base = getBaseUrl(req);
  if (!token) {
    const www = `Bearer realm="MCP Server", resource_metadata_uri="${base}/.well-known/oauth-protected-resource"`;
    return {
      success: false,
      response: res.status(401).header('WWW-Authenticate', www).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Missing Bearer token' },
        id: rpcId,
      }),
    };
  }
  const tokenData = accessTokens.get(token);
  if (!tokenData) {
    return {
      success: false,
      response: res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Invalid or expired token' },
        id: rpcId,
      }),
    };
  }
  return {
    success: true,
    authObject: { token, clientId: tokenData.client_id || 'demo-client', scopes: tokenData.scopes || [] },
  };
}

// MCP server and tool registration
const mcpServer = new McpServer({
  name: 'oauth-mcp-demo',
  version: '0.1.0',
  instructions: 'Demo MCP server with auth-gated tools.',
});

// Simple tool that requires auth
mcpServer.tool(
  'echo_secret',
  {
    message: { type: 'string', description: 'Message to echo back', nullable: false },
  },
  { description: 'Echoes the message with a secret only if authenticated.' },
  async (params, { authInfo }) => {
    if (!authInfo || !authInfo.token) {
      return { content: [{ type: 'text', text: 'Unauthorized: missing token' }] };
    }
    return {
      content: [
        { type: 'text', text: `secret:42 | client:${authInfo.clientId} | msg:${params.message}` },
      ],
    };
  }
);

// Helper to create/connect a transport
async function getOrCreateTransport(sessionId) {
  if (transports.has(sessionId)) return transports.get(sessionId);
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true, eventSourceEnabled: true });
  transport.sessionId = sessionId;
  transport.onclose = () => transports.delete(sessionId);
  await mcpServer.connect(transport);
  transports.set(sessionId, transport);
  return transport;
}

// MCP endpoint (Streamable HTTP)
app.post('/mcp', async (req, res) => {
  const body = req.body;
  const rpcId = body && body.id !== undefined ? body.id : null;

  const authRes = authenticateToken(req, res, rpcId);
  if (!authRes.success) return authRes.response;
  req.auth = authRes.authObject;

  const headerVal = req.headers['mcp-session-id'];
  const clientSessionId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  const isInit = body && body.method === 'initialize';
  let sessionId = clientSessionId;

  if (isInit || !sessionId) sessionId = uuidv4();
  res.setHeader('Mcp-Session-Id', sessionId);

  try {
    const transport = await getOrCreateTransport(sessionId);
    // Attach auth to transport context via request property understood by SDK (best-effort demo)
    req.authInfo = authRes.authObject;
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: rpcId,
      });
    }
  }
});

// Optional: end session
app.delete('/mcp', (req, res) => {
  const headerVal = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (sessionId && transports.has(sessionId)) {
    transports.delete(sessionId);
    return res.status(204).end();
  }
  return res.status(404).json({ error: 'Session not found' });
});

// Serve static assets
app.use('/static', express.static(path.join(__dirname, 'static')));

app.listen(port, () => {
  console.log(`MCP server running on http://localhost:${port}`);
});
