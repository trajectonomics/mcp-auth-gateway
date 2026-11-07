# Subagent Delegation

When an orchestration skill dispatches implementation or review subagents, these rules keep the
worktrees and integration branch coherent.

- **One worktree per ticket.** The child starts from the integration branch, merges the integration
  tip before reporting, and never pushes or merges the integration branch itself.
- **A failed delivery does not mean the child failed.** When a delegation call returns `fetch failed`,
  check `git worktree list` and `git branch` before retrying. The child may already have started; a
  blind retry creates a duplicate worktree and branch.
- **Review subagents are read-only.** Give them the fixed point, the diff command, and pointers to the
  spec and tickets. Do not let them edit the checkout.
- **Merge only the ticket branch.** Use a separate merger step or subagent, keep the integration
  checkout clean, and run the repository check after every merge.
