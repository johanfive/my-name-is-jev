import { matchesGlob } from "node:path";
import type { Finding, Identifier, JudgeCtx, Rule, Selector } from "./types.ts";

export const selects = (sel: Selector | undefined, id: Identifier): boolean =>
  !sel
  || ((!sel.kind || sel.kind.includes(id.kind)) && (!sel.path || matchesGlob(id.file, sel.path)));

const skip = (rule: Rule, id: Identifier, err: unknown) =>
  process.stderr.write(`nij: rule ${rule.id} skipped on ${id.name}: ${(err as Error).message}\n`);

/**
 * Pipe identifiers through the rules.
 * Per identifier: every applicable check runs and every failure is kept.
 * Judges run only when no check failed and Jev is available (`judgeCtx` non-null), in parallel.
 * A rule that throws is skipped and logged: fail open, always.
 * Only new identifiers are considered.
 */
export async function run(
  rules: Rule[],
  identifiers: Identifier[],
  judgeCtx: ((id: Identifier) => JudgeCtx) | null,
): Promise<Finding[]> {
  const perIdentifier = identifiers
    .filter((id) => id.isNew)
    .map(async (identifier): Promise<Finding[]> => {
      const applicable = rules.filter((rule) => selects(rule.select, identifier));
      const checkCtx = { siblings: identifiers.filter((o) => o !== identifier) };
      const findings: Finding[] = [];
      for (const rule of applicable) {
        if (!rule.check) continue;
        try {
          const verdict = rule.check(identifier, checkCtx);
          if (!verdict.ok) findings.push({ rule, identifier, verdict });
        } catch (err) {
          skip(rule, identifier, err);
        }
      }
      if (findings.length || !judgeCtx) return findings;

      const ctx = judgeCtx(identifier);
      const judged = await Promise.all(
        applicable
          .filter((rule) => rule.judge)
          .map(async (rule): Promise<Finding | null> => {
            try {
              const verdict = await rule.judge!(identifier, ctx);
              return verdict.ok ? null : { rule, identifier, verdict };
            } catch (err) {
              skip(rule, identifier, err);
              return null;
            }
          }),
      );
      return judged.filter((f): f is Finding => f !== null);
    });
  return (await Promise.all(perIdentifier)).flat();
}
