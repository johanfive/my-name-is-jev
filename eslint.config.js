// @ts-check
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.{js,ts}"],
  extends: [
    js.configs.recommended,
    tseslint.configs.recommended,
    stylistic.configs.customize({
      indent: 2,
      quotes: "double",
      semi: true,
      jsx: false,
      arrowParens: true,
      braceStyle: "1tbs",
    }),
  ],
  rules: {
    // 100 columns.
    // Large monitors or not, code is read in split screens, and in agent tools with
    // the chat on one side and the diff on the other. 100 is still the right ceiling.
    "@stylistic/max-len": ["error", { code: 100, ignoreUrls: true, ignoreRegExpLiterals: true }],
    // A one-line `if (x) y;` stays bare; a body that spans lines gets braces.
    "curly": ["error", "multi-line"],
    // Every unused binding is an error unless its name starts with `_`: unused on purpose.
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        args: "all",
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
    // One element per line from three items up; an array whose elements span lines stays broken.
    "@stylistic/array-bracket-newline": ["error", { multiline: true, minItems: 3 }],
    "@stylistic/array-element-newline": ["error", { multiline: true, minItems: 3 }],
    // Operators open the continuation line,
    // so the reader sees how it joins without scanning right.
    // Assignment is the exception: the name and its `=` stay together.
    "@stylistic/operator-linebreak": [
      "error",
      "before",
      { overrides: { "=": "after" } },
    ],
  },
});
