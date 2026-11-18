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
One-time interactive CLI workflow per Upstream (`bun run login:mobbin`, `bun run login:posthog`) that reads the authorization server's metadata, initiates an OAuth 2.0 PKCE flow on a local loopback port (`127.0.0.1:9696/callback`) and exports that Upstream's initial Token File.

### Gateway Secret
Pre-shared bearer credential (configured via `GATEWAY_INTERNAL_SECRET`) validated by the Auth Relay Proxy using timing-safe comparison to authenticate inbound agent requests before proxying upstream.

### Upstream
The target OAuth 2.0-protected Model Context Protocol server the Gateway fronts: Mobbin (`https://api.mobbin.com/mcp`) and PostHog (`https://mcp.posthog.com/mcp`). Each Upstream has its own Upstream Route, Token File and Token Manager.
_Avoid_: Backend, provider, target

### Upstream Route
The path the Auth Relay Proxy serves for one Upstream (`/mobbin/mcp`, `/posthog/mcp`). It is matched on exact pathname and forwards every HTTP method.
_Avoid_: Endpoint, mount, prefix

### Token File
Persistent JSON file stored on volume storage, one per Upstream (`/data/tokens.json` for Mobbin, `/data/posthog-tokens.json` for PostHog), holding the active OAuth credentials and authorization server metadata (`issuer`, `token_endpoint`, `client_id`, `resource`, `access_token`, `refresh_token`, `expires_at`).

### Access Token
Short-lived bearer token injected into upstream Streamable HTTP requests (`Authorization: Bearer <access_token>`).

### Refresh Token
Long-lived rotating OAuth credential used by the Token Manager to obtain fresh access tokens from the upstream authorization server.

### Client Registration
OAuth 2.0 Dynamic Client Registration step executed during Bootstrap Login at the authorization server's `registration_endpoint` (read from its metadata) to register client metadata and acquire a runtime `client_id`. The registered client is public (`token_endpoint_auth_method: "none"`), so PKCE `S256` carries the proof.

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
6. **Upstream Isolation**: One Upstream's Token File — missing, corrupt, expired or revoked — never prevents another Upstream's Upstream Route from serving.
