import { verbFirst } from "../judges/verb-first.ts";
import type { Rule } from "../../types.ts";

/**
 * Function names start with a verb and mean only one thing.
 * Getters and components are noun-named on purpose and excluded.
 */
export const functionsStartWithVerb: Rule[] = [
  {
    id: "fn/verb-first",
    select: { kind: ["function", "method"] },
    judge: verbFirst(),
    message:
      "A function name reads best as a command: a verb first, then the thing it acts on, "
      + "with no second reading. Think about what the function actually does.",
    example: "fetchUser, computeTotal, renderInvoice, parseConfig",
  },
];
