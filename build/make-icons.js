'use strict';
// Rasterise build/icon.svg into every icon the packagers need:
//   build/icon.png (1024, macOS / Linux, electron-builder converts it to .icns),
//   build/icon.ico (16–256, Windows exe + NSIS), build/appx/*.png (MSIX / Microsoft Store),
//   docs/store/store-logo-300.png (Partner Center tile icon).
// Run with: pnpm icons   (= electron build/make-icons.js)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');

// [file, canvas width, canvas height, icon size] — the icon is centred on a transparent canvas
const SCALES = [100, 125, 150, 200, 400];
const appx = [];
const scaled = (name, w, h, icon) => {
  for (const s of SCALES) appx.push([`${name}.scale-${s}.png`, Math.round((w * s) / 100), Math.round((h * s) / 100), Math.round((icon * s) / 100)]);
  appx.push([`${name}.png`, w, h, icon]);
};
scaled('StoreLogo', 50, 50, 50);
scaled('Square44x44Logo', 44, 44, 44);
scaled('Square150x150Logo', 150, 150, 110);
scaled('Wide310x150Logo', 310, 150, 110);
scaled('SmallTile', 71, 71, 56);
scaled('LargeTile', 310, 310, 220);
for (const t of [16, 24, 32, 48, 256]) {
  appx.push([`Square44x44Logo.targetsize-${t}.png`, t, t, t]);
  appx.push([`Square44x44Logo.targetsize-${t}_altform-unplated.png`, t, t, t]);
}
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// PNG frames packed into an .ico (Vista+ reads PNG entries at every size)
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  let code = 0;
  const win = new BrowserWindow({ show: false, width: 200, height: 200 });
  try {
    await win.loadURL('data:text/html,<!doctype html><meta charset=utf-8><body></body>');
    // drawn on a canvas so the output size never depends on the display's scale factor
    const render = async (w, h, icon) => {
      const url = await win.webContents.executeJavaScript(`(async () => {
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
        await img.decode();
        const c = document.createElement('canvas');
        c.width = ${w}; c.height = ${h};
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, ${(w - icon) / 2}, ${(h - icon) / 2}, ${icon}, ${icon});
        return c.toDataURL('image/png');
      })()`);
      return Buffer.from(url.split(',')[1], 'base64');
    };
    fs.writeFileSync(path.join(__dirname, 'icon.png'), await render(1024, 1024, 1024));
    const frames = [];
    for (const size of ICO_SIZES) frames.push({ size, data: await render(size, size, size) });
    fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico(frames));
    fs.mkdirSync(path.join(__dirname, 'appx'), { recursive: true });
    for (const [name, w, h, icon] of appx) fs.writeFileSync(path.join(__dirname, 'appx', name), await render(w, h, icon));
    fs.mkdirSync(path.join(root, 'docs/store'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/store/store-logo-300.png'), await render(300, 300, 300));
    console.log(`icons: icon.png, icon.ico (${ICO_SIZES.join('/')}), ${appx.length} appx images, store-logo-300.png`);
  } catch (err) {
    console.error(err);
    code = 1;
  }
  win.destroy();
  app.exit(code);
});
