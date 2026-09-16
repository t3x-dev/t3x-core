import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, finalPath] = process.argv.slice(2);
if (!candidatePath || !finalPath) {
  throw new Error('Usage: finalize-unify-blue.mjs <candidate.pptx> <final.pptx>');
}

const skillDir =
  '/Users/wangyaxin/.codex/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations';
const workspaceDir = '/Users/wangyaxin/Desktop/wyx/t3x';
const runtimePython =
  '/Users/wangyaxin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const stagingDir = '/Users/wangyaxin/Desktop/wyx/t3x/.codex-ppt-build-20260916-r2/finalizer';
const { finalizePresentation } = await import(
  pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href
);

await fs.mkdir(stagingDir, { recursive: true });
await fs.mkdir(path.dirname(finalPath), { recursive: true });

const result = await finalizePresentation({
  explicitTotalSlideCount: 28,
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(
    skillDir,
    'container_tools/inspect_presentation_package_integrity.py'
  ),
  layoutValidatorPath: path.join(
    skillDir,
    'container_tools/inspect_presentation_layout_geometry.py'
  ),
  layoutArgs: [
    '--expected-slide-size-emu',
    '12191365,6858000',
    '--validate-bullet-geometry',
    '--validate-heading-fit',
  ],
  fontPolicy: {
    basis: 'reference',
    families: ['微软雅黑'],
    referencePath:
      '/Users/wangyaxin/Desktop/wyx/t3x/outputs/近期宏观及资产配置_蓝色模板版_20260916.pptx',
    referenceSha256: 'c591779a3549575b7f59dd5b383419c7237f005cc5527ad2b9fb8f1e3e033f4f',
  },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, 'unify-blue.validation.json'),
});
console.log(JSON.stringify(result));
