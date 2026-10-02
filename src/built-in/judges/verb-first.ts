import { question } from "../../question.ts";
import type { Judge } from "../../types.ts";
import { describeConfidence } from "./helpers/describe-confidence.ts";

/**
 * Function names start with a verb and mean only one thing. Up to two nouls in one request:
 * could the name read as the name of a thing,
 * could the object read as an action.
 * The first is asked about the name "seen on its own":
 * knowing it is a function makes every name read as a command.
 * The second states the relation it tests, the verb and the thing it should act on,
 * then asks one plain "is it" question: good names answer under 0.25, bad ones over 0.5.
 * A name that does not start with a verb reads as a thing,
 * so whether the first word is a verb is never asked on its own.
 * Each example in the criteria says why it is a yes or a no: Jev answers better for it.
 */
export const verbFirst =
  ({
    nounPhraseThreshold = 0.6,
    objectActionThreshold = 0.4,
  } = {}): Judge =>
    async (id, ctx) => {
      if (id.segments.length === 0) return { ok: true };
      const [verb, ...rest] = id.segments;
      const object = rest.join(" ");
      const questions: Record<string, ReturnType<typeof question.noul>> = {
        nounPhrase: question.noul(
          "Seen on its own, with nothing saying it is a function, "
          + "could this name be the name of a thing rather than a command?",
          {
            true:
              "displayName (because it can be read as both: 'the display's name' "
              + "and 'display the name'), buildName ('the build's name'/'build the name'), "
              + "logName ('the log's name'/'log the name'), "
              + "userProfile (only 'the user's profile': 'user' is not a verb)",
            false:
              "getDisplayName (only 'get the display name'), fetchUser (only 'fetch the user'), "
              + "renderList ('render the list'), computeTotal ('compute the total'), "
              + "isReady (a yes/no command form)",
          },
        ),
      };
      if (rest.length) {
        questions.objectIsAction = question.noul(
          `In the function name "${id.name}", "${verb}" is the action and "${object}" `
          + `should be the thing it acts on. Is "${object}" an action too?`,
          {
            true:
              "getBuild (because it can be read as both: 'get the build' and 'get, then build'), "
              + "getFetch ('get the fetch'/'get, then fetch'), "
              + "fetchBuild ('fetch the build'/'fetch, then build'), "
              + "getCompute, runDeploy ('run the deploy'/'run, then deploy')",
            false:
              "getBuildArtifact (only 'get the build artifact': 'artifact' can only be a thing), "
              + "getName, getUser, getDisplayName, warnOnce ('once' is an adverb), "
              + "runTwice ('twice' is a count), sortDesc ('desc' is a direction)",
          },
        );
      }
      const a = await ctx.jev({ questions });
      const prob = (k: string) => (a[k]?.type === "noul" ? a[k].noul : 0);
      if (prob("nounPhrase") > nounPhraseThreshold) {
        return {
          ok: false,
          detail:
            `can be read as the name of a thing, "the ${id.segments.join(" ")}" `
            + `(${describeConfidence(prob("nounPhrase"))}); `
            + `a first word that can only be a verb settles it`,
        };
      }
      if (prob("objectIsAction") > objectActionThreshold) {
        return {
          ok: false,
          detail:
            `"${object}" can be read as an action as well as a thing `
            + `(${describeConfidence(prob("objectIsAction"))}); another verb does not change that, `
            + `a word after "${object}" that can only be a thing does, `
            + `as "artifact" does in getBuildArtifact`,
        };
      }
      return { ok: true };
    };
