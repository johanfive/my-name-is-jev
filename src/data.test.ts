import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { resolveConfig } from "./config.ts";
import { clearData, inspectData, openCache } from "./data.ts";
import { openFindingsLog } from "./findings-log.ts";

// These tests run the real node:sqlite in a temp directory: what they check is the
// database's answer, and a mocked database would only test the mock. That is acceptable
// only because SQLite is an in-process library over a local file: no server, no network,
// no shared state, and the file dies with the test. A real database would be mocked.

/**
 * Points nij at a writable temp data directory, removed when the test ends.
 *
 * @param t The test context the environment mock and the cleanup belong to.
 */
function useTempDataDir(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "nij-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  t.mock.property(process, "env", { NIJ_DATA_DIR: dir });
}

/**
 * Points nij at a temp data directory and fills it with one answer and one finding.
 *
 * @param t The test context the environment mock and the cleanup belong to.
 * @returns The resolved config to pass on.
 */
function createFilledData(t: TestContext) {
  useTempDataDir(t);
  const config = resolveConfig({ rules: [] });
  openCache(config)!.set("question", "answer");
  openFindingsLog(config)!.record([
    {
      project: "/project",
      rule: "ts/camel",
      kind: "variable",
      name: "bad_name",
      file: "src/fake.ts",
      line: 1,
      session: "fake-session",
      outcome: "warn",
      recordedAt: Date.now(),
    },
  ]);
  return config;
}

describe("inspectData", () => {
  test("counts the answers and the findings in the file", (t) => {
    const config = createFilledData(t);
    const summary = inspectData(config);
    assert.equal(summary?.answers, 1);
    assert.equal(summary?.findings, 1);
    assert.match(String(summary?.file), /nij\.sqlite$/);
  });

  test("returns null when data is off, even where it could write", (t) => {
    useTempDataDir(t);
    const summary = inspectData(resolveConfig({ rules: [], data: false }));
    assert.equal(summary, null);
  });
});

describe("clearData", () => {
  test("clears the answers and the findings", (t) => {
    const config = createFilledData(t);
    clearData(config);
    const summary = inspectData(config);
    assert.deepEqual([summary?.answers, summary?.findings], [0, 0]);
  });
});
