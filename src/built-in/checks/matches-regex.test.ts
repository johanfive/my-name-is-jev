import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Identifier } from "../../types.ts";
import { matchesRegex } from "./matches-regex.ts";

const fakeIdentifier = (name: string): Identifier =>
  ({ name, kind: "variable", file: "src/fake.ts", isNew: true, segments: [] });

describe("matchesRegex", () => {
  test("passes a name the pattern matches", () => {
    const verdict = matchesRegex(/^use[A-Z]/)(fakeIdentifier("useCache"), { siblings: [] });
    assert.deepEqual(verdict, { ok: true });
  });

  test("fails any other name, quoting the pattern", () => {
    const verdict = matchesRegex(/^use[A-Z]/)(fakeIdentifier("cacheHook"), { siblings: [] });
    assert.deepEqual(verdict, { ok: false, detail: "does not match /^use[A-Z]/" });
  });
});
