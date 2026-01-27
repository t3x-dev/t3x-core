# Migrate Keywords Slider to Leaf Configuration

This document contains issues for migrating the Keywords threshold slider from NodeModal to Leaf detail page.

---

## Issue 1

### Title
```
feat(web): Add ConfigSection with Keywords slider to Leaf detail page
```

### Body
```markdown
## Background

The Keywords threshold slider is currently in `NodeModal.tsx` as local component state (not persisted). We need to migrate this to the Leaf layer so different Leaves can have different keyword sensitivity settings.

## Current Implementation

**File**: `apps/web/src/components/canvas/NodeModal.tsx`
**Lines**: 2928-2945

```tsx
const [keywordsThreshold, setKeywordsThreshold] = useState(0.6);

// Controls minimum word length: 3-6 chars
const minWordLength = Math.floor(3 + keywordsThreshold * 3);
```

## Tasks

- [ ] Add `ConfigSection` component to `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx`
- [ ] Include Keywords slider (range: 0-1, step: 0.05, default: 0.6)
- [ ] Display current value (e.g., "0.60")
- [ ] Call `updateLeaf(leafId, { config: { keyword_threshold: value } })` on change
- [ ] Add debounce to prevent excessive API calls

## Acceptance Criteria

- [ ] Leaf detail page shows Keywords slider in Config section
- [ ] Slider value persists after page refresh
- [ ] New Leaves use default value 0.6 when `keyword_threshold` is undefined

## Related Files

| File | Purpose |
|------|---------|
| `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx` | Main changes |
| `apps/web/src/components/canvas/NodeModal.tsx` | Reference UI |
| `apps/web/src/lib/api.ts` | `updateLeaf` already exists |

## Notes

- No schema changes needed: `LeafConfig` already has `[key: string]: unknown`
- No API changes needed: `config` is JSONB, accepts any fields
```

---

## Issue 2 (Optional)

### Title
```
refactor(web): Read keyword_threshold from Leaf config in NodeModal
```

### Body
```markdown
## Background

After Issue #1 is complete, NodeModal should read `keyword_threshold` from the associated Leaf's config instead of using local state.

## Tasks

- [ ] When NodeModal has an associated Leaf, read `keyword_threshold` from `Leaf.config`
- [ ] Fall back to default value (0.6) when no Leaf is associated
- [ ] Consider removing the slider from NodeModal (or keep as read-only display)

## Acceptance Criteria

- [ ] NodeModal uses Leaf's `keyword_threshold` when available
- [ ] Existing behavior unchanged when no Leaf is associated

## Dependencies

- Requires Issue #1 to be completed first
```

---

## Labels

- `enhancement`
- `web`
- `leaf`
