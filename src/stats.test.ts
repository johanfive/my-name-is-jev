import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";
import type { FindingRecord } from "./findings-log.ts";
import { typescriptExtractor } from "./parse/typescript.ts";
import type { Extractor } from "./types.ts";

// node:fs is mocked once for the whole file: stats.ts binds it on first import and keeps that
// binding, so a module mock per test would only ever reach the first test. The TypeScript
// compiler reads fs as it loads, so it is imported statically, before the mock.
const existsSyncMock = mock.fn((_path: string) => false);
const readFileSyncMock = mock.fn((_path: string): string => "");
let computeStats: typeof import("./stats.ts").computeStats;
let extractors: Extractor[];

before(async () => {
  mock.module("node:fs", {
    exports: { existsSync: existsSyncMock, readFileSync: readFileSyncMock },
  });
  ({ computeStats } = await import("./stats.ts"));
  const { pathExtractor } = await import("./parse/path.ts");
  extractors = [pathExtractor, typescriptExtractor];
});

after(() => mock.restoreAll());

const fakeRecord = (overrides: Partial<FindingRecord> = {}): FindingRecord => ({
  project: "/project",
  rule: "ts/camel",
  kind: "variable",
  name: "bad_name",
  file: "src/cache.ts",
  line: 1,
  session: "fake-session",
  outcome: "warn",
  recordedAt: 1000,
  ...overrides,
});

/**
 * Computes the stats for the records in the project `/project`, with `contentByPath` on disk.
 *
 * @param records The flagged names.
 * @param contentByPath The content of each file that exists, by absolute path; a directory's
 *   content is irrelevant, so any string marks it as existing.
 * @returns The stats per rule.
 */
function getStats(records: FindingRecord[], contentByPath: Record<string, string>): unknown[] {
  existsSyncMock.mock.mockImplementation((path) => path in contentByPath);
  readFileSyncMock.mock.mockImplementation((path) => contentByPath[path]);
  return computeStats(records, "/project", extractors);
}

describe("computeStats", () => {
  test("counts a name still in its file as kept, and one no longer there as renamed", () => {
    const records = [fakeRecord({ name: "bad_name" }), fakeRecord({ name: "other_bad" })];
    const stats = getStats(records, { "/project/src/cache.ts": "let bad_name = 1;" });
    assert.deepEqual(stats, [{ rule: "ts/camel", kept: 1, renamed: 1, gone: 0 }]);
  });

  test("counts a name whose file is missing as gone", () => {
    const stats = getStats([fakeRecord()], {});
    assert.deepEqual(stats, [{ rule: "ts/camel", kept: 0, renamed: 0, gone: 1 }]);
  });

  test("tells a kept name from a renamed one by kind, not by text", () => {
    const records = [fakeRecord({ kind: "function", name: "bad_name" })];
    const stats = getStats(records, { "/project/src/cache.ts": "let bad_name = 1;" });
    assert.deepEqual(stats, [{ rule: "ts/camel", kept: 0, renamed: 1, gone: 0 }]);
  });

  test("counts a file by its path: present is kept, missing is renamed", () => {
    const present = fakeRecord({ kind: "file", name: "Bad_Name.ts", file: "src/Bad_Name.ts" });
    const missing = fakeRecord({ kind: "file", name: "Other_Bad.ts", file: "src/Other_Bad.ts" });
    const stats = getStats([present, missing], { "/project/src/Bad_Name.ts": "" });
    assert.deepEqual(stats, [{ rule: "ts/camel", kept: 1, renamed: 1, gone: 0 }]);
  });

  test("counts a directory by its own path, not its file's", () => {
    const present = fakeRecord({
      kind: "dir",
      name: "Billing_Dir",
      file: "src/Billing_Dir/invoice.ts",
    });
    const missing = fakeRecord({ kind: "dir", name: "Old_Dir", file: "src/Old_Dir/invoice.ts" });
    const stats = getStats([present, missing], { "/project/src/Billing_Dir": "" });
    assert.deepEqual(stats, [{ rule: "ts/camel", kept: 1, renamed: 1, gone: 0 }]);
  });

  test("groups by rule", () => {
    const records = [fakeRecord({ rule: "first" }), fakeRecord({ rule: "second" })];
    const rules = getStats(records, {}).map((stats) => (stats as { rule: string }).rule);
    assert.deepEqual(rules, ["first", "second"]);
  });
});
