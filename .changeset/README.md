# Changesets

Versioning and publishing for the three packages, kept in lockstep (`fixed`):

- `@transcribevideototext/client`
- `@transcribevideototext/mcp-server`
- `@transcribevideototext/cli`

## Workflow

```bash
pnpm changeset          # describe a change
pnpm version-packages   # bump versions + changelogs
pnpm release            # build, then publish to npm
```

The first release publishes at the current `0.1.0` — no changeset needed.
