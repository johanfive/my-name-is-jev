import { judgeStableToVariable } from "../judges/judge-stable-to-variable.ts";
import type { Rule } from "../../types.ts";

/** Words go from most stable to most variable. */
export const stableToVariable: Rule[] = [
  {
    id: "order/stable-to-variable",
    select: {
      kind: [
        "variable",
        "const",
        "function",
        "method",
        "class",
        "type",
        "interface",
        "property",
        "file",
        "dir",
        "string",
      ],
    },
    judge: judgeStableToVariable(),
    message:
      "A name sorts and reads best with its words ordered from most stable to most variable, "
      + "the way a date goes year, month, day. What counts as stable depends on how things are "
      + "made here: one company has many services, a service is deployed to a few environments, "
      + "and every deploy gets a new version, so the company comes first and the version last. "
      + "Qualifiers and units come after the thing they qualify (revenueTotal, timeoutMs), "
      + "and a map is named for its value, then By, then its key (urlByEnvironment). "
      + "Consider whether the words of this name follow that order.",
    example:
      "{company}-{service}-{resource}-{environment}-{version} as in "
      + "acme-billing-bucket-dev-20260301093000, leaving out the parts a name does not have: "
      + "acme-billing-bucket-dev, acme-billing-dev-20260301093000",
  },
];
