# ADR 0003: One Gateway Serves Several Upstreams, Each With Its Own Token File

## Status

Accepted. It supersedes the single-Upstream shape of [ADR 0001](./0001-core-architecture-decisions.md) — one Token File at `/data/tokens.json`, one operator login, one proxy route — and keeps every other decision in it: unbuffered Streamable HTTP, bounded request buffering, the single `401` replay, single-flight refresh, atomic persistence, persist-before-forwarding, the timing-safe Gateway Secret and the domain purity rules.

## Context

The owner asked the Gateway to front two upstream MCP servers, not one: Mobbin, which works today, and PostHog. Neither is reachable from a headless agent without an auth relay, and both are OAuth-protected resources.

The Gateway was single-Upstream by construction, not by configuration. `GatewayConfig` held one Upstream URL and one Token File path, the handler hard-coded `/mobbin/mcp`, and the process built one Token Store, one Token Manager and one Token Refresher. The revoked-token error named Mobbin and `login:mobbin` in its message.

PostHog's hosted MCP server (`https://mcp.posthog.com/mcp`) advertises an OAuth-protected resource (RFC 9728) whose authorization server is `https://oauth.posthog.com`, with authorization-code and refresh-token grants, PKCE `S256`, public-client Dynamic Client Registration and a token endpoint on a different host from the resource server. That is the same shape as Mobbin's, whose authorization server is Supabase Auth — a different *layout*, not a different protocol: Mobbin's endpoints are `/auth/v1/oauth/authorize`, `/auth/v1/oauth/token` and `/auth/v1/oauth/clients/register`, PostHog's are `/oauth/authorize/`, `/oauth/token/` and `/oauth/register/`.

## Decision

1. **One process, a route table.** The Gateway serves one Upstream Route per Upstream: `/mobbin/mcp` and `/posthog/mcp`, matched on exact pathname and forwarding every HTTP method. An unknown path is `404` before authentication and touches no Token Manager. The Gateway Secret stays single, because it authenticates the caller, not the Upstream.
2. **One Token File, Token Manager and Token Refresher per Upstream.** `src/defaults.ts` owns each Upstream's name, route, Upstream URL, issuer, resource, Token File path and login command; `GatewayConfig` carries a frozen list of Upstreams. A Token File the Gateway cannot use is reported on the route that needs it and never takes another route down: a missing, corrupt or revoked PostHog Token File leaves `/mobbin/mcp` serving.
3. **One name per setting, prefixed by Upstream.** `MOBBIN_UPSTREAM_URL`, `MOBBIN_ISSUER`, `MOBBIN_RESOURCE`, `MOBBIN_TOKEN_FILE` and the `POSTHOG_*` equivalents replace the un-prefixed `UPSTREAM_URL` and `TOKEN_FILE`, whose defaults are the values Mobbin uses today (`/data/tokens.json` included), so a deployment that sets nothing new keeps working.
4. **Token State per Upstream.** `/health` stays an unauthenticated liveness probe; `/health/token`, behind the Gateway Secret, answers one `tokenState` per Upstream. An `invalid` or `expiring_soon` state is data, not an error.
5. **The login reads its endpoints from metadata.** The Bootstrap Login resolves `authorization_endpoint`, `token_endpoint` and `registration_endpoint` from the authorization server's RFC 8414 metadata instead of composing a path, and refuses a non-`200`, an `issuer` that does not echo the requested issuer, or a missing endpoint. `bun run login:mobbin` and `bun run login:posthog` differ only in which Upstream they serve. The Token File keeps its schema and its stored `token_endpoint`, so the running Gateway never discovers anything.
6. **One error code per rule.** A revoked Refresh Token keeps `-32001`; a Token File the Gateway cannot turn into a valid one gets `-32002` naming the Upstream, the file and the login command, with the storage code in `data`; everything else keeps `-32603`.

## Considered Options

- **One container per Upstream.** Rejected: two Gateway Secrets, two ports, two healthchecks and two deployments for one credential model; isolation already comes from a Token File and Token Manager per Upstream.
- **Duplicate the handler per Upstream.** Rejected: it doubles the streaming, replay, limit and secret tests to gain nothing, and the two proxies would drift.
- **A personal API key for PostHog instead of OAuth.** Rejected: OAuth is PostHog's recommended path and its registered-client flow works, while a static `phx_` key would bypass the Token File schema, the single-flight refresh and the revoked-token error path.
- **Composing endpoint paths per Upstream in code.** Rejected: it embeds a third party's layout in this repository and breaks silently when that layout moves; the authorization server's own metadata is the contract.
- **Keeping `TOKEN_FILE`/`UPSTREAM_URL` as aliases.** Rejected: with two Upstreams an un-prefixed name cannot say which one it configures, and every deployed value equals the new default.

## Consequences

- A new Upstream is one row of defaults plus its route and Token File, not a second handler.
- A second login exists per Upstream, so an operator has one more human step per added Upstream; the Runbook gains that step.
- `/health/token`'s body changes shape, so anything reading the old flat `{"tokenState": ...}` body must read `upstreams.<name>.tokenState`.
- The exported `GatewayConfig` and `GatewayHandlerDeps` types change shape: a breaking change for library consumers of a package that is `private` and deployed as an image.
- An existing Mobbin Token File keeps refreshing against the `token_endpoint` it already stores; only a new interactive login uses discovery.
