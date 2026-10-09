import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Identifier, Verdict } from "../../types.ts";
import { passesAny } from "./passes-any.ts";

const fakeIdentifier: Identifier =
  { name: "userCache", kind: "variable", file: "src/fake.ts", isNew: true, segments: [] };

describe("passesAny", () => {
  test("passes at the first check that passes, without running the rest", (t) => {
    const failing = t.mock.fn((): Verdict => ({ ok: false, detail: "first" }));
    const passing = t.mock.fn((): Verdict => ({ ok: true }));
    const unreached = t.mock.fn((): Verdict => ({ ok: true }));
    const verdict = passesAny(failing, passing, unreached)(fakeIdentifier, { siblings: [] });
    assert.deepEqual(verdict, { ok: true });
    assert.equal(unreached.mock.callCount(), 0);
  });

  test("returns the last failure when every check fails", (t) => {
    const first = t.mock.fn((): Verdict => ({ ok: false, detail: "first" }));
    const last = t.mock.fn((): Verdict => ({ ok: false, detail: "last" }));
    const verdict = passesAny(first, last)(fakeIdentifier, { siblings: [] });
    assert.deepEqual(verdict, { ok: false, detail: "last" });
  });
});
