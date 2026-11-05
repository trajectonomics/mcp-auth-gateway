/** Byte ceiling for buffering an inbound request body, defaulting to four mebibytes. */
export const DEFAULT_MAX_REQUEST_BYTES: number = 4 * 1024 * 1024

/** Result of buffering an inbound request body for a possible single replay. */
export type BufferedRequestBody =
	| { readonly ok: true; readonly body: Uint8Array | undefined }
	| { readonly ok: false }

/** Buffers a request body up to `maxBytes`, or rejects it without consuming upstream. */
export async function readRequestBody(
	request: Request,
	maxBytes: number,
): Promise<BufferedRequestBody> {
	if (request.method === "GET" || request.method === "HEAD" || request.body === null) {
		return { ok: true, body: undefined }
	}
	const reader = request.body.getReader()
	const chunks: Uint8Array[] = []
	let totalBytes = 0
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		totalBytes += value.byteLength
		if (totalBytes > maxBytes) {
			await reader.cancel().catch(() => undefined)
			return { ok: false }
		}
		chunks.push(value)
	}
	return { ok: true, body: concatChunks(chunks, totalBytes) }
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
	const body = new Uint8Array(totalBytes)
	let offset = 0
	for (const chunk of chunks) {
		body.set(chunk, offset)
		offset += chunk.byteLength
	}
	return body
}
