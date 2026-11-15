// Capture the real application with isolated profiles, then prepare website assets.
// Run: pnpm build && node website/tools/shots.mjs
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const electron = createRequire(import.meta.url)(path.join(root, 'node_modules/electron'));
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
function run(script, language = '') {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'posemark-site-shots-'));
  try {
    const result = spawnSync(electron, [path.join(here, script)], {
      env: { ...process.env, POSEMARK_SHOT_PROFILE: profile, POSEMARK_SHOT_LANG: language },
      encoding: 'utf8', timeout: 120_000,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error || result.status !== 0) throw result.error || new Error(`${script} failed (${result.status})`);
  } finally {
    if (path.dirname(profile) !== path.resolve(os.tmpdir()) || !path.basename(profile).startsWith('posemark-site-shots-')) throw new Error('Unexpected profile path');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
for (const language of ['zh', 'en']) run('capture.cjs', language);
run('postprocess.cjs');
