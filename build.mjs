import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const outdir = path.join(root, 'dist');
fs.mkdirSync(outdir, { recursive: true });

// Static assets: html + css + katex fonts/css stay on disk and are loaded by URL.
function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

const options = {
  entryPoints: [path.join(root, 'src/renderer/main.js')],
  bundle: true,
  outfile: path.join(outdir, 'renderer.js'),
  platform: 'browser',
  format: 'iife',
  target: ['chrome120'],
  sourcemap: true,
  loader: { '.css': 'css', '.ttf': 'file', '.woff': 'file', '.woff2': 'file' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
};

function copyAssets() {
  fs.copyFileSync(path.join(root, 'src/renderer/index.html'), path.join(outdir, 'index.html'));
  copyDir(path.join(root, 'src/renderer/styles'), path.join(outdir, 'styles'));
  // KaTeX css + fonts (self-contained math rendering)
  const katexDist = path.join(root, 'node_modules/katex/dist');
  fs.mkdirSync(path.join(outdir, 'katex'), { recursive: true });
  fs.copyFileSync(path.join(katexDist, 'katex.min.css'), path.join(outdir, 'katex/katex.min.css'));
  copyDir(path.join(katexDist, 'fonts'), path.join(outdir, 'katex/fonts'));
  copyDir(path.join(root, 'assets'), path.join(outdir, 'assets'));
}

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  copyAssets();
  console.log('watching…');
} else {
  await esbuild.build(options);
  copyAssets();
  console.log('build ok');
}
