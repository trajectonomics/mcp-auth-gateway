# syntax=docker/dockerfile:1

# Build stage: install dev dependencies and emit dist/server/main.mjs.
FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json tsconfig.base.json tsdown.config.ts ./
COPY src ./src
RUN bun install --frozen-lockfile && bun run build

# Runtime stage: production dependencies and build output only, unprivileged user.
FROM oven/bun:1.4.4-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
	PORT=8080 \
	HOST=127.0.0.1 \
	TOKEN_FILE=/data/tokens.json
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && rm -rf /home/bun/.bun/install/cache
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown bun:bun /data
VOLUME ["/data"]
USER bun
EXPOSE 8080
CMD ["bun", "dist/server/main.mjs"]
