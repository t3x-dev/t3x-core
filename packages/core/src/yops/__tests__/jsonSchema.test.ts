import { describe, expect, it } from 'vitest';
import { getYOpsJsonSchema } from '../jsonSchema';

describe('getYOpsJsonSchema', () => {
  const schema = getYOpsJsonSchema() as {
    anyOf?: Array<Record<string, unknown>>;
    oneOf?: Array<Record<string, unknown>>;
  };

  const variants = schema.anyOf ?? schema.oneOf ?? [];

  it('returns a schema with 13 op variants', () => {
    expect(variants.length).toBe(13);
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
    'set', 'unset', 'add', 'drop', 'rename', 'clone',
    'move', 'nest', 'split', 'fold', 'merge', 'relate', 'unrelate',
  ];

  it('contains all 13 op names', () => {
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

  it('add variant has parent, node, source, from properties with descriptions', () => {
    const addVariant = variants.find((v: any) => 'add' in v.properties) as any;
    expect(addVariant).toBeDefined();
    const addProps = addVariant.properties.add.properties;
    expect(addProps.parent.description).toBeDefined();
    expect(addProps.node.description).toBeDefined();
    expect(addProps.source.description).toBeDefined();
    expect(addProps.from.description).toBeDefined();
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
