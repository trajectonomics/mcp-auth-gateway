# ADR 0001: Headless MCP Auth-Relay Gateway Architecture

## Status

Accepted (Supersedes initial bootstrap archetype)

## Context

Headless AI coding agents (such as Antigravity and containerized workers) cannot complete interactive, browser-based OAuth 2.0 PKCE authentication flows.

Third-party Model Context Protocol (MCP) servers, such as Mobbin (`https://api.mobbin.com/mcp`), operate over Streamable HTTP with mandatory OAuth 2.0 PKCE and rotating refresh tokens (Mobbin Pro plan; static API keys are restricted to enterprise tiers). Desktop tools like `mcp-remote` rely on interactive browser redirects, which hang indefinitely in headless environments when tokens expire.

Live inspection of Mobbin's OAuth 2.0 Protected Resource Metadata (RFC 9728) reveals:
- The authorization server is Supabase Auth (`https://ujasntkfphywizsdaapi.supabase.co/auth/v1`), not `api.mobbin.com`.
- Dynamic Client Registration is active (`/oauth/clients/register`), generating `client_id` at runtime.
- The token endpoint is on a separate domain from the resource server.
- The authorization server permits PKCE `plain`, requiring the client to explicitly enforce `S256`.

## Decision

1. **Architecture & Component Separation**:
   - **Bootstrap Login CLI (`bun run login:mobbin`)**: An interactive, one-time operator CLI that registers an OAuth client, generates S256 PKCE challenges, captures the authorization code via a local loopback callback (`http://127.0.0.1:9696/callback`), exchanges it for initial tokens, and exports the Token File.
   - **Autonomous Gateway**: A long-running server combining an **Auth Relay Proxy** and a **Token Manager** that requires zero interactive human input.

2. **Token File Schema & Storage**:
   - Stored at `/data/tokens.json` in plaintext with strict file permissions (`0600`) inside a `0700` volume directory, relying on host/cloud volume encryption.
   - Complete schema:
     ```json
     {
       "issuer": "https://ujasntkfphywizsdaapi.supabase.co/auth/v1",
       "token_endpoint": "https://ujasntkfphywizsdaapi.supabase.co/auth/v1/token",
       "client_id": "string",
       "resource": "https://api.mobbin.com/mcp",
       "access_token": "string",
       "refresh_token": "string",
       "expires_at": 1700000000000
     }
     ```

3. **Token Manager Lifecycle & Invariants**:
   - **Atomic Persistence**: Writes occur to a sibling temporary file in `/data`, followed by `fsync` and directory `rename`.
   - **Proactive Refresh**: Refreshes tokens automatically when remaining lifetime is under 5 minutes (`refreshLeadMs = 300_000`).
   - **Concurrency Control**: Refreshes are single-flighted across concurrent requests. Before initiating a refresh, the Token Manager inspects disk to adopt any updated tokens written by external logins.
   - **Reactive Retry**: On an unexpected upstream HTTP 401, the gateway force-refreshes the token and replays the request exactly once. If the refresh fails with `invalid_grant` (revoked), the gateway returns a descriptive JSON-RPC error pointing to the operational Runbook.

4. **Auth Relay Proxy & Streamable HTTP**:
   - Implemented using native `Bun.serve` and standard `fetch` / `ReadableStream` without buffering middleware.
   - **Bounded Request Buffering**: Request bodies are buffered in memory up to 4 MiB to allow a single retry on upstream 401; responses remain completely unbuffered (`application/json` and `text/event-stream`).
   - **Transport Tweaks**: Set Bun `idleTimeout: 0` to preserve long-lived SSE connections. Strip upstream `content-encoding` and `content-length` headers upon forwarding to avoid client decompression corruption.
   - **Inbound Security**: Validates `Authorization: Bearer <GATEWAY_INTERNAL_SECRET>` using constant-time digest comparison (`crypto.timingSafeEqual`). Requests with invalid or missing secrets are rejected with 401 and never touch upstream.

5. **Health & Inspection Endpoint**:
   - `GET /health` and `GET /healthz` are unauthenticated, exposing only basic service liveness (`{ status: "ok" }`).
   - Detailed token health (`valid`, `expiring_soon`, `invalid`) is restricted to requests authenticated with the Gateway Secret.

6. **Domain Purity**:
   - All core Token Manager calculations and state machines receive `nowMs: number` as an explicit parameter (no ambient `Date.now()`), keeping business logic pure and testable.

## Consequences

- Headless agents query Mobbin MCP without browser interaction.
- Single operator login provides all necessary runtime metadata (`client_id`, `token_endpoint`, `resource`).
- Upstream SSE and JSON-RPC streaming pass through unbuffered.
