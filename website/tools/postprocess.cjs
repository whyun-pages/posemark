'use strict';
// Electron script run by shots.mjs: raw captures → web-sized JPEGs, plus the logo, favicons and
// the 1200×630 social card (rendered from og.html).
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const site = path.join(here, '..');
const root = path.join(site, '..');
const assets = path.join(site, 'assets');
const shotsDir = path.join(assets, 'screenshots');
app.setPath('userData', process.env.POSEMARK_SHOT_PROFILE);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  let code = 0;
  try {
    fs.mkdirSync(shotsDir, { recursive: true });
    const raw = path.join(here, 'out');
    const captures = ['zh', 'en'].flatMap(lang => JSON.parse(fs.readFileSync(path.join(raw, `manifest-${lang}.json`), 'utf8')));
    const dimensions = {};
    for (const { file: f } of captures) {
      const img = nativeImage.createFromPath(path.join(raw, f));
      const { width } = img.getSize();
      const web = width > 1600 ? img.resize({ width: 1600, quality: 'best' }) : img;
      fs.writeFileSync(path.join(shotsDir, f.replace(/\.png$/, '.jpg')), web.toJPEG(86));
      const size = web.getSize();
      dimensions[f.replace(/\.png$/, '.jpg')] = size;
      console.log(`${f.replace(/\.png$/, '.jpg')} ${size.width}x${size.height}`);
    }

    fs.copyFileSync(path.join(root, 'build/icon.svg'), path.join(assets, 'logo.svg'));
    const icon = nativeImage.createFromPath(path.join(root, 'build/icon.png'));
    fs.writeFileSync(path.join(assets, 'apple-touch-icon.png'), icon.resize({ width: 180, quality: 'best' }).toPNG());
    fs.writeFileSync(path.join(assets, 'favicon-32.png'), icon.resize({ width: 32, quality: 'best' }).toPNG());

    // social card: lay the page out at 1200×630 CSS px and scale the capture back to that size
    const win = new BrowserWindow({ show: false, width: 1200, height: 630, useContentSize: true });
    await win.loadFile(path.join(here, 'og.html'));
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 300)))');
    await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    await new Promise(resolve => setTimeout(resolve, 200));
    const card = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    fs.writeFileSync(path.join(assets, 'og.png'), card.resize({ width: 1200, height: 630, quality: 'best' }).toPNG());
    win.destroy();
    fs.writeFileSync(path.join(raw, 'dimensions.json'), JSON.stringify(dimensions, null, 2));
    console.log(`site assets: ${captures.length} screenshots, logo, favicons, og.png`);
  } catch (err) {
    console.error(err);
    code = 1;
  }
  app.exit(code);
});
