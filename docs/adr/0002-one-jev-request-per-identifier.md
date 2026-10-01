# 0002 One Jev request per identifier, answers cached per question

**Context.** A Jev request carries one state and any number of questions, answered together.
Several judges select the same identifier and pass the same default state, yet each called
`ctx.jev` on its own, so one identifier cost one request per judge.

**Decision.** `ctx.jev` batches. Calls made within the same tick for an identical state are
merged into one request, questions prefixed per caller, and each caller receives its own
answers back. Judges are unchanged. Answers are cached one question at a time, so only
never-asked questions travel and rewording one question never evicts another's answer.

**Alternatives.** One request per judge, in parallel: same latency, N× the requests. One
request for all identifiers of a tool call: needs an indexed multi-identifier state whose
answer quality is unproven, and a cache key that changes with every call.
