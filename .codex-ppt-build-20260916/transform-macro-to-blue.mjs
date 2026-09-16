import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const [sourcePath, templatePath, candidatePath] = process.argv.slice(2);
if (![sourcePath, templatePath, candidatePath].every(Boolean)) {
  throw new Error(
    'Usage: transform-macro-to-blue.mjs <source.pptx> <template.pptx> <candidate.pptx>'
  );
}

const EMU_PER_PX = 9525;
const toEmu = (px) => String(Math.round(px * EMU_PER_PX));
const sourceZip = await JSZip.loadAsync(await fs.readFile(sourcePath));
const templateZip = await JSZip.loadAsync(await fs.readFile(templatePath));

const templateAssets = [
  { source: 'ppt/media/image3.png', target: 'ppt/media/blue-template-arc.png' },
  { source: 'ppt/media/image4.jpeg', target: 'ppt/media/blue-template-logo.jpeg' },
];
for (const asset of templateAssets) {
  const source = templateZip.file(asset.source);
  if (!source) throw new Error(`Missing template asset: ${asset.source}`);
  sourceZip.file(asset.target, await source.async('nodebuffer'));
}

const colorMap = new Map([
  ['D20A10', '0070C0'], // primary red -> reference primary blue
  ['8F1F27', '0070C0'],
  ['AF1F25', '007DC2'],
  ['6E1A1E', '1C4274'],
  ['B28247', '54B0E0'], // warm secondary -> reference mid blue
  ['D8C9AE', 'AED5EB'], // warm pale fill -> reference pale blue
  ['E4D2AC', 'FFFFFF'], // pale type on dark-colored components stays legible
  ['F6EFE4', 'F4FAFE'],
  ['FAEDEE', 'EAF6FC'],
  ['2E2E2E', '1F2933'], // neutral text -> reference navy
  ['777777', '595959'],
  ['575757', '383535'],
]);

function remapColors(xml) {
  let updated = xml;
  for (const [from, to] of colorMap) {
    updated = updated.replace(new RegExp(`(val=")${from}(")`, 'gi'), `$1${to}$2`);
  }
  return updated;
}

function nextShapeId(xml) {
  return (
    [...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].reduce(
      (max, match) => Math.max(max, Number(match[1])),
      0
    ) + 1
  );
}

function nextRelationshipId(xml) {
  return (
    [...xml.matchAll(/\bId="rId(\d+)"/g)].reduce(
      (max, match) => Math.max(max, Number(match[1])),
      0
    ) + 1
  );
}

function imageShape({ id, name, relationshipId, x, y, width, height }) {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${toEmu(x)}" y="${toEmu(y)}"/><a:ext cx="${toEmu(width)}" cy="${toEmu(height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr></p:pic>`;
}

function addRelationship(xml, id, target) {
  const relationship = `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`;
  if (!xml.includes('</Relationships>')) throw new Error('Invalid slide relationship XML');
  return xml.replace('</Relationships>', `${relationship}</Relationships>`);
}

function ensureContentType(xml, extension, contentType) {
  const pattern = new RegExp(`<Default\\s+Extension="${extension}"\\s+ContentType="[^"]+"\\s*/>`);
  if (pattern.test(xml)) return xml;
  return xml.replace(
    '</Types>',
    `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`
  );
}

const contentTypesFile = sourceZip.file('[Content_Types].xml');
if (!contentTypesFile) throw new Error('Missing [Content_Types].xml');
let contentTypes = await contentTypesFile.async('string');
contentTypes = ensureContentType(contentTypes, 'png', 'image/png');
contentTypes = ensureContentType(contentTypes, 'jpeg', 'image/jpeg');
sourceZip.file('[Content_Types].xml', contentTypes);

const slidePaths = Object.keys(sourceZip.files)
  .filter((filePath) => /^ppt\/slides\/slide\d+\.xml$/.test(filePath))
  .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)[1]) - Number(b.match(/slide(\d+)\.xml/)[1]));

for (const slidePath of slidePaths) {
  let slideXml = remapColors(await sourceZip.file(slidePath).async('string'));
  if (!slideXml.includes('xmlns:r=')) {
    slideXml = slideXml.replace(
      /<p:sld\b/,
      '<p:sld xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    );
  }
  const slideNumber = Number(slidePath.match(/slide(\d+)\.xml/)[1]);
  const relPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
  const relFile = sourceZip.file(relPath);
  let relXml = relFile
    ? await relFile.async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const darkSectionSlide = [4, 10, 28].includes(slideNumber);
  let backgroundElements = '';
  if (!darkSectionSlide) {
    const arcRelationshipId = nextRelationshipId(relXml);
    const logoRelationshipId = arcRelationshipId + 1;
    relXml = addRelationship(relXml, arcRelationshipId, '../media/blue-template-arc.png');
    relXml = addRelationship(relXml, logoRelationshipId, '../media/blue-template-logo.jpeg');
    const firstShapeId = nextShapeId(slideXml);
    backgroundElements = [
      imageShape({
        id: firstShapeId,
        name: '参考模板浅蓝背景弧线',
        relationshipId: arcRelationshipId,
        x: 468,
        y: 0,
        width: 330,
        height: 52,
      }),
      imageShape({
        id: firstShapeId + 1,
        name: '参考模板右上角标识',
        relationshipId: logoRelationshipId,
        x: 1018,
        y: 22,
        width: 182,
        height: 41,
      }),
    ].join('');
  }
  sourceZip.file(relPath, relXml);

  if (!slideXml.includes('</p:spTree>')) {
    throw new Error(`Cannot locate shape tree closing tag in ${slidePath}`);
  }
  // These source-template assets are placed above full-slide fills so the
  // recurring template remains visible. Dark section dividers keep their
  // original full-page composition after it has been recolored to template blue.
  slideXml = slideXml.replace('</p:spTree>', `${backgroundElements}</p:spTree>`);
  sourceZip.file(slidePath, slideXml);
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
console.log(JSON.stringify({ candidatePath, slideCount: slidePaths.length }));
