// Test script for Dynamic Client Registration endpoint
// Run this after starting the server to test the /register endpoint

import fetch from "node-fetch";

const BASE_URL = "http://localhost:3000";

async function testDynamicClientRegistration() {
  console.log("🧪 Testing Dynamic Client Registration...\n");

  // Test 1: Register a new client
  console.log("📝 Test 1: Registering a new client...");
  const registerResponse = await fetch(`${BASE_URL}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      redirect_uris: ["http://localhost:6274/oauth/callback"],
      client_name: "Test MCP Client",
      scope: "read_animals list_animals",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    }),
  });

  if (!registerResponse.ok) {
    console.error("❌ Registration failed:", await registerResponse.text());
    return;
  }

  const clientData = await registerResponse.json();
  console.log("✅ Client registered successfully!");
  console.log("📋 Client ID:", clientData.client_id);
  console.log("🔑 Client Secret:", clientData.client_secret);
  console.log("🔗 Redirect URIs:", clientData.redirect_uris);
  console.log();

  // Test 2: Check OAuth metadata includes registration endpoint
  console.log("📋 Test 2: Checking OAuth metadata...");
  const metadataResponse = await fetch(
    `${BASE_URL}/.well-known/oauth-authorization-server`
  );
  const metadata = await metadataResponse.json();

  if (metadata.registration_endpoint) {
    console.log(
      "✅ Registration endpoint found in metadata:",
      metadata.registration_endpoint
    );
  } else {
    console.error("❌ Registration endpoint missing from metadata");
  }
  console.log();

  // Test 3: List registered clients
  console.log("👥 Test 3: Listing registered clients...");
  const clientsResponse = await fetch(`${BASE_URL}/clients`);
  const clientsData = await clientsResponse.json();

  console.log("✅ Registered clients:", clientsData.total_count);
  clientsData.registered_clients.forEach((client, index) => {
    console.log(`   ${index + 1}. ${client.client_name} (${client.client_id})`);
  });
  console.log();

  // Test 4: Test authorization with registered client
  console.log(
    "🔐 Test 4: Testing authorization flow with registered client..."
  );
  const authResponse = await fetch(`${BASE_URL}/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: "johndoe",
      password: "pass",
      client_id: clientData.client_id,
      redirect_uri: "http://localhost:6274/oauth/callback",
      response_type: "code",
      scope: "read_animals",
      state: "test-state",
    }),
  });

  if (authResponse.ok) {
    const authData = await authResponse.json();
    console.log("✅ Authorization successful!");
    console.log("🔑 Authorization Code:", authData.code);
    console.log("📋 State:", authData.state);
  } else {
    console.error("❌ Authorization failed:", await authResponse.text());
  }

  console.log("\n🎉 All tests completed!");
}

// Run the test
testDynamicClientRegistration().catch(console.error);
