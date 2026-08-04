function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function sentence(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return /[.!?。！？]$/.test(normalized) ? normalized : `${normalized}.`;
}

/** Build host discovery text from the portable summary and activation boundaries. */
export function generateSkillDescription(tree: Record<string, unknown>): string {
  const manifest =
    tree.manifest && typeof tree.manifest === 'object' && !Array.isArray(tree.manifest)
      ? (tree.manifest as Record<string, unknown>)
      : {};
  const activation =
    tree.activation && typeof tree.activation === 'object' && !Array.isArray(tree.activation)
      ? (tree.activation as Record<string, unknown>)
      : {};
  if (typeof manifest.summary !== 'string' || !manifest.summary.trim()) {
    throw new Error('Skill tree is missing manifest/summary.');
  }

  const parts = [sentence(manifest.summary)];
  const positive = stringArray(activation.should_trigger);
  const negative = stringArray(activation.should_not_trigger);
  if (positive.length > 0) parts.push(`Use when: ${positive.map(sentence).join(' ')}`);
  if (negative.length > 0) parts.push(`Do not use when: ${negative.map(sentence).join(' ')}`);
  return parts.join(' ');
}
