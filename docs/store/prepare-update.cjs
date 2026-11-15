'use strict';
// Prepare upload files from the reviewed listing text and original app captures.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const version = require('../../package.json').version;
const output = path.join(root, 'release', 'store-' + version);
const raw = path.join(root, 'website/tools/out');
const languages = [
  { name: 'zh-CN', suffix: 'zh', sections: {
    'description': '说明', 'short-description': '简短说明', 'whats-new': '此版本中的新增功能',
    'features': '产品功能（20 条，每条一个输入框）', 'search-terms': '搜索词（7 个，每个 ≤ 30 字符）',
  } },
  { name: 'en-US', suffix: 'en', sections: {
    'description': 'Description', 'short-description': 'Short description', 'whats-new': "What's new in this version",
    'features': 'Product features (20, one per field)', 'search-terms': 'Search terms (7, ≤ 30 chars each)',
  } },
];
const screenshots = [
  ['editor', '边写边预览，文件夹和文稿在左侧文件树中清晰排列', 'Write with live preview and keep folders and notes within reach in the file tree'],
  ['website', '选择章节、调整装帧并实时预览，导出可离线阅读的网站', 'Arrange chapters and preview an offline reading website; export panel and reader currently use Chinese'],
  ['math', '数学公式和 Mermaid 图表在文档中就地呈现', 'Math formulas and Mermaid diagrams rendered in the document'],
  ['source', '随时切换到带语法高亮的 Markdown 源代码模式', 'Switch to Markdown source mode with syntax highlighting'],
  ['dark', '深色主题配合清晰的文件树图标与折叠工具', 'Dark theme with clear file-tree icons and folder controls'],
  ['wechat', '公众号排版设置与实时预览，复制时保留内联样式', 'Tune WeChat formatting with a live preview and copy using inline styles'],
  ['export', '调整 HTML、PDF 和长图导出的格式与输出设置', 'Configure HTML, PDF and image export options'],
];
function field(markdown, heading) {
  const section = markdown.split('\n## ' + heading + '\n')[1]?.split('\n## ')[0];
  const value = section?.match(/```\n([\s\S]*?)\n```/)?.[1];
  if (!value) throw Error('Missing listing field: ' + heading);
  return value;
}
const manifest = { version, languages: [] };
// Validate every input before producing the upload files.
for (const language of languages) {
  const markdown = fs.readFileSync(path.join(__dirname, 'listing.' + language.name + '.md'), 'utf8').replace(/\r\n/g, '\n');
  const fields = Object.fromEntries(Object.entries(language.sections).map(([key, heading]) => [key, field(markdown, heading)]));
  for (const [key, limit] of [['description', 10000], ['short-description', 1000], ['whats-new', 1500]]) {
    if (fields[key].length > limit) throw Error(language.name + ' ' + key + ' exceeds ' + limit);
  }
  const features = fields.features.split('\n');
  const terms = fields['search-terms'].split('\n');
  if (features.length > 20 || features.some(value => value.length > 200)) throw Error('Invalid features: ' + language.name);
  if (terms.length > 7 || terms.some(value => value.length > 30)) throw Error('Invalid search terms: ' + language.name);
  const captures = screenshots.map(([name, zh, en], index) => {
    const source = path.join(raw, name + '-' + language.suffix + '.png');
    const bytes = fs.readFileSync(source);
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Not a PNG: ' + source);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width < 1366 || height < 768 || width > 3840 || height > 2160 || bytes.length > 50 * 1024 * 1024) throw Error('Invalid screenshot dimensions: ' + source);
    const caption = language.suffix === 'zh' ? zh : en;
    if (caption.length > 200) throw Error('Caption too long: ' + name);
    return { file: String(index + 1).padStart(2, '0') + '-' + name + '.png', source, width, height, caption };
  });
  manifest.languages.push({ language: language.name, fields, captures });
}
for (const language of manifest.languages) {
  const folder = path.join(output, language.language);
  fs.mkdirSync(folder, { recursive: true });
  for (const [key, value] of Object.entries(language.fields)) fs.writeFileSync(path.join(folder, key + '.txt'), value, 'utf8');
  for (const capture of language.captures) fs.copyFileSync(capture.source, path.join(folder, capture.file));
  fs.writeFileSync(path.join(folder, 'captions.txt'), language.captures.map(c => c.file + '\n' + c.caption).join('\n\n'), 'utf8');
}
const summary = manifest.languages.map(language => ({
  language: language.language,
  characters: Object.fromEntries(Object.entries(language.fields).map(([key, value]) => [key, value.length])),
  featureCount: language.fields.features.split('\n').length,
  longestFeature: Math.max(...language.fields.features.split('\n').map(value => value.length)),
  captures: language.captures.map(({ source, ...capture }) => capture),
}));
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ version, languages: summary }, null, 2));
console.log(JSON.stringify({ output, languages: summary }, null, 2));
