import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { extractFromTypeScript } from "./typescript.ts";

/**
 * Extracts the identifiers of a TypeScript source and returns them as name → kind and facts,
 * leaving out the fields every identifier has.
 *
 * @param content The source to extract from.
 * @param filePath Its path, whose extension picks the parser's script kind.
 * @returns One entry per identifier, in source order.
 */
function getDeclarations(content: string, filePath = "src/fake.ts"): unknown[] {
  return extractFromTypeScript(filePath, content).map(
    ({ name, kind, async, returnType, type, arity }) =>
      Object.fromEntries(
        Object.entries({ name, kind, async, returnType, type, arity })
          .filter(([, value]) => value !== undefined),
      ),
  );
}

describe("extractFromTypeScript", () => {
  test("reads a function's signature facts, unwrapping Promise", () => {
    const declarations = getDeclarations("async function loadUser(id: string): Promise<User> {}");
    assert.deepEqual(declarations, [
      {
        name: "loadUser",
        kind: "function",
        async: true,
        returnType: "User",
        arity: 1,
      },
      { name: "id", kind: "parameter", type: "string" },
    ]);
  });

  test("tells a const from a variable, and a variable holding a function from both", () => {
    const declarations = getDeclarations(
      "const LIMIT: number = 3; let count = 0; const toWord = (n: number) => '';",
    );
    assert.deepEqual(declarations, [
      { name: "LIMIT", kind: "const", type: "number" },
      { name: "count", kind: "variable" },
      { name: "toWord", kind: "function", arity: 1 },
      { name: "n", kind: "parameter", type: "number" },
    ]);
  });

  test("reads classes, members, types, interfaces and enum members, but not enum names", () => {
    const declarations = getDeclarations(`
      class UserCache { size = 0; get count() { return 1; } clear() {} }
      type UserId = string;
      interface Profile { displayName: string }
      enum Role { Admin }
    `);
    assert.deepEqual(declarations, [
      { name: "UserCache", kind: "class" },
      { name: "size", kind: "property" },
      { name: "count", kind: "getter", arity: 0 },
      { name: "clear", kind: "method", arity: 0 },
      { name: "UserId", kind: "type" },
      { name: "Profile", kind: "interface" },
      { name: "displayName", kind: "property", type: "string" },
      { name: "Admin", kind: "enum-member" },
    ]);
  });

  test("calls a PascalCase function returning JSX a component", () => {
    const declarations = getDeclarations(
      "function Menu() { return <nav />; } const Item = () => <li />;",
      "src/menu.tsx",
    );
    const kinds = declarations.map((declaration) => (declaration as { kind: string }).kind);
    assert.deepEqual(kinds, ["component", "component"]);
  });

  test("skips usages, imports, destructuring and _-prefixed names", () => {
    const declarations = getDeclarations(
      "import { readFile } from 'node:fs'; const { a } = obj; const _unused = 1; readFile();",
    );
    assert.deepEqual(declarations, []);
  });

  test("records the line of each name", () => {
    const lines = extractFromTypeScript("src/fake.ts", "\n\nconst first = 1;").map(
      (id) => id.line,
    );
    assert.deepEqual(lines, [3]);
  });
});
