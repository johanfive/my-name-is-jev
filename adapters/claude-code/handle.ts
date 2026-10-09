import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveCacheDir } from "../../src/cache.ts";
import { loadConfig } from "../../src/config.ts";
import { createJev, createJudgeCtxFor } from "../../src/jev-client.ts";
import { parseToolCall } from "../../src/parse/index.ts";
import { runRules } from "../../src/pipeline.ts";
import { buildReport, type Report } from "../../src/report.ts";

export type HookInput = { session_id?: string; tool_name: string; tool_input: unknown };
export type HookOutput = {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse";
    permissionDecision?: "deny" | "ask";
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
  systemMessage?: string;
};

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
    const config = await loadConfig();
    const identifiers = parseToolCall(input.tool_name, input.tool_input, config.extractors);
    if (!identifiers.length) return null;

    const jev = createJev(config);
    const notice = jev ? undefined : warnKeyMissingOnce(input.session_id);
    const findings = await runRules(config.rules, identifiers, createJudgeCtxFor(jev, identifiers));
    return toHookOutput(buildReport(findings, config), notice);
  } catch (err) {
    process.stderr.write(`nij: ${(err as Error).stack ?? err}\n`);
    return null;
  }
}

/**
 * The report and the missing-key notice in Claude Code's hook format. Null when both are empty.
 * A warning carries no `permissionDecision`: "allow" would skip the user's own permission
 * prompt for the tool call.
 */
function toHookOutput(report: Report | null, notice: string | undefined): HookOutput | null {
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

/** The one line the human sees for a warning; the details go to the agent. */
function countWarnings(report: Report): string {
  const count = report.findings.length;
  return `nij: ${count} naming warning${count === 1 ? "" : "s"}`;
}

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
