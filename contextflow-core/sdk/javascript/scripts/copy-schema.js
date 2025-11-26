const fs = require('fs');
const path = require('path');

const sourceCandidates = [
  path.resolve(__dirname, '../../schema/v1.0.json'),
  path.resolve(__dirname, '../../../schema/v1.0.json'),
  path.resolve(__dirname, '../../../../schema/v1.0.json'),
];
const target = path.resolve(__dirname, '../dist/schema/v1.0.json');

function copySchema() {
  const source = sourceCandidates.find(candidate => fs.existsSync(candidate));
  if (!source) {
    throw new Error(`Canonical schema not found. Checked: ${sourceCandidates.join(', ')}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

copySchema();
