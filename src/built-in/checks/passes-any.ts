import type { Check, Verdict } from "../../types.ts";

/**
 * A check that passes at the first of `checks` that passes, else returns the last failure.
 * One rule can then accept several styles, as a const may be `MAX_RETRIES` or `defaultOptions`.
 */
export function passesAny(...checks: Check[]): Check {
  return (id, ctx) => {
    let last: Verdict = { ok: false, detail: "no checks" };
    for (const check of checks) {
      last = check(id, ctx);
      if (last.ok) return last;
    }
    return last;
  };
}
