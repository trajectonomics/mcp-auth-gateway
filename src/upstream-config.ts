import { UPSTREAM_DEFAULTS, type UpstreamConfig } from "./defaults"
import { readEnvValue } from "./env-value"

/** Resolves each Upstream's settings from its own prefixed environment variables. */
export function resolveUpstreams(
	env: Record<string, string | undefined>,
): readonly UpstreamConfig[] {
	return Object.freeze(UPSTREAM_DEFAULTS.map((defaults) => resolveUpstream(defaults, env)))
}

function resolveUpstream(
	defaults: UpstreamConfig,
	env: Record<string, string | undefined>,
): UpstreamConfig {
	const prefix = defaults.name.toUpperCase()
	return Object.freeze({
		name: defaults.name,
		displayName: defaults.displayName,
		route: defaults.route,
		upstreamUrl: readEnvValue(env[`${prefix}_UPSTREAM_URL`], defaults.upstreamUrl),
		issuer: readEnvValue(env[`${prefix}_ISSUER`], defaults.issuer),
		resource: readEnvValue(env[`${prefix}_RESOURCE`], defaults.resource),
		tokenFile: readEnvValue(env[`${prefix}_TOKEN_FILE`], defaults.tokenFile),
		loginCommand: defaults.loginCommand,
	})
}
