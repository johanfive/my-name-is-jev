# 0001 Siblings sit next to the Jev state, not in it

**Context.** A judge receives `state`, what Jev sees by default (name, kind, segments, file,
declared facts), and `siblings`, the other identifiers of the same tool call. Siblings help
some questions ("does this name say what the thing is") and are noise for others ("is this a
verb"). They also differ on every call, which would break the caching mechanism.

**Decision.** `siblings` is a field on the context, not part of `state`. A judge that wants them
spreads them into the state it passes: `ctx.jev({ questions, state: { ...ctx.state, siblings } })`.
The default state stays small and stable, so answers cache across calls and Jev's context is
minimal unless a rule asks for more.

**Alternatives.** Siblings in the default state: every cache key changes per call and every
question pays for context it did not ask for. Siblings nowhere: a rule like "a name says what the thing is" has nothing to judge against.
