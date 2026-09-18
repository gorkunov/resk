<p align="center">
  <img src="icons/icon-256.png" alt="resk" width="120" height="120">
</p>

<h1 align="center">resk</h1>

<p align="center"><b>Context-first local code review for AI coding agents.</b></p>

<p align="center">
  The agent explains the context and the reasoning behind every change, most important first.<br>
  You review the places it points you at, not a list of changed files.
</p>

```
┌──────────────────────────────────────────────────────────────────────────┐
│ resk · feature/auth vs main                                  ◐   Finish   │
├──────────────────────┬───────────────────────────────────────────────────┤
│ ## Critical          │ ┌─ M src/services/user.ts   +40 −12   Unified  × ┐ │
│ Token refresh moved  │ │  13  async refreshSession(token: RefreshToken)  │ │
│ into [UserService]•  │ │  18 +  const timeout = 3000;                    │ │
│ ...                  │ │       💬 Why is the timeout hardcoded?          │ │
│ ## Minor             │ └─────────────────────────────────────────────────┘ │
│ ...                  │ ┌─ R src/utils/clock.ts ← src/utils/time.ts  +1 −1 ┐ │
│ Changed files (6)    │ │ ...                                              │ │
│  M src/services/…  • │ └─────────────────────────────────────────────────┘ │
└──────────────────────┴───────────────────────────────────────────────────┘
```

## Why

When a colleague opens a pull request, the diff _is_ the review: you already share the context, and
the description is a courtesy. When an agent hands you fourteen changed files, the diff is not the
review. What matters is what the agent decided, what it guessed at, and what it quietly skipped,
and none of that is visible in the code. Read the files in alphabetical order and you rebuild that
reasoning yourself, with the three risky lines looking exactly like the three hundred boring ones.

So resk puts the context first. The agent writes a short account of the change, ordered from the
most important decision to the most minor, and links every claim in it to the file and line range
that backs it. You read a claim, click it, see the code next to the sentence that explains it, and
comment where you disagree. Your comments go back to the agent as its next work items.

[difit](https://github.com/yoshiko-pg/difit) and [hunk](https://github.com/modem-dev/hunk) are the
tools resk grew out of, and both are good at what they do. The difference is the starting point.

|                       | resk                                         | difit                               | hunk                           |
| --------------------- | -------------------------------------------- | ----------------------------------- | ------------------------------ |
| **Review surface**    | browser page                                 | browser page                        | terminal UI                    |
| **You see first**     | the agent's reasoning, most important first  | the diff, file by file              | the diff, hunk by hunk         |
| **Reaching the code** | click a highlight in the explanation         | pick a file                         | step through hunks             |
| **Comment on**        | lines, whole files, sentences of the summary | lines in the diff                   | lines and ranges               |
| **Lifecycle**         | one command, prints comments, exits          | one command, prints comments, exits | a session a daemon keeps alive |
| **The agent's part**  | explains the change, then reads the comments | runs it, then reads the comments    | drives the session over a CLI  |
| **Next round**        | stacks on the same page under the first      | a fresh run                         | the session stays open         |

What resk deliberately does not do: no terminal UI, no agent driving the review while you are in it,
no hosting, no GitHub. One local page, one reviewer, one review.

## Install

resk is a skill for your coding agent. Add it once:

```bash
npx skills add alex-gorkunov/resk
```

That covers Claude Code, Codex, Cursor, OpenCode and the rest of the agents
[skills](https://github.com/vercel-labs/skills) supports; add `-g` to install it for every project.
The skill fetches the reviewer itself with `npx`, so there is nothing else to install. Node 20 or
newer, and git.

## Use it

Say `resk` to your agent, and describe what you want to look at in plain words:

```
resk
resk last two commits
resk the platform changes
resk this branch against main
```

The agent works out what that means, writes up the change, and opens the review in your browser.
You read the account, click a highlight to see the code beside the sentence explaining it, comment
on a line, a whole file, or a sentence of the write-up itself, and press **Finish review**. The tab
closes and your comments land back with the agent as work items.

Ask for a review again once it has addressed them: the new round stacks on top of the first, so the
whole conversation stays on one page.

## Thanks

resk is built on two tools it kept borrowing from.

- **[difit](https://github.com/yoshiko-pg/difit)** by [@yoshiko-pg](https://github.com/yoshiko-pg)
  for the shape of the thing: one command, a local page, comments printed to stdout, process exits.
  resk keeps that lifecycle and its target grammar (`.`, `staged`, `working`, `<ref>`, `@`), so
  muscle memory carries over.
- **[hunk](https://github.com/modem-dev/hunk)** by [modem](https://github.com/modem-dev) for
  treating a review as a conversation an agent takes part in, addressed at exact files, hunks and
  ranges rather than at a whole changeset.

Neither is a starting point resk improves on. They are simply why it looks the way it does.

## License

MIT
