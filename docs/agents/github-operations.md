# GitHub Operations for Agents

Use the `gh` CLI. Check the credential before the first write:

```bash
gh auth status
```

The `Token scopes` line is authoritative. Two failures this repository has hit are credential scope
and transient server errors; neither is a reason to rewrite history.

## Workflow files need the `workflow` scope

GitHub rejects any ref update that creates or edits `.github/workflows/*` unless the token has the
`workflow` scope:

```text
refusing to allow an OAuth App to create or update workflow `.github/workflows/...` without `workflow` scope
```

The Git Data and Contents APIs enforce the same rule; there is no API bypass. Upgrade the existing
login, then retry the same push:

```bash
gh auth refresh -h github.com -s workflow
```

If the credential cannot be upgraded, push the branch without the workflow file and land that file
from a credential that has the scope.

## Transient `fatal error in commit_refs_rules`

This is a server-side ruleset evaluation failure, not a policy rejection. Retry the same push after
a short wait. Do not force-push or rewrite history to work around it. If it persists, inspect token
scopes and repository rules.

## Issue graph writes can fail while REST is healthy

`gh issue create --parent` and dependency edits can return GraphQL 502s or leave a partial graph.
Create the issue, then link it through REST:

```bash
# Sub-issue of a parent
gh api --method POST repos/OWNER/REPO/issues/PARENT/sub_issues \
  -F sub_issue_id="$(gh api repos/OWNER/REPO/issues/CHILD --jq .id)"

# Blocked-by edge
gh api --method POST repos/OWNER/REPO/issues/CHILD/dependencies/blocked_by \
  -F issue_id="$(gh api repos/OWNER/REPO/issues/BLOCKER --jq .id)"
```

Verify both edges:

```bash
gh api repos/OWNER/REPO/issues/PARENT/sub_issues --jq '.[].number'
gh api repos/OWNER/REPO/issues/CHILD/dependencies/blocked_by --jq '.[].number'
```

## GHCR package visibility is manual

The publish workflow's `GITHUB_TOKEN` can push images but cannot change package visibility. After the
first publish, set the package to **public** in GitHub package settings, or use a token with
`write:packages` and:

```bash
gh api --method PATCH orgs/ORG/packages/container/NAME -f visibility=public
```

## Merge only after checks

```bash
gh pr checks <number> --watch
gh pr merge <number> --squash --delete-branch
```
