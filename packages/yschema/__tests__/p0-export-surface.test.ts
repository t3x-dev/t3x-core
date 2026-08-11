import { describe, expect, it } from 'vitest';
import * as yschema from '../src/index';

describe('YSchema public export surface', () => {
  it('exposes only the reviewed runtime API', () => {
    expect(Object.keys(yschema).sort()).toEqual([
      'builtInEsphomeDeviceCoreArtifact',
      'builtInEsphomeDeviceModules',
      'builtInPrdCoreArtifact',
      'builtInPrdModules',
      'builtInPromptCoreArtifact',
      'builtInPromptModules',
      'builtInSkillCoreArtifact',
      'builtInSkillModules',
      'builtInYSchemaCores',
      'builtInYSchemaModules',
      'canonicalizeCompositionValue',
      'compileYSchemaComposition',
      'defaultEsphomeDeviceCompositionModuleOrder',
      'defaultPrdCompositionModuleOrder',
      'defaultPromptCompositionModuleOrder',
      'defaultSkillCompositionModuleOrder',
      'diffValidationResults',
      'generatePromptContract',
      'normalizeYSchemaObject',
      'parseYSchema',
      'renderComposedYSchemaMarkdown',
      'renderYSchemaMarkdown',
      'sha256CompositionValue',
      't3xPrdP0Fixtures',
      't3xPromptP0Fixtures',
      't3xSkillP0Fixtures',
      'validateTree',
    ]);
  });
});
