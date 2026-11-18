import type { UpstreamConfig } from "../defaults"
import type { TokenFile } from "../token-file"
import { trimTrailingSlashes } from "../trim-trailing-slashes"

/** Test fixture: a Token File belonging to one Upstream, carrying an Access Token and expiry. */
export function tokenFileFixture(
	upstream: UpstreamConfig,
	accessToken: string,
	expiresAt: number,
): TokenFile {
	return Object.freeze({
		issuer: upstream.issuer,
		token_endpoint: `${trimTrailingSlashes(upstream.issuer)}/oauth/token`,
		client_id: "client-abc",
		resource: upstream.resource,
		access_token: accessToken,
		refresh_token: `refresh-${accessToken}`,
		expires_at: expiresAt,
	})
}
