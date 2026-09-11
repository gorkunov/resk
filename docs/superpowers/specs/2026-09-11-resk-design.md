# resk: summary-first code review for AI agents

Date: 2026-09-11
Status: approved design, ready for implementation planning

## 1. Purpose

`resk` is a local code-review tool that an AI coding agent launches after making changes. Instead of presenting the reviewer with a file-by-file diff (as difit and hunk do), it presents the agent's own **written summary** of the change, ordered from the most important item to the most minor. Pieces of that summary are **highlights**: links into specific files or line ranges of the diff. The reviewer clicks a highlight to open that file's diff in a panel next to the summary, leaves comments on lines, files, or the summary as a whole, and finishes the review. The comments are printed to the agent's stdout so the agent can act on them.

`resk` runs as a Node server that opens a page in the browser, exactly like difit. It ships a Claude Code skill that teaches the agent how to write the summary and call the CLI.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Board model | Fixed layout. No pan/zoom canvas. |
| Right column | Stacks only the files the reviewer opened, one panel per file, in diff order. |
| Lifecycle | One-shot, like difit. "Finish review" prints comments to stdout and the process exits. |
| Default target | `.` (working tree vs HEAD), not `HEAD`. |
| Untracked files | Included by default for `.` and `working`; `--no-untracked` excludes them. |
| Summary column | Fixed width when panels are open; no drag divider. |
| Themes | System / light / dark toggle. One Shiki theme pair. No theme picker. |
| Diff renderer | `@pierre/diffs` (React, Shiki, annotations, line selection). |
| Server | Hono on `@hono/node-server`. |
| Client | Vite, React 19, TypeScript, Tailwind CSS 4, react-markdown + remark-gfm. |
| Tests | Vitest for unit tests, Playwright for acceptance tests. Both mandatory. |
| Package manager / runtime | npm, Node 22. |

## 3. Non-goals for v1

- Comment threads, replies, resolve/unresolve.
- Editing code from the browser.
- Persisting comments across separate `resk` runs.
- GitHub PR mode, remote diffs, multi-user sessions.
- A terminal UI.
- Free-form panel placement, drag-to-reorder, resizable columns.

## 4. Repository layout

Single npm package `resk` exposing the `resk` binary.

```
resk/
  package.json
  tsconfig.json              base
  tsconfig.node.json         cli + server + shared -> dist/
  vite.config.ts             client -> dist/client/
  vitest.config.ts
  playwright.config.ts
  eslint.config.js, .prettierrc
  src/
    cli/                     argument parsing, git command building, process wiring
    server/                  Hono app, static hosting, lifecycle, stdout output
    client/                  React app (index.html, main.tsx, components/, state/)
    shared/                  types, unified-diff parser, anchor grammar + resolver,
                             summary highlight extraction, output formatter
  skills/resk/SKILL.md       Claude Code skill shipped with the repo
  tests/
    unit/                    Vitest
    e2e/                     Playwright specs + launcher fixture
    fixtures/                sample patches and summaries
  docs/superpowers/specs/    this document
```

All logging from CLI and server goes to **stderr**. **stdout is reserved for the final review output** so an agent can capture it cleanly.

## 5. CLI

```
resk --summary <file.md> [target] [compare-with] [options]

Positional
  target        .  |  staged  |  working  |  <ref>  |  @        default: .
  compare-with  <ref> | @                                       optional

Options
  --summary <path>      Markdown summary file. Required. "-" reads the summary from stdin.
  --diff <path|->       Read a unified diff from a file (or stdin with "-") instead of running git.
                        Positional target arguments are rejected when --diff is given.
  --title <text>        Review title for the top bar. Default: derived from target, e.g.
                        "Working tree vs HEAD", "feature/x vs main", "Commit 6f4a9b7".
  --no-untracked        Do not include untracked files (only affects "." and "working").
  --context <n>         Context lines per hunk passed to git (--unified=n). Default: git default.
  --port <n>            Preferred port, default 4989. Falls back to the next free port, up to 20 tries.
                        0 asks the OS for a random free port.
  --host <addr>         Default 127.0.0.1.
  --no-open             Do not open the browser.
  --keep-alive          Do not exit when the last browser tab disconnects.
  --json                Print review output as JSON instead of Markdown.
  --version, --help
```

Both `--summary -` and `--diff -` cannot be used together (only one stdin).

### 5.1 Target resolution

`@` is replaced by `HEAD` wherever it appears. All git invocations use `git -c core.quotepath=false diff ... --no-color --no-ext-diff -M` (rename detection on) plus `--unified=<n>` when `--context` is given.

