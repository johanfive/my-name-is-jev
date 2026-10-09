import assert from "node:assert/strict";
import { after, before, describe, mock, test, type TestContext } from "node:test";
import { typescript } from "../../src/built-in/presets/typescript.ts";
import { typescriptExtractor } from "../../src/parse/typescript.ts";
import type { Identifier, ResolvedConfig, Severity } from "../../src/types.ts";
import type { HookInput } from "./handle.ts";

// node:fs, the config loader and the working-tree snapshots are mocked once for the whole file:
// the modules under the handler bind them on first import and keep that binding, so a module
// mock per test would only ever reach the first test. The TypeScript compiler reads fs as it
// loads, so it is imported statically, before the mock.
const existsSyncMock = mock.fn((_path: string) => false);
const readFileSyncMock = mock.fn((_path: string): string => "");
const writeFileSyncMock = mock.fn((_path: string, _content: string) => {});
const loadConfigMock = mock.fn(async (): Promise<ResolvedConfig | undefined> => undefined);
const snapshotWorkingTreeMock = mock.fn((_root: string): string | null => null);
const extractFromTreeDiffMock = mock.fn(
  (_root: string, _before: string, _after: string, _extractors: unknown): Identifier[] => [],
);
let handle: typeof import("./handle.ts").handle;
let createFakeConfig: (severity: Severity) => ResolvedConfig;

before(async () => {
  mock.module("node:fs", {
    exports: {
      existsSync: existsSyncMock,
      readFileSync: readFileSyncMock,
      writeFileSync: writeFileSyncMock,
      mkdirSync: mock.fn(),
      rmSync: mock.fn(),
      statSync: mock.fn(),
    },
  });
  mock.module("../../src/config.ts", { exports: { loadConfig: loadConfigMock } });
  mock.module("../../src/parse/working-tree.ts", {
    exports: {
      snapshotWorkingTree: snapshotWorkingTreeMock,
      extractFromTreeDiff: extractFromTreeDiffMock,
    },
  });
  ({ handle } = await import("./handle.ts"));
  const { pathExtractor } = await import("../../src/parse/path.ts");
  createFakeConfig = (severity) => ({
    rules: typescript,
    severity,
    extractors: [pathExtractor, typescriptExtractor],
    jev: {},
    cache: { enabled: false, entriesMax: 0, ageMaxDays: 0 },
    sources: [],
  });
});

after(() => mock.restoreAll());

const MARKER_PATH = "/cache/missing-key-notified";
const TREE_FILE_PATH = "/cache/trees-before/toolu_fake";
const fakeWrite = (content: string): HookInput => ({
  session_id: "fake-session",
  tool_name: "Write",
  tool_input: { file_path: "/project/src/new-file.ts", content },
});
const fakeBash = (hookEventName: HookInput["hook_event_name"]): HookInput => ({
  hook_event_name: hookEventName,
  session_id: "fake-session",
  tool_use_id: "toolu_fake",
  tool_name: "Bash",
  tool_input: { command: "sed -i '' s/a/b/ src/cache.ts" },
});
const fakeBadName: Identifier = {
  name: "bad_name",
  kind: "variable",
  file: "src/cache.ts",
  isNew: true,
  segments: ["bad", "name"],
};

/**
 * Runs the hook without a Jev key, in the project `/project` with its cache in `/cache`.
 *
 * @param t The test context the environment and stderr mocks belong to.
 * @param input The hook input.
 * @param options The config's severity, the session the missing-key marker names,
 *   the tree saved before a Bash call, the tree after it, and what the diff between them finds.
 * @returns The hook output.
 */
async function getHookOutput(
  t: TestContext,
  input: HookInput,
  {
    severity = "warn",
    notifiedSession = "fake-session",
    treeBefore,
    treeAfter = "tree-after",
    identifiersChanged = [],
  }: {
    severity?: Severity;
    notifiedSession?: string;
    treeBefore?: string;
    treeAfter?: string;
    identifiersChanged?: Identifier[];
  } = {},
): Promise<unknown> {
  t.mock.property(process, "env", { CLAUDE_PROJECT_DIR: "/project", NIJ_CACHE_DIR: "/cache" });
  t.mock.method(process.stderr, "write", () => true);
  for (const fn of [
    loadConfigMock,
    writeFileSyncMock,
    extractFromTreeDiffMock,
  ]) {
    fn.mock.resetCalls();
  }
  loadConfigMock.mock.mockImplementation(async () => createFakeConfig(severity));
  existsSyncMock.mock.mockImplementation((path) => path === MARKER_PATH);
  readFileSyncMock.mock.mockImplementation((path) => {
    if (path === MARKER_PATH) return notifiedSession;
    if (path === TREE_FILE_PATH && treeBefore) return treeBefore;
    throw new Error("no such file");
  });
  snapshotWorkingTreeMock.mock.mockImplementation(() => treeAfter);
  extractFromTreeDiffMock.mock.mockImplementation(() => identifiersChanged);
  return handle(input);
}

