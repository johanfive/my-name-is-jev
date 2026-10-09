import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { pathExtractor } from "./path.ts";
import { typescriptExtractor } from "./typescript.ts";
import { extractFromTreeDiff, snapshotWorkingTree } from "./working-tree.ts";

// These tests run the real git in a temp directory: what they check is git's answer,
// and a mocked git would only test the mock.

const runGit = (root: string, args: string[]) =>
  execFileSync("git", [
    "-c",
    "user.name=nij",
    "-c",
    "user.email=nij@test",
    ...args,
  ], {
    cwd: root,
    encoding: "utf8",
  });

/**
 * Creates a git repository holding `committed`, removed when the test ends.
 *
 * @param t The test context that removes the repository.
 * @param committed The content of each committed file, by path.
 * @returns The repository's root.
 */
function createRepo(t: TestContext, committed: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "nij-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  runGit(root, ["init", "--quiet"]);
  writeFiles(root, { ".gitignore": "ignored/\n", ...committed });
  runGit(root, ["add", "--all"]);
  runGit(root, [
    "commit",
    "--quiet",
    "--message",
    "init",
  ]);
  return root;
}

const writeFiles = (root: string, contentByPath: Record<string, string>) => {
  for (const [path, content] of Object.entries(contentByPath)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
};

/**
 * Snapshots the repository, runs `change`, snapshots again, and returns the names in the
 * changed files.
 *
 * @param root The repository's root.
 * @param change What the "command" does to the working tree.
 * @returns Each identifier found as `kind:name`, marked `(new)` when the change introduced it.
 */
function getNamesAfterChange(root: string, change: () => void): unknown[] {
  const treeBefore = snapshotWorkingTree(root)!;
  change();
  const treeAfter = snapshotWorkingTree(root)!;
  return extractFromTreeDiff(root, treeBefore, treeAfter, [pathExtractor, typescriptExtractor])
    .map((id) => `${id.kind}:${id.name}${id.isNew ? " (new)" : ""}`);
}

describe("extractFromTreeDiff", () => {
  test("finds the names in a file the shell wrote", (t) => {
    const root = createRepo(t, { "src/cache.ts": "const cache = 1;" });
    const names = getNamesAfterChange(root, () =>
      writeFiles(root, { "src/billing/invoice-total.ts": "const invoiceTotal = 1;" }),
    );
    assert.deepEqual(names, [
      "dir:billing (new)",
      "file:invoice-total.ts (new)",
      "const:invoiceTotal (new)",
    ]);
  });

  test("marks only the names an in-place edit adds as new", (t) => {
    const root = createRepo(t, { "src/billing/cache.ts": "const kept = 1;" });
    const names = getNamesAfterChange(root, () =>
      writeFiles(root, { "src/billing/cache.ts": "const kept = 1;\nconst added = 2;" }),
    );
    assert.deepEqual(names, [
      "dir:billing",
      "file:cache.ts",
      "const:kept",
      "const:added (new)",
    ]);
  });

  test("marks a renamed file's name as new, but not the names inside it", (t) => {
    const root = createRepo(t, { "src/old-name.ts": "const kept = 1;" });
    const names = getNamesAfterChange(root, () =>
      runGit(root, [
        "mv",
        "src/old-name.ts",
        "src/New_Name.ts",
      ]),
    );
    assert.deepEqual(names, ["file:New_Name.ts (new)", "const:kept"]);
  });

  test("sees changes to files that were already uncommitted", (t) => {
    const root = createRepo(t, {});
    writeFiles(root, { "src/draft.ts": "const first = 1;" });
    const names = getNamesAfterChange(root, () =>
      writeFiles(root, { "src/draft.ts": "const first = 1;\nconst second = 2;" }),
    );
    assert.deepEqual(names, [
      "file:draft.ts",
      "const:first",
      "const:second (new)",
    ]);
  });

  test("ignores files git ignores", (t) => {
    const root = createRepo(t, {});
    const names = getNamesAfterChange(root, () =>
      writeFiles(root, { "ignored/Bad_Name.ts": "const bad_name = 1;" }),
    );
    assert.deepEqual(names, []);
  });
});

describe("snapshotWorkingTree", () => {
  test("leaves the staging area as it was", (t) => {
    const root = createRepo(t, { "src/cache.ts": "const cache = 1;" });
    writeFiles(root, { "src/untracked.ts": "", "src/cache.ts": "const cache = 2;" });
    const indexBefore = readFileSync(join(root, ".git", "index"));
    snapshotWorkingTree(root);
    const indexAfter = readFileSync(join(root, ".git", "index"));
    assert.deepEqual(indexAfter, indexBefore);
  });

  test("returns null outside a git repository", (t) => {
    const root = mkdtempSync(join(tmpdir(), "nij-test-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const tree = snapshotWorkingTree(root);
    assert.equal(tree, null);
  });
});
