import ts from "typescript";
import type { Extractor, Identifier, Kind } from "../types.ts";
import { tokenize } from "../tokenize.ts";

const EXT = /\.(m|c)?(j|t)sx?$/;
const SCRIPT_KIND: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

const isFnLike = (n: ts.Node | undefined): n is ts.ArrowFunction | ts.FunctionExpression =>
  !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

const containsJsx = (n: ts.Node): boolean => {
  let found = false;
  const visit = (c: ts.Node) => {
    if (found) return;
    if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c)) found = true;
    else ts.forEachChild(c, visit);
  };
  visit(n);
  return found;
};

type Fn =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression;
type Facts = Pick<Identifier, "async" | "returnType" | "type" | "arity">;

const isPromise = (t: ts.TypeNode | undefined): t is ts.TypeReferenceNode =>
  !!t && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === "Promise";

/**
 * Declared type text, never inferred. `unwrapPromise` takes the value a caller gets after awaiting.
 */
const typeText = (
  sf: ts.SourceFile,
  t: ts.TypeNode | undefined,
  unwrapPromise = false,
): string | undefined => {
  if (!t) return undefined;
  if (unwrapPromise && isPromise(t)) return typeText(sf, t.typeArguments?.[0]);
  return t.getText(sf);
};

const factsOf = (sf: ts.SourceFile, fn: Fn): Facts => ({
  async:
    (ts.canHaveModifiers(fn)
      && ts.getModifiers(fn)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
    || isPromise(fn.type)
      ? true
      : undefined,
  returnType: typeText(sf, fn.type, true),
  arity: fn.parameters.length,
});

/**
 * Declared identifiers with their kind and the signature facts that are cheap to read.
 * Usages, imports and `_`-prefixed names are skipped.
 */
export function extractFromTypeScript(
  filePath: string,
  content: string,
  isNew = true,
): Identifier[] {
  const ext = filePath.match(EXT)?.[0] ?? ".ts";
  const sf = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    SCRIPT_KIND[ext] ?? ts.ScriptKind.TS,
  );
  const out: Identifier[] = [];

  const push = (nameNode: ts.Node | undefined, kind: Kind, facts: Facts = {}) => {
    if (!nameNode || !ts.isIdentifier(nameNode)) return;
    const name = nameNode.text;
    if (name.startsWith("_")) return;
    const { line } = sf.getLineAndCharacterOfPosition(nameNode.getStart(sf));
    const id: Identifier = {
      name,
      kind,
      file: filePath,
      line: line + 1,
      isNew,
      segments: tokenize(name),
    };
    Object.assign(id, Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== undefined)));
    out.push(id);
  };

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) {
      const isConst = !!(ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const);
      if (isFnLike(node.initializer)) {
        const fn = node.initializer;
        const pascal = ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text);
        push(node.name, pascal && containsJsx(fn) ? "component" : "function", factsOf(sf, fn));
      } else {
        push(node.name, isConst ? "const" : "variable", { type: typeText(sf, node.type) });
      }
    } else if (ts.isFunctionDeclaration(node)) {
      const pascal = !!node.name && /^[A-Z]/.test(node.name.text);
      push(node.name, pascal && containsJsx(node) ? "component" : "function", factsOf(sf, node));
    } else if (ts.isMethodDeclaration(node)) {
      push(node.name, "method", factsOf(sf, node));
    } else if (ts.isGetAccessorDeclaration(node)) {
      push(node.name, "getter", factsOf(sf, node));
    } else if (ts.isClassDeclaration(node)) {
      push(node.name, "class");
    } else if (ts.isTypeAliasDeclaration(node)) {
      push(node.name, "type");
    } else if (ts.isInterfaceDeclaration(node)) {
      push(node.name, "interface");
    } else if (ts.isEnumMember(node)) {
      push(node.name, "enum-member");
    } else if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
      push(node.name, "property", { type: typeText(sf, node.type) });
    } else if (ts.isParameter(node)) {
      push(node.name, "parameter", { type: typeText(sf, node.type) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export const typescriptExtractor: Extractor = {
  test: (filePath) => EXT.test(filePath),
  extract: (filePath, content) => extractFromTypeScript(filePath, content),
};
