/**
 * Public surface for @trajectonomics/mcp-auth-gateway.
 */

export { atomicWriteFile } from "./atomic-write"
export type { HealthStatus } from "./health"
export { getHealthStatus, handleRequest } from "./health"
export type { BootstrapLoginDeps } from "./login/bootstrap-login"
export { runBootstrapLogin } from "./login/bootstrap-login"
export type { BootstrapLoginErrorCode } from "./login/errors"
export { BootstrapLoginError } from "./login/errors"
export type { PkceErrorCode } from "./login/pkce"
export { createCodeChallenge, createCodeVerifier, createState, PkceError } from "./login/pkce"
export type { TokenFile, TokenFileParseErrorCode } from "./token-file"
export { parseTokenFile, TokenFileParseError } from "./token-file"
export type { TokenState } from "./token-state"
export { evaluateTokenState, REFRESH_LEAD_MS } from "./token-state"
export type { TokenStore } from "./token-store"
export { createFileTokenStore } from "./token-store"
export type { TokenStoreErrorCode } from "./token-store-error"
export { TokenStoreError } from "./token-store-error"
