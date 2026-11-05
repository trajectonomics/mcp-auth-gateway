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
	readonly expiresIn: number
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
	const accessToken = isRecord(payload) ? payload["access_token"] : undefined
	const refreshToken = isRecord(payload) ? payload["refresh_token"] : undefined
	const expiresIn = isRecord(payload) ? payload["expires_in"] : undefined
	if (
		typeof accessToken !== "string" ||
		accessToken.length === 0 ||
		typeof refreshToken !== "string" ||
		refreshToken.length === 0 ||
		typeof expiresIn !== "number" ||
		!Number.isFinite(expiresIn) ||
		expiresIn < 0
	) {
		throw new BootstrapLoginError(
			"invalid_token_response",
			`Token exchange at "${options.tokenEndpoint}" returned an incomplete token response`,
		)
	}
	return Object.freeze({ accessToken, refreshToken, expiresIn })
}

async function readOAuthError(response: Response): Promise<string | undefined> {
	const payload = (await response.json().catch(() => undefined)) as unknown
	if (!isRecord(payload)) return undefined
	const error = payload["error"]
	return typeof error === "string" && error.length > 0 ? error : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
