## Agent skills

Skills live in [`skills/`](skills/). Install into `~/.agents/skills` for agent runtimes:

```sh
npx skills add andrewchng/herdr-sessionizer --list
npx skills add andrewchng/herdr-sessionizer --skill sessionizer-layout-editor -y -g
```

- **sessionizer-layout-editor** — edit Sessionizer config (roots, layout, repo-local overrides)

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: CONTEXT.md + docs/adr/ at repo root. See `docs/agents/domain.md`.
