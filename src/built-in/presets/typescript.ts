import { any } from "../checks/any.ts";
import { casing } from "../checks/casing.ts";
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
    check: casing("camel"),
    message:
      "Variables, functions, methods, parameters and properties are camelCase, "
      + "unless an outside API or tool expects another form, like its own field names.",
    example: "fetchUser, isReady, retryCountMax",
  },
  {
    id: "ts/const",
    select: { kind: ["const"] },
    check: any(casing("screaming"), casing("camel")),
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
    check: casing("pascal"),
    message: "Classes, types, interfaces, components and enum members are PascalCase.",
    example: "UserCache, ProfileProps, Role.Admin",
  },
  {
    id: "ts/kebab-paths",
    select: { kind: ["file", "dir"] },
    check: casing("kebab"),
    message:
      "File and directory names are kebab-case, "
      + "unless a well-established convention or a tool expects another form.",
    example: "user-cache.ts, fetch-user.test.ts",
  },
];
