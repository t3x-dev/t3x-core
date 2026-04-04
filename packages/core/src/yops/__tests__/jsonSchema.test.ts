import { describe, expect, it } from 'vitest';
import { getYOpsJsonSchema } from '../jsonSchema';

describe('getYOpsJsonSchema', () => {
  const schema = getYOpsJsonSchema() as {
    anyOf?: Array<Record<string, unknown>>;
    oneOf?: Array<Record<string, unknown>>;
  };

  const variants = schema.anyOf ?? schema.oneOf ?? [];

  it('returns a schema with 14 op variants', () => {
    expect(variants.length).toBe(14);
  });

  it('every variant has a description on the op key', () => {
    for (const variant of variants) {
      const props = (variant as any).properties;
      const opKey = Object.keys(props)[0];
      expect(props[opKey].description).toBeDefined();
      expect(typeof props[opKey].description).toBe('string');
      expect(props[opKey].description.length).toBeGreaterThan(10);
    }
  });

  const opNames = [
    'set', 'unset', 'define', 'populate', 'drop', 'rename', 'clone',
    'move', 'nest', 'split', 'fold', 'merge', 'relate', 'unrelate',
  ];

  it('contains all 14 op names', () => {
    const foundOps = variants.map((v: any) => Object.keys(v.properties)[0]);
    for (const name of opNames) {
      expect(foundOps).toContain(name);
    }
  });

  it('set variant has path, value, source, from properties with descriptions', () => {
    const setVariant = variants.find((v: any) => 'set' in v.properties) as any;
    expect(setVariant).toBeDefined();
    const setProps = setVariant.properties.set.properties;
    expect(setProps.path.description).toBeDefined();
    expect(setProps.value.description).toBeDefined();
    expect(setProps.source.description).toBeDefined();
    expect(setProps.from.description).toBeDefined();
  });

  it('define variant has parent, key properties with descriptions', () => {
    const defineVariant = variants.find((v: any) => 'define' in v.properties) as any;
    expect(defineVariant).toBeDefined();
    const defineProps = defineVariant.properties.define.properties;
    expect(defineProps.parent.description).toBeDefined();
    expect(defineProps.key.description).toBeDefined();
  });

  it('populate variant has path, slots, source, from properties with descriptions', () => {
    const populateVariant = variants.find((v: any) => 'populate' in v.properties) as any;
    expect(populateVariant).toBeDefined();
    const populateProps = populateVariant.properties.populate.properties;
    expect(populateProps.path.description).toBeDefined();
    expect(populateProps.slots.description).toBeDefined();
    expect(populateProps.source.description).toBeDefined();
    expect(populateProps.from.description).toBeDefined();
  });

  it('drop variant has path property with description', () => {
    const dropVariant = variants.find((v: any) => 'drop' in v.properties) as any;
    expect(dropVariant).toBeDefined();
    expect(dropVariant.properties.drop.properties.path.description).toBeDefined();
  });

  it('relate variant has from, to, type properties with descriptions', () => {
    const relateVariant = variants.find((v: any) => 'relate' in v.properties) as any;
    expect(relateVariant).toBeDefined();
    const relateProps = relateVariant.properties.relate.properties;
    expect(relateProps.from.description).toBeDefined();
    expect(relateProps.to.description).toBeDefined();
    expect(relateProps.type.description).toBeDefined();
  });
});
