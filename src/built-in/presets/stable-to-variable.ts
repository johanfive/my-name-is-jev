import { ordered } from "../judges/ordered.ts";
import type { Rule } from "../../types.ts";

const SCALE = [
  "organisation or product (acme, stripe)",
  "domain entity (user, invoice, deploy)",
  "role or component (cache, handler, service, config)",
  "qualifier or variant (primary, legacy, prod, dev)",
  "state, time or version (pending, draft, v3, 2026)",
] as const;

const MESSAGE =
  "Order the words in a name from most stable to most variable: "
  + "what it belongs to, then what it is, then how it varies.";

/** Words go from most stable to most variable. For functions the leading verb is its own level. */
export const stableToVariable: Rule[] = [
  {
    id: "order/stable-to-variable",
    select: {
      kind: [
        "variable",
        "const",
        "class",
        "type",
        "interface",
        "property",
        "file",
        "dir",
        "string",
      ],
    },
    judge: ordered({ scale: SCALE }),
    message: MESSAGE,
    example: "stripeInvoiceHandlerDraft, deploy-config-prod, acme-prod-202609282037",
  },
  {
    id: "order/stable-to-variable-fn",
    select: { kind: ["function", "method"] },
    judge: ordered({ scale: ["the action (get, fetch, render, compute)", ...SCALE] }),
    message: MESSAGE,
    example: "renderStripeInvoiceDraft, fetchDeployConfigProd",
  },
];
