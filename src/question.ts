import { choice, noul, score } from "@typesafe-ai/sdk";

/**
 * The question builders a judge passes to `ctx.jev`.
 * A primitive: without these no semantic rule can be written.
 */
export const question = { noul, score, choice };
