# DSH compatibility snapshot

This directory preserves the existing local DSH changes used by the Aster `codex/0928` snapshot. It does not claim that an unmodified official DSH release provides these additions. No DSH credentials, profiles, user settings, session logs, or build outputs are included.

- Upstream: https://github.com/deepseek-ai/deepseek-harness
- Base: `00102833dfaee1da9f48a3a8eae9d34005a75218` (`0.1.7-alpha.2` release merge).
- Patch: `aster-compat.patch` (31 tracked-file changes and two new Schedule source files).

The patch allows the web profile to serve Aster's bundled interface via `frontendDistIndex`, supplies its image/font MIME types, exposes resolved plugin relationships, and provides Schedule management methods for Aster's reminder editor. It also includes the corresponding types, dependencies, tests and documentation. It leaves the Agent loop implementation unchanged.

## Reproduce in a separate DSH checkout

Keep an existing working DSH checkout intact. In a fresh checkout of the upstream repository:

```sh
git checkout --detach 00102833dfaee1da9f48a3a8eae9d34005a75218
git apply --check /absolute/path/to/aster/integrations/dsh/aster-compat.patch
git apply /absolute/path/to/aster/integrations/dsh/aster-compat.patch
pnpm install --frozen-lockfile
pnpm run build
```

Then, from the Aster repository root:

```sh
ASTER_DSH_REPO=/absolute/path/to/patched-dsh ./script/build_and_run.sh
```

The patch is tied to this upstream revision; review it before applying to a newer DSH version. The snapshot preserves the current integration for reproducibility. The requested broader comparison with official DSH remains separate work, and this publication does not assert feature parity.
