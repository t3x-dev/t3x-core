import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [candidatePath, finalPath] = process.argv.slice(2);
const skillDir =
  '/Users/wangyaxin/.codex/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations';
const workspaceDir = '/Users/wangyaxin/Desktop/wyx/t3x';
const runtimePython =
  '/Users/wangyaxin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
if (!candidatePath || !finalPath)
  throw new Error('Usage: finalize-macro-to-blue.mjs <candidate.pptx> <final.pptx>');
const { finalizePresentation } = await import(
  pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href
);
const stagingDir = '/Users/wangyaxin/Desktop/wyx/t3x/.codex-ppt-build-20260916/finalizer';
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
      '/Users/wangyaxin/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_xeci4ukpfwzj22_3232/temp/drag/近期宏观及资产配置_202609_大类资产四维度版_.pptx',
    referenceSha256: '687c901d2873e542b2b93ce943af5c3126359ccb5702e27ca2341cd5a1295023',
  },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, 'macro-blue.validation.json'),
});
console.log(JSON.stringify(result));
