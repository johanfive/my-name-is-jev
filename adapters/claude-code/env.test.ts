import assert from "node:assert/strict";
import { after, before, describe, mock, test, type TestContext } from "node:test";

// node:fs is mocked once for the whole file: env.ts binds it on first import and keeps that
// binding, so a module mock per test would only ever reach the first test.
const existsSyncMock = mock.fn((_path: string) => false);
let adoptHookHomes: typeof import("./env.ts").adoptHookHomes;
let adoptInstalledPluginHomes: typeof import("./env.ts").adoptInstalledPluginHomes;

before(async () => {
  mock.module("node:fs", { exports: { existsSync: existsSyncMock } });
  ({ adoptHookHomes, adoptInstalledPluginHomes } = await import("./env.ts"));
});

after(() => mock.restoreAll());

const DATA_DIR = "/claude/plugins/data/my-name-is-jev-my-name-is-jev";

/**
 * Runs `adopt` with the given environment, and returns the NIJ_* variables it leaves behind.
 *
 * @param t The test context the environment mock belongs to.
 * @param adopt The function under test.
 * @param env The environment before, Claude's config dir at `/claude`.
 * @param isInstalled Whether the plugin's data directory exists.
 * @returns The NIJ_* variables, by name.
 */
function getNijEnv(
  t: TestContext,
  adopt: () => void,
  env: Record<string, string>,
  { isInstalled = true } = {},
): Record<string, string | undefined> {
  t.mock.property(process, "env", { CLAUDE_CONFIG_DIR: "/claude", ...env });
  existsSyncMock.mock.mockImplementation((path) => isInstalled && path === DATA_DIR);
  adopt();
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name.startsWith("NIJ_")),
  );
}

describe("adoptHookHomes", () => {
  test("takes the plugin's data directory, Claude's config directory and its options", (t) => {
    const nijEnv = getNijEnv(t, () => adoptHookHomes(), {
      CLAUDE_PLUGIN_DATA: "/data",
      CLAUDE_PLUGIN_OPTION_JEV_API_KEY: "key",
      CLAUDE_PLUGIN_OPTION_JEV_BASE_URL: "https://jev",
      CLAUDE_PLUGIN_OPTION_JEV_MODEL: "fake-model",
    });
    assert.deepEqual(nijEnv, {
      NIJ_DATA_DIR: "/data",
      NIJ_CONFIG_DIR: "/claude",
      NIJ_JEV_API_KEY: "key",
      NIJ_JEV_BASE_URL: "https://jev",
      NIJ_JEV_MODEL: "fake-model",
    });
  });

  test("falls back to the plugin's known data directory outside a plugin process", (t) => {
    const nijEnv = getNijEnv(t, () => adoptHookHomes(), {});
    assert.equal(nijEnv.NIJ_DATA_DIR, DATA_DIR);
  });

  test("lets an explicit NIJ_* variable win", (t) => {
    const nijEnv = getNijEnv(t, () => adoptHookHomes(), {
      CLAUDE_PLUGIN_DATA: "/data",
      CLAUDE_PLUGIN_OPTION_JEV_API_KEY: "plugin-key",
      NIJ_DATA_DIR: "/mine",
      NIJ_JEV_API_KEY: "my-key",
    });
    assert.equal(nijEnv.NIJ_DATA_DIR, "/mine");
    assert.equal(nijEnv.NIJ_JEV_API_KEY, "my-key");
  });
});

describe("adoptInstalledPluginHomes", () => {
  test("points the CLI at the installed plugin's data and Claude's config directory", (t) => {
    const nijEnv = getNijEnv(t, () => adoptInstalledPluginHomes(), {});
    assert.deepEqual(nijEnv, { NIJ_DATA_DIR: DATA_DIR, NIJ_CONFIG_DIR: "/claude" });
  });

  test("follows a moved plugins root", (t) => {
    existsSyncMock.mock.mockImplementation((path) => path.startsWith("/elsewhere"));
    t.mock.property(process, "env", {
      CLAUDE_CONFIG_DIR: "/claude",
      CLAUDE_CODE_PLUGIN_CACHE_DIR: "/elsewhere",
    });
    adoptInstalledPluginHomes();
    assert.equal(process.env.NIJ_DATA_DIR, "/elsewhere/data/my-name-is-jev-my-name-is-jev");
  });

  test("changes nothing when the plugin is not installed", (t) => {
    const nijEnv = getNijEnv(t, () => adoptInstalledPluginHomes(), {}, { isInstalled: false });
    assert.deepEqual(nijEnv, {});
  });

  test("lets an explicit NIJ_* variable win", (t) => {
    const nijEnv = getNijEnv(t, () => adoptInstalledPluginHomes(), { NIJ_DATA_DIR: "/mine" });
    assert.equal(nijEnv.NIJ_DATA_DIR, "/mine");
  });
});
