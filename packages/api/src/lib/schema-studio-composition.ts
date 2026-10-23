import type { YSchemaModuleArtifactV2 } from '@t3x-dev/yschema';

export type StudioComposition = Record<string, string>;
export type StudioCompositionConflict = {
  path: string;
  candidates: string[];
  selected: string | null;
  definitions: Record<string, unknown>;
};

/** Explicit ownership decisions apply to immutable source projections, never to source bytes. */
export function resolveStudioComposition(
  entries: Array<{
    id: string;
    whole: boolean;
    module: YSchemaModuleArtifactV2;
    metadata?: Record<string, unknown>;
  }>,
  choices: StudioComposition = {}
) {
  const identities = entries.map(({ module }) => `${module.canonicalName}@${module.version}`);
  if (new Set(identities).size !== identities.length)
    throw new Error(
      'Two sources have the same canonical name and version. Choose one exact source.'
    );
  const modules = structuredClone(entries.map((entry) => entry.module));
  const conflicts: StudioCompositionConflict[] = [];
  const used = new Set<string>();
  function choose(path: string, indexes: number[]) {
    const candidates = indexes.map((index) => entries[index]!.id);
    const selected = choices[path];
    if (selected && !candidates.includes(selected))
      throw new Error(`The selected owner of ${path} is no longer in this composition.`);
    used.add(path);
    const definitions = Object.fromEntries(
      indexes.map((index) => {
        const entry = entries[index]!;
        const slash = path.indexOf('/'),
          section = path.slice(0, slash),
          key = path.slice(slash + 1);
        const value =
          path === '$metadata'
            ? entry.metadata
            : section === 'rules'
              ? entry.module.contribution.rules?.find((rule) => rule.id === key)
              : section === 'nodes'
                ? entry.module.contribution.nodes?.[key]
                : entry.module.contribution.relationTypes?.[key];
        return [entry.id, value];
      })
    );
    conflicts.push({ path, candidates, selected: selected ?? null, definitions });
    return selected ? entries.findIndex((entry) => entry.id === selected) : undefined;
  }
  const whole = entries.flatMap((entry, index) => (entry.whole ? [index] : []));
  const metadataIndex = whole.length > 1 ? choose('$metadata', whole) : whole[0];
  for (const section of ['nodes', 'relationTypes', 'rules'] as const) {
    const owners = new Map<string, number[]>();
    entries.forEach(({ module }, index) => {
      const keys =
        section === 'rules'
          ? (module.contribution.rules ?? []).map((rule) => rule.id)
          : Object.keys(module.contribution[section] ?? {});
      for (const key of keys) owners.set(key, [...(owners.get(key) ?? []), index]);
    });
    for (const [key, indexes] of owners) {
      if (indexes.length < 2) continue;
      const selected = choose(`${section}/${key}`, indexes);
      if (selected === undefined) continue;
      for (const index of indexes)
        if (index !== selected) {
          if (section === 'rules')
            modules[index]!.contribution.rules = modules[index]!.contribution.rules?.filter(
              (rule) => rule.id !== key
            );
          else delete modules[index]!.contribution[section]?.[key];
        }
    }
  }
  for (const path of Object.keys(choices))
    if (!used.has(path))
      throw new Error(
        `Composition decision ${path} no longer applies. Review the source selection again.`
      );
  return { modules, conflicts, metadataIndex: metadataIndex ?? whole[0] };
}
