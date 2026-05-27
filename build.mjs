// Build step for da-sc-sdk.
//
// Produces dist/index.js — a self-contained ESM bundle that runs identically
// in any ESM runtime (browser, Node, Deno, Bun, Workers, edge). Consumers
// that resolve via package name (npm) get the source under `src/`; consumers
// that vendor the artifact or load it from a CDN take this single file.

import { build } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(root, 'dist');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

// `platform: 'neutral'` because the SDK has zero environment-specific
// dependencies — `hast-util-from-html` is pure JS (parse5), and the rest
// of the SDK is plain ESM. The output runs in browsers, Node, Deno, Bun,
// and Cloudflare Workers without modification.
await build({
  entryPoints: [resolve(root, 'src/index.js')],
  outfile: resolve(outdir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  treeShaking: true,
  sourcemap: false,
  legalComments: 'none',
});

console.log('Built dist/index.js');
