import { loadGatewayConfig } from "../gateway-config"
import { createGatewayHandler } from "../gateway-handler"
import type { GatewayUpstream } from "../gateway-handler-types"
import { createTokenManager } from "../token-manager"
import { createTokenRefresher } from "../token-refresher"
import { createFileTokenStore } from "../token-store"

const config = loadGatewayConfig(process.env)

// Startup reads no Token File, so a missing one cannot stop the process or
// another Upstream's route.
const upstreams: GatewayUpstream[] = config.upstreams.map((upstream) =>
	Object.freeze({
		...upstream,
		tokenManager: createTokenManager({
			store: createFileTokenStore({ path: upstream.tokenFile }),
			refresher: createTokenRefresher({ fetchImpl: fetch }),
		}),
	}),
)
const handler = createGatewayHandler({
	gatewaySecret: config.gatewaySecret,
	upstreams,
	nowMs: Date.now,
})

Bun.serve({
	hostname: config.host,
	port: config.port,
	fetch(request, server) {
		server.timeout(request, 0)
		return handler(request)
	},
})
