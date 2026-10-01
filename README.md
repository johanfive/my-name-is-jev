# my-name-is-jev (`nij`)

Naming-convention enforcement for coding agents.

Every name an agent introduces, whether a file, a directory, a variable, a function, a class,
a type or a structured string, is checked at the moment it is chosen, inside the agent loop.
Shape (casing, position, pattern) is checked deterministically. Meaning (does this function
name read as a command, are these words ordered from most stable to most variable) is asked of
[Jev](https://docs.typesafe.ai), TypeSafe AI's decision model, which answers typed yes/no and
score questions with calibrated probabilities.

## Why

Coding agents produce a large share of the names in a codebase now, and they choose names one
token at a time without knowing a team's conventions. A convention that lives in a style guide
does not reach them. A convention encoded as a rule, checked before the tool call lands and
reported back in the agent's own context, does.

Two principles shape the library:

- **No word lists.** Whether a word is a verb, an extension, or a domain entity is a question
  about meaning, and every such question goes to Jev. Only shape is decided in code.
- **We diagnose, the model decides.** A finding names the readings and the convention. It does
  not invent the replacement name.

The library ships primitives for writing rules and, separately, presets that use them. It runs
without the presets.

Install: see [docs/install.md](docs/install.md).

Status: active development. Interfaces change without notice.
