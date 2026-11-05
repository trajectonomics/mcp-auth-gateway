# Domain Glossary: @trajectonomics/mcp-auth-gateway

Ubiquitous language for `trajectonomics/mcp-auth-gateway`. Every term defined here is binding across code, tests, documentation, and PR titles. Synonyms in a diff are defects.

## Core Terms

### Auth Relay Proxy
Reverse proxy that mediates communication between headless AI agents and upstream MCP servers by validating inbound gateway secrets and injecting valid OAuth bearer tokens into unbuffered Streamable HTTP/SSE streams.

### Token Manager
Component responsible for persistent token lifecycle management, including atomic disk persistence, proactive refresh (<5 minutes before expiry), and reactive retry on upstream 401 Unauthorized.

### Bootstrap Login
One-time interactive CLI workflow (login:mobbin) that initiates an OAuth 2.0 PKCE flow on a local loopback port to acquire initial access and refresh tokens.

### Streamable HTTP
MCP transport protocol operating over HTTP supporting streaming JSON-RPC and server-sent events (SSE) without response buffering.

### Invariant
A rule or condition that must hold true across all state transitions in this system.
