---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use before building anything with open choices, when a request is vague or has several valid shapes, or when the user wants to stress-test their thinking or says "grill me".
---

<!-- Forked from mattpocock/skills (grilling). Changes: rounds use a multiple-choice question tool instead of free text; questions are worded for a non-engineer. -->

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier, then wait for the user's answers before the next round.

## Asking a round

Ask with the multiple-choice question tool (`AskUserQuestion` in Claude Code). Never ask grilling questions as free text when that tool exists.

- 2 to 4 mutually exclusive options per question. Your recommended answer is the first option, its label ending in "(recommended)".
- Plain words, in the business's vocabulary (`docs/glossary.md` when it exists), per the `plain` style. Each option's description states what she would see or what it means for the business, in one line. Technical trade-offs stay in your own work.
- Make each question self-contained: she may see only the dialog. Name the facts you found that the question depends on.
- Up to 4 questions per call. A frontier larger than 4: ask it in chunks of 4, most foundational first, and recompute the frontier after each chunk.
- `multiSelect: true` only when the choices genuinely combine.
- Use option previews to compare concrete artifacts (code, config, mockups).
- Don't add an "Other" option; the tool provides one for free-text answers.

## Between rounds

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until she confirms, with a final multiple-choice prompt, that you have reached a shared understanding.
