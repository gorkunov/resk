# Example review

A realistic review to try resk without an agent: a small Express service moves session refresh
from the client to the server. The change touches 14 files, including a new module, a deleted
file, a rename, a SQL migration, tests, docs, and a binary.

- `summary.md`: the summary an agent would write, ordered from critical to minor, with `diff:` anchors.
- `changes.patch`: the matching unified diff (generated with `git diff -M`).
- `update-1.md`: the update an agent would write for a second round, after addressing comments.

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

## Follow-up rounds

Reviews usually take more than one round. The session variant of the example keeps the rounds
together under the key `example-service`:

```bash
npm run example:session    # round 1: the summary above; click Finish review when done
npm run example:update     # round 2: the same page with "Update 1" appended and opened
```

The second run shows the original summary first, then **Update 1** with what the agent changed in
response to the comments, and opens the page at the update. Highlights in both parts point into
the current diff. Finished rounds live in `~/.resk/sessions/example-service.json`; delete that file
to start the demo over. A run that ends without **Finish review** is not recorded.
