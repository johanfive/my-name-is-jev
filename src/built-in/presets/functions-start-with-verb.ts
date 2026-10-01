import { verbFirst } from "../judges/verb-first.ts";
import type { Rule } from "../../types.ts";

/** Function names start with a verb and mean only one thing. Getters and components are noun-named on purpose and excluded. */
export const functionsStartWithVerb: Rule[] = [
  {
    id: "fn/verb-first",
    select: { kind: ["function", "method"] },
    judge: verbFirst({ trustedVerbs: ["get", "set", "is", "has", "to", "from"] }),
    message:
      "A function name is a command: a verb first, then the thing it acts on, with no second reading. Think about what the function actually does, then choose a first word that can only be a verb here and an object that can only be a thing.",
    example: "fetchUser, computeTotal, renderInvoice, parseConfig",
  },
];
