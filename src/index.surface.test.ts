import { describe, expect, it } from "bun:test"
import * as api from "./index"

const PUBLIC_RUNTIME_EXPORTS = [
	"BootstrapLoginError",
	"GatewayConfigError",
	"PkceError",
	"REFRESH_LEAD_MS",
	"TokenFileParseError",
	"TokenRefreshError",
	"TokenStoreError",
	"atomicWriteFile",
	"createCodeChallenge",
	"createCodeVerifier",
	"createFileTokenStore",
	"createGatewayHandler",
	"createState",
	"createTokenManager",
	"createTokenRefresher",
	"evaluateTokenState",
	"loadGatewayConfig",
	"parseTokenFile",
	"runBootstrapLogin",
	"validateGatewaySecret",
].sort()

describe("public API surface", () => {
	it("exports exactly the documented runtime surface", () => {
		expect(Object.keys(api).sort()).toEqual(PUBLIC_RUNTIME_EXPORTS)
	})
})
