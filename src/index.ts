/**
 * Public surface for @trajectonomics/mcp-auth-gateway.
 */

export type { HealthStatus } from "./health"
export { getHealthStatus, handleRequest } from "./health"
export type { TokenFile, TokenFileParseErrorCode } from "./token-file"
export { parseTokenFile, TokenFileParseError } from "./token-file"
export type { TokenState } from "./token-state"
export { evaluateTokenState, REFRESH_LEAD_MS } from "./token-state"
