import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";

// node:fs is mocked once for the whole file: ./path.ts binds it on first import and keeps that
// binding, so a module mock per test would only ever reach the first test.
const existsSyncMock = mock.fn((_path: string) => false);
let extractFromPath: typeof import("./path.ts").extractFromPath;
let relativize: typeof import("./path.ts").relativize;

before(async () => {
  mock.module("node:fs", { exports: { existsSync: existsSyncMock } });
  ({ extractFromPath, relativize } = await import("./path.ts"));
});

after(() => mock.restoreAll());

/**
 * Extracts the names of a path in the project `/project`, with only `pathsOnDisk` existing.
 *
 * @param filePath The path to extract from.
 * @param pathsOnDisk The absolute paths that exist on disk.
 * @param options Whether the path is a directory.
 * @returns Each identifier as `kind:name`, marked `(new)` when it is new.
 */
function getNames(
  filePath: string,
  pathsOnDisk: string[] = [],
  { isDir = false } = {},
): unknown[] {
  existsSyncMock.mock.mockImplementation((path) => pathsOnDisk.includes(path));
  return extractFromPath(filePath, { isDir, root: "/project" }).map(
    (id) => `${id.kind}:${id.name}${id.isNew ? " (new)" : ""}`,
  );
}

describe("extractFromPath", () => {
  test("names each directory and the file, skipping conventional directories", () => {
    const names = getNames("src/billing/invoice-total.ts", ["/project/src"]);
    assert.deepEqual(names, ["dir:billing (new)", "file:invoice-total.ts (new)"]);
  });

  test("marks a directory that exists on disk as not new", () => {
    const pathsOnDisk = ["/project/src", "/project/src/billing"];
    const names = getNames("src/billing/invoice-total.ts", pathsOnDisk);
    assert.deepEqual(names, ["dir:billing", "file:invoice-total.ts (new)"]);
  });

  test("looks up an absolute path's directories where they are", () => {
    const names = getNames("/elsewhere/billing/invoice-total.ts", ["/elsewhere/billing"]);
    assert.deepEqual(names, [
      "dir:elsewhere (new)",
      "dir:billing",
      "file:invoice-total.ts (new)",
    ]);
  });

  test("names only directories for a directory path", () => {
    const names = getNames("billing/invoices", [], { isDir: true });
    assert.deepEqual(names, ["dir:billing (new)", "dir:invoices (new)"]);
  });

  test("skips dotfiles and dot directories", () => {
    const names = getNames(".github/workflows/.env");
    assert.deepEqual(names, ["dir:workflows (new)"]);
  });
});

describe("relativize", () => {
  const relativeByPath = {
    "/project/src/cache.ts": "src/cache.ts",
    "/elsewhere/cache.ts": "/elsewhere/cache.ts",
    "src/cache.ts": "src/cache.ts",
  };
  for (const [filePath, expected] of Object.entries(relativeByPath)) {
    test(`turns ${filePath} into ${expected}`, () => {
      const relativePath = relativize(filePath, "/project");
      assert.equal(relativePath, expected);
    });
  }
});
