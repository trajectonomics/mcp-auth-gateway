import type { TokenFile } from "../token-file"

/** Test fixture: a Token File carrying one Access Token and expiry. */
export function tokenFileFixture(accessToken: string, expiresAt: number): TokenFile {
	return Object.freeze({
		issuer: "https://auth.example.com",
		token_endpoint: "https://auth.example.com/token",
		client_id: "client-abc",
		resource: "https://upstream.example.com/mcp",
		access_token: accessToken,
		refresh_token: `refresh-${accessToken}`,
		expires_at: expiresAt,
	})
}
