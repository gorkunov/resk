---
name: resk
description: After completing an implementation, ask the user for a code review through resk. Pick a session key for the piece of work, write an importance-ordered Markdown summary with diff: anchors, run the resk CLI, treat the printed comments as work items, and report each follow-up round as an update in the same session.
---

# resk: summary-first code review

resk opens a browser page where the user reads **your summary of the changes** first and drills
into the diff through highlights you place in the text. The user comments on lines, files, or the
summary; when they finish, the comments are printed to your stdout.

Reviews take rounds. resk keeps the rounds of one piece of work together in a **session**: the
first run shows your summary as the **Initial Round**; every later run with the same key adds
**Round 2**, **Round 3**, ... on top of it, newest first, with the date each round was reviewed.

## When to use

After you have finished a change and before you commit or hand over, whenever the user asks for a
review, and again after you have addressed the comments of an earlier round.

## Sessions: one key per piece of work

- Choose the key when the work starts and keep it for every resk run about that work: the branch
  name or a short slug such as `feat-refresh-tokens` or `fix-1234-timeout`. Pass it as
  `--session <key>`.
- A new piece of work gets a new key. Never reuse a key for unrelated changes.
- Keep the diff target the same in every round so the reviewer still sees the whole change and the
  earlier highlights keep working. Prefer `@ <base>` (branch vs its base) when you commit as you
  go; `.` only shows uncommitted work.
- resk confirms the round on stderr (`resk: session "<key>": round 2 (1 finished round)`) and
  stores finished rounds in `~/.resk/sessions/<key>.json`. A run that is not finished by the user is
  not recorded; just run it again.

## Workflow

1. **Write the summary** (round 1) to a temporary file (for example `/tmp/resk-summary.md`).
   - Order by importance: behaviour, security, data, and public-interface changes first; refactors
     and internal changes next; tests, docs, and cosmetic changes last. Use a heading per tier
     (`## Critical`, `## Notable`, `## Minor`, or whatever fits).
   - Explain _why_ and _what to look at_, not the diff itself. Never paste code blocks of the diff.
   - Link every module, function, or file you mention with a `diff:` anchor (see below). Prefer a
     line range for anything you explain in words; use whole-file anchors for files you only list.
   - Mention every changed file at least once. A bare inline code span that equals a changed path
     (`` `src/utils/time.ts` ``) is automatically clickable.
2. **Run resk** with the session key and the target that matches the work:

   ```bash
   resk --summary /tmp/resk-summary.md --session feat-refresh-tokens @ main   # branch vs main
   resk --summary /tmp/resk-summary.md --session fix-1234-timeout             # uncommitted work vs HEAD
   resk --summary /tmp/resk-summary.md --session release-notes staged         # staged changes only
   resk --summary /tmp/resk-summary.md --session hotfix-6f4a9b7 6f4a9b7       # a single commit
   ```

   Use `--no-open` if the environment cannot open a browser; resk prints the URL on stderr.

3. **Fix anchor warnings.** Lines like `resk: warning: anchor "diff:src/foo.ts#L10" ...` on stderr
   mean a highlight will not work. Correct the summary and run again if practical.
4. **Read stdout when the process exits.** It is Markdown grouped by file with the referenced diff
   lines quoted, or JSON with `--json`. Treat each comment as a work item. `No review comments.`
   means the review passed.
5. **Address the comments, then write an update** (see below) to a new file and run resk again
   with the **same key and target**. Repeat until the review passes or the user stops.

## Writing an update (round 2 and later)

The update is a delta the reviewer reads above your earlier rounds. Do not rewrite or repeat the
summary; the page already shows it below.

- Open with one sentence of status: how many comments were addressed, how many declined.
- One bullet per reviewer comment, in the order the comments came. Quote or paraphrase the comment
  in bold, then say what you changed and link the new lines with a `diff:` anchor.
- If you did not do something, say so in its bullet and give the reason. Never drop a comment
  silently, and do not argue at length: one or two sentences, and offer the alternative.
- Add an **Also changed** paragraph for anything beyond the comments (a refactor the fix needed, a
  new file, a behaviour change) with anchors. Nothing that changed may go unmentioned.
- Keep it short: a few lines per comment. Line numbers in your earlier rounds may no longer match
  the code; that is expected, and the reviewer follows your update, which must be accurate.

```markdown
Three of four comments addressed; the purge job is declined for now.

- **"The route hardcodes `max: 10`, use the config."** Read from
  [config.rateLimit](diff:src/config.ts#L14-L18) in [POST /auth/refresh](diff:src/routes/auth.ts#L8).
- **"Is the unsalted hash safe?"** Kept: the secret is 32 random bytes. Comment added at
  [hashSecret()](diff:src/auth/refresh.ts#L13-L15); happy to switch to HMAC if you prefer.
- **"Nothing purges expired rows."** Declined for this change: it needs a scheduler we do not have.
  Follow-up task opened; the [expiry index](diff:db/migrations/20260911_add_refresh_tokens.sql#L9-L10)
  keeps the later cleanup cheap.
- **"Add a test for the unknown-token path."** Added in
  [user.service.test.ts](diff:tests/user.service.test.ts#L8-L29).

Also changed: [remove()](diff:src/services/user.ts#L38-L39) revokes refresh tokens before sessions.
```

## Anchor format

Anchors are ordinary Markdown links whose URL uses the `diff:` scheme. Paths are repo-relative,
exactly as they appear in the diff. Line numbers refer to the **new** side unless prefixed with
`old:`.

```markdown
[UserService](diff:src/services/user.ts) whole file
[refreshSession()](diff:src/services/user.ts#L40-L58) new-side line range
[one line](diff:src/services/user.ts#L40) single new-side line
[old client path](diff:src/auth/token.ts#old:L12-L20) removed code, old side
```

Read line numbers from the diff you are describing (`git diff` hunk headers give the new-side
start line). A path that is unique by suffix also resolves (`diff:user.ts`), but prefer full paths.

## Example summary (round 1)

```markdown
## Critical

Token refresh moved from the client into [UserService](diff:src/services/user.ts#L40-L58).
The old client-side path in [auth/token.ts](diff:src/auth/token.ts#old:L12-L20) is deleted.

## Notable

New route [POST /auth/refresh](diff:src/routes/auth.ts#L8-L31) with a rate limit.
Migration `db/migrations/20260911_add_refresh_tokens.sql` adds the table.

## Minor

Renamed helpers in [utils/time.ts](diff:src/utils/time.ts); test updates in `tests/user.service.test.ts`.
```

## Output you will receive

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

Summary comments are anchored to a text selection and written as `On "<selected text>": <comment>`.
Treat the quoted text as the part of your summary or update the user is reacting to. Selections
can land in any round on the page, including earlier ones. Only the comments of the current round
are printed; earlier rounds are in the session file if you need them.

## Constraints

- Git targets need a git work tree. To review an arbitrary patch use `--diff <file>` (or `--diff -`
  for stdin) instead of a target.
- The process blocks until the user finishes the review or closes the tab, which is usually
  longer than a shell tool's default timeout. In Claude Code, run it with `run_in_background`
  and wait for the completion notification, then read the command's output; do not poll or kill
  it while the user is reviewing. If you cannot background it, pass the longest timeout allowed.
