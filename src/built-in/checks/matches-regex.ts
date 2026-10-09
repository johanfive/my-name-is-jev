import type { Check } from "../../types.ts";

/** A check that the whole name matches the pattern, for conventions no case style covers. */
export function matchesRegex(pattern: RegExp): Check {
  return (id) =>
    pattern.test(id.name) ? { ok: true } : { ok: false, detail: `does not match ${pattern}` };
}
