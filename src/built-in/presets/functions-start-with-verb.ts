import { verbFirst } from "../judges/verb-first.ts";
import type { Rule } from "../../types.ts";

/** Function names start with a verb and mean only one thing. Getters and components are noun-named on purpose and excluded. */
export const functionsStartWithVerb: Rule[] = [
  {
    id: "fn/verb-first",
    select: { kind: ["function", "method"] },
    judge: verbFirst({ trustedVerbs: ["get", "set", "is", "has", "to", "from"] }),
    message:
      "A function name is a command: a verb first, then the thing it acts on, with no second reading. If the object could itself be an action, name the thing (getBuildArtifact, not getBuild). If the name reads as a noun phrase, lead with a verb that cannot be a noun here (getDisplayName, not displayName).",
    example: "fetchUser, getDisplayName, computeTotal, getBuildArtifact",
  },
];
