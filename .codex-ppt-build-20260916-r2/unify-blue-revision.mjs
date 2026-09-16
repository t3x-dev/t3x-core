import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const [sourcePath, candidatePath] = process.argv.slice(2);
if (!sourcePath || !candidatePath) {
  throw new Error('Usage: unify-blue-revision.mjs <source.pptx> <candidate.pptx>');
}

const sourceZip = await JSZip.loadAsync(await fs.readFile(sourcePath));

const approvedBluePalette = new Set([
  'FFFFFF',
  'F4FAFE',
  'EAF6FC',
  'D7ECF7',
  'AED5EB',
  '63AFDA',
  '54B0E0',
  '43A1D5',
  '0094D5',
  '00B0F0',
  '007DC2',
  '0070C0',
  '1C4274',
  '123B5D',
]);

function normalizeHexToBlue(hex) {
  const value = hex.toUpperCase();
  if (approvedBluePalette.has(value)) return value;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturationRange = max - min;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  if (luminance >= 248) return 'FFFFFF';
  if (saturationRange >= 70 && max >= 170) {
    if (luminance >= 185) return '54B0E0';
    if (luminance >= 120) return '43A1D5';
    return '0070C0';
  }
  if (luminance >= 225) return 'F4FAFE';
  if (luminance >= 195) return 'EAF6FC';
  if (luminance >= 150) return 'AED5EB';
  if (luminance >= 95) return '54B0E0';
  if (luminance >= 45) return '1C4274';
  return '123B5D';
}

function replaceSchemeAndPresetColors(xml) {
  return xml
    .replace(/<a:prstClr val="black"\s*\/>/g, '<a:srgbClr val="1C4274"/>')
    .replace(/<a:schemeClr val="accent1"\s*\/>/g, '<a:srgbClr val="0070C0"/>')
    .replace(/<a:schemeClr val="tx1"\s*\/>/g, '<a:srgbClr val="1C4274"/>')
    .replace(
      /<a:schemeClr val="accent1">([\s\S]*?)<\/a:schemeClr>/g,
      '<a:srgbClr val="0070C0">$1</a:srgbClr>'
    )
    .replace(
      /<a:schemeClr val="tx1">([\s\S]*?)<\/a:schemeClr>/g,
      '<a:srgbClr val="1C4274">$1</a:srgbClr>'
    );
}

function normalizeExplicitColors(xml) {
  return xml.replace(
    /(<a:srgbClr\b[^>]*\bval=")([0-9A-Fa-f]{6})(")/g,
    (match, prefix, hex, suffix) => `${prefix}${normalizeHexToBlue(hex)}${suffix}`
  );
}

const duotoneEffect = '<a:duotone><a:srgbClr val="1C4274"/><a:srgbClr val="EAF6FC"/></a:duotone>';

function duotoneImages(xml) {
  return xml.replace(
    /<a:blip\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:blip>)/g,
    (match, attributes, body) => {
      const existingBody = body ?? '';
      const withoutExistingDuotone = existingBody.replace(/<a:duotone>[\s\S]*?<\/a:duotone>/g, '');
      return `<a:blip${attributes}>${duotoneEffect}${withoutExistingDuotone}</a:blip>`;
    }
  );
}

function recolorLightSectionSlide(xml, slideNumber) {
  const maps = {
    4: new Map([
      ['1F2933', 'EAF6FC'],
      ['FFFFFF', '1C4274'],
      ['3A3A3A', 'AED5EB'],
    ]),
    10: new Map([
      ['0070C0', 'EAF6FC'],
      ['FFFFFF', '1C4274'],
    ]),
    28: new Map([
      ['1F2933', 'EAF6FC'],
      ['FFFFFF', '1C4274'],
      ['C8C8C8', '54B0E0'],
    ]),
  };
  let updated = xml;
  for (const [from, to] of maps[slideNumber]) {
    updated = updated.replace(
      new RegExp(`(<a:srgbClr\\b[^>]*\\bval=")${from}(")`, 'gi'),
      `$1${to}$2`
    );
  }
  return replaceSchemeAndPresetColors(updated);
}

for (let slideNumber = 1; slideNumber <= 28; slideNumber += 1) {
  const slidePath = `ppt/slides/slide${slideNumber}.xml`;
  const file = sourceZip.file(slidePath);
  if (!file) throw new Error(`Missing ${slidePath}`);
  let xml = await file.async('string');

  if ([4, 10, 28].includes(slideNumber)) {
    xml = recolorLightSectionSlide(xml, slideNumber);
  }

  if (slideNumber >= 13 && slideNumber <= 21) {
    xml = normalizeExplicitColors(xml);
    xml = replaceSchemeAndPresetColors(xml);
    xml = duotoneImages(xml);
  }

  sourceZip.file(slidePath, xml);
}

await fs.mkdir(path.dirname(candidatePath), { recursive: true });
await fs.writeFile(
  candidatePath,
  await sourceZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
);
console.log(JSON.stringify({ candidatePath, changedSlides: [4, 10, 28, '13-21'] }));
