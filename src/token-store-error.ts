/** Storage failure codes for a Token File. */
export type TokenStoreErrorCode =
	| "token_file_missing"
	| "token_file_unreadable"
	| "token_file_corrupt"
	| "token_file_unwritable"

/** Error thrown when a Token File storage rule is violated. */
export class TokenStoreError extends Error {
	readonly code: TokenStoreErrorCode

	constructor(code: TokenStoreErrorCode, message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = "TokenStoreError"
		this.code = code
	}
}
