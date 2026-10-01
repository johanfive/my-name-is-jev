# my-name-is-jev (`nij`)

> [!IMPORTANT]
> Naming-convention enforcement for coding agents.

Every name an agent introduces is checked at the moment it is chosen, inside the agent loop:

- files and directories
- variables and constants
- functions and methods
- classes, types and interfaces
- structured strings

Two kinds of check:

- **Shape** is decided in code: casing, position, pattern.
- **Meaning** is asked of [Jev](https://docs.typesafe.ai), TypeSafe AI's decision model: does this
  function name read as a command, are these words ordered from most stable to most variable.
  Jev answers typed yes/no and score questions with calibrated probabilities.

## Why

Coding agents now produce a large share of the names in a codebase.  
Even the strongest models (at time of writing) still name things poorly:
- a function called like a noun (what does `r2Bucket()` do?!)
- multi-words-names in an order that doesn't sort well
- a name that reads too many ways
They choose names 1 token at a time without knowing a team's conventions.  
A style guide does not reach them.
A rule that runs before the tool call lands, and reports back in the agent's own context, does.

Two principles:

- **No word lists.** Whether a word is a verb, an extension or a domain entity is a question
  about meaning. Every such question goes to Jev.
- **We diagnose, the model decides.** A finding names the problem and the convention. It never
  proposes the replacement name.

The library ships primitives for writing rules and, separately, presets built from them. It runs
without the presets.

Install: see [docs/install.md](docs/install.md).

> [!NOTE]
> Once a name has been through Jev, it has been jev-ed. Hence, my name is jev(ed).

Status: active development. Interfaces change without notice.
