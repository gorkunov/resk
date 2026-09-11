import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseUnifiedDiff } from '../../src/shared/diff-parser.js';
import { anchorWarnings } from '../../src/cli/warnings.js';

const fixture = readFileSync(new URL('../fixtures/sample.patch', import.meta.url), 'utf8');
const files = parseUnifiedDiff(fixture);

describe('anchorWarnings', () => {
  it('returns nothing for a summary whose anchors all resolve', () => {
    const md =
      'See [a](diff:src/services/user.ts#L18-L19) and [b](diff:src/utils/time.ts) and `src/routes/auth.ts`.';
    expect(anchorWarnings(md, files)).toEqual([]);
  });

  it('describes unresolved, invalid, ambiguous and out-of-range anchors once each', () => {
    const md = [
      '[x](diff:src/missing.ts) [x again](diff:src/missing.ts)',
      '[y](diff:src/services/user.ts#zzz)',
      '[z](diff:src/services/user.ts#L23)',
      '[w](diff:assets/logo.png#L1)',
    ].join('\n');
    expect(anchorWarnings(md, files)).toEqual([
      'anchor "diff:src/missing.ts" does not match any changed file',
      'anchor "diff:src/services/user.ts#zzz" is not a valid diff: anchor',
      'anchor "diff:src/services/user.ts#L23": line L23 (new side) is not part of the diff',
      'anchor "diff:assets/logo.png#L1" points into a binary file',
    ]);
  });
});
