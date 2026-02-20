# ArXiv Research Server - Authentication Guide

## Overview

The ArXiv Research Server MCP now implements **real user authentication** using OAuth 2.0. Unlike the previous auto-approval system, users must now provide valid credentials to access the server's tools and resources.

## Authentication Method

The server implements OAuth 2.0 Authorization Code Flow with the following features:

- **User Credential Validation**: Real username/password authentication
- **Scope-Based Authorization**: Tools require specific scopes
- **PKCE Support**: For public clients (optional)
- **Dynamic Client Registration**: Clients can register themselves (RFC 7591)
- **JWT Access Tokens**: Secure token-based authentication

## Valid User Credentials

The following demo users are configured in the server:

| Username   | Password      | Scopes                              |
|------------|---------------|-------------------------------------|
| researcher | research123   | read_papers, search_papers          |
| student    | student123    | read_papers, search_papers          |
| admin      | admin123      | read_papers, search_papers          |

> **Note**: In production, these should be stored in a secure database with hashed passwords.

## Available Scopes

- **read_papers**: Required to use the `extract_info` tool
- **search_papers**: Required to use the `search_papers` tool

## OAuth Endpoints

### Authorization Endpoint
```
GET /authorize
```
Serves the login form for user authentication.

**Parameters**:
- `client_id` (required): Client identifier
- `redirect_uri` (required): Callback URL after authorization
- `response_type` (required): Must be "code"
- `scope` (optional): Space-separated list of scopes
- `state` (optional): State parameter for CSRF protection
- `code_challenge` (optional): PKCE code challenge
- `code_challenge_method` (optional): PKCE challenge method (S256)

**Example**:
```
http://localhost:3004/authorize?client_id=arxiv-research-mcp-client&redirect_uri=http://localhost:3004/callback&response_type=code&scope=read_papers%20search_papers&state=xyz
```

### Token Endpoint
```
POST /token
```
Exchanges authorization code for access token.

**Request Body** (Authorization Code Grant):
```json
{
  "grant_type": "authorization_code",
  "code": "authorization-code-here",
  "redirect_uri": "http://localhost:3004/callback",
  "client_id": "arxiv-research-mcp-client",
  "client_secret": "your-client-secret",
  "code_verifier": "pkce-verifier" // Optional, for PKCE
}
```

**Response**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scope": "read_papers search_papers"
}
```

### Dynamic Client Registration
```
POST /register
```
Register a new OAuth client.

**Request Body**:
```json
{
  "redirect_uris": ["http://localhost:3004/callback"],
  "client_name": "My MCP Client",
  "client_uri": "http://localhost:3004",
  "scope": "read_papers search_papers"
}
```

**Response**:
```json
{
  "client_id": "52406b92-b142-4b83-8d15-ef24450ae3e7",
  "client_secret": "29154eb4-f86e-41d2-9ffd-f2e557ee4f23",
  "client_id_issued_at": 1771597295,
  "client_secret_expires_at": 0,
  "redirect_uris": ["http://localhost:3004/callback"],
  "client_name": "My MCP Client",
  "scope": "read_papers search_papers"
}
```

## Using the MCP Endpoint

All MCP requests require authentication via Bearer token:

```http
POST /mcp
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search_papers",
    "arguments": {
      "topic": "quantum computing",
      "max_results": 5
    }
  },
  "id": 1
}
```

## Authorization Flow Example

### Step 1: User Authorization
1. Client redirects user to authorization endpoint
2. User enters credentials in the login form
3. Server validates credentials
4. If valid, server generates authorization code and redirects back to client

### Step 2: Token Exchange
1. Client exchanges authorization code for access token
2. Server validates code and issues access token
3. Client stores access token for future requests

### Step 3: API Access
1. Client includes access token in Authorization header
2. Server validates token and scopes
3. If authorized, server processes the request

## Tool Authorization

Each tool now checks for required scopes:

### search_papers
- **Required Scope**: `search_papers`
- **Error if missing**: "Unauthorized: User lacks permission to search papers. Required scope: search_papers"

### extract_info
- **Required Scope**: `read_papers`
- **Error if missing**: "Unauthorized: User lacks permission to read paper information. Required scope: read_papers"

## Testing Authentication

### Test with cURL

1. **Get Authorization Code** (via login form):
```bash
# Open in browser
http://localhost:3004/authorize?client_id=arxiv-research-mcp-client&redirect_uri=http://localhost:3004/callback&response_type=code
```

2. **Exchange for Token**:
```bash
curl -X POST http://localhost:3004/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE",
    "redirect_uri": "http://localhost:3004/callback",
    "client_id": "arxiv-research-mcp-client",
    "client_secret": "your-client-secret"
  }'
```

3. **Use Access Token**:
```bash
curl -X POST http://localhost:3004/mcp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {},
    "id": 1
  }'
```

## Security Notes

1. **Password Storage**: In production, always hash passwords using bcrypt or similar
2. **JWT Secret**: Change `JWT_SECRET` environment variable to a strong random value
3. **Client Secrets**: Generate secure random secrets for production clients
4. **HTTPS**: Always use HTTPS in production
5. **Token Expiration**: Access tokens expire after 1 hour
6. **Refresh Tokens**: Valid for 30 days

## Environment Variables

```env
# OAuth Configuration
OAUTH_CLIENT_ID=arxiv-research-mcp-client
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_REDIRECT_URI=http://localhost:3004/callback
ALLOWED_REDIRECT_URIS=http://localhost:3004/callback,http://localhost:6274/oauth/callback

# JWT Configuration
JWT_SECRET=your-jwt-secret-key

# Server Configuration
PORT=3004
```

## Changes from Previous Version

### Before (Auto-Approval)
- ❌ No user authentication required
- ❌ Random user IDs generated automatically
- ❌ Anyone could access the server
- ❌ No scope-based authorization

### After (Real Authentication)
- ✅ Real username/password authentication
- ✅ User credentials validated against database
- ✅ Login form for credential entry
- ✅ Scope-based tool authorization
- ✅ Dynamic client registration support
- ✅ JWT-based access tokens

## Reference Implementation

This authentication system is based on the Zoo Animal MCP Server example:
https://github.com/juananpe/zoo-animal-mcp-server/tree/dcr

## Support

For issues or questions about authentication, please check:
- Server logs for detailed error messages
- OAuth error responses for specific failure reasons
- JWT token validation errors in console
