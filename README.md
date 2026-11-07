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
import { evaluateTokenState, parseTokenFile } from "@trajectonomics/mcp-auth-gateway"

const tokenFile = parseTokenFile(await Bun.file("/data/tokens.json").json())
console.log(evaluateTokenState(tokenFile, Date.now())) // valid | expiring_soon | invalid
```

---

## Container Deployment

The gateway ships as a multi-architecture (`linux/amd64`, `linux/arm64`) image published to GHCR on
pushes to `main` and on `v*` tags:

```text
ghcr.io/trajectonomics/mcp-auth-gateway:sha-1a2b3c4
```

After the first publish, set the package visibility to **public** in the repository's package
settings. The workflow's `GITHUB_TOKEN` can push images but cannot change package visibility.

Deploy the immutable `sha-<short>` tag; `latest` tracks `main` and `v*` tags also publish semver tags.
The reference Compose file and this documentation never pin `latest`. The image runs as the
unprivileged `bun` user (UID 1000) with `CMD ["bun", "dist/server/main.mjs"]` and no shell wrapper.

Required configuration:

- `GATEWAY_INTERNAL_SECRET`: shared secret for `Authorization` on every non-health route. It must be at
  least 32 bytes; the gateway refuses to start otherwise. Generate one with `openssl rand -hex 32` and
  never commit it.
- `TOKEN_FILE` (default `/data/tokens.json`) and a writable **directory** volume mounted at `/data`.
  The Token File is replaced by atomic rename, so mount the directory, never a single file.
- `PORT` (default `8080`) and `HOST` (default `127.0.0.1`). The gateway refuses a wildcard
  `HOST` (`0.0.0.0`, `::`, `[::]`), because ADR 0002 forbids binding a public interface.

Run the reference `docker-compose.yml` with a pinned image tag and a secret in the environment:

```bash
GATEWAY_IMAGE=ghcr.io/trajectonomics/mcp-auth-gateway:sha-1a2b3c4 \
GATEWAY_INTERNAL_SECRET=$(openssl rand -hex 32) docker compose up -d
curl --fail http://127.0.0.1:8080/health
# {"status":"ok"}
```

The reference Compose file refuses to start without `GATEWAY_IMAGE`, and uses host networking, a
read-only root filesystem, `cap_drop: [ALL]`, `no-new-privileges`, and a Bun-based healthcheck that
probes `/health` (the Alpine image has no curl).

The Token File lives in the named volume `mcp-auth-gateway_gateway-data`. Docker seeds a fresh named
volume from the image's `/data`, which the Dockerfile already `chown`s to `bun` (UID 1000), so the
Token Manager can write without a manual `chown`. Bootstrap the Token File once with the interactive
login, then install it as the container user:

```bash
bun run login:mobbin --out ./tokens.json
docker compose exec -T gateway sh -c 'umask 077; cat > /data/tokens.json' < ./tokens.json
```

`GET /health` is unauthenticated and returns `{"status":"ok"}`; use it for liveness probes.
`GET /health/token` requires the gateway secret and reports the Token State.

Host provisioning, host-side Compose, Tailscale and Cloudflare Tunnel wiring live in
[`trajectonomics/infra#3`](https://github.com/trajectonomics/infra/issues/3). This repository only
publishes images and the container contract.

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

Install it into the gateway's named `/data` volume as the unprivileged container user, which keeps
the file owned by `bun` with `0600` permissions:

```bash
docker compose exec -T gateway sh -c 'umask 077; cat > /data/tokens.json' < ./tokens.json
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
