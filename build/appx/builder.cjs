const base = require('../../package.json').build;
const { Arch } = require('electron-builder');
const { buildShell } = require('../shell/build.cjs');

// Opt-in only for AppX: ordinary NSIS/zip builds do not need MSVC or the DLL.
module.exports = {
  ...base,
  beforePack: async ({ arch }) => { buildShell(Arch[arch]); },
  appxManifestCreated: './build/appx/patch-manifest.cjs',
  artifactBuildCompleted: './build/appx/verify-package.cjs',
  win: {
    ...base.win,
    extraFiles: [...base.win.extraFiles, {
      from: '_cache/shell/${arch}/PosemarkShell.dll',
      to: 'shell/PosemarkShell.dll',
    }],
  },
  appx: {
    ...base.appx,
    // desktop5:ItemType supports folders/backgrounds starting with 1809.
    minVersion: '10.0.17763.0',
    maxVersionTested: '10.0.26100.0',
  },
};
