/** Persistent OAuth credential document stored on the Token File volume. */
export interface TokenFile {
	readonly issuer: string
	readonly token_endpoint: string
	readonly client_id: string
	readonly resource: string
	readonly access_token: string
	readonly refresh_token: string
	readonly expires_at: number
}

/** Domain error codes for rejecting a malformed Token File. */
export type TokenFileParseErrorCode = "not_an_object" | "missing_field" | "invalid_field"

/**
 * Error thrown when a value is not a well-formed Token File.
 * `field` is the caller's input path, or `""` for the root value.
 */
export class TokenFileParseError extends Error {
	readonly code: TokenFileParseErrorCode
	readonly field: string

	constructor(code: TokenFileParseErrorCode, field: string, message: string) {
		super(message)
		this.name = "TokenFileParseError"
		this.code = code
		this.field = field
	}
}

const STRING_FIELDS = [
	"issuer",
	"token_endpoint",
	"client_id",
	"resource",
	"access_token",
	"refresh_token",
] as const

const REQUIRED_FIELDS = [...STRING_FIELDS, "expires_at"] as const

/** Validates an already-JSON-parsed value and returns a frozen Token File. */
export function parseTokenFile(value: unknown): TokenFile {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new TokenFileParseError("not_an_object", "", "Token File must be a JSON object")
	}
	const record = value as Record<string, unknown>
	for (const field of REQUIRED_FIELDS) {
		if (!Object.hasOwn(record, field)) {
			throw new TokenFileParseError("missing_field", field, `Token File is missing "${field}"`)
		}
	}
	return Object.freeze({
		issuer: readStringField(record, "issuer"),
		token_endpoint: readStringField(record, "token_endpoint"),
		client_id: readStringField(record, "client_id"),
		resource: readStringField(record, "resource"),
		access_token: readStringField(record, "access_token"),
		refresh_token: readStringField(record, "refresh_token"),
		expires_at: readExpiresAt(record),
	})
}

function readStringField(record: Record<string, unknown>, field: string): string {
	const fieldValue = record[field]
	if (typeof fieldValue !== "string" || fieldValue.length === 0) {
		throw new TokenFileParseError(
			"invalid_field",
			field,
			`Token File field "${field}" must be a non-empty string`,
		)
	}
	return fieldValue
}

function readExpiresAt(record: Record<string, unknown>): number {
	const expiresAt = record["expires_at"]
	if (typeof expiresAt !== "number" || !Number.isInteger(expiresAt)) {
		throw new TokenFileParseError(
			"invalid_field",
			"expires_at",
			'Token File field "expires_at" must be a finite integer',
		)
	}
	return expiresAt
}
