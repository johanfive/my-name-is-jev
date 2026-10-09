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

const PERMISSION_DECISION_BY_SEVERITY = { block: "deny", ask: "ask" } as const;

const KEY_MISSING_NOTICE =
  "nij: no Jev key, so only the mechanical checks run. "
  + "Run /plugin configure my-name-is-jev, or set NIJ_JEV_API_KEY.";

/** Hook input in, hook output out. `null` means nothing to say. Never throws past this function. */
export async function handle(input: HookInput): Promise<HookOutput | null> {
  try {
    if (!TOOL_NAMES.has(input.tool_name)) return null;
    if (input.hook_event_name === "PostToolUse" || input.hook_event_name === "PostToolUseFailure") {
      return await handleAfterBash(input, input.hook_event_name);
    }
    return await handleBeforeTool(input);
  } catch (err) {
    process.stderr.write(`nij: ${(err as Error).stack ?? err}\n`);
    return null;
  }
}

/**
 * Judge the names a tool call says it will write, before it runs, so a blocking rule can stop it.
 * Before a Bash call, also snapshot the working tree: what the command writes is only known after.
 */
async function handleBeforeTool(input: HookInput): Promise<HookOutput | null> {
  if (input.tool_name === "Bash") saveTreeBefore(input.tool_use_id);
  const config = await loadConfig();
  const identifiers = parseToolCall(input.tool_name, input.tool_input, config.extractors);
  if (!identifiers.length) return null;
  const { report, notice } = await evaluateIdentifiers(config, identifiers, input.session_id);
  return toPreToolUseOutput(report, notice);
}

/**
 * Judge the names a Bash call wrote, failed or not, by diffing the working tree against its
 * snapshot from before the call. A failed command may still have written files.
 */
async function handleAfterBash(
  input: HookInput,
  event: "PostToolUse" | "PostToolUseFailure",
): Promise<HookOutput | null> {
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
  const { report, notice } = await evaluateIdentifiers(config, identifiers, input.session_id);
  return toPostToolUseOutput(event, report, notice);
}

/** The report on the identifiers, and the missing-key notice when Jev is not available. */
async function evaluateIdentifiers(
  config: ResolvedConfig,
  identifiers: Identifier[],
  sessionId: string | undefined,
): Promise<Judgement> {
  const jev = createJev(config);
  const notice = jev ? undefined : warnKeyMissingOnce(sessionId);
  const findings = await runRules(config.rules, identifiers, createJudgeCtxFor(jev, identifiers));
  return { report: buildReport(findings, config), notice };
}

/**
 * The report and the missing-key notice before a tool call. Null when both are empty.
 * A warning carries no `permissionDecision`: "allow" would skip the user's own permission
 * prompt for the tool call.
 */
function toPreToolUseOutput(report: Report | null, notice: string | undefined): HookOutput | null {
  if (!report) return notice ? { systemMessage: notice } : null;
  if (report.decision === "warn") {
    return {
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: report.text },
      systemMessage: [countWarnings(report), notice].filter(Boolean).join("\n"),
    };
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: PERMISSION_DECISION_BY_SEVERITY[report.decision],
      permissionDecisionReason: report.text,
    },
    ...(notice ? { systemMessage: notice } : {}),
  };
}

/**
 * The report and the missing-key notice after a Bash call. Null when both are empty.
 * The files are written by then, so nothing can be denied or asked:
 * a block is sent back to the agent as a block decision, everything else as context.
 * A failed call can only carry context.
 */
function toPostToolUseOutput(
  event: "PostToolUse" | "PostToolUseFailure",
  report: Report | null,
  notice: string | undefined,
): HookOutput | null {
  if (!report) return notice ? { systemMessage: notice } : null;
  const isWarning = report.decision === "warn";
  const systemMessage = [isWarning && countWarnings(report), notice].filter(Boolean).join("\n");
  const output: HookOutput = systemMessage ? { systemMessage } : {};
  if (report.decision === "block" && event === "PostToolUse") {
    return { decision: "block", reason: report.text, ...output };
  }
  const hookSpecificOutput = { hookEventName: event, additionalContext: report.text };
  return { hookSpecificOutput, ...output };
}

/** The one line the human sees for a warning; the details go to the agent. */
function countWarnings(report: Report): string {
  const count = report.findings.length;
  return `nij: ${count} naming warning${count === 1 ? "" : "s"}`;
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
