import { passesAny } from "../checks/passes-any.ts";
import { matchesCase } from "../checks/matches-case.ts";
import type { Rule } from "../../types.ts";

/** Conventional TypeScript casing. Shape only, no Jev. */
export const typescript: Rule[] = [
  {
    id: "ts/camel",
    select: { kind: [
      "variable",
      "function",
      "method",
      "getter",
      "parameter",
      "property",
    ] },
    check: matchesCase("camel"),
    message:
      "Variables, functions, methods, parameters and properties are camelCase, "
      + "unless an outside API or tool expects another form, like its own field names.",
    example: "fetchUser, isReady, retryCountMax",
  },
  {
    id: "ts/const",
    select: { kind: ["const"] },
    check: passesAny(matchesCase("screaming"), matchesCase("camel")),
    message:
      "SCREAMING_SNAKE_CASE is for a fixed value known when the code is written. "
      + "Every other const binding is camelCase.",
    example: "API_URL, TIMEOUT_MS, optionsDefault",
  },
  {
    id: "ts/pascal",
    select: { kind: [
      "class",
      "type",
      "interface",
      "component",
      "enum-member",
    ] },
    check: matchesCase("pascal"),
    message: "Classes, types, interfaces, components and enum members are PascalCase.",
    example: "UserCache, ProfileProps, Role.Admin",
  },
  {
    id: "ts/kebab-paths",
    select: { kind: ["file", "dir"] },
    check: matchesCase("kebab"),
    message:
      "File and directory names are kebab-case, "
      + "unless a well-established convention or a tool expects another form.",
    example: "user-cache.ts, fetch-user.test.ts",
  },
];
