import requests
import json

MCP_URL = "http://localhost:3000/mcp"


def initialize_session():
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 0,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "python-client", "version": "1.0"}
        }
    }
    response = requests.post(MCP_URL, json=payload, headers=headers)
    response.raise_for_status()
    data = response.json()
    session_id = response.headers.get("Mcp-Session-Id")
    print("Session ID:", session_id)
    print("Response:", data)
    return session_id


def send_mcp_request(session_id, method, params=None):
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Mcp-Session-Id": session_id
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params or {}
    }
    response = requests.post(MCP_URL, json=payload, headers=headers)
    response.raise_for_status()
    print("Response:", json.dumps(response.json(), indent=2))


if __name__ == "__main__":
    session_id = initialize_session()
    if not session_id:
        print("Failed to initialize session.")
        exit(1)

    # Get available tools
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Mcp-Session-Id": session_id
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list"
    }
    response = requests.post(MCP_URL, json=payload, headers=headers)
    response.raise_for_status()
    tools = response.json().get("result", {}).get("tools", [])
    print("\nAvailable MCP tools:")
    for tool in tools:
        print(f"- {tool['name']}: {tool.get('description', '')}")

    while True:
        tool_name = input(
            "\nEnter tool name to call (or 'exit' to quit): ").strip()
        if tool_name.lower() == "exit":
            break
        # Find tool schema
        tool = next((t for t in tools if t["name"] == tool_name), None)
        if not tool:
            print("Tool not found. Try again.")
            continue
        print(f"Input schema: {tool.get('inputSchema', {})}")
        params_input = input(
            "Enter tool arguments as JSON (or leave empty for defaults): ").strip()
        try:
            arguments = json.loads(params_input) if params_input else {}
        except Exception as e:
            print("Invalid JSON:", e)
            continue
        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        response = requests.post(MCP_URL, json=payload, headers=headers)
        response.raise_for_status()
        print("Response:", json.dumps(response.json(), indent=2))
