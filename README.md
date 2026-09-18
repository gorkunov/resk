<p align="center">
  <img src="icons/icon-256.png" alt="resk" width="120" height="120">
</p>

<h1 align="center">resk</h1>

<p align="center"><b>Summary-first local code review for AI coding agents.</b></p>

<p align="center">
  The agent writes the story of the change. You read it, click into the code,<br>
  comment, and finish. The comments land on the agent's stdout.
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

So resk asks for the story first. The agent writes a short summary ordered from the most important
change to the most minor, and links every claim in it to the file and line range that backs it. You
read a claim, click it, see the code next to the sentence that explains it, and comment where you
disagree. Nothing else changes: it is still a local page, still one command, still plain comments
on stdout.

[difit](https://github.com/yoshiko-pg/difit) and [hunk](https://github.com/modem-dev/hunk) are the
tools resk grew out of, and both are good at what they do. The difference is the starting point.

|                       | resk                                         | difit                               | hunk                           |
| --------------------- | -------------------------------------------- | ----------------------------------- | ------------------------------ |
| **Review surface**    | browser page                                 | browser page                        | terminal UI                    |
| **You see first**     | the agent's summary, most important first    | the diff, file by file              | the diff, hunk by hunk         |
| **Reaching the code** | click a highlight in the summary             | pick a file                         | step through hunks             |
| **Comment on**        | lines, whole files, sentences of the summary | lines in the diff                   | lines and ranges               |
| **Lifecycle**         | one command, prints comments, exits          | one command, prints comments, exits | a session a daemon keeps alive |
| **The agent's part**  | writes the summary, then reads the comments  | runs it, then reads the comments    | drives the session over a CLI  |
| **Next round**        | stacks on the same page under the first      | a fresh run                         | the session stays open         |

What resk deliberately does not do: no terminal UI, no agent driving the review while you are in it,
no hosting, no GitHub. One local page, one reviewer, one command.

## Install

Not on npm yet, since that name belongs to an unrelated package, so `npx resk` will not fetch this.
Install from a checkout:

```bash
git clone <this repo> && cd resk
npm install && npm run build
npm link                # puts `resk` on your PATH, pointing at this checkout
```

Node 20 or newer, and git. `npm link` symlinks the checkout, so after pulling changes a
`npm run build` is enough.

## Use it

**With Claude Code.** Link the bundled skill once, and ask for a review in any project:

```bash
ln -s "$(pwd)/skills/resk" ~/.claude/skills/resk
```

Then "review this with resk" (or just "ask me for a review") has the agent write the summary, run
resk, and pick up the comments you leave. Two settings in `~/.claude/settings.json` make it
smoother: `{ "permissions": { "allow": ["Bash(resk:*)"] } }` so it does not ask each time, and a
raised `BASH_MAX_TIMEOUT_MS` if you would rather it run in the foreground than in the background.

**By hand.** Write a summary in Markdown, then point resk at whatever you want reviewed:

```bash
resk --summary summary.md                # working tree vs HEAD, untracked files included
resk --summary summary.md @ main         # current HEAD vs main
resk --summary summary.md staged         # staged changes
resk --summary summary.md 6f4a9b7        # a single commit
git diff main | resk --summary summary.md --diff -
```

The browser opens, and the command keeps running while you review. Click **Finish review** and the
tab closes itself, the comments print, and the process exits. Closing the last tab or pressing
Ctrl+C does the same. The URL goes to stderr; stdout carries only the review, so an agent can
capture it directly.

**See it first.** `npm run example` opens a bundled 14-file review with the summary an agent would
have written for it. `examples/README.md` says what to click.

## Writing the summary

The summary is Markdown (CommonMark + GFM). Highlights are ordinary links with a `diff:` URL:

```markdown
[UserService](diff:src/services/user.ts) whole file
[refreshSession()](diff:src/services/user.ts#L40-L58) new-side line range
[one line](diff:src/services/user.ts#L40) single new-side line
[old client path](diff:src/auth/token.ts#old:L12-L20) removed code, old side
```

Paths are repo-relative as they appear in the diff; a unique suffix also resolves. An inline code
span that exactly equals a changed file path becomes a highlight automatically. Anchors that do not
resolve are reported on stderr at startup and rendered as inert chips. Below the summary resk lists
every changed file with its stats, so the summary never has to enumerate them.

In the page: clicking a highlight opens that file beside the summary and flashes the linked lines,
and the flash fades so it never sits on top of what you are reading. Every highlight into that file
turns green once you have opened it. A file opens directly below the one you are reading rather
than in diff order, and the code pane stays put once it appears, even after you close every file.
Between hunks the pane says how many unmodified lines are hidden and reveals 20 at a time, which
needs the real files: a review of a patch (`--diff`) shows only what the patch carries.

Select any text in the summary to comment on the sentence itself, not just on code.

## Review sessions

A review rarely ends after one round. Pass `--session <key>` and run resk again with the same key
once you have addressed the comments. The reviewer gets one page with the newest round on top
(**Round 2**, **Round 3**, …) and the **Initial Round** at the bottom, each with the date it was
reviewed.

```bash
resk --summary summary.md --session feat-refresh @ main    # the initial round
# ...address the comments...
resk --summary round-2.md --session feat-refresh @ main    # shown on top as "Round 2"
```

Highlights in every round point into the current diff, so a line range that has moved shows as a
broken highlight rather than the wrong code. Finished rounds live in `~/.resk/sessions/<key>.json`
(`RESK_HOME` moves that directory). A run that ends without **Finish review** is not recorded, so
an interrupted round can just be started again. Without `--title`, the session key is the title.

## Output

Markdown by default:

```text
# Review comments (4)

## Summary
- On "rate-limited endpoint": Which limit applies to the retry path?
- On "the migration should ship first": Split this into two PRs.

## src/services/user.ts
- (file) Please add a unit test for the retry path.
- L44-L46 (new): Why is the timeout hardcoded?
  > +    const timeout = 3000;
  > +    await refresh(token, timeout);
```

Comments on the summary are anchored to the text you selected and start with `On "<selected text>":`.
`--json` gives `{ "title": ..., "comments": [...] }` instead, where line comments carry an `excerpt`
of the referenced diff lines and selection comments carry their quote and offsets. With nothing to
say, resk prints `No review comments.`

## Options

```
resk --summary <file.md> [target] [compare-with] [options]

  target        .  |  staged  |  working  |  <ref>  |  @ (alias for HEAD)     default: .
  compare-with  a ref to compare the target against

  --summary <path>   Markdown summary file ("-" reads stdin). Required.
  --diff <path|->    review a unified diff from a file or stdin instead of running git
  --title <text>     review title shown in the top bar
  --session <key>    review session key; later runs with the same key stack up as rounds
  --no-untracked     exclude untracked files (only affects "." and "working")
  --context <n>      context lines per hunk passed to git
  --port <n>         preferred port (default 4989); falls back to the next free port
  --host <addr>      address to bind (default 127.0.0.1)
  --no-open          do not open the browser
  --keep-alive       do not exit when the last browser tab disconnects
  --json             print the review output as JSON
```

## Development

The toolchain is pinned in `.tool-versions` (Node 26, npm 12); `mise install` sets it up.

```bash
mise install
npm install
npm run check          # typecheck, lint, unit tests, build, acceptance tests
npm test               # unit tests (Vitest)
npm run test:e2e       # builds, then runs the Playwright acceptance suite
```

For UI work with hot reload, start a review server and point Vite at it:

```bash
node dist/cli/index.js --summary tests/fixtures/summary.md --diff tests/fixtures/sample.patch --keep-alive --no-open
npm run dev            # http://localhost:5173, proxies /api to port 4989
```

Layout: `src/cli` (arguments, git), `src/server` (Hono API, static hosting, lifecycle),
`src/client` (React, Tailwind, `@pierre/diffs`), `src/shared` (types, unified-diff parser, anchor
grammar, output formatter), `tests/unit`, `tests/e2e`, `skills/resk`, `icons` (the split plus-minus
mark above, also used as the favicon).

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
