import { defineConfig } from "./src/index.ts";
import { functionsStartWithVerb, stableToVariable, typescript } from "./src/built-in/presets/index.ts";

export default defineConfig({
  rules: [...typescript, ...functionsStartWithVerb, ...stableToVariable],
});
