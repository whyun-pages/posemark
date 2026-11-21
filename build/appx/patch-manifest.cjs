const fs = require('node:fs/promises');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const namespaces = {
  com: 'http://schemas.microsoft.com/appx/manifest/com/windows10',
  desktop4: 'http://schemas.microsoft.com/appx/manifest/desktop/windows10/4',
  desktop5: 'http://schemas.microsoft.com/appx/manifest/desktop/windows10/5',
};

function patchManifest(xml) {
  const doc = new DOMParser({ onError: (level, message) => {
    if (level !== 'warning') throw new Error(`Invalid AppX manifest: ${message}`);
  } }).parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (root?.localName !== 'Package' || root.namespaceURI !== 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
    throw new Error('Expected an AppX Package root');
  const ignorable = new Set((root.getAttribute('IgnorableNamespaces') || '').split(/\s+/).filter(Boolean));
  for (const [prefix, uri] of Object.entries(namespaces)) {
    const existing = root.getAttribute(`xmlns:${prefix}`);
    if (existing && existing !== uri) throw new Error(`Conflicting AppX namespace: ${prefix}`);
    root.setAttributeNS('http://www.w3.org/2000/xmlns/', `xmlns:${prefix}`, uri);
    ignorable.add(prefix);
  }
  root.setAttribute('IgnorableNamespaces', [...ignorable].join(' '));
  return new XMLSerializer().serializeToString(doc);
}

exports.patchManifest = patchManifest;
exports.default = async (manifestPath) => {
  await fs.writeFile(manifestPath, patchManifest(await fs.readFile(manifestPath, 'utf8')));
};
