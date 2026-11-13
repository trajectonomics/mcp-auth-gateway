# AGENTS.md

Instructions for AI coding agents in `trajectonomics/mcp-auth-gateway` (`@trajectonomics/mcp-auth-gateway`).

## Rules

1. Never commit to `main`. Branch (`feat/*`, `fix/*`, `docs/*`) and open a PR.
2. Never commit secrets or `.env` files. `NPM_TOKEN` lives in repo secrets only.
3. Package design: Keep core packages pure and deterministic wherever applicable (data in, data out, no I/O, no clock, no unseeded randomness). Keep boundaries closed-world with explicit contracts.
4. Bun only: `bun install`, `bun test`, `bun run <script>`. Do not add npm/pnpm/yarn lockfiles.
5. Done means `bun run check` passes (Biome lint with zero warnings, strict typecheck, tests, build, publint + are-the-types-wrong). `bun run format` fixes formatting and import order. Container or workflow changes must also pass the `container` and `workflows` CI jobs. Do not loosen `tsconfig.base.json` or `biome.json` to make an error go away.
6. Never edit `version` in `package.json` and never run `npm publish` locally. Merges to `main` publish alphas; a stable release is the manual Release workflow. PR titles are conventional commits (`feat:`, `fix:`, `feat!:` ...) because they decide the next version (see README "Releasing").
7. Model & Pi (`pi.dev`) rules:
   - Never use `gemini-3.8-flash` anywhere; use `gemini-4-hydrogen` instead for Antigravity tasks and reviews (and `gemini-4-argon` where configured).
   - When running the Pi coding agent (`pi.dev`), strictly use **DeepSeek 4.1 Flash** only (e.g., `deepseek/deepseek-v4.1-flash`, `deepseek/deepseek-v4.1-flash-fast`), whether routed via Command Code GOAT (`command-code`) or OpenCode Go (`opencode`). Do not switch to or run any other models (Claude, GPT, Gemini, etc.) in Pi sessions for this repository. This rule is mechanically enforced via `.pi/settings.json`.
8. Temporary files & scratch clones: `/tmp` is a shared, nearly full tmpfs. Never use fixed `/tmp` filenames (use `mktemp` or `--body-file -` for `gh` bodies) or install `node_modules` / clone scratch repos under `/tmp`; use `~/.cache/<slug>`.

## Owner

Save owner attention:
- Finish work end-to-end (commit, push, PR, independent review, `gh pr merge` when green/told to proceed, follow-up steps) without stopping for small permission questions or `## Not done yet` lists.
- When unsure, consult subagents on other models (`claude-sonnet-5-5`, `gemini-4-hydrogen`, `gemini-4-argon`, `deepseek-v4.1-flash`) instead of asking the owner.
- Check live GitHub state (`gh issue view`, `gh pr view`) and CLI/API schemas before claiming a blocker.
- Keep owner replies short (lead with what only the owner must do).
- Record durable lessons in repo instructions rather than agent memory.
- Settle your own T3 thread (`t3_thread_organize`, `action: "settle"`) when done and nothing waits on the owner.

## Agent skills

### Skills included in this repository

- **Matt Pocock Skills (`mattpocock/skills`)**: Complete engineering workflow including `/ask-matt`, `/tdd`, `/implement`, `/code-review`, `/wayfinder`, `/diagnosing-bugs`, `/codebase-design`, `/grill-with-docs`, etc.
- **Trajectonomics Internal Skills (`trajectonomics/internal-skills`)**: Organization-specific workflow including `/pick-the-issue` to discover unblocked GitHub issues not currently handled by active T3 Code sessions and route them into the `ask-matt` framework.

### Reviewing a diff

`CODING_STANDARDS.md`: the conventions `bun run check` cannot enforce. Read it when reviewing, not when implementing.

### Issue tracker

GitHub Issues via the `gh` CLI. A spec needs ticket sub-issues before implementation; if absent, create the graph first. See `docs/agents/issue-tracker.md`.

### GitHub operations

Workflow-file pushes need the `workflow` scope; retry transient `commit_refs_rules` failures. See `docs/agents/github-operations.md`.

### Delegation

Dispatching subagents: one worktree per ticket, and check for an existing worktree after a `fetch failed` before retrying. See `docs/agents/delegation.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Hosting

Host deployment, Compose, Tailscale, and runbooks live in `trajectonomics/infra#3`. This repo publishes the image and container contract only. See `docs/adr/0002-ci-publish-and-manual-oci-deployment.md`.

### Installing and updating skills

Skills come from [`mattpocock/skills`](https://github.com/mattpocock/skills) and [`trajectonomics/internal-skills`](https://github.com/trajectonomics/internal-skills) via the Vercel [`skills`](https://github.com/vercel-labs/skills) CLI and are pinned in `skills-lock.json`. The canonical copy is `.agents/skills/` (read natively by Codex, OpenCode, Pi, and Antigravity CLI); `.claude/skills/` holds symlinks into it for Claude Code. Never edit them by hand.

- Update: `bun run skills:update` (or `npx skills update -p -y`)
- Check status: `bun run skills:check` (or `npx skills check`)
- Reinstall:
  ```bash
  npx skills add mattpocock/skills --skill '*' -a claude-code codex opencode antigravity-cli pi -y
  npx skills add trajectonomics/internal-skills -y
  ```
- Restore from the lock: `npx skills experimental_install`

## Repository Information

- Repository: https://github.com/trajectonomics/mcp-auth-gateway
- Package: `@trajectonomics/mcp-auth-gateway`

## Factory Runs

A Factory Run or Spec drafter (a thread titled `traj/trajectonomics/<repo>#<n>` or `triage/trajectonomics/<repo>#<n>`) takes its instructions from the Dispatcher runbook in `trajectonomics/factory`, never from this repository, where `docs/dispatcher-runbook.md` does not exist. Read it with `gh api repos/trajectonomics/factory/contents/docs/dispatcher-runbook.md -H "Accept: application/vnd.github.raw"`. If you cannot read it, stop and say so; do not build from the issue alone.
