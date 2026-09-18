/**
 * Vite maps the bare `shiki` specifier to this module (see vite.config.ts).
 *
 * `@pierre/diffs` imports shiki's full `bundledLanguages`, a map of ~360 dynamic imports. Vite
 * turns every one into its own chunk, which made the client build 11 MB of grammars nobody asked
 * for. We bundle the languages a code review is likely to contain; anything else resolves to an
 * empty grammar, so an unusual file renders as readable plain text instead of failing to render.
 */
export * from '@shikijs/core';
export { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
export { createOnigurumaEngine } from 'shiki/engine/oniguruma';

import { createBundledHighlighter } from '@shikijs/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

import type { DynamicImportLanguageRegistration, LanguageRegistration } from '@shikijs/types';

type LanguageLoader = DynamicImportLanguageRegistration;

/** Grammars compiled into the client build. Keys are the ids `@pierre/diffs` derives from paths. */
const BUNDLED: Record<string, LanguageLoader> = {
  astro: () => import('@shikijs/langs/astro'),
  c: () => import('@shikijs/langs/c'),
  clojure: () => import('@shikijs/langs/clojure'),
  cmake: () => import('@shikijs/langs/cmake'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  csv: () => import('@shikijs/langs/csv'),
  dart: () => import('@shikijs/langs/dart'),
  diff: () => import('@shikijs/langs/diff'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  dotenv: () => import('@shikijs/langs/dotenv'),
  elixir: () => import('@shikijs/langs/elixir'),
  erlang: () => import('@shikijs/langs/erlang'),
  fish: () => import('@shikijs/langs/fish'),
  'git-commit': () => import('@shikijs/langs/git-commit'),
  go: () => import('@shikijs/langs/go'),
  graphql: () => import('@shikijs/langs/graphql'),
  groovy: () => import('@shikijs/langs/groovy'),
  haskell: () => import('@shikijs/langs/haskell'),
  hcl: () => import('@shikijs/langs/hcl'),
  html: () => import('@shikijs/langs/html'),
  ini: () => import('@shikijs/langs/ini'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  json5: () => import('@shikijs/langs/json5'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  jsx: () => import('@shikijs/langs/jsx'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  kts: () => import('@shikijs/langs/kotlin'),
  less: () => import('@shikijs/langs/less'),
  lua: () => import('@shikijs/langs/lua'),
  makefile: () => import('@shikijs/langs/make'),
  markdown: () => import('@shikijs/langs/markdown'),
  nginx: () => import('@shikijs/langs/nginx'),
  nix: () => import('@shikijs/langs/nix'),
  ocaml: () => import('@shikijs/langs/ocaml'),
  perl: () => import('@shikijs/langs/perl'),
  php: () => import('@shikijs/langs/php'),
  powershell: () => import('@shikijs/langs/powershell'),
  prisma: () => import('@shikijs/langs/prisma'),
  properties: () => import('@shikijs/langs/properties'),
  protobuf: () => import('@shikijs/langs/proto'),
  python: () => import('@shikijs/langs/python'),
  r: () => import('@shikijs/langs/r'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  sass: () => import('@shikijs/langs/sass'),
  scala: () => import('@shikijs/langs/scala'),
  scss: () => import('@shikijs/langs/scss'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  solidity: () => import('@shikijs/langs/solidity'),
  sql: () => import('@shikijs/langs/sql'),
  svelte: () => import('@shikijs/langs/svelte'),
  swift: () => import('@shikijs/langs/swift'),
  toml: () => import('@shikijs/langs/toml'),
  tsv: () => import('@shikijs/langs/tsv'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  vue: () => import('@shikijs/langs/vue'),
  xml: () => import('@shikijs/langs/xml'),
  xsl: () => import('@shikijs/langs/xsl'),
  yaml: () => import('@shikijs/langs/yaml'),
  zig: () => import('@shikijs/langs/zig'),
  zsh: () => import('@shikijs/langs/shellscript'),
};

/** Aliases the renderer may ask for that point at a grammar we already bundle. */
const ALIASES: Record<string, string> = {
  bash: 'shellscript',
  cmd: 'shellscript',
  sh: 'shellscript',
  js: 'javascript',
  md: 'markdown',
  make: 'makefile',
  objc: 'c',
  'objective-c': 'c',
  proto: 'protobuf',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  tf: 'hcl',
  tfvars: 'hcl',
  ts: 'typescript',
  yml: 'yaml',
};

/** A valid grammar that matches nothing, so unbundled languages render as plain text. */
function blankGrammar(lang: string): LanguageLoader {
  const grammar = {
    name: lang,
    scopeName: `source.${lang}.resk-plain`,
    patterns: [],
  } as unknown as LanguageRegistration;
  return () => Promise.resolve({ default: [grammar] });
}

function loaderFor(lang: string): LanguageLoader {
  return BUNDLED[lang] ?? BUNDLED[ALIASES[lang] ?? ''] ?? blankGrammar(lang);
}

/**
 * Looks like shiki's own map to `@pierre/diffs`, which checks `hasOwnProperty` before calling the
 * loader, but answers for every language rather than only the bundled ones.
 */
export const bundledLanguages: Record<string, LanguageLoader> = new Proxy(BUNDLED, {
  get: (_target, property) => (typeof property === 'string' ? loaderFor(property) : undefined),
  has: () => true,
  getOwnPropertyDescriptor: (_target, property) =>
    typeof property === 'string'
      ? { value: loaderFor(property), enumerable: true, configurable: true, writable: false }
      : undefined,
});

export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: {},
  // The renderer always passes its own engine; this default keeps the WASM build out of the bundle.
  engine: () => createJavaScriptRegexEngine(),
});
