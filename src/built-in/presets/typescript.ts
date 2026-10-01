import { any } from "../checks/any.ts";
import { casing } from "../checks/casing.ts";
import type { Rule } from "../../types.ts";

/** Conventional TypeScript casing. Shape only, no Jev. */
export const typescript: Rule[] = [
  {
    id: "ts/camel",
    select: { kind: ["variable", "function", "method", "getter", "parameter", "property"] },
    check: casing("camel"),
    message: "Variables, functions, methods, parameters and properties are camelCase.",
    example: "fetchUser, isReady, maxRetryCount",
  },
  {
    id: "ts/const",
    select: { kind: ["const"] },
    check: any(casing("screaming"), casing("camel")),
    message: "Constants are SCREAMING_SNAKE for true constants or camelCase for bound values.",
    example: "MAX_RETRIES, defaultOptions",
  },
  {
    id: "ts/pascal",
    select: { kind: ["class", "type", "interface", "component", "enum-member"] },
    check: casing("pascal"),
    message: "Classes, types, interfaces, components and enum members are PascalCase.",
    example: "UserCache, ProfileProps, Role.Admin",
  },
  {
    id: "ts/kebab-paths",
    select: { kind: ["file", "dir"] },
    check: casing("kebab"),
    message: "File and directory names are kebab-case.",
    example: "user-cache.ts, fetch-user.test.ts",
  },
];
