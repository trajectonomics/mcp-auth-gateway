import { authServerUrl } from "./urls"

/** Inputs for the OAuth 2.0 authorization request. */
export interface AuthorizeUrlOptions {
	readonly issuer: string
	readonly clientId: string
	readonly redirectUri: string
	readonly codeChallenge: string
	readonly state: string
	readonly resource: string
}

/** Builds the S256 PKCE authorization URL for the Bootstrap Login. */
export function createAuthorizeUrl(options: AuthorizeUrlOptions): string {
	const url = new URL(authServerUrl(options.issuer, "authorize"))
	url.searchParams.set("response_type", "code")
	url.searchParams.set("client_id", options.clientId)
	url.searchParams.set("redirect_uri", options.redirectUri)
	url.searchParams.set("code_challenge", options.codeChallenge)
	url.searchParams.set("code_challenge_method", "S256")
	url.searchParams.set("state", options.state)
	url.searchParams.set("resource", options.resource)
	return url.toString()
}
