# ADR-0001: Reopen existing workspaces as-is

## Status

Accepted

## Context

Sessionizer applies a configured tab and pane layout to newly created workspaces. Earlier iterations also tried to infer whether an existing worktree workspace was still "bare" and therefore safe to bootstrap again, using a `1 tab / 1 pane` heuristic.

That heuristic was ambiguous:

- it depended on Herdr workspace shape details
- it was not obvious to users when relayout would happen
- it risked modifying a workspace the user had already touched

## Decision

When a matching workspace already exists:

1. focus or reopen it
2. do not apply layout again

Layout bootstrap is create-time behavior only.

This applies to:

- Sessionizer existing workspace selection
- Worktree reopen paths after direct open
- Worktree reopen paths after duplicate-branch resolution

## Consequences

### Positive

- simpler mental model
- no hidden relayout heuristic
- safer for user-managed workspaces
- easier to test and document

### Negative

- an older workspace that never received the intended layout will not be auto-fixed on reopen
- repair or rebootstrap would need to be an explicit future feature if desired

## Notes

This ADR supersedes the earlier implicit idea that an existing workspace might still be eligible for bootstrap based on shape alone.
