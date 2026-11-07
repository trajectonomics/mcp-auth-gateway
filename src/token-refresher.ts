import { isRecord } from "./is-record"
import type { TokenFile } from "./token-file"
import { TokenRefreshError } from "./token-refresh-error"
import { parseTokenRefreshResponse } from "./token-refresh-response"

/** Refreshes a Token File against its upstream authorization server. */
export type TokenRefresher = (input: { tokenFile: TokenFile; nowMs: number }) => Promise<TokenFile>

/** Creates a Token Refresher that exchanges the Refresh Token at the token endpoint. */
export function createTokenRefresher(deps: { fetchImpl: typeof fetch }): TokenRefresher {
	const { fetchImpl } = deps
	return async function refreshTokenFile({ tokenFile, nowMs }): Promise<TokenFile> {
		const response = await sendRequest(fetchImpl, tokenFile)
		const payload = await readPayload(response)
		if (!response.ok) throw requestError(response.status, payload)
		return parseTokenRefreshResponse(payload, tokenFile, nowMs, response.status)
	}
}

async function sendRequest(fetchImpl: typeof fetch, tokenFile: TokenFile): Promise<Response> {
	try {
		return await fetchImpl(tokenFile.token_endpoint, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
			},
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: tokenFile.refresh_token,
				client_id: tokenFile.client_id,
				resource: tokenFile.resource,
			}).toString(),
		})
	} catch (error) {
		throw new TokenRefreshError("refresh_request_failed", "Token refresh request failed", {
			cause: error,
		})
	}
}

async function readPayload(response: Response): Promise<unknown> {
	try {
		return await response.json()
	} catch (error) {
		if (!response.ok) return undefined
		throw new TokenRefreshError(
			"refresh_response_invalid",
			"Token endpoint returned invalid JSON",
			{
				status: response.status,
				cause: error,
			},
		)
	}
}

function requestError(status: number, payload: unknown): TokenRefreshError {
	const oauthError = readOAuthError(payload)
	if (oauthError === "invalid_grant") {
		return new TokenRefreshError("refresh_token_revoked", "Refresh Token was revoked upstream", {
			status,
			oauthError,
		})
	}
	return new TokenRefreshError("refresh_failed", "Token endpoint rejected the refresh request", {
		status,
		oauthError,
	})
}

function readOAuthError(payload: unknown): string | undefined {
	if (!isRecord(payload)) return undefined
	const oauthError = payload["error"]
	return typeof oauthError === "string" ? oauthError : undefined
}
