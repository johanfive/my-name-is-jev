# Releasing

## What a release is

Claude Code installs the plugin from `main` and treats `version` in `.claude-plugin/plugin.json`
as the plugin's version.  
Existing installs only pick up a merge once that version changes.

The GitHub release is the changelog: it does not deliver anything, and nothing is published to npm.

Users still have to update, by hand or with auto-update turned on: see [Updates](../install.md#updates).

## Steps

The bump rides in the PR that changes what the plugin does. On that PR's branch:

```sh
npm version patch            # or minor / major
git commit -am "X.Y.Z"
git push
```

Merge the PR. `.github/workflows/release.yml` then tags `vX.Y.Z` on the merge commit and
publishes a GitHub release with notes listing the titles of the PRs merged since the previous tag.
Check it under **Actions** and **Releases**.

The workflow fails a PR that changes shipped code and leaves the version alone. Claude Code
installs from `main`, not from the tag: without a bump, new installs would get the new code under
the old number while existing installs keep the old code.

A PR that changes no shipped code (docs, CI, lint config) needs no bump. It passes the checks,
and merging it releases nothing: the workflow does not run on `main` unless the merge touches
`package.json` or an agent manifest.

## What does what

- `npm version` bumps `package.json` and `package-lock.json`, then runs the `version` script:
  `scripts/sync-manifest-versions.ts` copies the number into each agent manifest. A new agent's
  manifest goes in its list, and in the workflow's `paths`.
- `.npmrc` sets `git-tag-version=false`, so `npm version` neither commits nor tags. A local tag
  would point at a commit that never reaches `main` once the PR is merged.
- The workflow runs on every pull request, and on every push to `main` that touches
  `package.json` or an agent manifest. It first runs `scripts/sync-manifest-versions.ts` again
  and fails if the script had anything to rewrite: a manifest did not carry the `package.json`
  version.
- On a pull request it then compares against `main`: a change under `src`, `adapters`, `bin`,
  `.claude-plugin` or to `package-lock.json` must come with a different version. The check
  cannot tell behaviour from text, so a comment-only change in those folders needs a patch bump
  too.
- On `main` it creates the release, unless it already exists: a `package.json` change that leaves
  the version alone (description, scripts) is a no-op.

## Choosing the bump

- **patch**: fixes, reworded messages.
- **minor**: new rules, presets, options; anything a user can adopt without changing their config.
- **major**: a config or import that worked before stops working.

## When something goes wrong

- **The manifest check failed**: a manifest was edited by hand or the bump skipped
  `npm version`. On a pull request, fix the version on the branch and push. On `main`, fix it in
  a new PR; the merge reruns the workflow.
- **The bump check failed**: run `npm version` on the branch, commit and push. If `main` moved to
  the same number in the meantime, merge `main` in and bump again.
- **Wrong notes or wrong commit**: delete the release and its tag
  (`gh release delete vX.Y.Z --cleanup-tag`), then rerun the failed or latest run of the
  workflow from **Actions**, or create the release by hand
  (`gh release create vX.Y.Z --target <sha> --generate-notes`).
- **Version shipped with a bug**: release a new patch. Never reuse a version number: installed
  copies keep the old code under that number.
