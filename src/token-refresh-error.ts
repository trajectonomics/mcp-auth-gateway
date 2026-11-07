/** Domain error codes for an upstream token refresh. */
export type TokenRefreshErrorCode =
	| "refresh_token_revoked"
	| "refresh_failed"
	| "refresh_request_failed"
	| "refresh_response_invalid"

/** Metadata reported alongside a failed token refresh. */
export interface TokenRefreshErrorMetadata {
	readonly status?: number | undefined
	readonly oauthError?: string | undefined
	readonly cause?: unknown
}

/** Error thrown when an upstream token refresh cannot produce a Token File. */
export class TokenRefreshError extends Error {
	readonly code: TokenRefreshErrorCode
	readonly status: number | undefined
	readonly oauthError: string | undefined

	constructor(
		code: TokenRefreshErrorCode,
		message: string,
		metadata: TokenRefreshErrorMetadata = {},
	) {
		super(message, { cause: metadata.cause })
		this.name = "TokenRefreshError"
		this.code = code
		this.status = metadata.status
		this.oauthError = metadata.oauthError
	}
}
