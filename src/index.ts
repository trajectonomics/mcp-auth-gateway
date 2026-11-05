/**
 * Public surface for @trajectonomics/mcp-auth-gateway.
 */

export { atomicWriteFile } from "./atomic-write"
export type { GatewayConfig, GatewayConfigErrorCode } from "./gateway-config"
export { GatewayConfigError, loadGatewayConfig } from "./gateway-config"
export { createGatewayHandler } from "./gateway-handler"
export type { GatewayFetch, GatewayHandlerDeps } from "./gateway-handler-types"
export { validateGatewaySecret } from "./gateway-secret"
export type { HealthStatus } from "./health"
export { getHealthStatus, handleRequest } from "./health"
export type { TokenFile, TokenFileParseErrorCode } from "./token-file"
export { parseTokenFile, TokenFileParseError } from "./token-file"
export type { TokenManager, TokenManagerDeps } from "./token-manager"
export { createTokenManager } from "./token-manager"
export type {
	TokenRefreshErrorCode,
	TokenRefreshErrorMetadata,
} from "./token-refresh-error"
export { TokenRefreshError } from "./token-refresh-error"
export type { TokenRefresher } from "./token-refresher"
export { createTokenRefresher } from "./token-refresher"
export type { TokenState } from "./token-state"
export { evaluateTokenState, REFRESH_LEAD_MS } from "./token-state"
export type { TokenStore } from "./token-store"
export { createFileTokenStore } from "./token-store"
export type { TokenStoreErrorCode } from "./token-store-error"
export { TokenStoreError } from "./token-store-error"
