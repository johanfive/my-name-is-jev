import type { JsonValue, Questions, SystemOneResult } from "@typesafe-ai/sdk";

export type Kind =
  | "file"
  | "dir"
  | "variable"
  | "const"
  | "function"
  | "method"
  | "getter"
  | "class"
  | "type"
  | "interface"
  | "enum-member"
  | "property"
  | "parameter"
  | "component"
  | "string";

export type Identifier = {
  name: string;
  kind: Kind;
  file: string;
  line?: number;
  /** Introduced by the current tool call. Only new identifiers are checked. */
  isNew: boolean;
  /** Lowercase words, separator-agnostic. See `tokenize`. */
  segments: string[];
  // Signature facts the parser could read. Present only when declared; also given to Jev as state.
  /** Callers await it: the `async` keyword, or a declared `Promise<…>` return type. */
  async?: boolean;
  /**
   * Declared return type of a callable, verbatim, with one outer `Promise<…>` unwrapped.
   * Never inferred.
   */
  returnType?: string;
  /** Declared type of a variable, property or parameter, verbatim. Never inferred. */
  type?: string;
  /** Parameter count of a callable. */
  arity?: number;
};

/**
 * A failing verdict says what is wrong, never what the name should be:
 * we diagnose, the model decides.
 */
export type Verdict = { ok: true } | { ok: false; detail?: string };
export type Failure = Extract<Verdict, { ok: false }>;

export type Answers = SystemOneResult<Questions>["answers"];
export type State = { [key: string]: JsonValue };

export type CheckCtx = {
  /** The other identifiers this tool call introduces. */
  siblings: Identifier[];
};

export type JudgeCtx = CheckCtx & {
  /**
   * One request to Jev.
   * `state` replaces the default.
   * Throws when Jev fails; the pipeline skips the judge.
   */
  jev: (req: { questions: Questions; state?: State }) => Promise<Answers>;
  /**
   * What Jev sees by default: name, kind, segments, file, declared facts. Spread it to add context.
   */
  state: State;
};

/** Mechanical: sync, pure, no Jev. */
export type Check = (id: Identifier, ctx: CheckCtx) => Verdict;
/** Semantic: async, Jev. Runs only when every check on the identifier passed. */
export type Judge = (id: Identifier, ctx: JudgeCtx) => Promise<Verdict>;

export type Selector = {
  kind?: Kind[];
  /** Glob matched against the identifier's file path. */
  path?: string;
};

export type Severity = "block" | "warn" | "ask";

type RuleBase = {
  id: string;
  select?: Selector;
  /** Defaults to the config's `severity`. */
  severity?: Severity;
  /** Human-authored. This is what the agent reads. */
  message: string;
  example?: string;
};
/** A rule is mechanical or semantic, never both. Combine kinds with two rules. */
export type Rule = RuleBase & ({ check: Check; judge?: never } | { judge: Judge; check?: never });

export type Finding = { rule: Rule; identifier: Identifier; verdict: Failure };

export type Extractor = {
  test: (filePath: string) => boolean;
  extract: (filePath: string, content: string) => Identifier[];
};

export type Config = {
  rules: Rule[];
  severity?: Severity;
  extractors?: Extractor[];
  jev?: { baseURL?: string; model?: string };
  /** Jev answers are cached on disk, bounded by rows and days since last use. `false` disables. */
  cache?: false | { entriesMax?: number; ageMaxDays?: number };
  /** Also apply the user-level config. A project sets `false` to opt out of it. */
  global?: boolean;
};

export type ResolvedConfig = Required<Omit<Config, "jev" | "cache" | "global">> & {
  jev: { baseURL?: string; model?: string };
  cache: { enabled: boolean; entriesMax: number; ageMaxDays: number };
  /** The config files that were loaded, user-level first. */
  sources: string[];
};

/** Types a config file's export. It returns the config as-is: the point is the editor's help. */
export const defineConfig = (config: Config): Config => config;
