---
name: gh-release
description: Ships herdr-sessionizer releases end to end — tag on main, extract CHANGELOG notes, and publish the GitHub release. Use when the user asks to release, ship, tag, or publish a version, create a GitHub release, or finish release prep for v0.x.x.
---

# GitHub Release

Release tooling lives under `scripts/release/` (`prep.ts`, `tag.ts`, `notes.ts`). The `package.json` commands stay `release`, `release:tag`, and `release:notes`.

## Quick start

When the user says "release 0.4.0" or "ship the new version", run this sequence on `main`:

```sh
bun run test
bun run typecheck
bun run release:tag -- 0.4.0
bun run release:notes -- 0.4.0 > /tmp/release-notes-0.4.0.md
gh release create v0.4.0 --title "v0.4.0" --notes-file /tmp/release-notes-0.4.0.md --latest
gh release view v0.4.0
```

Report the release URL. Remove the temp notes file when done.

## When to use

Trigger this skill when the user wants to:

- Release, ship, tag, or publish a version
- Create the GitHub release page for a version
- Finish release work after changelog and version files are ready

Upstream prep (`bun run release -- <version>` plus filling in `CHANGELOG.md`) may already be done. If not, do that first on a branch, merge to `main`, then run the ship workflow below.

## Ship workflow

Run these steps in order. Skip a step only when its precondition is already satisfied.

### 1. Confirm version is ready

- `package.json` and `herdr-plugin.toml` both have version `<version>`
- `CHANGELOG.md` has `## [<version>] - YYYY-MM-DD` with real Added/Changed bullets (not `TBD`)
- Changes are merged on `main`

If version files still need bumping, run `bun run release -- <version>` on a branch, fill in the changelog, merge, then continue.

### 2. Preflight on `main`

```sh
git checkout main
git pull
bun run test
bun run typecheck
```

`release:tag` requires:

- current branch is `main`
- clean working tree
- `package.json` and `herdr-plugin.toml` versions match `<version>`
- tag `v<version>` does not already exist locally

### 3. Tag

```sh
bun run release:tag -- <version>
```

This creates an annotated `v<version>` tag and pushes it to `origin`.

If the tag already exists on `origin`, skip tagging and continue to step 4.

Dry-run first when unsure: `bun run release:tag -- <version> --dry-run`

### 4. Build release notes

```sh
bun run release:notes -- <version> > /tmp/release-notes-<version>.md
```

`release:notes` extracts the changelog section for `<version>`, converts `<kbd>` to backticks, and appends the Keep a Changelog footer. It prints to stdout only — it does not create the GitHub release.

### 5. Publish GitHub release

Preflight:

- `git ls-remote --tags origin v<version>` — tag must exist on `origin`
- `gh release view v<version>` — if it exists, stop and report the URL

Publish:

```sh
gh release create v<version> --title "v<version>" --notes-file /tmp/release-notes-<version>.md --latest
gh release view v<version>
```

Notes format matches prior releases: title is `v<version>`, body starts at `### Added` / `### Changed` (no `## [version] - date` heading).

## Guardrails

- Tag name is always `v<version>` (for example `v0.4.0`), not bare semver.
- Run `release:tag` only from clean `main` with matching version files.
- Do not overwrite an existing GitHub release without explicit user approval.
- If changelog bullets still say `TBD`, stop and ask the user to finish the changelog first.
- Execute the commands yourself; do not only tell the user what to run.

## Examples

**Full ship**

User: "Release 0.5.0."

1. Verify `0.5.0` in version files and changelog on `main`
2. `bun run test` and `bun run typecheck`
3. `bun run release:tag -- 0.5.0`
4. `bun run release:notes -- 0.5.0 > /tmp/release-notes-0.5.0.md`
5. `gh release create v0.5.0 --title "v0.5.0" --notes-file /tmp/release-notes-0.5.0.md --latest`
6. Return the release URL

**Tag already pushed**

User: "I tagged 0.4.0, publish the GitHub release."

1. Confirm tag on `origin`
2. Skip `release:tag`
3. `release:notes` → `gh release create` → report URL

**Already published**

If `gh release view v<version>` succeeds, report the existing URL instead of creating a duplicate.
