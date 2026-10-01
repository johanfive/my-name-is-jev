import { createHash } from "node:crypto";
import { TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
import { openCache } from "./cache.ts";
import type { Answers, Identifier, JudgeCtx, ResolvedConfig, State } from "./types.ts";

type Answer = Answers[string];
type MutableAnswers = { [key: string]: Answer };

export type Trace = (state: State, questions: Questions, answers: Answers, cached: boolean) => void;

export type Jev = {
  /** Throws when the request fails; the pipeline catches and skips the judge. */
  ask: (state: State, questions: Questions) => Promise<Answers>;
  /** One line naming the resolved backend, model and cache. This is the setup guidance. */
  describe: () => string;
  cache: ReturnType<typeof openCache>;
};

export const resolveProjectDir = () => process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

/**
 * Resolve a Jev backend from env and config.
 * Returns null when no key is available, in which case no judge runs.
 * Specific (NIJ_JEV_*) overrides generic (TYPESAFE_*, read by the SDK).
 */
export function createJev(config: ResolvedConfig, trace?: Trace): Jev | null {
  const keyVar = process.env.NIJ_JEV_API_KEY
    ? "NIJ_JEV_API_KEY"
    : process.env.TYPESAFE_API_KEY
      ? "TYPESAFE_API_KEY"
      : null;
  if (!keyVar) {
    process.stderr.write(
      "nij: no Jev key found; set NIJ_JEV_API_KEY (or TYPESAFE_API_KEY). "
      + "Semantic rules are skipped.\n",
    );
    return null;
  }

  const client = new TypeSafeClient({
    apiKey: process.env[keyVar],
    baseURL: process.env.NIJ_JEV_BASE_URL ?? config.jev.baseURL,
    defaultModel: process.env.NIJ_JEV_MODEL ?? config.jev.model,
    timeout: 3000,
    retry: { maxRetries: 1 },
    logLevel: "off",
  });

  const cache = openCache(config);
  /**
   * Answers are cached one question at a time,
   * so rewording one question never evicts its neighbours.
   */
  const cacheKey = (state: State, question: Questions[string]) =>
    sha1(`v2${client.defaultModel}${JSON.stringify(state)}${JSON.stringify(question)}`);

  /**
   * Batching.
   * Every judge asking about the same state within one tick shares a single request:
   * their questions are merged under a per-asker prefix, sent once,
   * and the answers handed back to each asker under its own keys.
   */
  type Asker = {
    prefix: string;
    questions: Questions;
    answeredFromCache: MutableAnswers;
    resolve: (a: Answers) => void;
    reject: (e: unknown) => void;
  };
  type PendingRequest = { state: State; askers: Asker[] };
  const pendingByState = new Map<string, PendingRequest>();

  async function sendPending(pending: PendingRequest, stateKey: string) {
    pendingByState.delete(stateKey);
    const merged: Questions = {};
    for (const asker of pending.askers) {
      for (const [key, q] of Object.entries(asker.questions)) merged[asker.prefix + key] = q;
    }
    try {
      const { answers } = await client.systemOne({ state: pending.state, questions: merged });
      for (const asker of pending.askers) {
        const own: MutableAnswers = { ...asker.answeredFromCache };
        for (const [key, q] of Object.entries(asker.questions)) {
          own[key] = answers[asker.prefix + key];
          cache?.set(cacheKey(pending.state, q), JSON.stringify(own[key]));
        }
        trace?.(pending.state, { ...asker.questions }, own, false);
        asker.resolve(own);
      }
    } catch (err) {
      for (const asker of pending.askers) asker.reject(err);
    }
  }

  function ask(state: State, questions: Questions): Promise<Answers> {
    const answeredFromCache: MutableAnswers = {};
    const unanswered: Questions = {};
    for (const [key, q] of Object.entries(questions)) {
      const hit = cache?.get(cacheKey(state, q));
      if (hit) answeredFromCache[key] = JSON.parse(hit);
      else unanswered[key] = q;
    }
    if (!Object.keys(unanswered).length) {
      trace?.(state, questions, answeredFromCache, true);
      return Promise.resolve(answeredFromCache);
    }
    return new Promise((resolve, reject) => {
      const stateKey = JSON.stringify(state);
      let pending = pendingByState.get(stateKey);
      if (!pending) {
        pending = { state, askers: [] };
        pendingByState.set(stateKey, pending);
        queueMicrotask(() => sendPending(pending!, stateKey));
      }
      pending.askers.push({
        prefix: `${pending.askers.length}:`,
        questions: unanswered,
        answeredFromCache,
        resolve,
        reject,
      });
    });
  }

  return {
    describe: () => {
      const backend = `${client.baseURL} via ${keyVar}, model ${client.defaultModel}`;
      const cacheInfo = cache ? `${cache.file} (${cache.stats().rows} answers)` : "off";
      return `jev: ${backend}, cache ${cacheInfo}`;
    },
    ask,
    cache,
  };
}

/**
 * What a judge receives for one identifier.
 * The default state is the cheap-win context:
 * name, kind, segments, file, and the signature facts when known.
 */
export function judgeCtx(jev: Jev, id: Identifier, siblings: Identifier[]): JudgeCtx {
  const state: State = { name: id.name, kind: id.kind, segments: id.segments, file: id.file };
  for (const k of [
    "async",
    "returnType",
    "type",
    "arity",
  ] as const) {
    if (id[k] !== undefined) state[k] = id[k];
  }
  return { state, siblings, jev: ({ questions, state: s = state }) => jev.ask(s, questions) };
}
