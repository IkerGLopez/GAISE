#!/bin/bash
# Development script for MCP Inspector with self-signed certificate support

echo "🔧 Starting MCP Inspector in development mode..."
echo "⚠️  Note: TLS certificate validation is disabled for self-signed certificates"
echo ""

# Set environment variable to allow self-signed certificates
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Start MCP Inspector
npx @modelcontextprotocol/inspector