| Invocation | Git command(s) |
|---|---|
| `.` | `git diff HEAD` plus untracked files (see 5.2) |
| `staged` | `git diff --cached` |
| `working` | `git diff` plus untracked files |
| `<ref>` | `git diff-tree --root -p -M --no-commit-id <ref>` (works for root commits) |
| `. <base>` | `git diff <base>` plus untracked files |
| `staged <base>` | `git diff --cached <base>` |
| `<ref> <base>` | `git diff <base> <ref>` |
| `working <base>` | error: "working" cannot be compared with a ref |

The CLI verifies it is inside a git work tree (`git rev-parse --show-toplevel`) and runs git from the repository root so paths in the diff are repo-relative.

### 5.2 Untracked files

`git ls-files --others --exclude-standard -z` lists untracked, non-ignored files. Each is rendered as an addition with `git diff --no-index -- /dev/null <file>` (exit code 1 is the normal "differences found" result and is not an error). The resulting patches are appended to the main diff. Binary untracked files yield the standard "Binary files differ" patch.

### 5.3 Startup validation and exit codes

1. Read the summary; error if missing or unreadable.
2. Produce the diff; error if git fails (its stderr is forwarded).
3. Parse the diff (shared parser). An empty diff is allowed: a warning is printed and the review opens with an empty file list.
4. Extract anchors from the summary and resolve them (section 6). Each unresolved or ambiguous anchor prints one warning line to stderr in the form `resk: warning: anchor "diff:src/foo.ts#L10" does not match any changed file`. Unresolved anchors do not stop the review.
5. Start the server, print `resk: http://127.0.0.1:4989` to stderr, open the browser unless `--no-open`.

Exit codes: `0` normal completion (with or without comments), `2` usage or environment error (bad arguments, not a git repo, summary missing, git failure, no free port). `SIGINT` prints whatever comments were collected and exits `0`.

## 6. Summary format and anchors

The summary is CommonMark plus GFM (tables, task lists, strikethrough). Highlights are ordinary Markdown links whose URL uses the `diff:` scheme.

```
diff:<path>                       whole file
diff:<path>#L<n>                  one line on the new side
diff:<path>#L<n>-L<m>             inclusive line range on the new side
diff:<path>#old:L<n>              one line on the old side (removed code)
diff:<path>#old:L<n>-L<m>         inclusive range on the old side
```

Grammar: `path` is everything between `diff:` and the first `#`, URL-decoded. `n` and `m` are positive integers; if `m < n` they are swapped. Anything else after `#` makes the anchor invalid (rendered as broken, warned at startup).

### 6.1 Path resolution

Every changed file has a **display path**: the new path, or the old path for deleted files. Resolution order:

1. Exact match against a display path.
2. Exact match against an old path of a renamed file (the anchor then points at that file).
3. Unique suffix match: exactly one display path equals the anchor path or ends with `/` + anchor path.
4. Otherwise unresolved. If step 3 finds more than one candidate, the anchor is unresolved with an "ambiguous" warning listing the candidates.

### 6.2 Range validation

For a resolved anchor with a range, the startup check warns when the start line is not present on the given side in any hunk of that file (context lines count as present). The anchor still resolves; the client outlines whatever part of the range exists and scrolls to the nearest rendered line.

### 6.3 Auto-highlights from code spans

An inline code span whose text exactly equals a display path (after resolution rules 1 and 2 only, no suffix matching) is rendered as a whole-file highlight. This lets the agent write `` `src/utils/time.ts` `` without a link.

### 6.4 Example summary

```markdown
## Critical
Token refresh moved from the client into [UserService](diff:src/services/user.ts#L40-L58).
The old client path in [auth/token.ts](diff:src/auth/token.ts#old:L12-L20) is deleted.

## Notable
New route [POST /auth/refresh](diff:src/routes/auth.ts#L8-L31) with a rate limit.
Migration `db/migrations/20260911_add_refresh_tokens.sql` adds the table.

## Minor
Renamed helpers in [utils/time.ts](diff:src/utils/time.ts), test updates in `tests/user.service.test.ts`.
```

## 7. Shared data model

