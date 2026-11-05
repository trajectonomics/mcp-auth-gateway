import { isRecord } from "../is-record"
import { BootstrapLoginError } from "./errors"

/** Inputs for exchanging an authorization code for tokens. */
export interface ExchangeCodeOptions {
	readonly fetchImpl: typeof fetch
	readonly tokenEndpoint: string
	readonly code: string
	readonly redirectUri: string
	readonly clientId: string
	readonly codeVerifier: string
	readonly resource: string
}

/** OAuth tokens returned by the authorization server. */
export interface TokenSet {
	readonly accessToken: string
	readonly refreshToken: string
	readonly expiresInSeconds: number
}

/** Exchanges an authorization code for the initial token set. */
export async function exchangeCode(options: ExchangeCodeOptions): Promise<TokenSet> {
	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code: options.code,
		redirect_uri: options.redirectUri,
		client_id: options.clientId,
		code_verifier: options.codeVerifier,
		resource: options.resource,
	})
	let response: Response
	try {
		response = await options.fetchImpl(options.tokenEndpoint, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
			},
			body: body.toString(),
		})
	} catch (error) {
		throw new BootstrapLoginError(
			"token_exchange_failed",
			`Token exchange failed at "${options.tokenEndpoint}"; check network access`,
			{ cause: error },
		)
	}
	if (!response.ok) {
		const oauthError = await readOAuthError(response)
		const detail = oauthError ? ` (${oauthError})` : ""
		throw new BootstrapLoginError(
			"token_exchange_failed",
			`Token exchange failed at "${options.tokenEndpoint}" with HTTP ${response.status}${detail}; rerun the Bootstrap Login`,
		)
	}
	const payload = (await response.json().catch(() => undefined)) as unknown
	if (!isRecord(payload)) throw incompleteTokenResponse(options.tokenEndpoint)
	const accessToken = payload["access_token"]
	const refreshToken = payload["refresh_token"]
	const expiresInSeconds = payload["expires_in"]
	if (
		typeof accessToken !== "string" ||
		accessToken.length === 0 ||
		typeof refreshToken !== "string" ||
		refreshToken.length === 0 ||
		typeof expiresInSeconds !== "number" ||
		!Number.isFinite(expiresInSeconds) ||
		expiresInSeconds < 0
	) {
		throw incompleteTokenResponse(options.tokenEndpoint)
	}
	return Object.freeze({ accessToken, refreshToken, expiresInSeconds })
}

function incompleteTokenResponse(tokenEndpoint: string): BootstrapLoginError {
	return new BootstrapLoginError(
		"invalid_token_response",
		`Token exchange at "${tokenEndpoint}" returned an incomplete token response`,
	)
}

async function readOAuthError(response: Response): Promise<string | undefined> {
	const payload = (await response.json().catch(() => undefined)) as unknown
	if (!isRecord(payload)) return undefined
	const error = payload["error"]
	return typeof error === "string" && error.length > 0 ? error : undefined
}
