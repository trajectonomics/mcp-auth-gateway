/** Domain error codes for a failed Bootstrap Login. */
export type BootstrapLoginErrorCode =
	| "client_registration_failed"
	| "missing_client_id"
	| "callback_listener_failed"
	| "authorization_denied"
	| "authorization_timeout"
	| "token_exchange_failed"
	| "invalid_token_response"

/** Error thrown when Bootstrap Login cannot acquire a Token File. */
export class BootstrapLoginError extends Error {
	readonly code: BootstrapLoginErrorCode

	constructor(code: BootstrapLoginErrorCode, message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = "BootstrapLoginError"
		this.code = code
	}
}
