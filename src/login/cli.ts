import { randomBytes as nodeRandomBytes } from "node:crypto"
import { resolveUpstreams } from "../upstream-config"
import { runBootstrapLogin } from "./bootstrap-login"
import { parseLoginArgs } from "./cli-args"

const OPENER_TIMEOUT_MS = 2000

async function openBrowser(url: string): Promise<void> {
	console.log(`Open this URL to complete the Bootstrap Login:\n${url}`)
	const command = process.platform === "darwin" ? "open" : "xdg-open"
	try {
		const opener = Bun.spawn([command, url], { stdout: "ignore", stderr: "ignore" })
		const exitCode = await Promise.race([opener.exited, Bun.sleep(OPENER_TIMEOUT_MS)])
		if (exitCode === undefined) opener.kill()
	} catch {
		// The URL is already printed, so the operator can open it manually.
	}
}

async function main(): Promise<void> {
	const target = parseLoginArgs(process.argv.slice(2), resolveUpstreams(process.env))
	await runBootstrapLogin({
		fetchImpl: fetch,
		openBrowser,
		nowMs: Date.now,
		randomBytes: (length) => nodeRandomBytes(length),
		outPath: target.outPath,
		issuer: target.upstream.issuer,
		resource: target.upstream.resource,
	})
	console.log(`Token File written to ${target.outPath}`)
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`Bootstrap Login failed: ${message}`)
	process.exitCode = 1
})
