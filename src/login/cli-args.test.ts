import { describe, expect, it } from "bun:test"
import { MOBBIN_DEFAULTS, POSTHOG_DEFAULTS, UPSTREAM_DEFAULTS } from "../defaults"
import { parseLoginArgs } from "./cli-args"

describe("Bootstrap Login CLI arguments", () => {
	it("selects the Upstream and defaults the Token File to its documented path", () => {
		const target = parseLoginArgs(["--upstream", "posthog"], UPSTREAM_DEFAULTS)

		expect(target.upstream).toEqual(POSTHOG_DEFAULTS)
		expect(target.outPath).toBe("/data/posthog-tokens.json")
		expect(Object.isFrozen(target)).toBe(true)
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

		for (const target of [outFirst, upstreamFirst]) {
			expect(target.upstream).toEqual(POSTHOG_DEFAULTS)
			expect(target.outPath).toBe("./posthog.json")
		}
	})

	it("accepts --flag=value form", () => {
		const target = parseLoginArgs(["--upstream=mobbin", "--out=./mobbin.json"], UPSTREAM_DEFAULTS)

		expect(target.upstream).toEqual(MOBBIN_DEFAULTS)
		expect(target.outPath).toBe("./mobbin.json")
	})

	it("refuses a missing, unknown or valueless Upstream", () => {
		expect(() => parseLoginArgs([], UPSTREAM_DEFAULTS)).toThrow("--upstream")
		expect(() => parseLoginArgs(["--upstream", "mailchimp"], UPSTREAM_DEFAULTS)).toThrow(
			"mailchimp",
		)
		expect(() => parseLoginArgs(["--upstream"], UPSTREAM_DEFAULTS)).toThrow("--upstream")
		expect(() => parseLoginArgs(["--upstream="], UPSTREAM_DEFAULTS)).toThrow("--upstream")
	})

	it("refuses a valueless or unknown argument", () => {
		expect(() => parseLoginArgs(["--upstream", "mobbin", "--out"], UPSTREAM_DEFAULTS)).toThrow(
			"--out",
		)
		expect(() => parseLoginArgs(["--upstream", "mobbin", "--wat"], UPSTREAM_DEFAULTS)).toThrow(
			"Unknown argument",
		)
	})
})
