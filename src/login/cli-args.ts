import type { UpstreamConfig } from "../defaults"

/** Resolved Bootstrap Login target: one Upstream and the Token File path to write. */
export interface LoginTarget {
	readonly upstream: UpstreamConfig
	readonly outPath: string
}

/** Domain error codes for refusing Bootstrap Login CLI arguments. */
export type LoginArgsErrorCode =
	| "upstream_missing"
	| "upstream_unknown"
	| "option_value_missing"
	| "option_unknown"

/** Error thrown when the Bootstrap Login CLI cannot parse its arguments. */
export class LoginArgsError extends Error {
	readonly code: LoginArgsErrorCode

	constructor(code: LoginArgsErrorCode, message: string) {
		super(message)
		this.name = "LoginArgsError"
		this.code = code
	}
}

type OptionName = "upstream" | "outPath"

const OPTIONS = [
	{ name: "upstream", flag: "--upstream" },
	{ name: "outPath", flag: "--out" },
] as const

/** Parses `--upstream` and `--out` in either order and in `--flag=value` form. */
export function parseLoginArgs(
	args: readonly string[],
	upstreams: readonly UpstreamConfig[],
): LoginTarget {
	const options = readOptions(args)
	const upstream = upstreams.find((candidate) => candidate.name === options.upstream)
	if (upstream === undefined) {
		const names = upstreams.map((candidate) => candidate.name).join(", ")
		throw new LoginArgsError(
			"upstream_unknown",
			`Unknown Upstream "${options.upstream}"; expected one of ${names}`,
		)
	}
	return Object.freeze({ upstream, outPath: options.outPath ?? upstream.tokenFile })
}

interface ReadOptions {
	readonly upstream: string
	readonly outPath: string | undefined
}

function readOptions(args: readonly string[]): ReadOptions {
	const options: { upstream?: string; outPath?: string } = {}
	for (let index = 0; index < args.length; ) {
		const [name, value, consumed] = readOption(args, index)
		options[name] = value
		index += consumed
	}
	if (options.upstream === undefined) {
		throw new LoginArgsError("upstream_missing", "--upstream <name> is required")
	}
	return { upstream: options.upstream, outPath: options.outPath }
}

function readOption(args: readonly string[], index: number): [OptionName, string, number] {
	const argument = args[index] ?? ""
	for (const option of OPTIONS) {
		const inlinePrefix = `${option.flag}=`
		if (argument.startsWith(inlinePrefix)) {
			return [option.name, requireValue(argument.slice(inlinePrefix.length), option.flag), 1]
		}
		if (argument === option.flag)
			return [option.name, requireValue(args[index + 1], option.flag), 2]
	}
	throw new LoginArgsError("option_unknown", `Unknown argument: ${argument}`)
}

function requireValue(value: string | undefined, flag: string): string {
	if (value === undefined || value.length === 0) {
		throw new LoginArgsError("option_value_missing", `${flag} requires a value`)
	}
	return value
}
