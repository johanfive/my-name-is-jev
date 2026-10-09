import type { Identifier } from "./types.ts";

/**
 * The other identifiers of the same tool call.
 * Checks and judges see them, since a name often only makes sense next to its siblings.
 */
export const listSiblings = (identifiers: Identifier[], id: Identifier) =>
  identifiers.filter((other) => other !== id);
