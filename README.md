# @trajectonomics/mcp-auth-gateway

Headless-friendly MCP auth-relay reverse proxy and background token manager

[![CI](https://github.com/trajectonomics/mcp-auth-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/trajectonomics/mcp-auth-gateway/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Part of the [Trajectonomics](https://github.com/trajectonomics) ecosystem.

---

## Installation & Deployment

```bash
bun install
bun run build
```

## Getting Started

```typescript
import { handleRequest } from "@trajectonomics/mcp-auth-gateway"

const response = handleRequest("/health", "mcp-auth-gateway", Date.now())
console.log(response.status)
```

---

## Development

```bash
# Install dependencies
bun install

# Run full verification suite (lint, typecheck, tests, build)
bun run check

# Run tests
bun test

# Code formatting & lint
bun run format
bun run lint
```

---

## Domain Documentation

- [GLOSSARY.md](./GLOSSARY.md): Ubiquitous domain terminology.
- [AGENTS.md](./AGENTS.md): Guidelines and rules for autonomous AI coding agents.
- [CODING_STANDARDS.md](./CODING_STANDARDS.md): Architecture, purity, and review invariants.
- [docs/adr/](./docs/adr/): Architecture Decision Records.

---

## License

[MIT](./LICENSE)
