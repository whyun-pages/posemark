// Build with the installed Visual Studio C++ toolchain, including from a plain
// terminal or GitHub Actions. No dependency on Electron's native module ABI.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: __dirname, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return result.stdout;
}

function toolchain(arch) {
  const finder = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio/Installer/vswhere.exe');
  if (!fs.existsSync(finder)) throw new Error('Install Visual Studio Build Tools with Desktop development with C++ and a Windows 10/11 SDK.');
  const installation = run(finder, ['-latest', '-products', '*', '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
    { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim();
  if (!installation) throw new Error('No Visual Studio C++ toolchain found. Install the C++ build tools and Windows SDK.');
  const vcvars = path.join(installation, 'VC/Auxiliary/Build/vcvarsall.bat');
  const output = run(process.env.ComSpec || 'cmd.exe', ['/d', '/u', '/s', '/c',
    `""${vcvars}" ${arch === 'arm64' ? 'amd64_arm64' : 'amd64'} >nul && set"`],
    { windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf16le' });
  const env = {};
  for (const line of output.split(/\r?\n/)) {
    const equal = line.indexOf('=');
    if (equal > 0) env[line.slice(0, equal)] = line.slice(equal + 1);
  }
  return env;
}

function buildShell(arch = 'x64', test = false) {
  if (process.platform !== 'win32') throw new Error('The Store shell extension must be built on Windows.');
  if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported shell architecture: ${arch}`);
  if (test && arch !== process.arch) throw new Error('Native smoke tests must run on the build host architecture.');
  const env = toolchain(arch);
  const output = path.join(root, '_cache/shell', arch);
  fs.mkdirSync(output, { recursive: true });
  const res = path.join(output, 'PosemarkShell.res');
  run('rc.exe', ['/nologo', '/c65001', `/fo${res}`, 'PosemarkShell.rc'], { env });
  const flags = ['/nologo', '/std:c++17', '/EHsc', '/utf-8', '/O2', '/MT', '/W4', '/WX',
    '/DUNICODE', '/D_UNICODE', '/D_WIN32_WINNT=0x0A00', '/guard:cf', `/Fo${output}\\`];
  run('cl.exe', [...flags, '/LD', 'PosemarkShell.cpp', res, `/Fe${path.join(output, 'PosemarkShell.dll')}`,
    '/link', '/DEF:PosemarkShell.def', '/DYNAMICBASE', '/NXCOMPAT', '/guard:cf',
    'shell32.lib', 'shlwapi.lib', 'ole32.lib', 'uuid.lib', 'user32.lib'], { env });
  if (test) {
    const exe = path.join(output, 'shell-smoke.exe');
    run('cl.exe', [...flags, path.join(root, 'test/shell-smoke.cpp'), `/Fe${exe}`,
      '/link', '/DYNAMICBASE', '/NXCOMPAT', 'shell32.lib', 'shlwapi.lib', 'ole32.lib', 'uuid.lib', 'user32.lib'], { env });
    run(exe, [path.join(output, 'PosemarkShell.dll')], { cwd: root, env });
  }
  return path.join(output, 'PosemarkShell.dll');
}

module.exports = { buildShell };
if (require.main === module) {
  try { buildShell(process.argv.includes('--arm64') ? 'arm64' : 'x64', process.argv.includes('--test')); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
