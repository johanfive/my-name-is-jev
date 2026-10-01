# Primitives

What `nij` must let anyone build, what the pipeline decides on its own, and what each module is
for. Presets are out of scope here: they are consumers of these primitives, nothing more.

## Intents a rule author must be able to express

| # | Intent | Needs | Kind of judgement |
|---|---|---|---|
| 1 | Function names start with a verb, whatever the verb. | first segment; "is this a verb here" | Jev |
| 2 | A name that can be read more than one way is flagged. The agent decides whether and how to fix it. | "could this be read as X and as Y"; the readings in the finding | Jev |
| 3 | Some kinds of identifier are cased some way (files kebab, variables camel, constants screaming). | kind; casing test | mechanical |
| 4 | A rule applies only to some files: an extension, a directory, a glob. | the file path; a glob | mechanical, selection |
| 5 | In a multi-segment name the segments are ordered a semantic way (most stable to most variable, verb before object). | segments; a scale to place each on | Jev |
| 6 | A name says what the thing is. Only answerable when the name is not alone: skip unless the tool call brought enough other identifiers to serve as context. | the sibling identifiers of the same call; a threshold under which the rule skips itself | Jev, conditional |

Two things fall out of the table. Every intent is either fully mechanical or fully semantic;
none needs both inside one judgement. And every semantic intent is a question about the
identifier, optionally with more state, whose answer is turned into a verdict in code.

On intent 2, and on all of them: Jev answers questions, it does not write names, and neither
does the library. A finding names what is wrong (the readings, the misplaced pair, the piece
that is not kebab); the replacement is always the agent's. Even a re-ordering that looks
mechanical is not offered: we can be wrong, and we diagnose, the model decides.

## Invariants the pipeline owns

Users cannot change these. They are what makes the system reasonable to think about.

- **Two kinds of rule, never mixed.** A rule has a `check` (sync, pure, no Jev) or a `judge`
  (async, has Jev). Not both. Composition across kinds happens by having two rules, not by
  combining functions. The types enforce it: a `check` returns a `Verdict`, not a promise, and
  has no Jev handle to reach for. Both receive a context object, so fields can be added to
  either without a breaking change; the check's is the judge's minus Jev.
- **Checks first, judges last.** Per identifier: every applicable check runs and every failure
  is kept. If any check failed, no judge runs for that identifier. Judges then run in parallel.
  A name that will be renamed for its casing does not earn a Jev request.
- **Only new identifiers.** What the tool call introduces. Pre-existing names are not the
  agent's doing.
- **Fail open, always.** No key, Jev down, a rule that throws: the judge is skipped, a line goes
  to stderr, the agent proceeds. There is no strict mode.
- **Severity resolves rule → config → `warn`.** The default never blocks.

## Modules

| Module | Responsibility | Input → output | Knows about |
|---|---|---|---|
| `parse/` | Turn a tool call into identifiers. Nothing else. | `(toolName, toolInput, extractors) → Identifier[]` with `isNew` | the file system (to diff), the language parsers |
| `pipeline.ts` | Pipe identifiers through the rules under the invariants above. | `(rules, identifiers, judgeCtx?) → Finding[]` | rules, the invariants |
| `report.ts` | Turn findings into one decision and one text an agent can act on. | `(findings, config) → Report \| null` | severities, formatting |
| `question.ts`, `tokenize.ts` | The two primitives that are functions: form a question, split a name. | | the SDK |
| `built-in/checks/`, `built-in/judges/`, `built-in/presets/` | Things a user could write from the primitives, shipped because most would. Every export of `checks/` and `judges/` is a factory returning a `Check` or a `Judge`; presets are rules wired from them. | | only the core exports |
| `jev-client.ts`, `cache.ts` | The one wrapper around the SDK: env, batching, tracing; and the bounded on-disk answer cache (SQLite from the standard library, one row per question, pruned to a size and an age on open). | `createJev(config) → Jev \| null`, `judgeCtx(jev, id, siblings) → JudgeCtx` | env vars, the cache file |
| `adapters/<agent>/` | Map a `Report` onto one agent's hook protocol. | hook input → hook output | that agent's JSON |
| `config.ts` | Load and default the config. No config anywhere means the built-in presets at `warn`; writing a config replaces them. | `nij.config.ts → ResolvedConfig` | defaults |

`parse/` never sees a rule. `pipeline.ts` never formats text. `report.ts` never sees Jev.
`built-in/` imports only what the root export exposes, which is the proof that a user could have
written it. Entry points mirror the tree: `my-name-is-jev`, `/checks`, `/judges`, `/presets`.

## The primitives

