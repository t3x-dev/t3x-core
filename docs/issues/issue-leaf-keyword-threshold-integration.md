# [Feature]: Integrate keyword_threshold from Leaf config into NodeModal

## Scope / Module

- [x] webui

## What

When a Commit node has an associated Leaf, NodeModal should read `keyword_threshold` from the Leaf's config instead of using a fixed default value. This enables per-Leaf keyword sensitivity settings to affect the commit creation flow.

Currently, `keywordsThreshold` in NodeModal is hardcoded to `DEFAULT_KEYWORD_THRESHOLD` (0.6) after the Keywords slider was removed from the Commit detail view.

## Why now

The product design changed - keyword threshold configuration should only exist in the Leaf detail page, not in the Commit modal. However, NodeModal still needs to use this value for:

1. `extractPhrasesFromText()` - controls minimum word length for keyword extraction
2. `anchorThreshold` prop - controls anchor candidate visibility in `SelectableTextBlock`

Without this integration, all commits use the same default threshold regardless of their associated Leaf's configuration.

## Suggested approach

### 1. Add Leaf config loading to NodeModal

**File**: `apps/web/src/components/canvas/NodeModal.tsx`

```typescript
// Add state
const [leafConfig, setLeafConfig] = useState<api.LeafConfig | null>(null);

// Load Leaf config when there's an associated Leaf
useEffect(() => {
  const leaves = node?.data?.leaves;
  if (!leaves || leaves.length === 0) {
    setLeafConfig(null);
    return;
  }

  const leafId = leaves[0].id;

  const loadLeafConfig = async () => {
    try {
      const leaf = await api.getLeaf(leafId);
      setLeafConfig(leaf.config);
    } catch (err) {
      console.error('Failed to load leaf config:', err);
      setLeafConfig(null);
    }
  };

  loadLeafConfig();
}, [node?.data?.leaves]);

// Replace the current constant with:
const keywordsThreshold = typeof leafConfig?.keyword_threshold === 'number'
  ? leafConfig.keyword_threshold
  : DEFAULT_KEYWORD_THRESHOLD;
```

### 2. Current state reference

The constant to replace is at line ~760:
```typescript
// Keywords threshold - fixed default value for now
// TODO: Read from Leaf config when Leaf feature is fully implemented
const keywordsThreshold = DEFAULT_KEYWORD_THRESHOLD;
```

### 3. Related files

| File | Purpose |
|------|---------|
| `apps/web/src/components/canvas/NodeModal.tsx` | Main integration point |
| `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx` | Leaf config UI (already done) |
| `apps/web/src/lib/api.ts` | `getLeaf()` API |
| `apps/web/src/components/canvas/SelectableTextBlock.tsx` | Uses `anchorThreshold` |

### 4. Type reference

```typescript
// LeafConfig (from api.ts)
interface LeafConfig {
  keyword_threshold?: number;  // 0-1, default 0.6
  [key: string]: unknown;
}

// DEFAULT_KEYWORD_THRESHOLD = 0.6
```

## Success criteria / Definition of Done

- [ ] NodeModal reads `keyword_threshold` from associated Leaf's config
- [ ] Falls back to 0.6 when no Leaf is associated or config is undefined
- [ ] No UI slider in NodeModal (config only exists in Leaf detail page)
- [ ] `extractPhrasesFromText` receives correct threshold from Leaf
- [ ] `anchorThreshold` prop receives correct threshold from Leaf
- [ ] Test: Commit with Leaf uses Leaf's threshold
- [ ] Test: Commit without Leaf uses default (0.6)
- [ ] Test: API error gracefully falls back to default

## Potential impact

- [ ] May touch schema/contract
- [ ] May affect deterministic core
- [x] Needs CLI/WebUI changes

## Confirmation

- [x] I checked existing issues/roadmap

---

## Notes

- The Leaf detail page already has the Keywords slider implemented and persisting to `config.keyword_threshold`
- Higher threshold = fewer but longer keywords (minWordLength formula: `3 + threshold * 3` = 3-6 chars)
- This is a dependency for Leaf WebUI to be fully functional
