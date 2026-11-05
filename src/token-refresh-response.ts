import { parseTokenFile, type TokenFile, TokenFileParseError } from "./token-file"
import { TokenRefreshError } from "./token-refresh-error"

const UNIX_SECONDS_MIN = 1_000_000_000
const UNIX_SECONDS_MAX = 100_000_000_000

/** Builds a refreshed frozen Token File from a token endpoint response body. */
export function parseTokenRefreshResponse(
	payload: unknown,
	previous: TokenFile,
	nowMs: number,
	status: number,
): TokenFile {
	const record = readRecord(payload, status)
	const accessToken = readAccessToken(record, status)
	const refreshToken = readRefreshToken(record, previous, status)
	const expiresAt = readExpiresAt(record, nowMs, status)
	try {
		return parseTokenFile({
			issuer: previous.issuer,
			token_endpoint: previous.token_endpoint,
			client_id: previous.client_id,
			resource: previous.resource,
			access_token: accessToken,
			refresh_token: refreshToken,
			expires_at: expiresAt,
		})
	} catch (error) {
		if (error instanceof TokenFileParseError) throw invalidResponse(error.message, status, error)
		throw error
	}
}

function readRecord(payload: unknown, status: number): Record<string, unknown> {
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
		throw invalidResponse("Token endpoint response is not a JSON object", status)
	}
	return payload as Record<string, unknown>
}

function readAccessToken(record: Record<string, unknown>, status: number): string {
	const accessToken = record["access_token"]
	if (typeof accessToken !== "string" || accessToken.length === 0) {
		throw invalidResponse('Token endpoint response is missing "access_token"', status)
	}
	return accessToken
}

function readRefreshToken(
	record: Record<string, unknown>,
	previous: TokenFile,
	status: number,
): string {
	if (!Object.hasOwn(record, "refresh_token")) return previous.refresh_token
	const refreshToken = record["refresh_token"]
	if (typeof refreshToken !== "string" || refreshToken.length === 0) {
		throw invalidResponse('Token endpoint response has an invalid "refresh_token"', status)
	}
	return refreshToken
}

function readExpiresAt(record: Record<string, unknown>, nowMs: number, status: number): number {
	const expiresIn = record["expires_in"]
	if (expiresIn !== undefined) {
		if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn < 0) {
			throw invalidResponse('Token endpoint response has an invalid "expires_in"', status)
		}
		return nowMs + Math.round(expiresIn * 1_000)
	}
	const expiresAt = record["expires_at"]
	if (isUnixSeconds(expiresAt)) return expiresAt * 1_000
	throw invalidResponse(
		'Token endpoint response needs "expires_in" or a unix-seconds "expires_at"',
		status,
	)
}

function isUnixSeconds(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= UNIX_SECONDS_MIN &&
		value < UNIX_SECONDS_MAX
	)
}

function invalidResponse(message: string, status: number, cause?: unknown): TokenRefreshError {
	return new TokenRefreshError("refresh_response_invalid", message, { status, cause })
}
