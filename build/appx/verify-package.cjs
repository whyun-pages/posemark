const path = require('node:path');
const { spawnSync } = require('node:child_process');

function verifyPackage(file) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'verify-package.ps1'), '-PackagePath', path.resolve(file)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Store package verification failed (${result.status})`);
}

exports.default = async ({ file }) => { if (file.endsWith('.appx')) verifyPackage(file); };
if (require.main === module) {
  try { verifyPackage(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
