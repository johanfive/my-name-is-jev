// Built-in presets: rules wired from the built-in checks and judges.
// The library runs without them.
import { functionsStartWithVerb } from "./functions-start-with-verb.ts";
import { stableToVariable } from "./stable-to-variable.ts";
import { typescript } from "./typescript.ts";

export { typescript, functionsStartWithVerb, stableToVariable };

/** Every built-in preset: what nij applies when a project has no config. */
export const defaultRules = [
  ...typescript,
  ...functionsStartWithVerb,
  ...stableToVariable,
];
