# resk

Summary-first local code review for AI coding agents.

Tools like [difit](https://github.com/yoshiko-pg/difit) and [hunk](https://github.com/modem-dev/hunk)
show the reviewer a diff, file by file. resk flips that around: the agent writes a short
**summary of the change, ordered from the most important item to the most minor**, and links
pieces of that summary to specific files and line ranges. The reviewer reads the story, clicks a
highlight to open the relevant diff next to it, leaves comments, and finishes. The comments are
printed to the agent's stdout.

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

## Install

```bash
npm install -g resk     # or: npx resk ...
```

Requires Node 20 or newer and git.

## Try it

```bash
git clone <this repo> && cd resk
npm install
npm run example
```

This builds resk and opens a bundled example review (`examples/`): a 14-file change with a
summary an agent would write. See `examples/README.md` for what to click.

## Usage

```
resk --summary <file.md> [target] [compare-with] [options]

  target        .  |  staged  |  working  |  <ref>  |  @ (alias for HEAD)     default: .
  compare-with  a ref to compare the target against

  --summary <path>   Markdown summary file ("-" reads stdin). Required.
  --diff <path|->    review a unified diff from a file or stdin instead of running git
  --title <text>     review title shown in the top bar
  --no-untracked     exclude untracked files (only affects "." and "working")
  --context <n>      context lines per hunk passed to git
  --port <n>         preferred port (default 4989); falls back to the next free port
  --host <addr>      address to bind (default 127.0.0.1)
  --no-open          do not open the browser
  --keep-alive       do not exit when the last browser tab disconnects
  --json             print the review output as JSON
```

Examples:

```bash
resk --summary summary.md                # working tree vs HEAD, untracked files included
resk --summary summary.md @ main         # current HEAD vs main
resk --summary summary.md staged         # staged changes
resk --summary summary.md 6f4a9b7        # one commit (root commits work too)
git diff main | resk --summary summary.md --diff -
```

resk prints its URL to **stderr** and opens the browser. **stdout is reserved for the review
output**, so an agent can capture it directly. The process exits when the reviewer clicks
"Finish review", when the last tab has been closed for five seconds, or on Ctrl+C. In every case
the collected comments are printed first.

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
resolve are reported as warnings on stderr at startup and rendered as inert chips.

Below the summary resk always lists every changed file with its stats, so the summary does not need
to enumerate files.

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

Summary comments are anchored to a text selection and start with `On "<selected text>":`. With `--json`, an
object `{ "title": ..., "comments": [...] }` where each line comment carries an `excerpt` array
with the referenced diff lines and selection comments carry the quote and its offsets in the
target. No comments prints `No review comments.`

## Claude Code skill

The repository ships a skill that teaches an agent the workflow and the anchor format:

```bash
ln -s "$(pwd)/skills/resk" ~/.claude/skills/resk      # or copy the folder
```

After installing resk globally, the agent runs `resk --summary <file> <target>` after finishing a
change and continues with the comments it gets back.

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
grammar, output formatter), `tests/unit`, `tests/e2e`, `skills/resk`, `icons` (app icon and
favicons, copied into the client build).

## License

MIT
