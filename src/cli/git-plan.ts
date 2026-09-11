export interface GitPlan {
  /** Arguments for the main `git` invocation (without the `git` executable). */
  args: string[];
  /** Whether untracked files must be appended as additions. */
  includeUntracked: boolean;
  /** Default review title. */
  title: string;
  /** Context lines, when the user asked for a specific amount. */
  context?: number;
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
      };
    } else if (t === 'staged') {
      plan = { args: diff('--cached'), includeUntracked: false, title: 'Staged changes' };
    } else if (t === 'working') {
      plan = { args: diff(), includeUntracked: options.untracked, title: 'Unstaged changes' };
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
      };
    }
  } else {
    const base = ref(compareWith);
    if (t === '.') {
      plan = {
        args: diff(base),
        includeUntracked: options.untracked,
        title: `Working tree vs ${base}`,
      };
    } else if (t === 'staged') {
      plan = {
        args: diff('--cached', base),
        includeUntracked: false,
        title: `Staged changes vs ${base}`,
      };
    } else if (t === 'working') {
      throw new Error('"working" (unstaged changes) cannot be compared with a ref');
    } else {
      const r = ref(t);
      plan = { args: diff(base, r), includeUntracked: false, title: `${r} vs ${base}` };
    }
  }
  if (options.context !== undefined) plan.context = options.context;
  return plan;
}
