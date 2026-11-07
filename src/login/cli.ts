import { randomBytes as nodeRandomBytes } from "node:crypto"
import { DEFAULT_TOKEN_FILE } from "../defaults"
import { runBootstrapLogin } from "./bootstrap-login"

const OPENER_TIMEOUT_MS = 2000

function parseOutPath(args: readonly string[]): string | undefined {
	const [argument, value] = args
	if (argument === undefined) return undefined
	if (argument === "--out") {
		if (!value) throw new Error("--out requires a Token File path")
		return value
	}
	if (argument.startsWith("--out=")) {
		const inlineValue = argument.slice("--out=".length)
		if (!inlineValue) throw new Error("--out requires a Token File path")
		return inlineValue
	}
	throw new Error(`Unknown argument: ${argument}`)
}

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
	const outPath =
		parseOutPath(process.argv.slice(2)) ?? process.env["MOBBIN_TOKEN_FILE"] ?? DEFAULT_TOKEN_FILE
	const issuer = process.env["MOBBIN_ISSUER"]
	const resource = process.env["MOBBIN_RESOURCE"]
	await runBootstrapLogin({
		fetchImpl: fetch,
		openBrowser,
		nowMs: Date.now,
		randomBytes: (length) => nodeRandomBytes(length),
		outPath,
		...(issuer ? { issuer } : {}),
		...(resource ? { resource } : {}),
	})
	console.log(`Token File written to ${outPath}`)
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`Bootstrap Login failed: ${message}`)
	process.exitCode = 1
})
