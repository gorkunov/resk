import {
  describeAnchorProblem,
  extractAnchorUrls,
  rangeWarning,
  resolveAnchor,
} from '../shared/anchors.js';
import type { FileChange } from '../shared/types.js';

/** One warning per distinct problematic anchor in the summary, in document order. */
export function anchorWarnings(summary: string, files: FileChange[]): string[] {
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const raw of extractAnchorUrls(summary)) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    const resolved = resolveAnchor(raw, files);
    const problem = describeAnchorProblem(resolved);
    if (problem) {
      warnings.push(`anchor "${raw}" ${problem}`);
      continue;
    }
    const warning = rangeWarning(resolved);
    if (warning) warnings.push(warning);
  }
  return warnings;
}
