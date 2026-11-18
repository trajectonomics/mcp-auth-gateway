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

const UNUSABLE_CODES = new Set<TokenStoreErrorCode>([
	"token_file_missing",
	"token_file_unreadable",
	"token_file_corrupt",
])

/** Whether the store code means the operator must install that Token File. */
export function isTokenFileUnusable(code: TokenStoreErrorCode): boolean {
	return UNUSABLE_CODES.has(code)
}
