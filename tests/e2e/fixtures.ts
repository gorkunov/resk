import { test as base } from '@playwright/test';
import { DEFAULT_ARGS, launchResk, type Launched } from './launch.js';

export const test = base.extend<{ resk: Launched }>({
  // eslint-disable-next-line no-empty-pattern
  resk: async ({}, use) => {
    const launched = await launchResk(DEFAULT_ARGS);
    await use(launched);
    await launched.kill();
  },
});

export { expect } from '@playwright/test';
