import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCacheDir } from "../../src/cache.ts";
import { loadConfig } from "../../src/config.ts";
import { createJev, judgeCtx } from "../../src/jev-client.ts";
import { parse } from "../../src/parse/index.ts";
import { run } from "../../src/pipeline.ts";
import { report } from "../../src/report.ts";

export type HookInput = { session_id?: string; tool_name: string; tool_input: any };
export type HookOutput = {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse";
    permissionDecision?: "deny" | "ask";
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
  systemMessage?: string;
};

const TOOLS = new Set(["Write", "Edit", "MultiEdit", "Bash"]);

const MISSING_KEY = "nij: no Jev key, so only the mechanical checks run. Run /plugin configure my-name-is-jev, or set NIJ_JEV_API_KEY.";

/** The missing-key notice goes to the human, once per session (ADR 0006). The marker remembers the last session told. */
function warnKeyMissingOnce(sessionId = "unknown"): string | undefined {
  try {
    const marker = join(resolveCacheDir(), "missing-key-notified");
    if (existsSync(marker) && readFileSync(marker, "utf8") === sessionId) return undefined;
    mkdirSync(join(marker, ".."), { recursive: true });
    writeFileSync(marker, sessionId);
  } catch {
    /* unwritable cache dir: notify every time rather than never */
  }
  return MISSING_KEY;
}

/** Hook input in, hook output out. `null` means nothing to say. Never throws past this function. */
export async function handle(input: HookInput): Promise<HookOutput | null> {
  try {
    if (!TOOLS.has(input.tool_name)) return null;
    const config = await loadConfig();
    const identifiers = parse(input.tool_name, input.tool_input, config.extractors);
    if (!identifiers.length) return null;

    const jev = createJev(config);
    const notice = jev ? undefined : warnKeyMissingOnce(input.session_id);
    const findings = await run(config.rules, identifiers, jev && ((id) => judgeCtx(jev, id, identifiers.filter((o) => o !== id))));
    const r = report(findings, config);
    if (!r) return notice ? { systemMessage: notice } : null;

    // A warning carries no `permissionDecision`: "allow" would skip the user's own permission prompt for the tool call.
    const out: HookOutput = { hookSpecificOutput: { hookEventName: "PreToolUse" } };
    if (r.decision === "block") Object.assign(out.hookSpecificOutput!, { permissionDecision: "deny", permissionDecisionReason: r.text });
    else if (r.decision === "ask") Object.assign(out.hookSpecificOutput!, { permissionDecision: "ask", permissionDecisionReason: r.text });
    else {
      out.hookSpecificOutput!.additionalContext = r.text;
      out.systemMessage = `nij: ${r.findings.length} naming warning${r.findings.length === 1 ? "" : "s"}`;
    }
    if (notice) out.systemMessage = [out.systemMessage, notice].filter(Boolean).join("\n");
    return out;
  } catch (err) {
    process.stderr.write(`nij: ${(err as Error).stack ?? err}\n`);
    return null;
  }
}
