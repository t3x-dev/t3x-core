// T3X editorial artwork for built-in starters. Author resources always take precedence.
// These illustrations are not schema content, validation evidence, or execution output.
export function builtinSchemaCover(canonicalName: string, sourceProjectId?: string | null) {
  if (sourceProjectId) return undefined;
  switch (canonicalName) {
    case 't3x/compose-services':
      return '/schema-covers/compose.jpg';
    case 't3x/care-checklist':
      return '/schema-covers/care.jpg';
    case 't3x/product-brief':
      return '/schema-covers/product.jpg';
    default:
      return undefined;
  }
}
