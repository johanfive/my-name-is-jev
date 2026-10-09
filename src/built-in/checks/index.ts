// Built-in checks: every export is a factory returning a `Check`.
// A user could write any of these from the primitives.
export { matchesCase, type CaseStyle } from "./matches-case.ts";
export { matchesRegex } from "./matches-regex.ts";
export { passesAny } from "./passes-any.ts";
