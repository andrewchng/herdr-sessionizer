# CLI help

## Sub-features

- Lists all plugin modes (`open`, `sessionizer`, `worktree`, …).
- Rejects unknown modes with non-zero exit.

## How to get to it (user POV)

From a built checkout:

```bash
./dist/sessionizer --help
```

## Driving it with subprocess

```bash
.cursor/skills/verify-sessionizer/helpers/launch-build.sh
./dist/sessionizer --help
./dist/sessionizer not-a-mode ; test $? -eq 1
```

## Gotchas

- Requires `bun run build` first; Herdr plugin install builds the same binary on the user machine.
