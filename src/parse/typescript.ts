import ts from "typescript";
import { tokenize } from "../tokenize.ts";
import type { Extractor, Identifier, Kind } from "../types.ts";
import { withoutUndefined } from "../without-undefined.ts";

const SCRIPT_EXTENSION_PATTERN = /\.(m|c)?(j|t)sx?$/;
const SCRIPT_KIND_BY_EXTENSION: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

type Fn =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression;
type Facts = Pick<Identifier, "async" | "returnType" | "type" | "arity">;
/** What a node declares, before the name is read and filtered. */
type Declaration = { nameNode: ts.Node | undefined; kind: Kind; facts?: Facts };

/**
 * Declared identifiers with their kind and the signature facts that are cheap to read.
 * Usages, imports and `_`-prefixed names are skipped.
 */
export function extractFromTypeScript(
  filePath: string,
  content: string,
  isNew = true,
): Identifier[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    toScriptKind(filePath),
  );
  return listNodes(sourceFile).flatMap((node) => {
    const declaration = describeDeclaration(sourceFile, node);
    return declaration ? toIdentifiers(sourceFile, filePath, declaration, isNew) : [];
  });
}

export const typescriptExtractor: Extractor = {
  test: (filePath) => SCRIPT_EXTENSION_PATTERN.test(filePath),
  extract: (filePath, content) => extractFromTypeScript(filePath, content),
};

/** The parser's script kind for the file's extension, so JSX and plain JS parse right. */
function toScriptKind(filePath: string): ts.ScriptKind {
  const extension = filePath.match(SCRIPT_EXTENSION_PATTERN)?.[0] ?? ".ts";
  return SCRIPT_KIND_BY_EXTENSION[extension] ?? ts.ScriptKind.TS;
}

/** The node and every node under it, parents first. Declarations nest at any depth. */
function listNodes(node: ts.Node): ts.Node[] {
  const children: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return [node, ...children.flatMap(listNodes)];
}

/** What the node declares, or null when it declares nothing nij checks. */
function describeDeclaration(sourceFile: ts.SourceFile, node: ts.Node): Declaration | null {
  if (ts.isVariableDeclaration(node)) return describeVariable(sourceFile, node);
  if (ts.isFunctionDeclaration(node)) {
    const kind = isComponent(node.name, node) ? "component" : "function";
    return { nameNode: node.name, kind, facts: factsOf(sourceFile, node) };
  }
  if (ts.isMethodDeclaration(node)) {
    return { nameNode: node.name, kind: "method", facts: factsOf(sourceFile, node) };
  }
  if (ts.isGetAccessorDeclaration(node)) {
    return { nameNode: node.name, kind: "getter", facts: factsOf(sourceFile, node) };
  }
  if (ts.isClassDeclaration(node)) return { nameNode: node.name, kind: "class" };
  if (ts.isTypeAliasDeclaration(node)) return { nameNode: node.name, kind: "type" };
  if (ts.isInterfaceDeclaration(node)) return { nameNode: node.name, kind: "interface" };
  if (ts.isEnumMember(node)) return { nameNode: node.name, kind: "enum-member" };
  if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
    return describeTyped(sourceFile, node, "property");
  }
  if (ts.isParameter(node)) return describeTyped(sourceFile, node, "parameter");
  return null;
}

/** A variable is a function or component when it holds one, else a const or a variable. */
function describeVariable(sourceFile: ts.SourceFile, node: ts.VariableDeclaration): Declaration {
  const fn = node.initializer;
  if (isFnLike(fn)) {
    const kind = isComponent(node.name, fn) ? "component" : "function";
    return { nameNode: node.name, kind, facts: factsOf(sourceFile, fn) };
  }
  const isConst = !!(ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const);
  return describeTyped(sourceFile, node, isConst ? "const" : "variable");
}

/** A declaration whose one fact is its declared type. */
function describeTyped(
  sourceFile: ts.SourceFile,
  node: { name: ts.Node; type?: ts.TypeNode },
  kind: Kind,
): Declaration {
  return { nameNode: node.name, kind, facts: { type: typeText(sourceFile, node.type) } };
}

/**
 * The declaration as an identifier, or none when its name is not a plain identifier
 * (a destructuring pattern, a computed key) or starts with `_`, which marks it unused on purpose.
 */
function toIdentifiers(
  sourceFile: ts.SourceFile,
  filePath: string,
  { nameNode, kind, facts = {} }: Declaration,
  isNew: boolean,
): Identifier[] {
  if (!nameNode || !ts.isIdentifier(nameNode) || nameNode.text.startsWith("_")) return [];
  const name = nameNode.text;
  const { line } = sourceFile.getLineAndCharacterOfPosition(nameNode.getStart(sourceFile));
  const id = { name, kind, file: filePath, line: line + 1, isNew, segments: tokenize(name) };
  return [{ ...id, ...withoutUndefined(facts) }];
}

/** A PascalCase function that returns JSX: React's convention for a component. */
function isComponent(nameNode: ts.Node | undefined, fn: ts.Node): boolean {
  const isPascal = !!nameNode && ts.isIdentifier(nameNode) && /^[A-Z]/.test(nameNode.text);
  return isPascal && containsJsx(fn);
}

/** Whether JSX appears anywhere in the node. `forEachChild` stops at the first `true`. */
function containsJsx(node: ts.Node): boolean {
  return (
    ts.isJsxElement(node)
    || ts.isJsxSelfClosingElement(node)
    || ts.isJsxFragment(node)
    || !!ts.forEachChild(node, containsJsx)
  );
}

/** The signature facts Jev gets to weigh a callable's name against. */
function factsOf(sourceFile: ts.SourceFile, fn: Fn): Facts {
  return {
    async: isAsync(fn) ? true : undefined,
    returnType: typeText(sourceFile, fn.type, true),
    arity: fn.parameters.length,
  };
}

/** Callers await it: the `async` keyword, or a declared `Promise<…>` return type. */
function isAsync(fn: Fn): boolean {
  const hasAsyncKeyword = ts.canHaveModifiers(fn)
    && !!ts.getModifiers(fn)?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
  return hasAsyncKeyword || isPromise(fn.type);
}

/**
 * Declared type text, never inferred. `unwrapPromise` takes the value a caller gets after awaiting.
 */
function typeText(
  sourceFile: ts.SourceFile,
  type: ts.TypeNode | undefined,
  unwrapPromise = false,
): string | undefined {
  if (!type) return undefined;
  if (unwrapPromise && isPromise(type)) return typeText(sourceFile, type.typeArguments?.[0]);
  return type.getText(sourceFile);
}

/** Whether the type is written as `Promise<…>`. */
function isPromise(type: ts.TypeNode | undefined): type is ts.TypeReferenceNode {
  return !!type
    && ts.isTypeReferenceNode(type)
    && ts.isIdentifier(type.typeName)
    && type.typeName.text === "Promise";
}

/** An arrow function or function expression: what makes a variable a function. */
function isFnLike(node: ts.Node | undefined): node is ts.ArrowFunction | ts.FunctionExpression {
  return !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}