```ts
type Side = 'old' | 'new';

interface DiffLine { type: 'context' | 'add' | 'del'; oldLine?: number; newLine?: number; text: string }
interface Hunk { oldStart: number; oldLines: number; newStart: number; newLines: number; header: string; lines: DiffLine[] }

interface FileChange {
  path: string;            // display path
  oldPath?: string;        // set only for renames
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: Hunk[];
  patch: string;           // this file's raw patch text, fed to the diff renderer
}

interface Anchor { path: string; side?: Side; start?: number; end?: number }
type ResolvedAnchor =
  | { status: 'ok'; anchor: Anchor; file: FileChange }
  | { status: 'unresolved' | 'ambiguous' | 'invalid'; raw: string; candidates?: string[] };

type CommentTarget =
  | { kind: 'summary' }
  | { kind: 'file'; path: string }
  | { kind: 'lines'; path: string; side: Side; start: number; end: number };

interface Comment { id: string; target: CommentTarget; body: string; createdAt: string; updatedAt: string }

interface ReviewPayload { title: string; summary: string; files: FileChange[] }
```

The **shared unified-diff parser** (`src/shared/diff-parser.ts`) is our own code. It handles `diff --git` headers, `new file mode`, `deleted file mode`, `rename from/to`, `similarity index`, `Binary files ... differ`, `GIT binary patch`, `\ No newline at end of file`, hunk headers with and without counts, and quoted paths. It is the single source of the file list, statistics, line lookup (for range validation and output excerpts), and per-file patch slicing. The client uses `@pierre/diffs` only for rendering a single file's `patch` string.

## 8. Server

Hono application served by `@hono/node-server`.

| Route | Behaviour |
|---|---|
| `GET /api/review` | `ReviewPayload` |
| `GET /api/comments` | `Comment[]` |
| `PUT /api/comments` | Replaces the in-memory list with the validated body. Invalid body returns 400 and leaves state unchanged. |
| `POST /api/finish` | Responds `{ "ok": true }`, then prints the review output and exits 0 after the response is flushed. |
| `GET /api/events` | Server-sent events stream used only for presence. Sends a `ready` event and a heartbeat comment every 15 s. |
| `GET /*` | Static files from `dist/client`; unknown paths fall back to `index.html`. |

**Comment storage.** In memory only. The client is the editor; it sends the full list on every change. A page refresh restores comments through `GET /api/comments`.

**Presence and auto-exit.** The server counts open SSE connections. When the count drops to zero it starts a 5 second timer; if no client reconnects, it prints the review output and exits 0. `--keep-alive` disables this. Before the first client connects there is no timer, so a slow browser start does not end the review.

**Printing.** Output is written to stdout exactly once, whichever of finish, disconnect, or SIGINT happens first.

## 9. Client

### 9.1 Layout

- **Top bar** (fixed, 48 px): "resk" mark, review title, then on the right: theme toggle cycling system / light / dark, "Comment on summary" button, "Finish review" primary button.
- **No panels open:** the summary is a single centered column, `max-width` about 48 rem, scrolling with the page.
- **One or more panels open:** the body becomes a two-column flex row filling the viewport below the top bar. Left: the summary column, fixed width 440 px, scrolls independently. Right: the **diff column**, takes the remaining width, scrolls independently as one continuous surface.
- The layout switch is animated with a short width transition; nothing else moves.

### 9.2 Summary column

- Markdown rendered with `react-markdown` + `remark-gfm`. `urlTransform` must pass `diff:` URLs through unchanged (react-markdown drops unknown schemes by default). Non-`diff:` links open in a new tab.
- Links with `diff:` URLs and matching code spans render as **Highlight** chips (9.3).
- **Summary comments** are shown at the top of the column as comment cards; "Comment on summary" opens a composer there.
- **Changed files** section at the bottom: heading "Changed files (N)", then one row per file in diff order: status badge (A/M/D/R, plus "binary" when applicable), display path with the old path for renames, `+adds −dels`, and a comment dot when the file has comments. Clicking a row opens or scrolls to that file's panel. A row whose panel is open is visually marked.

### 9.3 Highlight chip

Inline element, keyboard focusable (`button` semantics), with a soft accent background and dotted underline.

| State | Meaning | Visual |
|---|---|---|
| default | linked file resolved, panel closed | soft background |
| hover / focus | | stronger background |
| open | panel for the linked file is in the diff column | filled accent, `aria-pressed="true"` |
| broken | anchor invalid, unresolved, or ambiguous | dashed underline, muted, not clickable, `title` explains why |
| dot | linked file has one or more comments of any kind | small accent dot at the top-right corner, in any of the states above |

Clicking a highlight: open the panel if closed (inserted at its diff-order position), scroll the diff column so the panel header is at the top, and if the anchor has a range, outline those lines and scroll them into view. Clicking the same highlight again repeats the scroll and outline; it does not close the panel.

