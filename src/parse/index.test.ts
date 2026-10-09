import assert from "node:assert/strict";
import { after, before, describe, mock, test, type TestContext } from "node:test";
import type { Extractor } from "../types.ts";
import { typescriptExtractor } from "./typescript.ts";

// node:fs is mocked once for the whole file: ./path.ts binds it on first import and keeps that
// binding, so a module mock per test would only ever reach the first test.
const existsSyncMock = mock.fn((_path: string) => false);
const readFileSyncMock = mock.fn((_path: string): string => {
  throw new Error("not mocked");
});
let parseToolCall: typeof import("./index.ts").parseToolCall;
let extractors: Extractor[];

before(async () => {
  mock.module("node:fs", {
    exports: { existsSync: existsSyncMock, readFileSync: readFileSyncMock },
  });
  ({ parseToolCall } = await import("./index.ts"));
  const { pathExtractor } = await import("./path.ts");
  extractors = [pathExtractor, typescriptExtractor];
});

after(() => mock.restoreAll());

/**
 * Parses a tool call in the project `/project`, with the files on disk as `contentByPath`,
 * and returns the names it found.
 *
 * @param t The test context the environment mock belongs to.
 * @param toolName The tool called.
 * @param input The tool's input.
 * @param contentByPath The content of each file that exists, by absolute path.
 * @returns Each identifier as `kind:name`, marked `(new)` when the call introduces it.
 */
function getIdentifiers(
  t: TestContext,
  toolName: string,
  input: object,
  contentByPath: Record<string, string> = {},
): unknown[] {
  existsSyncMock.mock.mockImplementation((path) => path in contentByPath);
  readFileSyncMock.mock.mockImplementation((path) => contentByPath[path]);
  t.mock.property(process, "env", { CLAUDE_PROJECT_DIR: "/project" });
  return parseToolCall(toolName, input, extractors).map(
    (id) => `${id.kind}:${id.name}${id.isNew ? " (new)" : ""}`,
  );
}

describe("parseToolCall", () => {
  test("marks everything a Write creates as new", (t) => {
    const identifiers = getIdentifiers(t, "Write", {
      file_path: "/project/src/user-cache.ts",
      content: "const userCache = 1;",
    });
    assert.deepEqual(identifiers, ["file:user-cache.ts (new)", "const:userCache (new)"]);
  });

  test("marks only the names an Edit adds as new", (t) => {
    const identifiers = getIdentifiers(
      t,
      "Edit",
      { file_path: "/project/src/cache.ts", old_string: "const a", new_string: "const b" },
      { "/project/src/cache.ts": "const kept = 0;\nconst a = 1;" },
    );
    assert.deepEqual(identifiers, [
      "file:cache.ts",
      "const:kept",
      "const:b (new)",
    ]);
  });

  test("applies every edit of a MultiEdit, and replace_all to every match", (t) => {
    const renameAll = { old_string: "one", new_string: "first", replace_all: true };
    const renameFirst = { old_string: "two", new_string: "second" };
    const identifiers = getIdentifiers(
      t,
      "MultiEdit",
      { file_path: "/project/src/cache.ts", edits: [renameAll, renameFirst] },
      { "/project/src/cache.ts": "let one = 1; const oneMore = one; let two = 2;" },
    );
    assert.deepEqual(identifiers, [
      "file:cache.ts",
      "variable:first (new)",
      "const:firstMore (new)",
      "variable:second (new)",
    ]);
  });

  test("finds nothing in a call to another tool", (t) => {
    const identifiers = getIdentifiers(t, "Read", { file_path: "/project/src/cache.ts" });
    assert.deepEqual(identifiers, []);
  });

  test("finds nothing in a file outside the project", (t) => {
    const identifiers = getIdentifiers(t, "Write", {
      file_path: "/tmp/scratch/Bad_Name.ts",
      content: "const bad_name = 1;",
    });
    assert.deepEqual(identifiers, []);
  });
});
