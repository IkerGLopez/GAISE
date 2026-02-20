#!/bin/bash

echo "=== Testing MCP OAuth Authentication Flow ==="

# Get authorization code
echo "1. Getting authorization code..."
AUTH_CODE=$(curl -k -s -L 'https://localhost/authorize?response_type=code&client_id=zoo-animal-mcp-client&redirect_uri=https://localhost/callback&scope=read_animals+list_animals' | jq -r .authorization_code)

if [ "$AUTH_CODE" = "null" ] || [ -z "$AUTH_CODE" ]; then
    echo "❌ Failed to get authorization code"
    exit 1
fi

echo "✅ Got authorization code: $AUTH_CODE"

# Exchange for access token
echo "2. Exchanging for access token..."
TOKEN_RESPONSE=$(curl -k -s -X POST "https://localhost/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=$AUTH_CODE&redirect_uri=https://localhost/callback&client_id=zoo-animal-mcp-client&client_secret=your-client-secret")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r .access_token)

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo "❌ Failed to get access token"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

echo "✅ Got access token: ${ACCESS_TOKEN:0:50}..."

# Initialize MCP session
echo "3. Initializing MCP session..."
curl -k -s -X POST "https://localhost/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "mcp-protocol-version: 2024-11-05" \
  -D headers.txt \
  -d '{"jsonrpc": "2.0", "method": "initialize", "id": 1, "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test-client", "version": "1.0.0"}}}' > init_response.json

INIT_RESULT=$(cat init_response.json)
echo "Init response: $INIT_RESULT"

# Extract session ID
SESSION_ID=$(grep "^mcp-session-id:" headers.txt | cut -d' ' -f2 | tr -d '\r\n')

if [ -z "$SESSION_ID" ]; then
    echo "❌ No session ID found in headers"
    echo "Headers:"
    cat headers.txt
    exit 1
fi

echo "✅ Got session ID: $SESSION_ID"

# Test get_animal_details tool
echo "4. Testing get_animal_details tool..."
TOOL_RESPONSE=$(curl -k -s -X POST "https://localhost/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "mcp-protocol-version: 2024-11-05" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "id": 2, "params": {"name": "get_animal_details", "arguments": {"name": "Leo"}}}')

echo "Tool response: $TOOL_RESPONSE"

# Test get_animals_by_species tool
echo "5. Testing get_animals_by_species tool..."
SPECIES_RESPONSE=$(curl -k -s -X POST "https://localhost/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "mcp-protocol-version: 2024-11-05" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "id": 3, "params": {"name": "get_animals_by_species", "arguments": {"species": "lion"}}}')

echo "Species response: $SPECIES_RESPONSE"

echo "=== Test Complete ==="

# Cleanup
rm -f headers.txt init_response.json