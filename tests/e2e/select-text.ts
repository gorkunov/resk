import { expect, type Page } from '@playwright/test';

/** Selects `text` inside the rendered summary with a real mouse drag. */
export async function selectText(page: Page, text: string) {
  await page.locator('[data-testid="summary-markdown"]').waitFor();
  const points = await page.evaluate((needle) => {
    const root = document.querySelector('[data-testid="summary-markdown"]');
    if (!root) throw new Error('summary-markdown not found');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const index = node.data.indexOf(needle);
      if (index !== -1) {
        const first = document.createRange();
        first.setStart(node, index);
        first.setEnd(node, index + 1);
        const last = document.createRange();
        last.setStart(node, index + needle.length - 1);
        last.setEnd(node, index + needle.length);
        const a = first.getBoundingClientRect();
        const b = last.getBoundingClientRect();
        return {
          x1: a.left + 1,
          y1: a.top + a.height / 2,
          x2: b.right - 1,
          y2: b.top + b.height / 2,
        };
      }
      node = walker.nextNode() as Text | null;
    }
    throw new Error(`text not found: ${needle}`);
  }, text);
  await page.mouse.move(points.x1, points.y1);
  await page.mouse.down();
  await page.mouse.move(points.x2, points.y2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim())).toBe(text);
}