### 9.4 Diff column and panels

- Panels are stacked vertically, each at its natural height, always in **diff order** regardless of the order they were opened.
- **Panel header** (sticky within the column): status badge, display path (old path shown for renames), `+adds −dels`, unified/split toggle (default unified, per panel), "Comment on file" button, close button. When the file has comments the header shows the comment count.
- **Panel body:** `@pierre/diffs` `PatchDiff` for the file's `patch` with `theme: { light: 'github-light', dark: 'github-dark' }`, `themeType` bound to the app theme, line numbers on, word-level inline diff on. Binary files render a "Binary file not shown" body instead.
- **Range outline:** the anchor range is passed as `selectedLines`; the outlined lines are scrolled into view.
- **Closing** removes the panel. Closing the last panel returns to the centered layout. Comments are never lost by closing a panel.

### 9.5 Comments

Targets: summary, file, or a line range on one side of one file. Comment bodies are plain text; whitespace and newlines are preserved when displayed and in the output.

- **Line comments.** Clicking a line number opens a composer under that line. Dragging across line numbers (`@pierre/diffs` line selection) opens a composer under the last line of the range. The composer is rendered as an annotation on the range's end line on that side. Submit with the button or Ctrl/Cmd+Enter; cancel with Escape or the Cancel button. An empty body cannot be submitted.
- **File comments.** "Comment on file" opens a composer as a file-level annotation above the first hunk. Existing file comments are listed there.
- **Summary comments.** As in 9.2.
- **Comment card:** body, relative timestamp, Edit and Delete. Edit turns the card into a composer prefilled with the body. Delete removes immediately (no confirmation; a one-shot review is low stakes).
- Every change sends the full list with `PUT /api/comments`. A failed PUT shows a non-blocking error toast and retries on the next change.

### 9.6 Finish review

"Finish review" opens a confirmation popover: "N comments in M files, K on summary" (or "No comments yet") with Confirm and Cancel. Confirm calls `POST /api/finish`; the page then shows a full-screen "Review finished. You can close this tab." state and stops all requests.

### 9.7 Theme

The app theme (`system | light | dark`) is stored in `localStorage` (guarded with try/catch) and applied as a `dark` class on `<html>`. Tailwind's dark variant is class-based. The diff renderer receives the same theme type so code and UI switch together.

### 9.8 Keyboard

Escape closes an open composer or popover. Highlights and file rows are reachable by Tab and activated by Enter or Space. Nothing else in v1.

## 10. Review output

### 10.1 Markdown (default)

```markdown
# Review comments (3)

## Summary
- Split this into two PRs; the migration should ship first.

## src/services/user.ts
- (file) Please add a unit test for the retry path.
- L44-L46 (new): Why is the timeout hardcoded?
  > +    const timeout = 3000;
  > +    await refresh(token, timeout);
  > +    return session;
```

Rules:

- Title line: `# Review comments (<total>)`. With zero comments the whole output is the single line `No review comments.`
- `## Summary` section first, only if summary comments exist, one bullet per comment in creation order.
- One `## <display path>` section per file that has comments, in diff order. Within a file: file comments first (prefixed `(file)`), then line comments sorted by start line, then by side with `new` before `old`.
- Line comment label: `L<n>` for a single line, `L<n>-L<m>` for a range, followed by ` (new)` or ` (old)`.
- Multi-line bodies keep their newlines; continuation lines are indented two spaces so they remain inside the bullet.
- Each line comment is followed by an excerpt: the diff lines of that range on that side, each prefixed with `> ` and keeping the original `+`, `-`, or space marker. Lines in the range that are not present in the diff are skipped.

### 10.2 JSON (`--json`)

```json
{
  "title": "feature/auth-refresh vs main",
  "comments": [
    { "id": "…", "target": { "kind": "lines", "path": "src/services/user.ts", "side": "new", "start": 44, "end": 46 },
      "body": "Why is the timeout hardcoded?", "createdAt": "…", "updatedAt": "…",
      "excerpt": ["+    const timeout = 3000;", "+    await refresh(token, timeout);", "+    return session;"] }
  ]
}
```

Comments appear in the same order as the Markdown output. `excerpt` is present only for `lines` targets. With zero comments the object has an empty `comments` array.

## 11. Claude Code skill

`skills/resk/SKILL.md` with frontmatter `name: resk` and a description that triggers after the agent completes an implementation and wants the user's review. The body instructs the agent to:

