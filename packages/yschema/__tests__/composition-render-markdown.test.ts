import { describe, expect, it } from 'vitest';
import {
  builtInPrdCoreArtifact,
  builtInPrdModules,
  compileYSchemaComposition,
  defaultPrdCompositionModuleOrder,
  renderComposedYSchemaMarkdown,
} from '../src';

describe('renderComposedYSchemaMarkdown', () => {
  it('renders Core and Module sections in the Composition render order', async () => {
    const composition = {
      apiVersion: 't3x.dev/yschema-composition/v1' as const,
      id: 'composition:render',
      revision: 1,
      family: 'prd' as const,
      status: 'draft' as const,
      core: { canonicalName: 't3x/prd-core', version: '1.1.0' },
      modules: defaultPrdCompositionModuleOrder.slice(0, 2).map((canonicalName, index) => ({
        canonicalName,
        version: '1.0.0',
        order: (index + 1) * 10,
      })),
    };
    const compiled = await compileYSchemaComposition({
      composition,
      core: builtInPrdCoreArtifact,
      modules: builtInPrdModules,
    });
    const markdown = renderComposedYSchemaMarkdown({
      schema: compiled.schema,
      tree: {
        summary: { problem: 'Large contracts are difficult to navigate.' },
        system_architecture: { context: 'Web and API boundaries.' },
        technology_stack: { frontend: ['Next.js'], backend: ['Hono'] },
      },
      renderPlan: compiled.renderPlan,
      originsByPath: compiled.originsByPath,
      showOrigins: true,
    });

    expect(markdown).toContain('## Core');
    expect(markdown).toContain('## System Architecture');
    expect(markdown).toContain('## Technology Stack');
    expect(markdown).toContain('Origin: `t3x/prd-system-architecture@1.0.0`');
    expect(markdown.indexOf('## System Architecture')).toBeLessThan(
      markdown.indexOf('## Technology Stack')
    );
  });
});
