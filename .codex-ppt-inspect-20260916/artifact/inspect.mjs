import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';

const source = process.argv[2];
const outputDir = process.argv[3];
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const snapshot = await presentation.inspect({
  kind: 'slide,textbox,shape,image,table,chart,notes,layout',
  maxChars: 100000,
});
console.log(snapshot.ndjson);
if (outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  for (let index = 0; index < presentation.slides.items.length; index += 1) {
    const image = await presentation.export({
      slide: presentation.slides.items[index],
      format: 'png',
      scale: 1,
    });
    await fs.writeFile(
      path.join(outputDir, `slide-${String(index + 1).padStart(2, '0')}.png`),
      new Uint8Array(await image.arrayBuffer())
    );
  }
}