1. Write the summary to a temporary file: start with the changes that most affect behaviour, security, data, or public interfaces; end with cosmetic and test changes. Use headings for tiers. Link every mentioned module, function, or file with a `diff:` anchor, preferring line ranges for anything it explains in words. Mention every changed file at least once, but do not paste the diff into the summary.
2. Run `resk --summary <file> <target>` with the target that matches the work (`.` for uncommitted work, `@ <base>` for a branch).
3. Fix any `resk: warning: anchor …` lines by correcting the summary and re-running, if practical.
4. Read stdout after the process exits. Treat each comment as a work item, address them, and offer another review. `No review comments.` means the review passed.

The README explains installation of the skill: copy or symlink `skills/resk` into `~/.claude/skills/resk`.

## 12. Error handling summary

| Situation | Behaviour |
|---|---|
| Not a git repository and no `--diff` | stderr message, exit 2 |
| Summary file missing / unreadable | stderr message, exit 2 |
| git command fails | forward git stderr, exit 2 |
| Empty diff | warning, review opens with empty file list |
| Anchor invalid / unresolved / ambiguous | warning per anchor, chip rendered broken |
| Preferred port busy | try next ports, up to 20; then exit 2 |
| Browser cannot be opened | warning with the URL, server keeps running |
| Invalid `PUT /api/comments` body | 400, state unchanged, client toast |
| Client fails to load `/api/review` | full-page error with retry button |
| SIGINT | print collected comments, exit 0 |

## 13. Testing

### 13.1 Unit tests (Vitest)

- Diff parser: modified, added, deleted, renamed, binary, no-newline marker, hunks without counts, quoted paths, multiple files, per-file patch slicing, statistics.
- Anchor grammar: every form in section 6, invalid forms, swapped ranges, URL-encoded paths.
- Anchor resolution: exact, old-path, unique suffix, ambiguous suffix, unresolved; range validation warnings.
- Auto-highlight extraction from code spans.
- Git command builder: every row of the table in 5.1, `@` substitution, `--context`, rejection of `working <base>`.
- Untracked file patch assembly.
- Output formatter: ordering rules, labels, excerpts, multi-line bodies, zero comments, JSON shape.
- Client reducer: open/close panels keeps diff order, same-file highlight reuses the panel, dot derivation, theme cycling.
- Comment validation for `PUT /api/comments`.

### 13.2 Acceptance tests (Playwright, Chromium)

A launcher fixture spawns the built CLI (`node dist/cli/index.js --diff <fixture.patch> --summary <fixture.md> --no-open --port 0 [--keep-alive]`), parses the URL from stderr, and exposes `stdout`, `exitCode`, and `kill()`. Every spec runs against the real server and built client.

1. Load: summary is centered, headings render, "Changed files (N)" lists every fixture file with correct counts.
2. Highlight opens a panel: clicking a range highlight shifts the summary left, adds one panel with the right path, marks the chip open, outlines the range.
3. Stacking order: opening a later file then an earlier one yields panels in diff order.
4. Same-file reuse: two highlights into one file produce one panel; the second click scrolls and outlines the new range.
5. Close: closing a panel removes it; closing the last one re-centers the summary.
6. Line comment: click a line number, type, submit; card appears under the line; dot appears on the chip and the file row.
7. Range comment via drag selection.
8. File comment and summary comment create cards in their places.
9. Edit and delete a comment; dot disappears when the last comment on a file is deleted.
10. Refresh keeps comments.
11. Theme toggle switches the `dark` class and the diff renderer theme.
12. Broken anchor renders as a non-clickable chip with a tooltip; the CLI stderr contains the warning.
13. Unified/split toggle changes the panel rendering.
14. Finish review: confirmation shows the right counts, confirming ends the process with exit code 0 and stdout equal to the expected Markdown for the comments left in the test.
15. Finish with `--json` yields the expected JSON.
16. Auto-exit: closing the page without `--keep-alive` ends the process within a few seconds and prints the collected comments.

### 13.3 Continuous integration

GitHub Actions on push and pull request: `npm ci`, typecheck, lint, unit tests, build, Playwright (Chromium). The Playwright job uploads traces on failure.

## 14. Tooling

- TypeScript strict mode across all folders, ESM only.
- ESLint (typescript-eslint, react-hooks) and Prettier.
- `npm scripts`: `dev` (Vite dev server with `/api` proxied to a running CLI started with `--keep-alive`), `build` (client and node targets), `typecheck`, `lint`, `test` (Vitest), `test:e2e` (build then Playwright), `check` (all of the above).
- Published files: `dist/`, `skills/`, `README.md`. `npx resk` must work after publishing.