describe("handle", () => {
  test("answers nothing for a tool it does not watch, without loading the config", async (t) => {
    const output = await getHookOutput(t, { tool_name: "Read", tool_input: {} });
    assert.equal(output, null);
    assert.equal(loadConfigMock.mock.callCount(), 0);
  });

  test("answers nothing when the call introduces no bad name", async (t) => {
    const output = await getHookOutput(t, fakeWrite("const userCache = 1;"));
    assert.equal(output, null);
  });

  test("gives a warning to the agent, without a permission decision", async (t) => {
    const output = await getHookOutput(t, fakeWrite("const bad_name = 1;"));
    const { hookSpecificOutput, systemMessage } = output as {
      hookSpecificOutput: Record<string, unknown>;
      systemMessage: string;
    };
    assert.deepEqual(Object.keys(hookSpecificOutput), ["hookEventName", "additionalContext"]);
    assert.match(String(hookSpecificOutput.additionalContext), /bad_name \(const, src\/new-file\.ts\)/);
    assert.equal(systemMessage, "nij: 1 naming warning");
  });

  const permissionDecisionBySeverity = { block: "deny", ask: "ask" };
  for (const [severity, permissionDecision] of Object.entries(permissionDecisionBySeverity)) {
    test(`turns ${severity} into the permission decision ${permissionDecision}`, async (t) => {
      const output = await getHookOutput(t, fakeWrite("const bad_name = 1;"), {
        severity: severity as Severity,
      });
      const hookOutput = (output as { hookSpecificOutput: Record<string, unknown> })
        .hookSpecificOutput;
      assert.equal(hookOutput.permissionDecision, permissionDecision);
      assert.match(String(hookOutput.permissionDecisionReason), /bad_name/);
      assert.equal((output as { systemMessage?: string }).systemMessage, undefined);
    });
  }

  describe("tells the human the Jev key is missing", () => {
    test("once per session, remembering the session it told", async (t) => {
      const output = await getHookOutput(t, fakeWrite("const userCache = 1;"), {
        notifiedSession: "earlier-session",
      });
      assert.match(String((output as { systemMessage: string }).systemMessage), /no Jev key/);
      assert.deepEqual(writeFileSyncMock.mock.calls[0].arguments, [MARKER_PATH, "fake-session"]);
    });

    test("alongside a warning", async (t) => {
      const output = await getHookOutput(t, fakeWrite("const bad_name = 1;"), {
        notifiedSession: "earlier-session",
      });
      const systemMessage = String((output as { systemMessage: string }).systemMessage);
      assert.match(systemMessage, /^nij: 1 naming warning\nnij: no Jev key/);
    });
  });

  describe("around a Bash call", () => {
    test("saves the working tree before it, under the call's id", async (t) => {
      await getHookOutput(t, fakeBash("PreToolUse"), { treeAfter: "tree-before" });
      const saved = writeFileSyncMock.mock.calls.map((call) => call.arguments);
      assert.deepEqual(saved, [[TREE_FILE_PATH, "tree-before"]]);
    });

    test("judges what it wrote, against the tree saved before it", async (t) => {
      const output = await getHookOutput(t, fakeBash("PostToolUse"), {
        treeBefore: "tree-before",
        identifiersChanged: [fakeBadName],
      });
      const treesDiffed = extractFromTreeDiffMock.mock.calls[0].arguments.slice(0, 3);
      const { hookSpecificOutput } = output as { hookSpecificOutput: Record<string, unknown> };
      assert.deepEqual(treesDiffed, [
        "/project",
        "tree-before",
        "tree-after",
      ]);
      assert.equal(hookSpecificOutput.hookEventName, "PostToolUse");
      assert.match(String(hookSpecificOutput.additionalContext), /bad_name \(variable, src\/cache\.ts\)/);
    });

    test("sends a block back to the agent as a block decision", async (t) => {
      const output = await getHookOutput(t, fakeBash("PostToolUse"), {
        severity: "block",
        treeBefore: "tree-before",
        identifiersChanged: [fakeBadName],
      });
      const { decision, reason } = output as { decision: string; reason: string };
      assert.equal(decision, "block");
      assert.match(reason, /^Naming convention violations/);
    });

    test("only adds context after a failed call, even for a block", async (t) => {
      const output = await getHookOutput(t, fakeBash("PostToolUseFailure"), {
        severity: "block",
        treeBefore: "tree-before",
        identifiersChanged: [fakeBadName],
      });
      const { hookSpecificOutput, decision } = output as {
        hookSpecificOutput: Record<string, unknown>;
        decision?: string;
      };
      assert.equal(decision, undefined);
      assert.equal(hookSpecificOutput.hookEventName, "PostToolUseFailure");
      assert.match(String(hookSpecificOutput.additionalContext), /bad_name/);
    });

    test("answers nothing when no tree was saved before it", async (t) => {
      const output = await getHookOutput(t, fakeBash("PostToolUse"), {
        identifiersChanged: [fakeBadName],
      });
      assert.equal(output, null);
      assert.equal(extractFromTreeDiffMock.mock.callCount(), 0);
    });

    test("answers nothing when it changed no file", async (t) => {
      const output = await getHookOutput(t, fakeBash("PostToolUse"), {
        treeBefore: "same-tree",
        treeAfter: "same-tree",
        identifiersChanged: [fakeBadName],
      });
      assert.equal(output, null);
    });
  });
});
