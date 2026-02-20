# OAuth Authentication for Zoo Animal MCP Server

This document explains how to use the OAuth 2.1 authentication endpoints that have been added to the streamable MCP server.

## OAuth Configuration

The server now includes the following OAuth endpoints:

- `/authorize` - Authorization endpoint for OAuth flow
- `/token` - Token exchange endpoint
- `/callback` - OAuth callback endpoint (demo)
- `/tokeninfo` - Token information endpoint (for debugging)

## OAuth Flow

### 1. Authorization Request

To start the OAuth flow, redirect users to the authorization endpoint:

```bash
GET /authorize?client_id=zoo-animal-mcp-client&redirect_uri=http://localhost:3000/callback&response_type=code&scope=read_animals%20list_animals&state=test123
```

Parameters:

- `client_id`: The OAuth client ID (default: "zoo-animal-mcp-client")
- `redirect_uri`: Callback URL (default: "http://localhost:3000/callback")
- `response_type`: Must be "code"
- `scope`: Space-separated scopes ("read_animals list_animals")
- `state`: Optional state parameter for security

### 2. Authorization Code Exchange

Exchange the authorization code for an access token:

```bash
curl -X POST "http://localhost:3000/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=YOUR_AUTH_CODE&redirect_uri=http://localhost:3000/callback&client_id=zoo-animal-mcp-client&client_secret=your-client-secret"
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scope": "read_animals list_animals"
}
```

### 3. Using Access Tokens

Include the access token in the Authorization header for all MCP requests:

```bash
curl -X POST "http://localhost:3000/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "id": 1}'
```

### 4. Token Information

Check token information:

```bash
curl -X GET "http://localhost:3000/tokeninfo" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Scopes

The server supports the following scopes:

- `read_animals`: Required for `get_animal_details` tool
- `list_animals`: Required for `get_animals_by_species` tool

## Environment Variables

Configure the OAuth settings using environment variables:

```bash
export OAUTH_CLIENT_ID="your-client-id"
export OAUTH_CLIENT_SECRET="your-client-secret"
export OAUTH_REDIRECT_URI="http://localhost:3000/callback"
export JWT_SECRET="your-jwt-secret-key"
export PORT=3000
```

## Security Features

1. **JWT Tokens**: Access tokens are JWT tokens with expiration
2. **Scope Validation**: Tools check user scopes before execution
3. **Token Expiration**: Access tokens expire after 1 hour
4. **Refresh Tokens**: Long-lived tokens for getting new access tokens
5. **PKCE Support**: Code challenge/verifier for enhanced security

## Production Considerations

1. **Replace In-Memory Storage**: Use a database for production
2. **Secure JWT Secret**: Use a strong, randomly generated secret
3. **HTTPS Only**: Use HTTPS in production
4. **Rate Limiting**: Implement rate limiting on OAuth endpoints
5. **Audit Logging**: Log all authentication events

## Example Complete Flow

```bash
# 1. Get authorization code
curl -L "http://localhost:3000/authorize?client_id=zoo-animal-mcp-client&redirect_uri=http://localhost:3000/callback&response_type=code&scope=read_animals%20list_animals"

# 2. Exchange for tokens (use the code from step 1)
curl -X POST "http://localhost:3000/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=AUTHORIZATION_CODE&redirect_uri=http://localhost:3000/callback&client_id=zoo-animal-mcp-client&client_secret=your-client-secret"

# 3. Use the access token with MCP endpoints
curl -X POST "http://localhost:3000/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "id": 1}'
```

The OAuth implementation follows the Model Context Protocol specification for authentication and provides secure access to the zoo animal tools.
