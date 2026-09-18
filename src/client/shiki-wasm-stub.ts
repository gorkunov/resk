/**
 * Vite maps `shiki/wasm` here (see vite.config.ts). `@pierre/diffs` references the Oniguruma WASM
 * engine only when `preferredHighlighter` is `shiki-wasm`, which resk never sets: the JavaScript
 * regex engine handles every grammar we bundle. Keeping the real module would add 600 kB to the
 * build for a branch that cannot run.
 */
export default function unavailable(): never {
  throw new Error('resk builds without the Oniguruma WASM engine; use the JavaScript engine');
}
