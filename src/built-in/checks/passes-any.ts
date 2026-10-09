import type { Check, Verdict } from "../../types.ts";

/** Passes at the first check that passes. If none pass, returns the last failure. */
export const passesAny =
  (...checks: Check[]): Check =>
    (id, ctx) => {
      let last: Verdict = { ok: false, detail: "no checks" };
      for (const check of checks) {
        last = check(id, ctx);
        if (last.ok) return last;
      }
      return last;
    };
