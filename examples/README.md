# Example review

A realistic review to try resk without an agent: a small Express service moves session refresh
from the client to the server. The change touches 14 files, including a new module, a deleted
file, a rename, a SQL migration, tests, docs, and a binary.

- `summary.md`: the summary an agent would write, ordered from critical to minor, with `diff:` anchors.
- `changes.patch`: the matching unified diff (generated with `git diff -M`).

## Run it

From the repository root:

```bash
npm install
npm run example
```

This builds resk and opens the review in your browser. Without the npm script:

```bash
node dist/cli/index.js --summary examples/summary.md --diff examples/changes.patch
```

## Things to try

1. Read the summary and click a highlight such as **UserService.refreshSession()**. The panel opens
   on the right with the linked lines outlined, and the highlight turns green to mark it as reviewed
   (that survives a reload). Click **hardcodes `max: 10`** in the same file group
   to see the panel reused and scrolled.
2. Open several files. Panels stay in diff order no matter what you clicked first. Close one with ×.
3. Click a line number, or drag across several, and leave a comment. The highlight and the file row
   get a dot, and the panel header shows a count.
4. Use **Comment** in a panel header for a whole-file note. On the summary, select any text: a
   **Comment** button appears and the comment is anchored to that text, which stays underlined.
   Click underlined text to see, edit or delete its comments.
5. Toggle **Unified/Split** and the theme button.
6. Click **Finish review**. The tab closes, the terminal where you started resk prints the comments
   as Markdown, and the process exits. Add `-- --json` to `npm run example` to get JSON instead.