```ts
type Identifier = { name; kind: Kind; file; line?; isNew; segments: string[];
                    async?; returnType?; type?; arity? };  // declared facts, verbatim, never inferred
type Verdict = { ok: true } | { ok: false; detail?: string };

type Check = (id: Identifier, ctx: CheckCtx) => Verdict;          // mechanical
type Judge = (id: Identifier, ctx: JudgeCtx) => Promise<Verdict>;  // semantic

type CheckCtx = { siblings: Identifier[] };  // the other identifiers this tool call introduces
type JudgeCtx = CheckCtx & {
  jev: (req: { questions: Questions; state?: State }) => Promise<Answers>;
  state: State;            // what Jev sees by default: name, kind, segments, file, declared facts. Spread to extend.
};

type Rule = { id; select?: { kind?: Kind[]; path?: glob }; severity?; message; example? }
          & ({ check: Check } | { judge: Judge });
```

Primitives that are functions, from the root export:

- `question.noul / .score / .choice`: the SDK builders, for judges that ask one or several
  questions in one `ctx.jev` call and combine the answers in code. There is no combinator for
  judges on purpose, because several questions belong in one request.
- `tokenize(name)`: the function behind `segments`.

Built-in, from `/checks` and `/judges`, all factories, all named-parameter where there is more
than one parameter:

- `casing(style)`, `regex(re)`, `any(...checks)` → `Check`.
- `noul({ ask, criteria?, threshold?, failWhen? })`, `score({ ask, legend, min?, max? })`,
  `verbFirst({...})`, `ordered({...})` → `Judge`. Plus `describeConfidence(p)` → "82% sure", from `judges/helpers/`.

The intents map onto these directly: 1 is a judge with two or three `question.noul`s; 2 is a
`noul` with the readings in `detail`; 3 is `casing`; 4 is `select.path`; 5 is a judge with one
`question.score` per segment; 6 is a judge that returns ok when `ctx.siblings.length` is under
its threshold and otherwise spreads the sibling names into `state`.

The signature facts are primitives in their own right (a check can say "boolean-returning
functions start with is or has" with no Jev at all from `returnType === "boolean"`) and they ride along in the default Jev
state, because they are the minimal, high-signal slice of the tool input. The raw tool input and
the file content are deliberately out of reach of rules and of Jev: too much context, and an
invitation to over-engineer.

`ctx.jev` calls for the same state in the same tick share one request, so an identifier costs one
request however many judges select it (ADR 0002). Answers are cached per question.

`ctx.jev` takes an object so that fields can be added (a per-request model, a cache hint)
without a breaking change. The default `state` is deliberately small and stable so that cache
hits survive across calls; a judge that adds siblings to the state opts out of that for itself.

## Gap between this and the code before this document

Dropped, because no intent needed it:

- `Ctx.file`, `Ctx.tool`, `Ctx.config`: no check ever read them.
- `Selector.match`: a regex on the name is what `regex()` is for.
- `all(...)`: two rules with the same selector are `all`, and give one message each.
- `scope: "touched-file"`: contradicts "only new identifiers".
- `failClosed`: contradicts "fail open, always".
- `JevAsk` returning `null`: judges are skipped before they run when Jev is absent, and a
  transport failure throws and is caught by the pipeline. Rule authors never see a null.

Changed:

- `Check` was one type for both kinds and the engine ran everything in parallel. Now `check`
  and `judge` are distinct properties with distinct signatures, and the pipeline enforces
  checks-then-judges per identifier.
- `noul(instructions, opts)` and `score(instructions, opts)` take one named-parameter object.
- `ctx.jev(questions, state?)` is `ctx.jev({ questions, state? })`.
- `diff.ts` + `extract/` are `parse/`. `engine.ts` is `pipeline.ts`. Formatting and the
  severity decision move out of the adapter into `report.ts`.
- The adapter is now a thin mapping from `Report` to Claude Code's hook JSON.

Kept: kinds, tokenizer, casing regexes, path/TypeScript/Bash parsers, env resolution, the cache,
`explain` and `check` in the CLI, the presets (rewritten onto `judge`, intent unchanged).

## Open questions

Defaults taken; each is one word to veto.

1. Names `check` / `judge` for the two rule kinds. Alternatives: `shape` / `meaning`,
   `test` / `ask`.
2. Intent 6 threshold: a judge skips itself under 2 siblings. Left to the rule; no helper.
3. `noul`'s first field is `ask`, since `question` is the namespace for the raw builders.
4. Severity `ask` stays in the core `Report` even though only Claude Code has an equivalent.
   An adapter without one maps it to its nearest thing.
