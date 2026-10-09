import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveCacheDir } from "../../src/cache.ts";
import { loadConfig } from "../../src/config.ts";
import { createJev, createJudgeCtxFor } from "../../src/jev-client.ts";
import { parseToolCall } from "../../src/parse/index.ts";
import { extractFromTreeDiff, snapshotWorkingTree } from "../../src/parse/working-tree.ts";
import { runRules } from "../../src/pipeline.ts";
import { resolveProjectDir } from "../../src/project-dir.ts";
import { buildReport, type Report } from "../../src/report.ts";
import type { Identifier, ResolvedConfig } from "../../src/types.ts";

type HookEventName = "PreToolUse" | "PostToolUse" | "PostToolUseFailure";
export type HookInput = {
  hook_event_name?: HookEventName;
  session_id?: string;
  tool_use_id?: string;
  tool_name: string;
  tool_input: unknown;
};
export type HookOutput = {
  hookSpecificOutput?: {
    hookEventName: HookEventName;
    permissionDecision?: "deny" | "ask";
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
  decision?: "block";
  reason?: string;
  systemMessage?: string;
};
type Judgement = { report: Report | null; notice: string | undefined };

const TOOL_NAMES = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "Bash",
]);

const PERMISSION_DECISION_BY_OUTCOME = { deny: "deny", ask: "ask" } as const;

const KEY_MISSING_NOTICE =
  "nij: no Jev key, so only the mechanical checks run. "
  + "Run /plugin configure my-name-is-jev, or set NIJ_JEV_API_KEY.";

/** Hook input in, hook output out. `null` means nothing to say. Never throws past this function. */
export async function handle(input: HookInput): Promise<HookOutput | null> {
  try {
    if (!TOOL_NAMES.has(input.tool_name)) return null;
    const event = input.hook_event_name ?? "PreToolUse";
    const judgement = event === "PreToolUse"
      ? await evaluateToolInput(input)
      : await evaluateTreeDiff(input);
    return toHookOutput(event, judgement);
  } catch (err) {
    process.stderr.write(`nij: ${(err as Error).stack ?? err}\n`);
    return null;
  }
}

/**
 * Judge the names a tool call says it will write, before it runs, so a blocking rule can stop it.
 * Before a Bash call, also snapshot the working tree: what the command writes is only known after.
 */
async function evaluateToolInput(input: HookInput): Promise<Judgement | null> {
  if (input.tool_name === "Bash") saveTreeBefore(input.tool_use_id);
  const config = await loadConfig();
  const identifiers = parseToolCall(input.tool_name, input.tool_input, config.extractors);
  if (!identifiers.length) return null;
  return evaluateIdentifiers(config, identifiers, input.session_id, { isWritten: false });
}

/**
 * Judge the names a Bash call wrote, failed or not, by diffing the working tree against its
 * snapshot from before the call. A failed command may still have written files.
 */
async function evaluateTreeDiff(input: HookInput): Promise<Judgement | null> {
  const treeBefore = takeTreeBefore(input.tool_use_id);
  const treeAfter = treeBefore && snapshotWorkingTree(resolveProjectDir());
  if (!treeBefore || !treeAfter || treeBefore === treeAfter) return null;
  const config = await loadConfig();
  const identifiers = extractFromTreeDiff(
    resolveProjectDir(),
    treeBefore,
    treeAfter,
    config.extractors,
  );
  if (!identifiers.length) return null;
  return evaluateIdentifiers(config, identifiers, input.session_id, { isWritten: true });
}

/** The report on the identifiers, and the missing-key notice when Jev is not available. */
async function evaluateIdentifiers(
  config: ResolvedConfig,
  identifiers: Identifier[],
  sessionId: string | undefined,
  { isWritten }: { isWritten: boolean },
): Promise<Judgement> {
  const jev = createJev(config);
  const notice = jev ? undefined : warnKeyMissingOnce(sessionId);
  const findings = await runRules(config.rules, identifiers, createJudgeCtxFor(jev, identifiers));
  return { report: buildReport(findings, config, { isWritten }), notice };
}

/**
 * The report and the missing-key notice in Claude Code's hook format. Null when both are empty.
 * A deny or ask becomes the permission decision; a fix, the block decision that sends the agent
 * back to rename (after a failed call it can only be context); a warning is context.
 * A warning carries no `permissionDecision`: "allow" would skip the user's own permission
 * prompt for the tool call.
 */
function toHookOutput(event: HookEventName, judgement: Judgement | null): HookOutput | null {
  if (!judgement) return null;
  const { report, notice } = judgement;
  const systemMessage = [report?.summary, notice].filter(Boolean).join("\n");
  const output: HookOutput = systemMessage ? { systemMessage } : {};
  if (!report) return systemMessage ? output : null;
  if (report.decision === "deny" || report.decision === "ask") {
    return {
      hookSpecificOutput: {
        hookEventName: event,
        permissionDecision: PERMISSION_DECISION_BY_OUTCOME[report.decision],
        permissionDecisionReason: report.text,
      },
      ...output,
    };
  }
  if (report.decision === "fix" && event === "PostToolUse") {
    return { decision: "block", reason: report.text, ...output };
  }
  const hookSpecificOutput = { hookEventName: event, additionalContext: report.text };
  return { hookSpecificOutput, ...output };
}

/**
 * Remember the working tree before a Bash call, under the call's id, for the hook after the call.
 * Failing to remember only means the call goes unchecked.
 */
// ponytail: a call that never completes (denied, interrupted) leaves its small file behind;
// prune old files here if the directory ever grows.
function saveTreeBefore(toolUseId: string | undefined) {
  if (!toolUseId) return;
  try {
    const tree = snapshotWorkingTree(resolveProjectDir());
    if (!tree) return;
    const file = resolveTreeFile(toolUseId);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, tree);
  } catch {
    /* unwritable cache dir: this call goes unchecked */
  }
}

/** The tree saved before the Bash call, forgotten as it is read. Null when none was saved. */
function takeTreeBefore(toolUseId: string | undefined): string | null {
  if (!toolUseId) return null;
  try {
    const file = resolveTreeFile(toolUseId);
    const tree = readFileSync(file, "utf8");
    rmSync(file, { force: true });
    return tree;
  } catch {
    return null;
  }
}

/** Where the tree before a call is kept. The id is made safe to use as a file name. */
const resolveTreeFile = (toolUseId: string) =>
  join(resolveCacheDir(), "trees-before", toolUseId.replace(/[^\w-]/g, "_"));

/**
 * The missing-key notice, once per session, for the human (ADR 0006).
 * The marker remembers the last session told.
 */
function warnKeyMissingOnce(sessionId = "unknown"): string | undefined {
  try {
    const marker = join(resolveCacheDir(), "missing-key-notified");
    if (existsSync(marker) && readFileSync(marker, "utf8") === sessionId) return undefined;
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, sessionId);
  } catch {
    /* unwritable cache dir: notify every time rather than never */
  }
  return KEY_MISSING_NOTICE;
}
