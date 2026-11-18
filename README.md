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

## Upstreams and Routes

The Gateway fronts two MCP servers, each on its own route, each with its own Token File and Token
Manager ([ADR 0003](./docs/adr/0003-multiple-upstreams-per-gateway.md)):

| Upstream | Route          | Upstream URL                  | Token File                    |
| -------- | -------------- | ----------------------------- | ----------------------------- |
| Mobbin   | `/mobbin/mcp`  | `https://api.mobbin.com/mcp`  | `/data/tokens.json`           |
| PostHog  | `/posthog/mcp` | `https://mcp.posthog.com/mcp` | `/data/posthog-tokens.json`   |

One `GATEWAY_INTERNAL_SECRET` authenticates the caller on both routes. A Token File that is missing,
corrupt, expired or revoked affects its own route only: Mobbin keeps serving while PostHog is fixed,
and the reverse.

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
- `MOBBIN_TOKEN_FILE` (default `/data/tokens.json`) and `POSTHOG_TOKEN_FILE` (default
  `/data/posthog-tokens.json`), each inside a writable **directory** volume mounted at `/data`.
  A Token File is replaced by atomic rename, so mount the directory, never a single file. The earlier
  un-prefixed `TOKEN_FILE` is no longer read; Mobbin's default is the path it used to name.
- Optional per-Upstream overrides: `MOBBIN_UPSTREAM_URL` and `POSTHOG_UPSTREAM_URL`, defaulting to the
  Upstream URLs in the table above.
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

The Token Files live in the named volume `mcp-auth-gateway_gateway-data`. Docker seeds a fresh named
volume from the image's `/data`, which the Dockerfile already `chown`s to `bun` (UID 1000), so the
Token Manager can write without a manual `chown`. Bootstrap each Token File once with its Upstream's
interactive login, then install it as the container user:

```bash
bun run login:mobbin --out ./tokens.json
docker compose exec -T gateway sh -c 'umask 077; cat > /data/tokens.json' < ./tokens.json

bun run login:posthog --out ./posthog-tokens.json
docker compose exec -T gateway sh -c 'umask 077; cat > /data/posthog-tokens.json' < ./posthog-tokens.json
```

`GET /health` is unauthenticated and returns `{"status":"ok"}`; use it for liveness probes.
`GET /health/token` requires the gateway secret and reports one Token State per Upstream:

```json
{"upstreams":{"mobbin":{"tokenState":"valid"},"posthog":{"tokenState":"invalid"}}}
```

`invalid` and `expiring_soon` are reported, not raised: one Upstream's Token State never decides
whether another Upstream's route serves.

Host provisioning, host-side Compose, Tailscale and Cloudflare Tunnel wiring live in
[`trajectonomics/infra#3`](https://github.com/trajectonomics/infra/issues/3). This repository only
publishes images and the container contract.

---

## Bootstrap Login

`bun run login:mobbin` and `bun run login:posthog` perform the one-time interactive OAuth 2.0 PKCE
login for one Upstream and write the Token File the gateway consumes. Both read their endpoints from
the authorization server's RFC 8414 metadata, so neither hard-codes an endpoint path, and both
register a public client with PKCE `S256`.

```bash
# Mobbin, defaults to /data/tokens.json
bun run login:mobbin

# PostHog, defaults to /data/posthog-tokens.json
bun run login:posthog

# Or choose a different Token File path
MOBBIN_TOKEN_FILE=./tokens.json bun run login:mobbin
bun run login:posthog --out ./posthog-tokens.json

# Running the CLI directly takes the Upstream as a flag
bun run src/login/cli.ts --upstream posthog --out ./posthog-tokens.json
```

The CLI prints the authorization URL and tries to open a browser. Complete the consent screen; the
loopback listener runs only on `http://127.0.0.1:9696/callback` and stops as soon as the
authorization code arrives. The flow times out after five minutes.

Optional overrides, one set per Upstream:

- `MOBBIN_ISSUER` (default `https://ujasntkfphywizsdaapi.supabase.co/auth/v1`) and `MOBBIN_RESOURCE`
  (default `https://api.mobbin.com/mcp`)
- `POSTHOG_ISSUER` (default `https://oauth.posthog.com`) and `POSTHOG_RESOURCE`
  (default `https://mcp.posthog.com/mcp`)

On success the command writes the Token File as `0600` in a `0700` directory with `issuer`,
`token_endpoint`, `client_id`, `resource`, `access_token`, `refresh_token`, and `expires_at`. It
contains secrets: never commit it.

Install it into the gateway's named `/data` volume as the unprivileged container user, which keeps
the file owned by `bun` with `0600` permissions:

```bash
docker compose exec -T gateway sh -c 'umask 077; cat > /data/tokens.json' < ./tokens.json
docker compose exec -T gateway sh -c 'umask 077; cat > /data/posthog-tokens.json' < ./posthog-tokens.json
```

Rerun the Bootstrap Login only when the Runbook says the refresh token was permanently revoked.

## PostHog Notes

PostHog's hosted MCP server is an OAuth-protected resource at `https://mcp.posthog.com/mcp`
([protected-resource metadata](https://mcp.posthog.com/.well-known/oauth-protected-resource/mcp),
[authorization-server metadata](https://oauth.posthog.com/.well-known/oauth-authorization-server)).
It also accepts a personal API key, which this gateway does not use: OAuth keeps both Upstreams on one
Token Manager, one refresh path and one revoked-token error.

PostHog routes to its US or EU region by the account that signs in, and an MCP session has one active
organization and project. The Gateway passes `x-posthog-organization-id`, `x-posthog-project-id` and
their `organization_id`/`project_id` query parameters through unchanged, so an agent can pin each
session to a project without a second login.

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
