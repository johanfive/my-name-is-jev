import type { Check } from "../../types.ts";

export const matchesRegex =
  (re: RegExp): Check =>
    (id) =>
      re.test(id.name) ? { ok: true } : { ok: false, detail: `does not match ${re}` };
