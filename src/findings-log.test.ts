import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { resolveConfig } from "./config.ts";
import { openFindingsLog, type FindingRecord } from "./findings-log.ts";

// These tests run the real node:sqlite in a temp directory: what they check is the
// database's answer, and a mocked database would only test the mock.

const fakeRecord = (overrides: Partial<FindingRecord> = {}): FindingRecord => ({
  project: "/project",
  rule: "ts/camel",
  kind: "variable",
  name: "bad_name",
  file: "src/cache.ts",
  line: 3,
  session: "fake-session",
  outcome: "warn",
  recordedAt: Date.now(),
  ...overrides,
});

/**
 * Opens a findings log in a temp cache directory, removed when the test ends.
 *
 * @param t The test context the environment mock and the cleanup belong to.
 * @param cacheOption The config's `cache` setting.
 * @returns The log, or null when the cache is off.
 */
function openTestLog(t: TestContext, cacheOption: false | { ageMaxDays?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "nij-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  t.mock.property(process, "env", { NIJ_CACHE_DIR: dir });
  return openFindingsLog(resolveConfig({ rules: [], cache: cacheOption }));
}

describe("openFindingsLog", () => {
  test("returns null when the cache is off", (t) => {
    const log = openTestLog(t, false);
    assert.equal(log, null);
  });

  test("lists a project's records oldest first, and none of another project's", (t) => {
    const log = openTestLog(t)!;
    const older = fakeRecord({ name: "first", recordedAt: 1000 });
    const newer = fakeRecord({ name: "second", recordedAt: 2000 });
    log.record([
      newer,
      older,
      fakeRecord({ project: "/other" }),
    ]);
    const names = log.list("/project").map((record) => record.name);
    assert.deepEqual(names, ["first", "second"]);
  });

  test("keeps every field of a record", (t) => {
    const log = openTestLog(t)!;
    const record = fakeRecord({ outcome: "demand", recordedAt: 5000 });
    log.record([record]);
    const listed = log.list("/project");
    assert.deepEqual(listed, [record]);
  });

  test("replaces the record of a name flagged again by the same rule", (t) => {
    const log = openTestLog(t)!;
    log.record([fakeRecord({ session: "first", recordedAt: 1000 })]);
    log.record([fakeRecord({ session: "second", recordedAt: 2000 })]);
    const sessions = log.list("/project").map((record) => record.session);
    assert.deepEqual(sessions, ["second"]);
  });

  test("forgets records older than the cache's age limit on open", (t) => {
    const log = openTestLog(t, { ageMaxDays: 1 })!;
    const stale = fakeRecord({ name: "stale", recordedAt: Date.now() - 2 * 86_400_000 });
    log.record([stale, fakeRecord({ name: "fresh" })]);
    const reopened = openFindingsLog(resolveConfig({ rules: [], cache: { ageMaxDays: 1 } }))!;
    const names = reopened.list("/project").map((record) => record.name);
    assert.deepEqual(names, ["fresh"]);
  });
});
