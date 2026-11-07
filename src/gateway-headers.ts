const HOP_BY_HOP_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
])

const STRIPPED_RESPONSE_HEADERS = new Set([
	"content-encoding",
	"content-length",
	"www-authenticate",
])

function hopByHopNames(headers: Headers): Set<string> {
	const names = new Set(HOP_BY_HOP_HEADERS)
	const connection = headers.get("connection")
	if (connection !== null) {
		for (const token of connection.split(",")) {
			const name = token.trim().toLowerCase()
			if (name.length > 0) names.add(name)
		}
	}
	return names
}

function copyHeaders(headers: Headers, shouldSkip: (name: string) => boolean): Headers {
	const result = new Headers()
	headers.forEach((value, name) => {
		if (!shouldSkip(name)) result.set(name, value)
	})
	return result
}

/** Builds outbound request headers with the Access Token and all private inbound material removed. */
export function sanitizeRequestHeaders(headers: Headers, accessToken: string): Headers {
	const hopByHop = hopByHopNames(headers)
	const result = copyHeaders(headers, (name) => {
		return (
			hopByHop.has(name) ||
			name === "authorization" ||
			name === "cookie" ||
			name.startsWith("proxy-") ||
			name.startsWith("x-forwarded-")
		)
	})
	result.set("authorization", `Bearer ${accessToken}`)
	return result
}

/** Builds client-facing response headers without upstream framing or authentication metadata. */
export function sanitizeResponseHeaders(headers: Headers): Headers {
	const hopByHop = hopByHopNames(headers)
	return copyHeaders(headers, (name) => {
		return hopByHop.has(name) || name.startsWith("proxy-") || STRIPPED_RESPONSE_HEADERS.has(name)
	})
}
