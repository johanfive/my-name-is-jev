import { defineConfig } from "./src/index.ts";
import { defaultRules } from "./src/built-in/presets/index.ts";

export default defineConfig({ rules: defaultRules });
