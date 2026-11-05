import { createHash, timingSafeEqual } from "node:crypto"

const BEARER_HEADER = /^Bearer ([^\s]+)$/i

function digest(value: string): Buffer {
	return createHash("sha256").update(value, "utf8").digest()
}

/** Validates an inbound Authorization header against the configured Gateway Secret. */
export function validateGatewaySecret(authorizationHeader: string | null, secret: string): boolean {
	if (secret.length === 0 || authorizationHeader === null) return false
	const match = BEARER_HEADER.exec(authorizationHeader)
	if (match === null || match[1] === undefined) return false
	return timingSafeEqual(digest(match[1]), digest(secret))
}
