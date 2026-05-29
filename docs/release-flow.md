# Release Flow

How releases work for `da-sc-sdk`: which GitHub Actions workflow runs, when, and what each step does.

## Workflows at a glance

Two workflows, deliberately separated by concern:

| Workflow | Trigger | Purpose | Secrets |
|---|---|---|---|
| [`.github/workflows/main.yaml`](../.github/workflows/main.yaml) | `push` (any branch) | Lint, test, run semantic-release on `main` | `GITHUB_TOKEN` (auto-provided) |
| [`.github/workflows/npm-publish.yml`](../.github/workflows/npm-publish.yml) | `release: [published]` | Publish the tagged version to npm | `ADOBE_BOT_NPM_TOKEN` |

### Why two files?

- **Trigger semantics.** `main` runs on every push; `npm-publish` runs only when semantic-release emits a GitHub Release. Different events → different files.
- **Secret scoping.** `ADOBE_BOT_NPM_TOKEN` is only loaded by `npm-publish.yml`. The test job in `main.yaml` runs untrusted user code (dependencies, fixtures) and never sees the npm token.
- **Tighter permissions.** `main.yaml` needs `contents: write` for semantic-release to commit/tag. `npm-publish.yml` only needs `contents: read`.
- **Independent re-runs.** If publishing fails (npm outage, expired token), the publish workflow can be re-run without re-running the whole test suite.

## Flow 1 — push to a feature/PR branch

```
[git push feature/foo]
        │
        ▼
┌────────────────────────────────────────┐
│ main.yaml  (trigger: push)             │
│                                        │
│   ┌──────────┐                         │
│   │   test   │  lint + wtr tests       │
│   └────┬─────┘                         │
│        │ needs: test                   │
│        ▼                               │
│   ┌────────────────────────┐           │
│   │ semantic-release-dry   │  if: ref  │
│   │  (dry-run, no commits) │  != main  │
│   └────────────────────────┘           │
│                                        │
│   ┌──────────┐                         │
│   │ release  │  SKIPPED (ref != main)  │
│   └──────────┘                         │
└────────────────────────────────────────┘
        │
        ▼
   no GitHub Release → npm-publish does NOT fire
```

The dry-run job prints what *would* be released if this branch were merged to `main` (next version, changelog draft). It never commits or tags.

## Flow 2 — merge to `main` with a releasable commit

A commit is releasable if its [Conventional Commits](https://www.conventionalcommits.org/) type is `feat:`, `fix:`, or carries a `BREAKING CHANGE:` footer.

```
[PR merged → push to main]
        │
        ▼
┌────────────────────────────────────────────┐
│ main.yaml  (trigger: push)                 │
│                                            │
│   ┌──────────┐                             │
│   │   test   │                             │
│   └────┬─────┘                             │
│        │ needs: test                       │
│        ▼                                   │
│   ┌────────────────────────┐               │
│   │ semantic-release-dry   │  SKIPPED      │
│   └────────────────────────┘  (ref==main)  │
│                                            │
│   ┌──────────────────────────────────┐     │
│   │ release   (if: ref == main)      │     │
│   │                                  │     │
│   │  semantic-release:               │     │
│   │   1. analyze commits             │     │
│   │   2. bump package.json version   │     │
│   │   3. write CHANGELOG.md          │     │
│   │   4. commit  ──┐                 │     │
│   │   5. tag vX.Y.Z                  │     │
│   │   6. create GitHub Release ──┐   │     │
│   └──────────────────────────────│───┘     │
└──────────────────────────────────│─────────┘
                                   │
        [GitHub Release published] ◀┘
                                   │
                                   ▼
┌────────────────────────────────────────────┐
│ npm-publish.yml                            │
│   (trigger: release: [published])          │
│                                            │
│   ┌──────────────────────────────────┐     │
│   │  npm-publish                     │     │
│   │   1. checkout tag vX.Y.Z         │     │
│   │   2. setup-node + npmjs registry │     │
│   │   3. npm install                 │     │
│   │   4. npm publish                 │     │
│   │       └─ prepublishOnly:         │     │
│   │           npm run build → dist/  │     │
│   │       └─ uploads tarball to npm  │     │
│   │          (using ADOBE_BOT_NPM_   │     │
│   │           TOKEN)                 │     │
│   └──────────────────────────────────┘     │
└────────────────────────────────────────────┘
        │
        ▼
   package vX.Y.Z is live on npmjs.com
```

> **Note on the `v` prefix.** The git tag and GitHub Release are `vX.Y.Z` (e.g. `v1.2.3`); the npm package version drops the `v` (`1.2.3`). Consumers install with `npm install da-sc-sdk@1.2.3`, not `@v1.2.3`.

## Flow 3 — merge to `main` with non-releasable commits only

`chore:`, `docs:`, `test:`, `refactor:`, `style:`, `ci:` commits do **not** trigger a release.

```
[push to main with only chore/docs/test]
        │
        ▼
   main.yaml runs → test ✓ → release runs
        │
        ▼
   semantic-release: "no relevant changes, skipping release"
        │
        ▼
   no version bump, no tag, no GitHub Release
        │
        ▼
   npm-publish does NOT fire
```

## Commit conventions that drive releases

| Commit prefix | Release impact |
|---|---|
| `feat: …` | minor version bump (`X.Y.0` → `X.(Y+1).0`) |
| `fix: …` | patch version bump (`X.Y.Z` → `X.Y.(Z+1)`) |
| `perf: …` | patch version bump |
| Revert commits (`git revert` style: `Revert "…"`) | patch version bump |
| `feat!: …` or footer `BREAKING CHANGE: …` | major version bump (`X.Y.Z` → `(X+1).0.0`) |
| `chore:`, `docs:`, `test:`, `refactor:`, `style:`, `ci:` | no release |

The first release ever cut by semantic-release starts at `1.0.0` regardless of the current `package.json` version.

## Required setup before the first release

1. **`ADOBE_BOT_NPM_TOKEN`** repo secret — an npm automation token with publish access for `da-sc-sdk`, set as a GitHub Actions secret on this repo.
2. **npm package name availability** — confirm `da-sc-sdk` is available on npmjs.com or owned by the publishing account.
3. **Branch protection** — `main` should require the `test` check to pass before merge.

## Files involved

- [`.github/workflows/main.yaml`](../.github/workflows/main.yaml) — CI + release
- [`.github/workflows/npm-publish.yml`](../.github/workflows/npm-publish.yml) — npm publish
- [`.releaserc.cjs`](../.releaserc.cjs) — semantic-release plugin configuration
- [`package.json`](../package.json) — `semantic-release` / `semantic-release-dry` scripts, `prepublishOnly` build hook, `files` allowlist for the published tarball
