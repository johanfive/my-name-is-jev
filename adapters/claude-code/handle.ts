import { loadConfig } from "../../src/config.ts";
import { createJev, judgeCtx } from "../../src/jev-client.ts";
import { parse } from "../../src/parse/index.ts";
import { run } from "../../src/pipeline.ts";
import { report } from "../../src/report.ts";

export type HookInput = { tool_name: string; tool_input: any };
export type HookOutput = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
  systemMessage?: string;
};

const TOOLS = new Set(["Write", "Edit", "MultiEdit", "Bash"]);

/** Hook input in, hook output out. `null` means nothing to say. Never throws past this function. */
export async function handle(input: HookInput): Promise<HookOutput | null> {
  try {
    if (!TOOLS.has(input.tool_name)) return null;
    const config = await loadConfig();
    const identifiers = parse(input.tool_name, input.tool_input, config.extractors);
    if (!identifiers.length) return null;

    const jev = createJev(config);
    const findings = await run(config.rules, identifiers, jev && ((id) => judgeCtx(jev, id, identifiers.filter((o) => o !== id))));
    const r = report(findings, config);
    if (!r) return null;

    const out: HookOutput = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
    if (r.decision === "block") Object.assign(out.hookSpecificOutput, { permissionDecision: "deny", permissionDecisionReason: r.text });
    else if (r.decision === "ask") Object.assign(out.hookSpecificOutput, { permissionDecision: "ask", permissionDecisionReason: r.text });
    else {
      out.hookSpecificOutput.additionalContext = r.text;
      out.systemMessage = `nij: ${r.findings.length} naming warning${r.findings.length === 1 ? "" : "s"}`;
    }
    return out;
  } catch (err) {
    process.stderr.write(`nij: ${(err as Error).stack ?? err}\n`);
    return null;
  }
}
