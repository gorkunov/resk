/** Where the full text of a file version comes from, for expanding unmodified context. */
export type ContentSource = { kind: 'worktree' } | { kind: 'index' } | { kind: 'rev'; rev: string };

export interface GitPlan {
  /** Arguments for the main `git` invocation (without the `git` executable). */
  args: string[];
  /** Whether untracked files must be appended as additions. */
  includeUntracked: boolean;
  /** Default review title. */
  title: string;
  /** Context lines, when the user asked for a specific amount. */
  context?: number;
  /** The two file versions this diff compares, so the client can expand context. */
  sources: { old: ContentSource; new: ContentSource };
}

export interface GitPlanOptions {
  untracked: boolean;
  context?: number;
}

const COMMON = ['-c', 'core.quotepath=false'];
const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '-M'];

function ref(value: string): string {
  return value === '@' ? 'HEAD' : value.replace(/^@(?=[~^])/, 'HEAD');
}

export function buildGitPlan(
  target: string | undefined,
  compareWith: string | undefined,
  options: GitPlanOptions,
): GitPlan {
  const t = target ?? '.';
  const contextFlags = options.context === undefined ? [] : [`--unified=${options.context}`];
  const diff = (...rest: string[]): string[] => [
    ...COMMON,
    'diff',
    ...DIFF_FLAGS,
    ...contextFlags,
    ...rest,
  ];

  let plan: GitPlan;
  if (compareWith === undefined) {
    if (t === '.') {
      plan = {
        args: diff('HEAD'),
        includeUntracked: options.untracked,
        title: 'Working tree vs HEAD',
        sources: { old: { kind: 'rev', rev: 'HEAD' }, new: { kind: 'worktree' } },
      };
    } else if (t === 'staged') {
      plan = {
        args: diff('--cached'),
        includeUntracked: false,
        title: 'Staged changes',
        sources: { old: { kind: 'rev', rev: 'HEAD' }, new: { kind: 'index' } },
      };
    } else if (t === 'working') {
      plan = {
        args: diff(),
        includeUntracked: options.untracked,
        title: 'Unstaged changes',
        sources: { old: { kind: 'index' }, new: { kind: 'worktree' } },
      };
    } else {
      const r = ref(t);
      plan = {
        args: [
          ...COMMON,
          'diff-tree',
          '--root',
          '-p',
          '--no-commit-id',
          ...DIFF_FLAGS,
          ...contextFlags,
          r,
        ],
        includeUntracked: false,
        title: `Commit ${r}`,
        // A root commit has no parent; the old side then simply has no contents to expand.
        sources: { old: { kind: 'rev', rev: `${r}^` }, new: { kind: 'rev', rev: r } },
      };
    }
  } else {
    const base = ref(compareWith);
    if (t === '.') {
      plan = {
        args: diff(base),
        includeUntracked: options.untracked,
        title: `Working tree vs ${base}`,
        sources: { old: { kind: 'rev', rev: base }, new: { kind: 'worktree' } },
      };
    } else if (t === 'staged') {
      plan = {
        args: diff('--cached', base),
        includeUntracked: false,
        title: `Staged changes vs ${base}`,
        sources: { old: { kind: 'rev', rev: base }, new: { kind: 'index' } },
      };
    } else if (t === 'working') {
      throw new Error('"working" (unstaged changes) cannot be compared with a ref');
    } else {
      const r = ref(t);
      plan = {
        args: diff(base, r),
        includeUntracked: false,
        title: `${r} vs ${base}`,
        sources: { old: { kind: 'rev', rev: base }, new: { kind: 'rev', rev: r } },
      };
    }
  }
  if (options.context !== undefined) plan.context = options.context;
  return plan;
}
