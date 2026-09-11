import type { Page } from '@playwright/test';

/**
 * Navigates like a tab opened directly at the URL (as the CLI's browser launch does): the initial
 * about:blank entry is replaced, so the page has a single history entry and may close itself.
 */
export async function gotoAsFreshTab(page: Page, url: string): Promise<void> {
  await Promise.all([page.waitForURL(`${url}/`), page.evaluate((u) => location.replace(u), url)]);
}
