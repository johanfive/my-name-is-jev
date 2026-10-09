import { createHash } from "node:crypto";
import { TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
import { openCache, type AnswerCache } from "./cache.ts";
import { listSiblings } from "./siblings.ts";
import { withoutUndefined } from "./without-undefined.ts";
import type { Answers, Identifier, JudgeCtx, ResolvedConfig, State } from "./types.ts";

type Answer = Answers[string];
type MutableAnswers = { [key: string]: Answer };

export type Trace = (state: State, questions: Questions, answers: Answers, cached: boolean) => void;

export type Jev = {
  /** Throws when the request fails; the pipeline catches and skips the judge. */
  ask: (state: State, questions: Questions) => Promise<Answers>;
  /** One line naming the resolved backend, model and cache. This is the setup guidance. */
  describe: () => string;
  cache: AnswerCache | null;
};

/** One judge's share of a batched request: its questions go out under its own key prefix. */
type Asker = {
  prefix: string;
  questions: Questions;
  answeredFromCache: MutableAnswers;
  resolve: (answers: Answers) => void;
  reject: (err: unknown) => void;
};
/** Every asker waiting on one state. They share a single request. */
type PendingRequest = { state: State; askers: Asker[] };

/** Specific (NIJ_JEV_*) first, then generic (TYPESAFE_*, read by the SDK). */
const KEY_VARS = ["NIJ_JEV_API_KEY", "TYPESAFE_API_KEY"];

/**
 * Resolve a Jev backend from env and config.
 * Returns null when no key is available, in which case no judge runs.
 * Every judge asking about the same state within one tick shares a single request,
 * and answers are cached one question at a time.
 */
export function createJev(config: ResolvedConfig, trace?: Trace): Jev | null {
  const keyVar = KEY_VARS.find((name) => process.env[name]);
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
  const pendingByState = new Map<string, PendingRequest>();

  return {
    describe: () => describeBackend(client, keyVar, cache),
    ask,
    cache,
  };

  /** Answer from the cache what it can, and queue the rest on this state's pending request. */
  function ask(state: State, questions: Questions): Promise<Answers> {
    const { answeredFromCache, unanswered } = splitByCache(state, questions);
    if (Object.keys(unanswered).length === 0) {
      trace?.(state, questions, answeredFromCache, true);
      return Promise.resolve(answeredFromCache);
    }
    return new Promise((resolve, reject) => {
      const pending = findOrQueuePending(state);
      pending.askers.push({
        prefix: `${pending.askers.length}:`,
        questions: unanswered,
        answeredFromCache,
        resolve,
        reject,
      });
    });
  }

  /** Split the questions into those the cache answers and those only Jev can. */
  function splitByCache(state: State, questions: Questions) {
    const answeredFromCache: MutableAnswers = {};
    const unanswered: Questions = {};
    for (const [key, question] of Object.entries(questions)) {
      const hit = cache?.get(toCacheKey(state, question));
      if (hit) answeredFromCache[key] = JSON.parse(hit);
      else unanswered[key] = question;
    }
    return { answeredFromCache, unanswered };
  }

  /**
   * The request this state's askers share, created and sent on the next microtask on first use,
   * so every judge that asks within the same tick joins it.
   */
  function findOrQueuePending(state: State): PendingRequest {
    const stateKey = JSON.stringify(state);
    const existing = pendingByState.get(stateKey);
    if (existing) return existing;
    const pending: PendingRequest = { state, askers: [] };
    pendingByState.set(stateKey, pending);
    queueMicrotask(() => sendPending(pending, stateKey));
    return pending;
  }

  /** Send one merged request for every asker of a state, then answer each asker. */
  async function sendPending(pending: PendingRequest, stateKey: string) {
    pendingByState.delete(stateKey);
    try {
      const { answers } = await client.systemOne({
        state: pending.state,
        questions: mergeQuestions(pending.askers),
      });
      for (const asker of pending.askers) answerAsker(asker, pending.state, answers);
    } catch (err) {
      for (const asker of pending.askers) asker.reject(err);
    }
  }

  /** Hand an asker its answers under its own keys, and cache each one. */
  function answerAsker(asker: Asker, state: State, answers: Answers) {
    const own: MutableAnswers = { ...asker.answeredFromCache };
    for (const [key, question] of Object.entries(asker.questions)) {
      own[key] = answers[asker.prefix + key];
      cache?.set(toCacheKey(state, question), JSON.stringify(own[key]));
    }
    trace?.(state, { ...asker.questions }, own, false);
    asker.resolve(own);
  }

  /**
   * One cache key per question, not per request,
   * so rewording one question never evicts its neighbours.
   */
  function toCacheKey(state: State, question: Questions[string]) {
    return hashSha1(
      `v2${client.defaultModel}${JSON.stringify(state)}${JSON.stringify(question)}`,
    );
  }
}

/**
 * What a judge receives for one identifier.
 * The default state is the cheap-win context:
 * name, kind, segments, file, and the signature facts when known.
 */
export function createJudgeCtx(jev: Jev, id: Identifier, siblings: Identifier[]): JudgeCtx {
  const facts = { async: id.async, returnType: id.returnType, type: id.type, arity: id.arity };
  const state: State = {
    name: id.name,
    kind: id.kind,
    segments: id.segments,
    file: id.file,
    ...withoutUndefined(facts),
  };
  return {
    state,
    siblings,
    jev: ({ questions, state: stateOverride = state }) => jev.ask(stateOverride, questions),
  };
}

/**
 * A judge-context factory for one tool call's identifiers, or null without Jev.
 * Each identifier's siblings are the other identifiers of the call.
 */
export function createJudgeCtxFor(jev: Jev | null, identifiers: Identifier[]) {
  return jev && ((id: Identifier) => createJudgeCtx(jev, id, listSiblings(identifiers, id)));
}

/** Every questions object of the askers in one, each key under its asker's prefix. */
function mergeQuestions(askers: Asker[]): Questions {
  return Object.fromEntries(
    askers.flatMap((asker) =>
      Object.entries(asker.questions).map(([key, question]) => [asker.prefix + key, question]),
    ),
  );
}

/** One line naming the backend, model and cache, so a user can see what nij resolved. */
function describeBackend(client: TypeSafeClient, keyVar: string, cache: AnswerCache | null) {
  const backend = `${client.baseURL} via ${keyVar}, model ${client.defaultModel}`;
  const cacheInfo = cache ? `${cache.file} (${cache.stats().rows} answers)` : "off";
  return `jev: ${backend}, cache ${cacheInfo}`;
}

/** A fixed-length key for any text, however long the question. */
const hashSha1 = (text: string) => createHash("sha1").update(text).digest("hex");
