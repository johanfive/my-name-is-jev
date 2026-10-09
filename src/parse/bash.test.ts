import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { extractFromBash } from "./bash.ts";

const branchesByCommand = {
  "git checkout -b feature/user-cache": ["feature/user-cache"],
  "git switch -c fix_login": ["fix_login"],
  "git fetch && git switch -c \"quoted-name\"": ["quoted-name"],
  "git switch main": [],
  "hg checkout -b not-git": [],
  "git checkout -b": [],
  "mkdir -p src/Bad_Dir && touch src/Bad_Name.ts": [],
  "cat > \"$S/notes.md\" <<'EOF'": [],
};

describe("extractFromBash", () => {
  for (const [command, expected] of Object.entries(branchesByCommand)) {
    test(`finds ${JSON.stringify(expected)} in ${command}`, () => {
      const branches = extractFromBash(command).map((id) => id.name);
      assert.deepEqual(branches, expected);
    });
  }

  test("splits a branch name into words on slashes, dashes and underscores", () => {
    const segments = extractFromBash("git switch -c feature/user-cache_v2")[0].segments;
    assert.deepEqual(segments, [
      "feature",
      "user",
      "cache",
      "v2",
    ]);
  });
});
