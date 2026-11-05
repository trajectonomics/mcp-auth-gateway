# @trajectonomics/mcp-auth-gateway

Headless-friendly MCP auth-relay reverse proxy and background token manager

[![CI](https://github.com/trajectonomics/mcp-auth-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/trajectonomics/mcp-auth-gateway/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Part of the [Trajectonomics](https://github.com/trajectonomics) ecosystem.

---

## Installation & Deployment

```bash
bun install
bun run build
```

## Getting Started

```typescript
import { handleRequest } from "@trajectonomics/mcp-auth-gateway"

const response = handleRequest("/health", "mcp-auth-gateway", Date.now())
console.log(response.status)
```

---

## Bootstrap Login

`bun run login:mobbin` performs the one-time interactive OAuth 2.0 PKCE login and writes the Token
File consumed by the gateway.

```bash
# Defaults to /data/tokens.json
bun run login:mobbin

# Or choose a different Token File path
MOBBIN_TOKEN_FILE=./tokens.json bun run login:mobbin
bun run login:mobbin --out ./tokens.json
```

The CLI prints the authorization URL and tries to open a browser. Complete the consent screen; the
loopback listener runs only on `http://127.0.0.1:9696/callback` and stops as soon as the
authorization code arrives. The flow times out after five minutes.

Optional overrides:

- `MOBBIN_ISSUER` (default `https://ujasntkfphywizsdaapi.supabase.co/auth/v1`)
- `MOBBIN_RESOURCE` (default `https://api.mobbin.com/mcp`)

On success the command writes the Token File as `0600` in a `0700` directory with `issuer`,
`token_endpoint`, `client_id`, `resource`, `access_token`, `refresh_token`, and `expires_at`. It
contains secrets: never commit it.

Mount or copy the Token File into the gateway's `/data` volume, for example:

```bash
docker cp ./tokens.json <gateway-container>:/data/tokens.json
```

Rerun the Bootstrap Login only when the Runbook says the refresh token was permanently revoked.

---

## Development

```bash
# Install dependencies
bun install

# Run full verification suite (lint, typecheck, tests, build)
bun run check

# Run tests
bun test

# Code formatting & lint
bun run format
bun run lint
```

---

## Domain Documentation

- [GLOSSARY.md](./GLOSSARY.md): Ubiquitous domain terminology.
- [AGENTS.md](./AGENTS.md): Guidelines and rules for autonomous AI coding agents.
- [CODING_STANDARDS.md](./CODING_STANDARDS.md): Architecture, purity, and review invariants.
- [docs/adr/](./docs/adr/): Architecture Decision Records.

---

## License

[MIT](./LICENSE)
