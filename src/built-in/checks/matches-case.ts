import type { Check } from "../../types.ts";

export type CaseStyle = "camel" | "pascal" | "kebab" | "snake" | "screaming";

const CASE: Record<CaseStyle, RegExp> = {
  camel: /^[a-z][a-zA-Z\d]*$/,
  pascal: /^[A-Z][a-zA-Z\d]*$/,
  kebab: /^[a-z][a-z\d]*(-[a-z\d]+)*$/,
  snake: /^[a-z][a-z\d]*(_[a-z\d]+)*$/,
  screaming: /^[A-Z][A-Z\d]*(_[A-Z\d]+)*$/,
};

const pieces = (name: string) =>
  name
    .replace(/^[_$]+/, "")
    .split(".")
    .filter(Boolean);

/**
 * Name matches the case style. A leading `_` or `$` is ignored.
 * Dots split a name into pieces judged one by one,
 * since a dot cannot tell an extension (`the-thing.test.ts`)
 * from a name part (`com.google.event`, `Dockerfile.theThing`).
 */
export const matchesCase =
  (style: CaseStyle): Check =>
    (id) => {
      const ps = pieces(id.name);
      const bad = ps.find((p) => !CASE[style].test(p));
      if (bad === undefined) return { ok: true };
      return {
        ok: false,
        detail: ps.length > 1 ? `"${bad}" is not ${style} case` : `not ${style} case`,
      };
    };
