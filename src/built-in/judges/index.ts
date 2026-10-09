// Built-in judges: every export is a factory returning a `Judge`.
// A user could write any of these from the primitives.
export { judgeByNoul } from "./judge-by-noul.ts";
export { judgeByScore } from "./judge-by-score.ts";
export { judgeVerbFirst } from "./judge-verb-first.ts";
export { judgeStableToVariable } from "./judge-stable-to-variable.ts";
/* Helpers for writing judges. Not factories. */
export { describeConfidence } from "./helpers/describe-confidence.ts";
