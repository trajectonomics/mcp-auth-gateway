# ADR 0002: CI Image Publishing and OCI Deployment Boundary

## Status

Accepted

## Context

The gateway runs in production on an Oracle Cloud Infrastructure (OCI) Compute VM. Automated continuous deployment from GitHub Actions via inbound SSH would require opening SSH port 22 to the public internet (`0.0.0.0/0`) due to dynamic GitHub runner IP ranges, and storing server private SSH credentials in GitHub repository secrets.

Furthermore, deployment responsibilities span two repositories:
- `trajectonomics/mcp-auth-gateway` (this repository): Application source, container packaging, and CI image publishing.
- `trajectonomics/infra#3`: Host provisioning, Tailscale/Cloudflare network wiring, host Docker Compose specification, and operational runbooks.

## Decision

1. **CI & Image Publishing Only**:
   - GitHub Actions builds multi-architecture container images (`linux/amd64`, `linux/arm64`) using `oven/bun:alpine` on push to `main` and publishes them to GitHub Container Registry (`ghcr.io/trajectonomics/mcp-auth-gateway`).
   - Images are published publicly to eliminate host credential requirements on OCI.
   - Images are tagged with immutable commit SHAs and release tags.
   - No automated push deployment workflow from GitHub to the VM is maintained in this repository.

2. **Host-Side Operations & Repository Boundary**:
   - Host-level orchestration (Docker Compose files, Tailscale integration, systemd services) is officially maintained in `trajectonomics/infra#3`.
   - This repository maintains a reference `docker-compose.yml` and container contract documentation solely for local verification and infrastructure contract alignment.
   - Updates on the OCI VM are performed host-side by an operator pulling the pinned immutable image tag.

3. **Network Boundary (No Inbound Management Ports)**:
   - The OCI VM maintains zero inbound management ports (SSH port 22 closed to the internet).
   - Gateway traffic arrives via private network mesh (Tailscale) or Cloudflare Tunnel, strictly validated by the Gateway Secret.
   - Containers bind only to localhost (`127.0.0.1`) or the private network interface, never `0.0.0.0`.

4. **Container Isolation & Storage Mounts**:
   - The persistent volume is mounted at directory level (`/data`), not single-file level, to ensure atomic directory renames (`rename` syscall) succeed without `EBUSY`.
   - The container executes as unprivileged user `bun` (UID 1000) with `read_only` root filesystem, dropping all capabilities (`cap_drop: ALL`), with write access restricted strictly to `/data`.

## Consequences

- Zero server credentials in GitHub Actions and zero open SSH ports on OCI.
- Clear separation between application development (`mcp-auth-gateway`) and infrastructure operations (`infra`).
- Atomic rename operations on the Token File are guaranteed to succeed across volume mounts.
