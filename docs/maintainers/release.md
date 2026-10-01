# Releasing

## What a release is

Claude Code installs the plugin from `main` and treats `version` in `.claude-plugin/plugin.json`
as the plugin's version. Merges that leave it unchanged reach no one who is already installed;
a new version is what reaches them. The GitHub release is the changelog: it does not deliver
anything, and nothing is published to npm.

Users do not update on their own: auto-update is off by default for marketplaces outside
Anthropic's. They update from `/plugin` → **Installed** → **Update now**, or with
`claude plugin update my-name-is-jev@my-name-is-jev`, or turn on auto-update in `/plugin` →
**Marketplaces** → `my-name-is-jev` → **Enable auto-update**.

## Steps

```sh
git switch main && git pull
git switch -c release-X.Y.Z
npm version patch            # or minor / major
git commit -am "X.Y.Z"
git push -u origin HEAD
gh pr create --fill
```

Merge the PR. `.github/workflows/release.yml` then tags `vX.Y.Z` on the merge commit and
publishes a GitHub release with notes generated from the PRs merged since the previous tag.
Check it under **Actions** and **Releases**.

The bump can also ride in the PR that ships the change instead of its own PR.

## What does what

- `npm version` bumps `package.json` and `package-lock.json`, then runs the `version` script:
  `scripts/sync-manifest-versions.ts` copies the number into each agent manifest. A new agent's
  manifest goes in its list.
- `.npmrc` sets `git-tag-version=false`, so `npm version` neither commits nor tags. A local tag
  would point at a commit that never reaches `main` once the PR is merged.
- The workflow runs on every push to `main` that touches `package.json`. It runs the same
  script and fails if any manifest changes, and does nothing if the release already exists, so a
  dependency change is harmless.

## Choosing the bump

- **patch**: fixes, reworded messages.
- **minor**: new rules, presets, options; anything a user can adopt without changing their config.
- **major**: a config or import that worked before stops working.

## When something goes wrong

- **The workflow failed on the version check**: a manifest was edited by hand or the bump
  skipped `npm version`. Fix the version in a PR; the merge reruns the workflow.
- **Wrong notes or wrong commit**: delete the release and its tag
  (`gh release delete vX.Y.Z --cleanup-tag`), then rerun the failed or latest run of the
  workflow from **Actions**, or create the release by hand
  (`gh release create vX.Y.Z --target <sha> --generate-notes`).
- **Version shipped with a bug**: release a new patch. Never reuse a version number: installed
  copies keep the old code under that number.
