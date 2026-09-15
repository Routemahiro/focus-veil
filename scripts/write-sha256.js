const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const version = require('../package.json').version;
const distDirectory = path.join(__dirname, '..', 'dist');
const names = [
  `FocusVeil-Setup-${version}.exe`,
  `FocusVeil-Portable-${version}.exe`
];

const lines = [];

for (const name of names) {
  const filePath = path.join(distDirectory, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing release artifact: ${name}`);
  }

  const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  lines.push(`${hash}  ${name}`);
}

const outputPath = path.join(distDirectory, `FocusVeil-${version}.sha256`);
fs.mkdirSync(distDirectory, { recursive: true });
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
process.stdout.write(`Wrote ${path.basename(outputPath)}\n`);
