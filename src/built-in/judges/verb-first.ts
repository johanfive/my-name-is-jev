import { question } from "../../question.ts";
import type { Judge } from "../../types.ts";
import { describeConfidence } from "./helpers/describe-confidence.ts";

const describeReadings = (segments: string[]) => {
  const [a, ...rest] = segments;
  if (!rest.length) return `reads as a thing, not a command`;
  return `reads both as "${a} the ${rest.join(" ")}" and as "the ${a} ${rest.join(" ")}"`;
};

/**
 * Function names start with a verb and mean only one thing. Up to three nouls in one request:
 * is the first segment a verb,
 * could the name read as a noun phrase,
 * could the object read as an action.
 * Words in `trustedVerbs` skip the is-it-a-verb question only;
 * the second-reading questions always run.
 */
export const verbFirst =
  ({
    trustedVerbs = [] as string[],
    verbThreshold = 0.5,
    nounPhraseThreshold = 0.6,
    objectActionThreshold = 0.5,
  } = {}): Judge =>
    async (id, ctx) => {
      if (id.segments.length === 0) return { ok: true };
      const [verb, ...rest] = id.segments;
      const questions: Record<string, ReturnType<typeof question.noul>> = {
        nounPhrase: question.noul(
          "Could a reader take this function name as a noun phrase, "
          + "the name of a thing, rather than as a command?",
          {
            true:
              "displayName ('the display's name'), buildName ('the build's name'), "
              + "logName, userProfile",
            false: "getDisplayName, fetchUser, renderList, computeTotal, isReady",
          },
        ),
      };
      if (rest.length) {
        questions.objectIsAction = question.noul(
          `After the leading verb "${verb}", could the remaining words "${rest.join(" ")}" `
          + `be read as a second verb, an action to perform, rather than as the thing acted on?`,
          {
            true:
              "getBuild ('get, build'), getFetch ('get, fetch'), fetchBuild, getCompute, runDeploy",
            false:
            "getBuildArtifact, getName, getUser, getDisplayName, "
            + "warnOnce ('once' is an adverb), runTwice, sortDesc, verbFirst",
          },
        );
      }
      if (!trustedVerbs.includes(verb)) {
        questions.isVerb = question.noul("Is the first segment acting as a verb in this name?", {
          true: "The name is a command: fetchUser, renderList, computeTotal, isReady",
          false: "The name is a thing: userProfile, displayName as 'the display's name', config",
        });
      }
      const a = await ctx.jev({ questions });
      const prob = (k: string, fallback: number) => (a[k]?.type === "noul" ? a[k].noul : fallback);
      if (prob("isVerb", 1) < verbThreshold) {
        return {
          ok: false,
          detail: `does not start with a verb (${describeConfidence(1 - prob("isVerb", 1))})`,
        };
      }
      if (prob("nounPhrase", 0) > nounPhraseThreshold) {
        return {
          ok: false,
          detail: `${describeReadings(id.segments)} (${describeConfidence(prob("nounPhrase", 0))})`,
        };
      }
      if (prob("objectIsAction", 0) > objectActionThreshold) {
        return {
          ok: false,
          detail:
            `"${rest.join(" ")}" reads as an action as well as a thing `
            + `(${describeConfidence(prob("objectIsAction", 0))}); name the thing`,
        };
      }
      return { ok: true };
    };
