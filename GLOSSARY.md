# Domain Glossary: @trajectonomics/mcp-auth-gateway

Ubiquitous language for `trajectonomics/mcp-auth-gateway`. Every term defined here is binding across code, tests, documentation, and PR titles. Synonyms in a diff are defects.

## Core Terms

### Gateway
Deployable system composed of the Auth Relay Proxy and Token Manager, mediating communication between headless AI agents and OAuth 2.0-protected MCP servers.

### Auth Relay Proxy
Reverse proxy that mediates communication between headless AI agents and upstream MCP servers by validating inbound Gateway Secrets and injecting valid OAuth bearer tokens into unbuffered Streamable HTTP/SSE streams.

### Token Manager
Component responsible for persistent token lifecycle management, including atomic disk persistence, proactive refresh (<5 minutes before expiry), and single-flight reactive retry on upstream 401 Unauthorized.

### Bootstrap Login
One-time interactive CLI workflow (`bun run login:mobbin`) that initiates an OAuth 2.0 PKCE flow on a local loopback port (`127.0.0.1:9696/callback`) to acquire and export the initial Token File.

### Gateway Secret
Pre-shared bearer credential (configured via `GATEWAY_INTERNAL_SECRET`) validated by the Auth Relay Proxy using timing-safe comparison to authenticate inbound agent requests before proxying upstream.

### Upstream
The target OAuth 2.0-protected Model Context Protocol server (specifically Mobbin MCP at `https://api.mobbin.com/mcp`).

### Token File
Persistent JSON file stored on volume storage (`/data/tokens.json`) holding the active OAuth credentials and authorization server metadata (`issuer`, `token_endpoint`, `client_id`, `resource`, `access_token`, `refresh_token`, `expires_at`).

### Access Token
Short-lived bearer token injected into upstream Streamable HTTP requests (`Authorization: Bearer <access_token>`).

### Refresh Token
Long-lived rotating OAuth credential used by the Token Manager to obtain fresh access tokens from the upstream authorization server.

### Client Registration
OAuth 2.0 Dynamic Client Registration step (`/oauth/clients/register`) executed during Bootstrap Login to register client metadata with the upstream authorization server (Supabase Auth) and acquire a runtime `client_id`.

### Token State
Observable lifecycle status of the Token File:
- `valid`: Token is active with greater than 5 minutes remaining before expiration.
- `expiring_soon`: Token is within 5 minutes of expiration, triggering proactive refresh.
- `invalid`: Token is expired, missing, corrupted, or permanently revoked upstream.

### Runbook
Operational recovery manual (tracked in `trajectonomics/infra#3`) providing instructions for human operators to execute Bootstrap Login when refresh tokens are permanently revoked.

### Streamable HTTP
MCP transport protocol operating over HTTP supporting streaming JSON-RPC and server-sent events (SSE) without response buffering.

## Invariants

1. **Unauthenticated Isolation**: An inbound request with a missing or invalid Gateway Secret is rejected immediately with HTTP 401 and never reaches the upstream server.
2. **Single-Flight Refresh**: Concurrent requests encountering an expiring or rejected token share a single in-flight refresh operation; multiple concurrent refreshes for the same token are forbidden.
3. **Atomic Persistence**: The Token File is written via temporary file, followed by `fsync` and directory `rename`—it is never written directly or partially.
4. **Persist Before Forwarding**: A refreshed token must be successfully written to disk before it is injected into outbound upstream requests.
5. **Unbuffered Streaming**: Upstream response streaming (`application/json` and `text/event-stream`) must never be buffered in memory or delayed by intermediate frameworks.
