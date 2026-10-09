import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import * as sdk from "@typesafe-ai/sdk";
import { resolveConfig } from "./config.ts";
import type { Identifier } from "./types.ts";

const fakeConfig = resolveConfig({ rules: [] });
const fakeQuestion = sdk.noul("Is it fake?");
const fakeIdentifier: Identifier = {
  name: "loadUser",
  kind: "function",
  file: "src/fake.ts",
  isNew: true,
  segments: ["load", "user"],
  async: true,
  arity: 1,
};

/** Answers each question with its own merged key, so a test can see where an answer came from. */
const echoKeys = async ({ questions }: { questions: object; state?: unknown }) => ({
  answers: Object.fromEntries(
    Object.keys(questions).map((key) => [key, { type: "choice", choice: key }]),
  ),
});

/**
 * Imports a fresh jev-client against a mocked SDK client and answer cache, with a Jev key set.
 *
 * @param t The test context the mocks belong to.
 * @param options What the client's `systemOne` does, and the environment.
 * @returns The module, the `systemOne` mock, and the cache's `get` and `set` mocks.
 */
async function importJevClient(
  t: TestContext,
  {
    systemOne = echoKeys,
    env = { NIJ_JEV_API_KEY: "fake-key" },
  }: {
    systemOne?: (request: { questions: object; state?: unknown }) => Promise<unknown>;
    env?: Record<string, string>;
  } = {},
) {
  const systemOneMock = t.mock.fn(systemOne);
  const cacheGetMock = t.mock.fn((_key: string): string | undefined => undefined);
  const cacheSetMock = t.mock.fn();
  t.mock.property(process, "env", env);
  t.mock.method(process.stderr, "write", () => true);
  t.mock.module("@typesafe-ai/sdk", {
    exports: {
      ...sdk,
      TypeSafeClient: t.mock.fn(function () {
        return { baseURL: "https://fake.jev", defaultModel: "fake-model", systemOne: systemOneMock };
      }),
    },
  });
  t.mock.module("./cache.ts", {
    exports: {
      openCache: () => ({
        file: "fake.sqlite",
        get: cacheGetMock,
        set: cacheSetMock,
        stats: () => ({ rows: 0, bytes: 0 }),
        clear: () => {},
      }),
    },
  });
  const jevClient: typeof import("./jev-client.ts") =
    await import(`./jev-client.ts?test=${crypto.randomUUID()}`);
  return { jevClient, systemOneMock, cacheGetMock, cacheSetMock };
}

