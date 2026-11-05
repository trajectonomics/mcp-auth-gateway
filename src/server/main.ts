import { loadGatewayConfig } from "../gateway-config"
import { createGatewayHandler } from "../gateway-handler"
import { createTokenManager } from "../token-manager"
import { createTokenRefresher } from "../token-refresher"
import { createFileTokenStore } from "../token-store"

const config = loadGatewayConfig(process.env)
const store = createFileTokenStore({ path: config.tokenFile })
const refresher = createTokenRefresher({ fetchImpl: fetch })
const tokenManager = createTokenManager({ store, refresher })
const handler = createGatewayHandler({
	gatewaySecret: config.gatewaySecret,
	tokenManager,
	upstreamUrl: config.upstreamUrl,
})

Bun.serve({
	hostname: config.host,
	port: config.port,
	fetch(request, server) {
		server.timeout(request, 0)
		return handler(request)
	},
})
