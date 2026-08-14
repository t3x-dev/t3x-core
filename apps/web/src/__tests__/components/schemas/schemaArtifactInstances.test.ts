import { describe, expect, it } from 'vitest';
import { findSchemaArtifactInstance } from '@/data/schemaArtifactInstances';

const OFFICIAL_MODULES = [
  't3x/prd-system-architecture',
  't3x/prd-technology-stack',
  't3x/prd-frontend-design',
  't3x/prd-backend-design',
  't3x/prd-database-design',
  't3x/prd-api-contract',
  't3x/prd-security-privacy',
  't3x/prd-quality-strategy',
  't3x/prd-rollout-operations',
  't3x/skill-tool-policy',
  't3x/skill-safety-gates',
  't3x/skill-delivery-targets',
  't3x/skill-runtime-environment',
  't3x/skill-evaluation-suite',
  't3x/prompt-few-shot-examples',
  't3x/prompt-guardrails',
  't3x/prompt-observability',
  't3x/prompt-context-policy',
  't3x/prompt-evaluation-suite',
  't3x/esphome-sensors',
  't3x/esphome-actuators',
  't3x/esphome-automations',
  't3x/esphome-hardware-buses',
  't3x/esphome-network-services',
  't3x/esphome-power-management',
] as const;

describe('schemaArtifactInstances', () => {
  it('provides a renderable example and curated guidance for every official Module', () => {
    expect(OFFICIAL_MODULES).toHaveLength(25);

    for (const canonicalName of OFFICIAL_MODULES) {
      const instance = findSchemaArtifactInstance({
        canonicalName,
        title: canonicalName.split('/').at(-1) ?? canonicalName,
        version: '1.0.0',
      });

      expect(instance, canonicalName).toBeDefined();
      expect(Object.keys(instance?.value ?? {}), canonicalName).toHaveLength(1);
      expect(instance?.useCases, canonicalName).toHaveLength(3);
      expect(new Set(instance?.useCases.map((useCase) => useCase.title)).size, canonicalName).toBe(
        3
      );
      expect(
        instance?.useCases.every(
          (useCase) =>
            useCase.title.trim().length > 0 &&
            useCase.title.length <= 36 &&
            useCase.description.trim().length > 0 &&
            useCase.description.length <= 100
        ),
        canonicalName
      ).toBe(true);
    }
  });
});
