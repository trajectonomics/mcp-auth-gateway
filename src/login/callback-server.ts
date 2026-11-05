import { BootstrapLoginError } from "./errors"

const CALLBACK_TIMEOUT_MS = 300_000
const COMPLETION_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Bootstrap Login complete</title></head>
<body><h1>Bootstrap Login complete</h1><p>You can close this window and return to the terminal.</p></body></html>`

/** Loopback listener that captures the OAuth authorization code. */
export interface CallbackServer {
	readonly redirectUri: string
	waitForCode(): Promise<string>
	stop(): Promise<void>
}

/**
 * Starts the 127.0.0.1-only loopback listener for the authorization callback.
 * A state mismatch is answered with HTTP 400 and the listener keeps waiting for a valid callback.
 * The listener force-closes after delivering the completion page.
 */
export function startCallbackServer(options: {
	readonly port: number
	readonly state: string
}): CallbackServer {
	let resolveCode: (code: string) => void = () => undefined
	let rejectCode: (error: BootstrapLoginError) => void = () => undefined
	const codePromise = new Promise<string>((resolve, reject) => {
		resolveCode = resolve
		rejectCode = reject
	})
	let server: Bun.Server<undefined> | undefined
	let stopPromise: Promise<void> | undefined

	function stop(): Promise<void> {
		clearTimeout(timeout)
		stopPromise ??= server ? server.stop(true) : Promise.resolve()
		return stopPromise
	}

	function handleCallback(request: Request): Response {
		const url = new URL(request.url)
		if (request.method !== "GET" || url.pathname !== "/callback") {
			return new Response("Not Found", { status: 404 })
		}
		if (url.searchParams.get("state") !== options.state) {
			return new Response("Invalid state", { status: 400 })
		}
		const oauthError = url.searchParams.get("error")
		if (oauthError) {
			setTimeout(() => {
				rejectCode(
					new BootstrapLoginError(
						"authorization_denied",
						`Authorization was denied by the authorization server (${oauthError}); rerun the Bootstrap Login`,
					),
				)
			}, 0)
			return new Response("Authorization failed", { status: 400 })
		}
		const code = url.searchParams.get("code")
		if (!code) return new Response("Missing authorization code", { status: 400 })
		setTimeout(() => {
			resolveCode(code)
			void stop()
		}, 0)
		return new Response(COMPLETION_PAGE, {
			status: 200,
			headers: { "content-type": "text/html; charset=utf-8" },
		})
	}

	const timeout = setTimeout(() => {
		rejectCode(
			new BootstrapLoginError(
				"authorization_timeout",
				"Bootstrap Login timed out after 5 minutes; rerun the Bootstrap Login",
			),
		)
		void stop()
	}, CALLBACK_TIMEOUT_MS)

	try {
		server = Bun.serve({ hostname: "127.0.0.1", port: options.port, fetch: handleCallback })
	} catch (error) {
		clearTimeout(timeout)
		throw new BootstrapLoginError(
			"callback_listener_failed",
			`Cannot listen on 127.0.0.1:${options.port}; is the port already in use?`,
			{ cause: error },
		)
	}

	return {
		redirectUri: `http://127.0.0.1:${server.port}/callback`,
		waitForCode: () => codePromise,
		stop,
	}
}
