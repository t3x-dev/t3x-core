import { PRESETS } from './dist/extractors/extractionStyleConfig.js';
import { buildFrameExtractionPrompt } from './dist/extractors/frameExtractionPrompt.js';

const turns = [{ role: 'user', content: 'I want to open a coffee shop' }];

console.log('=== FIRST EXTRACTION (no snapshot) ===');
const first = buildFrameExtractionPrompt({ turns }, PRESETS.balanced);
const lines = first.systemPrompt.split('\n');
const frameCountLine = lines.find((l) => l.startsWith('## Frame Count:'));
console.log('Frame Count line:', frameCountLine);
console.log('');

console.log('=== DELTA MODE (with snapshot) ===');
const delta = buildFrameExtractionPrompt(
  {
    turns,
    snapshot: { frames: [], relations: [] },
  },
  PRESETS.balanced
);
const lines2 = delta.systemPrompt.split('\n');
const frameCountLine2 = lines2.find((l) => l.startsWith('## Frame Count:'));
console.log('Frame Count line:', frameCountLine2);
