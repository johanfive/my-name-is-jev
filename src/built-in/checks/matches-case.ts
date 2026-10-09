import { stripLeadingSigil } from "../../tokenize.ts";
import type { Check } from "../../types.ts";

export type CaseStyle = "camel" | "pascal" | "kebab" | "snake" | "screaming";

const REGEX_BY_CASE_STYLE: Record<CaseStyle, RegExp> = {
  camel: /^[a-z][a-zA-Z\d]*$/,
  pascal: /^[A-Z][a-zA-Z\d]*$/,
  kebab: /^[a-z][a-z\d]*(-[a-z\d]+)*$/,
  snake: /^[a-z][a-z\d]*(_[a-z\d]+)*$/,
  screaming: /^[A-Z][A-Z\d]*(_[A-Z\d]+)*$/,
};

/**
 * A check that the name matches the case style. A leading `_` or `$` is ignored.
 * Dots split a name into pieces judged one by one,
 * since a dot cannot tell an extension (`the-thing.test.ts`)
 * from a name part (`com.google.event`, `Dockerfile.theThing`).
 */
export function matchesCase(style: CaseStyle): Check {
  return (id) => {
    const pieces = splitOnDots(id.name);
    const badPiece = pieces.find((piece) => !REGEX_BY_CASE_STYLE[style].test(piece));
    if (badPiece === undefined) return { ok: true };
    return {
      ok: false,
      detail: pieces.length > 1 ? `"${badPiece}" is not ${style} case` : `not ${style} case`,
    };
  };
}

/** The dotted pieces of a name, sigil stripped, so each piece is judged on its own. */
const splitOnDots = (name: string) => stripLeadingSigil(name).split(".").filter(Boolean);
