import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DOMParser } from '@xmldom/xmldom';

const require = createRequire(import.meta.url);
const { patchManifest } = require('../build/appx/patch-manifest.cjs');
const foundation = 'http://schemas.microsoft.com/appx/manifest/foundation/windows10';
const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');

test('AppX namespace hook preserves package identity and existing ignorable namespaces; is idempotent', () => {
  const input = `<Package xmlns="${foundation}" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" IgnorableNamespaces="uap"><Identity Name="whyun.Posemark" Version="0.3.0.0"/><Applications/></Package>`;
  const output = patchManifest(input);
  assert.equal(patchManifest(output), output);
  const root = parse(output).documentElement;
  assert.equal(root.getAttribute('IgnorableNamespaces'), 'uap com desktop4 desktop5');
  assert.equal(root.lookupNamespaceURI('desktop5'), 'http://schemas.microsoft.com/appx/manifest/desktop/windows10/5');
  assert.equal(root.getElementsByTagName('Identity')[0].getAttribute('Name'), 'whyun.Posemark');
});

test('AppX namespace hook rejects malformed XML, wrong root and conflicting namespace bindings', () => {
  assert.throws(() => patchManifest('<Package><Identity></Package>'));
  assert.throws(() => patchManifest('<NotPackage/>'), /Package root/);
  assert.throws(() => patchManifest(`<Package xmlns="${foundation}" xmlns:com="urn:wrong"/>`), /Conflicting/);
});

test('Store extensions register every context against a packaged COM class and keep execution alias', () => {
  const extensions = readFileSync(new URL('../build/appx/extensions.xml', import.meta.url), 'utf8');
  const root = parse(patchManifest(`<Package xmlns="${foundation}"><Applications><Application><Extensions>${extensions}</Extensions></Application></Applications></Package>`)).documentElement;
  const classes = [...root.getElementsByTagNameNS('http://schemas.microsoft.com/appx/manifest/com/windows10', 'Class')];
  const items = [...root.getElementsByTagNameNS('http://schemas.microsoft.com/appx/manifest/desktop/windows10/5', 'ItemType')];
  assert.equal(classes.length, 2);
  assert.deepEqual(items.map((item) => item.getAttribute('Type')), ['*', 'Directory', 'Directory\\Background']);
  for (const item of items) {
    const clsid = item.getElementsByTagNameNS('http://schemas.microsoft.com/appx/manifest/desktop/windows10/5', 'Verb')[0].getAttribute('Clsid');
    assert.ok(classes.some((entry) => entry.getAttribute('Id') === clsid));
  }
  for (const entry of classes) {
    assert.equal(entry.getAttribute('Path'), 'app\\shell\\PosemarkShell.dll');
    assert.equal(entry.getAttribute('ThreadingModel'), 'STA');
  }
  assert.equal(root.getElementsByTagNameNS('http://schemas.microsoft.com/appx/manifest/uap/windows10/5', 'ExecutionAlias')[0].getAttribute('Alias'), 'posemark.exe');
});
