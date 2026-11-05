import { DEFAULT_TOKEN_FILE, DEFAULT_UPSTREAM_URL } from "./defaults"

/** Runtime configuration for the HTTP Gateway. */
export interface GatewayConfig {
	readonly gatewaySecret: string
	readonly upstreamUrl: string
	readonly tokenFile: string
	readonly port: number
	readonly host: string
}

/** Domain error codes for refusing to start the HTTP Gateway. */
export type GatewayConfigErrorCode =
	| "gateway_secret_missing"
	| "gateway_secret_too_short"
	| "port_invalid"
	| "host_invalid"

/** Error thrown when runtime configuration cannot produce a Gateway Config. */
export class GatewayConfigError extends Error {
	readonly code: GatewayConfigErrorCode

	constructor(code: GatewayConfigErrorCode, message: string) {
		super(message)
		this.name = "GatewayConfigError"
		this.code = code
	}
}

const MIN_SECRET_BYTES = 32
const DEFAULT_PORT = 8080
const DEFAULT_HOST = "127.0.0.1"
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"])

/** Loads a frozen Gateway Config from the environment, refusing insecure startup. */
export function loadGatewayConfig(env: Record<string, string | undefined>): GatewayConfig {
	const gatewaySecret = env["GATEWAY_INTERNAL_SECRET"]
	if (gatewaySecret === undefined || gatewaySecret.length === 0) {
		throw new GatewayConfigError("gateway_secret_missing", "GATEWAY_INTERNAL_SECRET is required")
	}
	if (Buffer.byteLength(gatewaySecret, "utf8") < MIN_SECRET_BYTES) {
		throw new GatewayConfigError(
			"gateway_secret_too_short",
			`GATEWAY_INTERNAL_SECRET must be at least ${MIN_SECRET_BYTES} bytes`,
		)
	}
	return Object.freeze({
		gatewaySecret,
		upstreamUrl: valueOrDefault(env["UPSTREAM_URL"], DEFAULT_UPSTREAM_URL),
		tokenFile: valueOrDefault(env["TOKEN_FILE"], DEFAULT_TOKEN_FILE),
		port: parsePort(env["PORT"]),
		host: parseHost(env["HOST"]),
	})
}

function valueOrDefault(value: string | undefined, fallback: string): string {
	return value === undefined || value.length === 0 ? fallback : value
}

function parseHost(value: string | undefined): string {
	const host = valueOrDefault(value, DEFAULT_HOST)
	if (WILDCARD_HOSTS.has(host)) {
		throw new GatewayConfigError(
			"host_invalid",
			`HOST must never be a wildcard address; bind ${DEFAULT_HOST} or a private interface`,
		)
	}
	return host
}

function parsePort(value: string | undefined): number {
	if (value === undefined || value.length === 0) return DEFAULT_PORT
	const port = Number(value)
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new GatewayConfigError("port_invalid", "PORT must be an integer between 1 and 65535")
	}
	return port
}
