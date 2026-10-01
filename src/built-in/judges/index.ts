/* Built-in judges: every export is a factory returning a `Judge`. A user could write any of these from the primitives. */
export { noul } from "./noul.ts";
export { score } from "./score.ts";
export { verbFirst } from "./verb-first.ts";
export { ordered } from "./ordered.ts";
/* Helpers for writing judges. Not factories. */
export { describeConfidence } from "./helpers/describe-confidence.ts";
