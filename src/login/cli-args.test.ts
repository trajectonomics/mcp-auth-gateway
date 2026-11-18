import { describe, expect, it } from "bun:test"
import { MOBBIN_DEFAULTS, POSTHOG_DEFAULTS, UPSTREAM_DEFAULTS } from "../defaults"
import { LoginArgsError, parseLoginArgs } from "./cli-args"

function argsError(run: () => unknown): LoginArgsError {
	try {
		run()
	} catch (error) {
		if (error instanceof LoginArgsError) return error
		throw error
	}
	throw new Error("expected parseLoginArgs to throw")
}

describe("Bootstrap Login CLI arguments", () => {
	it("selects the Upstream and defaults the Token File to its documented path", () => {
		const selection = parseLoginArgs(["--upstream", "posthog"], UPSTREAM_DEFAULTS)

		expect(selection.upstream).toEqual(POSTHOG_DEFAULTS)
		expect(selection.outPath).toBe("/data/posthog-tokens.json")
		expect(Object.isFrozen(selection)).toBe(true)
	})

	it("accepts --upstream and --out in either order", () => {
		const outFirst = parseLoginArgs(
			["--out", "./posthog.json", "--upstream", "posthog"],
			UPSTREAM_DEFAULTS,
		)
		const upstreamFirst = parseLoginArgs(
			["--upstream", "posthog", "--out", "./posthog.json"],
			UPSTREAM_DEFAULTS,
		)

		for (const selection of [outFirst, upstreamFirst]) {
			expect(selection.upstream).toEqual(POSTHOG_DEFAULTS)
			expect(selection.outPath).toBe("./posthog.json")
		}
	})

	it("accepts --flag=value form", () => {
		const selection = parseLoginArgs(
			["--upstream=mobbin", "--out=./mobbin.json"],
			UPSTREAM_DEFAULTS,
		)

		expect(selection.upstream).toEqual(MOBBIN_DEFAULTS)
		expect(selection.outPath).toBe("./mobbin.json")
	})

	it("refuses a missing Upstream", () => {
		const error = argsError(() => parseLoginArgs([], UPSTREAM_DEFAULTS))

		expect(error.code).toBe("upstream_missing")
	})

	it("refuses an unknown Upstream", () => {
		const error = argsError(() => parseLoginArgs(["--upstream", "mailchimp"], UPSTREAM_DEFAULTS))

		expect(error.code).toBe("upstream_unknown")
		expect(error.message).toContain("mailchimp")
	})

	it("refuses an option without a value", () => {
		for (const args of [["--upstream"], ["--upstream="], ["--upstream", "mobbin", "--out"]]) {
			const error = argsError(() => parseLoginArgs(args, UPSTREAM_DEFAULTS))

			expect(error.code).toBe("option_value_missing")
		}
	})

	it("refuses an unknown argument", () => {
		const error = argsError(() =>
			parseLoginArgs(["--upstream", "mobbin", "--wat"], UPSTREAM_DEFAULTS),
		)

		expect(error.code).toBe("option_unknown")
	})
})
