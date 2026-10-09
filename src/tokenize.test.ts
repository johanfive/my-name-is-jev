import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tokenize } from "./tokenize.ts";

const wordsByName = {
  "userProfileCache": "user profile cache",
  "acme-prod-202609282037": "acme prod 202609282037",
  "RETRY_COUNT_MAX": "retry count max",
  "fetch-user-profile.test": "fetch user profile test",
  "HTMLParser": "html parser",
  "scratch-e2e": "scratch e2e",
  "_privateThing": "private thing",
  "$store": "store",
  "src/user-cache": "src user cache",
};

describe("tokenize", () => {
  for (const [name, expected] of Object.entries(wordsByName)) {
    test(`splits ${name} into ${expected}`, () => {
      const words = tokenize(name);
      assert.deepEqual(words, expected.split(" "));
    });
  }
});
