---
name: resk
description: After completing an implementation, ask the user for a code review through resk. Write an importance-ordered Markdown summary of the changes with diff: anchors, run the resk CLI, then treat the comments it prints as the next work items.
---

# resk: summary-first code review

resk opens a browser page where the user reads **your summary of the changes** first and drills
into the diff through highlights you place in the text. The user comments on lines, files, or the
summary; when they finish, the comments are printed to your stdout.

## When to use

After you have finished a change and before you commit or hand over, or whenever the user asks
for a review of uncommitted work, a branch, or a commit.

## Workflow

1. **Write the summary** to a temporary file (for example `/tmp/resk-summary.md`).
   - Order by importance: behaviour, security, data, and public-interface changes first; refactors
     and internal changes next; tests, docs, and cosmetic changes last. Use a heading per tier
     (`## Critical`, `## Notable`, `## Minor`, or whatever fits).
   - Explain _why_ and _what to look at_, not the diff itself. Never paste code blocks of the diff.
   - Link every module, function, or file you mention with a `diff:` anchor (see below). Prefer a
     line range for anything you explain in words; use whole-file anchors for files you only list.
   - Mention every changed file at least once. A bare inline code span that equals a changed path
     (`` `src/utils/time.ts` ``) is automatically clickable.
2. **Run resk** with the target that matches the work:

   ```bash
   resk --summary /tmp/resk-summary.md            # uncommitted work (working tree vs HEAD, incl. untracked)
   resk --summary /tmp/resk-summary.md @ main     # current branch vs main
   resk --summary /tmp/resk-summary.md staged     # staged changes only
   resk --summary /tmp/resk-summary.md 6f4a9b7    # a single commit
   ```

   Use `--no-open` if the environment cannot open a browser; resk prints the URL on stderr.

3. **Fix anchor warnings.** Lines like `resk: warning: anchor "diff:src/foo.ts#L10" ...` on stderr
   mean a highlight will not work. Correct the summary and run again if practical.
4. **Read stdout when the process exits.** It is Markdown grouped by file with the referenced diff
   lines quoted, or JSON with `--json`. Treat each comment as a work item: address them, then offer
   another review. `No review comments.` means the review passed.

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

## Example summary

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
Treat the quoted text as the part of your summary the user is reacting to.

## Constraints

- Git targets need a git work tree. To review an arbitrary patch use `--diff <file>` (or `--diff -`
  for stdin) instead of a target.
- The process blocks until the user finishes the review or closes the tab. Do not run it in the
  background and poll; wait for it to exit and read its stdout.