describe("createJev", () => {
  test("returns null without a key", async (t) => {
    const { jevClient } = await importJevClient(t, { env: {} });
    const jev = jevClient.createJev(fakeConfig);
    assert.equal(jev, null);
  });

  test("prefers NIJ_JEV_API_KEY over TYPESAFE_API_KEY", async (t) => {
    const env = { NIJ_JEV_API_KEY: "specific", TYPESAFE_API_KEY: "generic" };
    const { jevClient } = await importJevClient(t, { env });
    const description = jevClient.createJev(fakeConfig)?.describe();
    assert.match(String(description), /via NIJ_JEV_API_KEY/);
  });

  test("sends the questions asked about one state in one tick as one request", async (t) => {
    const { jevClient, systemOneMock } = await importJevClient(t);
    const jev = jevClient.createJev(fakeConfig)!;
    const firstAsk = jev.ask({ name: "same" }, { first: fakeQuestion });
    const secondAsk = jev.ask({ name: "same" }, { second: fakeQuestion });
    const answers = await Promise.all([firstAsk, secondAsk]);
    const sentKeys = Object.keys(systemOneMock.mock.calls[0].arguments[0].questions);
    assert.equal(systemOneMock.mock.callCount(), 1);
    assert.deepEqual(sentKeys, ["0:first", "1:second"]);
    assert.deepEqual(answers[0], { first: { type: "choice", choice: "0:first" } });
    assert.deepEqual(answers[1], { second: { type: "choice", choice: "1:second" } });
  });

  test("sends one request per state", async (t) => {
    const { jevClient, systemOneMock } = await importJevClient(t);
    const jev = jevClient.createJev(fakeConfig)!;
    const firstAsk = jev.ask({ name: "one" }, { first: fakeQuestion });
    const secondAsk = jev.ask({ name: "two" }, { first: fakeQuestion });
    await Promise.all([firstAsk, secondAsk]);
    assert.equal(systemOneMock.mock.callCount(), 2);
  });

  test("caches each answer under its own question", async (t) => {
    const { jevClient, cacheSetMock } = await importJevClient(t);
    const jev = jevClient.createJev(fakeConfig)!;
    await jev.ask({ name: "same" }, { first: fakeQuestion, second: sdk.noul("Other?") });
    const cacheKeys = cacheSetMock.mock.calls.map((call) => call.arguments[0]);
    const cachedChoices = cacheSetMock.mock.calls.map(
      (call) => JSON.parse(String(call.arguments[1])).choice,
    );
    assert.equal(new Set(cacheKeys).size, 2);
    assert.deepEqual(cachedChoices, ["0:first", "0:second"]);
  });

  test("answers from the cache without a request, and sends only what it misses", async (t) => {
    const { jevClient, systemOneMock, cacheGetMock, cacheSetMock } = await importJevClient(t);
    const jev = jevClient.createJev(fakeConfig)!;
    await jev.ask({ name: "same" }, { first: fakeQuestion });
    const cacheKey = cacheSetMock.mock.calls[0].arguments[0];
    const cachedAnswer = { type: "choice", choice: "from cache" };
    cacheGetMock.mock.mockImplementation((key) =>
      key === cacheKey ? JSON.stringify(cachedAnswer) : undefined,
    );
    const questions = { first: fakeQuestion, second: sdk.noul("Other?") };
    const answers = await jev.ask({ name: "same" }, questions);
    const sentKeys = Object.keys(systemOneMock.mock.calls[1].arguments[0].questions);
    assert.deepEqual(sentKeys, ["0:second"]);
    const fromJev = { type: "choice", choice: "0:second" };
    assert.deepEqual(answers, { first: cachedAnswer, second: fromJev });
  });

  test("sends no request when the cache answers everything", async (t) => {
    const { jevClient, systemOneMock, cacheGetMock } = await importJevClient(t);
    const cachedAnswer = { type: "choice", choice: "from cache" };
    cacheGetMock.mock.mockImplementation(() => JSON.stringify(cachedAnswer));
    const jev = jevClient.createJev(fakeConfig)!;
    const answers = await jev.ask({ name: "same" }, { first: fakeQuestion });
    assert.equal(systemOneMock.mock.callCount(), 0);
    assert.deepEqual(answers, { first: cachedAnswer });
  });

  test("rejects every asker of a failed request", async (t) => {
    const systemOne = async () => {
      throw new Error("jev down");
    };
    const { jevClient } = await importJevClient(t, { systemOne });
    const jev = jevClient.createJev(fakeConfig)!;
    const firstAsk = jev.ask({ name: "same" }, { first: fakeQuestion });
    const secondAsk = jev.ask({ name: "same" }, { second: fakeQuestion });
    const results = await Promise.allSettled([firstAsk, secondAsk]);
    const statuses = results.map((result) => result.status);
    assert.deepEqual(statuses, ["rejected", "rejected"]);
  });
});

describe("createJudgeCtx", () => {
  test("gives Jev the identifier and only the facts it has as the default state", async (t) => {
    const { jevClient } = await importJevClient(t);
    const ctx = jevClient.createJudgeCtx(jevClient.createJev(fakeConfig)!, fakeIdentifier, []);
    assert.deepEqual(ctx.state, {
      name: "loadUser",
      kind: "function",
      segments: ["load", "user"],
      file: "src/fake.ts",
      async: true,
      arity: 1,
    });
  });

  test("lets a judge replace the state", async (t) => {
    const { jevClient, systemOneMock } = await importJevClient(t);
    const ctx = jevClient.createJudgeCtx(jevClient.createJev(fakeConfig)!, fakeIdentifier, []);
    await ctx.jev({ questions: { first: fakeQuestion }, state: { name: "custom" } });
    const sentState = systemOneMock.mock.calls[0].arguments[0].state;
    assert.deepEqual(sentState, { name: "custom" });
  });
});
