# Zoo Animal MCP Server - Production Deployment

Deploy the Zoo Animal MCP Server to `zoo.ikasten.io` with OAuth authentication and SSL.

## Prerequisites

- SSH access: `ssh root@zoo.ikasten.io`
- Node.js v22.16.0 via nvm
- Domain: `zoo.ikasten.io` pointing to server

## Quick OAuth Fix (Existing Deployment)

If you have OAuth redirect URI errors with an existing deployment:

```bash
# Update code and install new dependencies
cd /opt/zoo-animal-mcp-server
git pull origin main
source ~/.nvm/nvm.sh && nvm use stable && npm install --production

# Configure OAuth environment
cat > .env << 'EOF'
OAUTH_CLIENT_ID=zoo-animal-mcp-client
OAUTH_CLIENT_SECRET=your-secure-client-secret-here
OAUTH_REDIRECT_URI=https://zoo.ikasten.io/callback
JWT_SECRET=your-secure-jwt-secret-here
ALLOWED_REDIRECT_URIS=https://zoo.ikasten.io/callback,http://127.0.0.1:33418,http://localhost:33418,http://localhost:6274/oauth/callback,http://localhost:6274/oauth/callback/debug
EOF

# Update systemd service
cat > /etc/systemd/system/zoo-mcp-server.service << 'EOF'
[Unit]
Description=Zoo Animal MCP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/zoo-animal-mcp-server
Environment=NODE_ENV=production
Environment=PORT=3003
EnvironmentFile=/opt/zoo-animal-mcp-server/.env
ExecStart=/root/.nvm/versions/node/v22.16.0/bin/node streamablemcpserver.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Restart service
systemctl daemon-reload && systemctl restart zoo-mcp-server
```

## Full Deployment (New Installation)

### 1. Clone and Install

```bash
cd /opt
git clone git@github.com:juananpe/zoo-animal-mcp-server.git
cd zoo-animal-mcp-server
source ~/.nvm/nvm.sh && nvm use stable && npm install --production
```

### 2. Configure OAuth

```bash
cat > .env << 'EOF'
OAUTH_CLIENT_ID=zoo-animal-mcp-client
OAUTH_CLIENT_SECRET=your-secure-client-secret-here
OAUTH_REDIRECT_URI=https://zoo.ikasten.io/callback
JWT_SECRET=your-secure-jwt-secret-here
ALLOWED_REDIRECT_URIS=https://zoo.ikasten.io/callback,http://127.0.0.1:33418,http://localhost:33418,http://localhost:6274/oauth/callback,http://localhost:6274/oauth/callback/debug
EOF
```

### 3. Install Nginx

```bash
apt update && apt install -y nginx

cat > /etc/nginx/sites-available/zoo.ikasten.io << 'EOF'
server {
    listen 80;
    server_name zoo.ikasten.io;

    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

ln -s /etc/nginx/sites-available/zoo.ikasten.io /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### 4. Install SSL Certificate

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d zoo.ikasten.io
certbot renew --dry-run
```

### 5. Create Systemd Service

```bash
cat > /etc/systemd/system/zoo-mcp-server.service << 'EOF'
[Unit]
Description=Zoo Animal MCP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/zoo-animal-mcp-server
Environment=NODE_ENV=production
Environment=PORT=3003
EnvironmentFile=/opt/zoo-animal-mcp-server/.env
ExecStart=/root/.nvm/versions/node/v22.16.0/bin/node streamablemcpserver.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable zoo-mcp-server
systemctl start zoo-mcp-server
```

## Verification

```bash
# Check service status
systemctl status zoo-mcp-server

# Test endpoints
curl -I https://zoo.ikasten.io/health
curl https://zoo.ikasten.io/

# View logs
journalctl -u zoo-mcp-server -f
```

## Configuration

- **Port**: 3003
- **OAuth Client ID**: `zoo-animal-mcp-client`
- **Tools**: `get_animals_by_species`, `get_animal_details`
- **SSL**: Auto-renewal via certbot

## Troubleshooting

```bash
# Service issues
systemctl status zoo-mcp-server
journalctl -u zoo-mcp-server -n 50

# Nginx issues
nginx -t
systemctl status nginx

# SSL issues
certbot certificates
certbot renew

# Direct app test
curl http://localhost:3003/health
```

## Security Notes

- Open only ports 80, 443
- Use strong secrets in `.env`
- Monitor systemd service logs
- Consider rate limiting in nginx

## How to Restart service

```bash
systemctl daemon-reload && systemctl restart zoo-mcp-server && systemctl status zoo-mcp-server
```
