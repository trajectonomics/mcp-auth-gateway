import type { UpstreamConfig } from "../defaults"

/** Resolved Bootstrap Login target: one Upstream and the Token File path to write. */
export interface LoginTarget {
	readonly upstream: UpstreamConfig
	readonly outPath: string
}

/** Parses `--upstream` and `--out` in either order and in `--flag=value` form. */
export function parseLoginArgs(
	args: readonly string[],
	upstreams: readonly UpstreamConfig[],
): LoginTarget {
	const options = parseOptions(args)
	const upstream = upstreams.find((candidate) => candidate.name === options.upstream)
	if (upstream === undefined) {
		const names = upstreams.map((candidate) => candidate.name).join(", ")
		throw new Error(`Unknown Upstream "${options.upstream}"; expected one of ${names}`)
	}
	return Object.freeze({ upstream, outPath: options.outPath ?? upstream.tokenFile })
}

interface LoginOptions {
	readonly upstream: string
	readonly outPath: string | undefined
}

type OptionName = "upstream" | "outPath"

interface ParsedOptions {
	upstream?: string
	outPath?: string
}

function parseOptions(args: readonly string[]): LoginOptions {
	const options = readOptions(args)
	if (options.upstream === undefined) throw new Error("--upstream <name> is required")
	return { upstream: options.upstream, outPath: options.outPath }
}

const INLINE_FLAGS = [
	["upstream", "--upstream="],
	["outPath", "--out="],
] as const

function readOptions(args: readonly string[]): ParsedOptions {
	const options: ParsedOptions = {}
	for (let index = 0; index < args.length; ) {
		const [name, value, consumed] = readOption(args, index)
		options[name] = value
		index += consumed
	}
	return options
}

function readOption(args: readonly string[], index: number): [OptionName, string, number] {
	const argument = args[index] ?? ""
	for (const [name, flag] of INLINE_FLAGS) {
		if (argument.startsWith(flag)) return [name, inlineValue(argument, flag), 1]
	}
	const inlineName = argument === "--upstream" ? "upstream" : undefined
	const name = argument === "--out" ? "outPath" : inlineName
	if (name === undefined) throw new Error(`Unknown argument: ${argument}`)
	const value = args[index + 1]
	if (value === undefined || value.length === 0) throw new Error(`${argument} requires a value`)
	return [name, value, 2]
}

function inlineValue(argument: string, flag: string): string {
	const value = argument.slice(flag.length)
	if (value.length === 0) throw new Error(`${flag.slice(0, -1)} requires a value`)
	return value
}
