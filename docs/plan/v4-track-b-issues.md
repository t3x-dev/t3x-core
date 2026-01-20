# V4 Track B Issues (API/WebUI)

> **Owner**: Your teammate
> **Depends on**: Phase 0 contracts (completed), Track A queries (partial)
> **Related**: `docs/specification/semantic-layer-architecture.md`, `docs/specification/memory-pin-system-design.md`

---

## Issue B1: API Routes - Leaves CRUD

**Priority**: P0 (do first)
**Estimated scope**: ~250 lines
**Files**:
- `apps/api/src/routes/leaves.ts` (new)
- `apps/api/src/routes/leaves.openapi.ts` (new)

### Description

Implement REST API endpoints for leaves. Leaves own constraints and validation results.

### Tasks

- [ ] Create `apps/api/src/routes/leaves.ts`
- [ ] Create `apps/api/src/routes/leaves.openapi.ts` (OpenAPI schemas)
- [ ] Implement `POST /v1/leaves` - Create leaf
- [ ] Implement `GET /v1/leaves/:id` - Get leaf by ID
- [ ] Implement `GET /v1/commits/:hash/leaves` - List leaves by commit
- [ ] Implement `GET /v1/projects/:projectId/leaves` - List leaves by project
- [ ] Implement `PATCH /v1/leaves/:id` - Update leaf
- [ ] Implement `DELETE /v1/leaves/:id` - Delete leaf
- [ ] Implement `POST /v1/leaves/:id/generate` - Generate output (future)
- [ ] Implement `POST /v1/leaves/:id/validate` - Validate output (future)
- [ ] Register routes in `apps/api/src/routes/index.ts`
- [ ] Write integration tests

### Implementation Notes

```typescript
// apps/api/src/routes/leaves.ts

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDB } from '../lib/db';
import {
  createLeaf,
  findLeafById,
  findLeavesByCommit,
  findLeavesByProject,
  updateLeaf,
  deleteLeaf,
} from '@t3x/storage';
import {
  CreateLeafRequest,
  UpdateLeafRequest,
} from '../schemas/v4-contracts';

const app = new Hono();

// POST /v1/leaves
app.post(
  '/',
  zValidator('json', CreateLeafRequest),
  async (c) => {
    const db = await getDB();
    const body = c.req.valid('json');

    const leaf = await createLeaf(db, {
      commit_hash: body.commit_hash,
      type: body.type,
      title: body.title,
      constraints: body.constraints,
      config: body.config,
      project_id: body.project_id,
    });

    return c.json({ success: true, data: leaf });
  }
);

// GET /v1/leaves/:id
app.get('/:id', async (c) => {
  const db = await getDB();
  const id = c.req.param('id');

  const leaf = await findLeafById(db, id);
  if (!leaf) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Leaf not found' } },
      404
    );
  }

  return c.json({ success: true, data: leaf });
});

// GET /v1/commits/:hash/leaves
app.get('/by-commit/:hash', async (c) => {
  const db = await getDB();
  const hash = c.req.param('hash');

  const leaves = await findLeavesByCommit(db, hash);
  return c.json({ success: true, data: leaves });
});

// GET /v1/projects/:projectId/leaves
app.get('/by-project/:projectId', async (c) => {
  const db = await getDB();
  const projectId = c.req.param('projectId');

  const leaves = await findLeavesByProject(db, projectId);
  return c.json({ success: true, data: leaves });
});

// PATCH /v1/leaves/:id
app.patch(
  '/:id',
  zValidator('json', UpdateLeafRequest),
  async (c) => {
    const db = await getDB();
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const leaf = await updateLeaf(db, id, body);
    return c.json({ success: true, data: leaf });
  }
);

// DELETE /v1/leaves/:id
app.delete('/:id', async (c) => {
  const db = await getDB();
  const id = c.req.param('id');

  await deleteLeaf(db, id);
  return c.json({ success: true, data: { deleted: true, id } });
});

export default app;
```

```typescript
// apps/api/src/routes/leaves.openapi.ts

import { createRoute, z } from '@hono/zod-openapi';
import {
  CreateLeafRequest,
  CreateLeafResponse,
  GetLeafResponse,
  ListLeavesResponse,
  UpdateLeafRequest,
  UpdateLeafResponse,
  DeleteLeafResponse,
} from '../schemas/v4-contracts';

export const createLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves',
  tags: ['Leaves'],
  summary: 'Create a new leaf',
  request: {
    body: {
      content: { 'application/json': { schema: CreateLeafRequest } },
    },
  },
  responses: {
    200: {
      description: 'Leaf created',
      content: { 'application/json': { schema: CreateLeafResponse } },
    },
  },
});

// ... other routes
```

### Acceptance Criteria

- [ ] All CRUD endpoints work correctly
- [ ] Request validation using Zod schemas from `v4-contracts.ts`
- [ ] Proper error responses (404, 400, etc.)
- [ ] OpenAPI documentation complete
- [ ] Integration tests pass

### Dependencies

- Track A: `createLeaf`, `findLeafById`, etc. from `@t3x/storage`

### Blocks

- B5 (WebUI store), B9 (Leaf page)

---

## Issue B2: API Routes - Pins CRUD

**Priority**: P0 (do first)
**Estimated scope**: ~200 lines
**Files**:
- `apps/api/src/routes/pins.ts` (new)
- `apps/api/src/routes/pins.openapi.ts` (new)

### Description

Implement REST API endpoints for pins. Pins are used for source selection (commit sources + conversation context).

### Tasks

- [ ] Create `apps/api/src/routes/pins.ts`
- [ ] Create `apps/api/src/routes/pins.openapi.ts`
- [ ] Implement `POST /v1/projects/:projectId/pins` - Create pin
- [ ] Implement `GET /v1/projects/:projectId/pins` - List pins
- [ ] Implement `GET /v1/pins/:id` - Get pin by ID
- [ ] Implement `PATCH /v1/pins/:id/assertions` - Update selected assertions
- [ ] Implement `DELETE /v1/pins/:id` - Delete pin
- [ ] Register routes in `apps/api/src/routes/index.ts`
- [ ] Write integration tests

### Implementation Notes

```typescript
// apps/api/src/routes/pins.ts

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDB } from '../lib/db';
import {
  createPin,
  findPinById,
  findPinsByProject,
  updatePinAssertions,
  deletePin,
} from '@t3x/storage';
import {
  CreatePinRequest,
  UpdatePinAssertionsRequest,
} from '../schemas/v4-contracts';

const app = new Hono();

// POST /v1/projects/:projectId/pins
app.post(
  '/projects/:projectId/pins',
  zValidator('json', CreatePinRequest),
  async (c) => {
    const db = await getDB();
    const projectId = c.req.param('projectId');
    const body = c.req.valid('json');

    const pin = await createPin(db, {
      project_id: projectId,
      type: body.type,
      ref_id: body.ref_id,
      selected_assertion_ids: body.selected_assertion_ids,
    });

    return c.json({ success: true, data: pin });
  }
);

// GET /v1/projects/:projectId/pins
app.get('/projects/:projectId/pins', async (c) => {
  const db = await getDB();
  const projectId = c.req.param('projectId');

  const pins = await findPinsByProject(db, projectId);
  return c.json({ success: true, data: pins });
});

// GET /v1/pins/:id
app.get('/pins/:id', async (c) => {
  const db = await getDB();
  const id = c.req.param('id');

  const pin = await findPinById(db, id);
  if (!pin) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Pin not found' } },
      404
    );
  }

  return c.json({ success: true, data: pin });
});

// PATCH /v1/pins/:id/assertions
app.patch(
  '/pins/:id/assertions',
  zValidator('json', UpdatePinAssertionsRequest),
  async (c) => {
    const db = await getDB();
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const pin = await updatePinAssertions(db, id, body.selected_assertion_ids);
    return c.json({ success: true, data: pin });
  }
);

// DELETE /v1/pins/:id
app.delete('/pins/:id', async (c) => {
  const db = await getDB();
  const id = c.req.param('id');

  await deletePin(db, id);
  return c.json({ success: true, data: { deleted: true, id } });
});

export default app;
```

### Acceptance Criteria

- [ ] All CRUD endpoints work correctly
- [ ] Unique constraint handled (can't pin same item twice)
- [ ] OpenAPI documentation complete
- [ ] Integration tests pass

### Dependencies

- Track A: `createPin`, `findPinsByProject`, etc. from `@t3x/storage`

### Blocks

- B5 (WebUI store), B6 (PinButton)

---

## Issue B3: API Routes - Conversation Context

**Priority**: P1
**Estimated scope**: ~150 lines
**File**: `apps/api/src/routes/conversations.ts` (modify existing)

### Description

Add conversation context endpoints to existing conversations routes.

### Tasks

- [ ] Add `GET /v1/conversations/:id/context` - Get context config
- [ ] Add `PUT /v1/conversations/:id/context` - Update context config
- [ ] Add `GET /v1/conversations/:id/memory` - Get built memory string
- [ ] Update OpenAPI schemas
- [ ] Write integration tests

### Implementation Notes

```typescript
// Add to apps/api/src/routes/conversations.ts

import {
  getConversationContext,
  setConversationContext,
  findPinsByProject,
  findCommitV4ByHash,
} from '@t3x/storage';
import { buildConversationContext } from '@t3x/core';
import {
  UpdateConversationContextRequest,
} from '../schemas/v4-contracts';

// GET /v1/conversations/:id/context
app.get('/:id/context', async (c) => {
  const db = await getDB();
  const id = c.req.param('id');

  const context = await getConversationContext(db, id);
  // null means using default (all pins)
  return c.json({ success: true, data: context });
});

// PUT /v1/conversations/:id/context
app.put(
  '/:id/context',
  zValidator('json', UpdateConversationContextRequest),
  async (c) => {
    const db = await getDB();
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const context = await setConversationContext(db, id, body.selected_pin_ids);
    return c.json({ success: true, data: context });
  }
);

// GET /v1/conversations/:id/memory
app.get('/:id/memory', async (c) => {
  const db = await getDB();
  const conversationId = c.req.param('id');

  // Get conversation and project
  const conversation = await findConversationById(db, conversationId);
  if (!conversation) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } },
      404
    );
  }

  // Get context config
  const contextConfig = await getConversationContext(db, conversationId);

  // Get project pins
  const pins = await findPinsByProject(db, conversation.project_id);

  // Get current commit (HEAD)
  const currentCommit = await getCurrentCommitForProject(db, conversation.project_id);

  // Load pinned conversations and leaves
  const conversations = await loadPinnedConversations(db, pins);
  const leaves = await loadPinnedLeaves(db, pins);

  // Build context
  const builtContext = buildConversationContext({
    currentCommit,
    projectPins: pins,
    contextConfig,
    conversations,
    leaves,
  });

  return c.json({ success: true, data: builtContext });
});
```

### Acceptance Criteria

- [ ] Context config get/set works
- [ ] Memory endpoint returns assembled context
- [ ] Token estimation included
- [ ] Sources list included
- [ ] Integration tests pass

### Dependencies

- Track A: Context builder, conversation_contexts queries

### Blocks

- B7 (ContextPanel), B8 (EditContextDialog)

---

## Issue B4: API Routes - CommitV4 CRUD

**Priority**: P1
**Estimated scope**: ~200 lines
**Files**:
- `apps/api/src/routes/commits-v4.ts` (new)
- `apps/api/src/routes/commits-v4.openapi.ts` (new)

### Description

Implement REST API endpoints for CommitV4. Similar to commits-v3 but without constraints.

### Tasks

- [ ] Create `apps/api/src/routes/commits-v4.ts`
- [ ] Create `apps/api/src/routes/commits-v4.openapi.ts`
- [ ] Implement `POST /v1/commits-v4` - Create commit
- [ ] Implement `GET /v1/commits-v4/:hash` - Get commit by hash
- [ ] Implement `GET /v1/projects/:projectId/commits-v4` - List commits by project
- [ ] Implement `PATCH /v1/commits-v4/:hash/position` - Update canvas position
- [ ] Implement `DELETE /v1/commits-v4/:hash` - Delete commit
- [ ] Register routes
- [ ] Write integration tests

### Implementation Notes

```typescript
// apps/api/src/routes/commits-v4.ts

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDB } from '../lib/db';
import {
  createCommitV4,
  findCommitV4ByHash,
  findCommitsV4ByProject,
  updateCommitV4Position,
  deleteCommitV4,
} from '@t3x/storage';
import { CreateCommitV4Request } from '../schemas/v4-contracts';

const app = new Hono();

// POST /v1/commits-v4
app.post(
  '/',
  zValidator('json', CreateCommitV4Request),
  async (c) => {
    const db = await getDB();
    const body = c.req.valid('json');

    const commit = await createCommitV4(db, {
      parents: body.parents,
      author: body.author,
      sentences: body.sentences,
      project_id: body.project_id,
      message: body.message,
      branch: body.branch,
      source_refs: body.source_refs,
      position_x: body.position_x,
      position_y: body.position_y,
    });

    return c.json({ success: true, data: commit });
  }
);

// GET /v1/commits-v4/:hash
app.get('/:hash', async (c) => {
  const db = await getDB();
  const hash = c.req.param('hash');

  const commit = await findCommitV4ByHash(db, hash);
  if (!commit) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Commit not found' } },
      404
    );
  }

  return c.json({ success: true, data: commit });
});

// ... other endpoints

export default app;
```

### Acceptance Criteria

- [ ] All CRUD endpoints work
- [ ] Sentences stored correctly (no constraints)
- [ ] source_refs stored correctly
- [ ] OpenAPI documentation complete
- [ ] Integration tests pass

### Dependencies

- Track A: `createCommitV4`, etc. from `@t3x/storage`

---

## Issue B5: WebUI Store - pinsStore

**Priority**: P1
**Estimated scope**: ~100 lines
**File**: `apps/web/src/store/pinsStore.ts` (new)

### Description

Create Zustand store for managing pins state in WebUI.

### Tasks

- [ ] Create `apps/web/src/store/pinsStore.ts`
- [ ] Define `PinsState` interface
- [ ] Implement `fetchPins(projectId)`
- [ ] Implement `addPin(type, refId)`
- [ ] Implement `removePin(pinId)`
- [ ] Implement `updatePinAssertions(pinId, assertionIds)`
- [ ] Implement `isPinned(type, refId)` selector
- [ ] Export from `apps/web/src/store/index.ts`

### Implementation Notes

```typescript
// apps/web/src/store/pinsStore.ts

import { create } from 'zustand';
import type { Pin, PinType } from '@t3x/core';
import { api } from '@/lib/api';

interface PinsState {
  pins: Pin[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPins: (projectId: string) => Promise<void>;
  addPin: (projectId: string, type: PinType, refId: string) => Promise<Pin>;
  removePin: (pinId: string) => Promise<void>;
  updatePinAssertions: (pinId: string, assertionIds: string[]) => Promise<void>;

  // Selectors
  isPinned: (type: PinType, refId: string) => boolean;
  getPinByRef: (type: PinType, refId: string) => Pin | undefined;
}

export const usePinsStore = create<PinsState>((set, get) => ({
  pins: [],
  isLoading: false,
  error: null,

  fetchPins: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get(`/v1/projects/${projectId}/pins`);
      const data = await response.json();
      if (data.success) {
        set({ pins: data.data, isLoading: false });
      } else {
        set({ error: data.error.message, isLoading: false });
      }
    } catch (err) {
      set({ error: 'Failed to fetch pins', isLoading: false });
    }
  },

  addPin: async (projectId, type, refId) => {
    const response = await api.post(`/v1/projects/${projectId}/pins`, {
      type,
      ref_id: refId,
    });
    const data = await response.json();
    if (data.success) {
      set((state) => ({ pins: [...state.pins, data.data] }));
      return data.data;
    }
    throw new Error(data.error.message);
  },

  removePin: async (pinId) => {
    await api.delete(`/v1/pins/${pinId}`);
    set((state) => ({
      pins: state.pins.filter((p) => p.id !== pinId),
    }));
  },

  updatePinAssertions: async (pinId, assertionIds) => {
    const response = await api.patch(`/v1/pins/${pinId}/assertions`, {
      selected_assertion_ids: assertionIds,
    });
    const data = await response.json();
    if (data.success) {
      set((state) => ({
        pins: state.pins.map((p) => (p.id === pinId ? data.data : p)),
      }));
    }
  },

  isPinned: (type, refId) => {
    return get().pins.some((p) => p.type === type && p.ref_id === refId);
  },

  getPinByRef: (type, refId) => {
    return get().pins.find((p) => p.type === type && p.ref_id === refId);
  },
}));
```

### Acceptance Criteria

- [ ] Store manages pins state correctly
- [ ] API calls work with backend
- [ ] `isPinned` selector works for UI components
- [ ] TypeScript types correct

### Dependencies

- B2 (Pins API)

### Blocks

- B6 (PinButton), B7 (ContextPanel)

---

## Issue B6: WebUI Component - PinButton

**Priority**: P2
**Estimated scope**: ~60 lines
**File**: `apps/web/src/components/ui/PinButton.tsx` (new)

### Description

Create a reusable button component for pinning/unpinning items.

### Tasks

- [ ] Create `apps/web/src/components/ui/PinButton.tsx`
- [ ] Support `pinned` / `unpinned` states
- [ ] Support `loading` state during API call
- [ ] Use pinsStore actions
- [ ] Add hover tooltip

### Implementation Notes

```typescript
// apps/web/src/components/ui/PinButton.tsx

'use client';

import { useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePinsStore } from '@/store/pinsStore';
import type { PinType } from '@t3x/core';
import { cn } from '@/lib/utils';

interface PinButtonProps {
  projectId: string;
  type: PinType;
  refId: string;
  className?: string;
}

export function PinButton({ projectId, type, refId, className }: PinButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { isPinned, getPinByRef, addPin, removePin } = usePinsStore();

  const pinned = isPinned(type, refId);
  const pin = getPinByRef(type, refId);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      if (pinned && pin) {
        await removePin(pin.id);
      } else {
        await addPin(projectId, type, refId);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8',
            pinned && 'text-amber-500 hover:text-amber-600',
            className
          )}
          onClick={handleClick}
          disabled={isLoading}
        >
          {pinned ? (
            <Pin className="h-4 w-4 fill-current" />
          ) : (
            <PinOff className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {pinned ? 'Unpin from sources' : 'Pin as source'}
      </TooltipContent>
    </Tooltip>
  );
}
```

### Acceptance Criteria

- [ ] Button toggles pin state
- [ ] Loading state shown during API call
- [ ] Visual distinction between pinned/unpinned
- [ ] Tooltip explains action

### Dependencies

- B5 (pinsStore)

### Blocks

- Conversation page, Leaf page need this component

---

## Issue B7: WebUI Component - ContextPanel

**Priority**: P2
**Estimated scope**: ~120 lines
**File**: `apps/web/src/components/conversation/ContextPanel.tsx` (new)

### Description

Create the context panel shown on conversation page sidebar.

### Tasks

- [ ] Create `apps/web/src/components/conversation/ContextPanel.tsx`
- [ ] Display current context sources (commit + pins)
- [ ] Show "Edit context" button
- [ ] Show token estimate
- [ ] Collapsible design

### Implementation Notes

```typescript
// apps/web/src/components/conversation/ContextPanel.tsx

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePinsStore } from '@/store/pinsStore';
import { EditContextDialog } from './EditContextDialog';

interface ContextPanelProps {
  conversationId: string;
  projectId: string;
  contextConfig: { selected_pin_ids: string[] | null } | null;
  onContextChange: (pinIds: string[] | null) => void;
}

export function ContextPanel({
  conversationId,
  projectId,
  contextConfig,
  onContextChange,
}: ContextPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { pins } = usePinsStore();

  // Determine active pins
  const activePins = contextConfig?.selected_pin_ids === null
    ? pins // all pins
    : pins.filter(p => contextConfig?.selected_pin_ids?.includes(p.id));

  const convPins = activePins.filter(p => p.type === 'conversation');
  const leafPins = activePins.filter(p => p.type === 'leaf');

  return (
    <div className="border-r bg-muted/30 w-64 flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-medium text-sm">Context</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            setIsDialogOpen(true);
          }}
        >
          <Settings2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 space-y-3 text-sm">
          {/* Status */}
          <div className="text-muted-foreground">
            {contextConfig?.selected_pin_ids === null
              ? 'Using all pins'
              : `Using ${activePins.length} pins`}
          </div>

          {/* Pinned conversations */}
          {convPins.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Conversations
              </div>
              {convPins.map(pin => (
                <div key={pin.id} className="flex items-center gap-1">
                  <span className="text-amber-500">📌</span>
                  <span className="truncate">{pin.ref_id}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pinned leaves */}
          {leafPins.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Leaves
              </div>
              {leafPins.map(pin => (
                <div key={pin.id} className="flex items-center gap-1">
                  <span className="text-amber-500">📌</span>
                  <span className="truncate">{pin.ref_id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <EditContextDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        conversationId={conversationId}
        currentSelection={contextConfig?.selected_pin_ids}
        onSave={onContextChange}
      />
    </div>
  );
}
```

### Acceptance Criteria

- [ ] Shows current context sources
- [ ] Collapsible
- [ ] Edit button opens dialog
- [ ] Shows "all pins" vs specific count

### Dependencies

- B5 (pinsStore), B8 (EditContextDialog)

---

## Issue B8: WebUI Component - EditContextDialog

**Priority**: P2
**Estimated scope**: ~150 lines
**File**: `apps/web/src/components/conversation/EditContextDialog.tsx` (new)

### Description

Create dialog for customizing conversation context (selecting which pins to include).

### Tasks

- [ ] Create `apps/web/src/components/conversation/EditContextDialog.tsx`
- [ ] List all project pins with checkboxes
- [ ] Support "use all" (null) vs specific selection
- [ ] Show token estimate preview
- [ ] Save/cancel buttons

### Implementation Notes

```typescript
// apps/web/src/components/conversation/EditContextDialog.tsx

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { usePinsStore } from '@/store/pinsStore';

interface EditContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  conversationId: string;
  currentSelection: string[] | null;
  onSave: (pinIds: string[] | null) => void;
}

export function EditContextDialog({
  open,
  onOpenChange,
  projectId,
  conversationId,
  currentSelection,
  onSave,
}: EditContextDialogProps) {
  const { pins } = usePinsStore();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [useAll, setUseAll] = useState(true);

  // Initialize selection when dialog opens
  useEffect(() => {
    if (open) {
      if (currentSelection === null) {
        setUseAll(true);
        setSelection(new Set(pins.map(p => p.id)));
      } else {
        setUseAll(false);
        setSelection(new Set(currentSelection));
      }
    }
  }, [open, currentSelection, pins]);

  const handleToggle = (pinId: string) => {
    setUseAll(false);
    setSelection(prev => {
      const next = new Set(prev);
      if (next.has(pinId)) {
        next.delete(pinId);
      } else {
        next.add(pinId);
      }
      return next;
    });
  };

  const handleUseAll = () => {
    setUseAll(true);
    setSelection(new Set(pins.map(p => p.id)));
  };

  const handleSave = () => {
    onSave(useAll ? null : Array.from(selection));
    onOpenChange(false);
  };

  const convPins = pins.filter(p => p.type === 'conversation');
  const leafPins = pins.filter(p => p.type === 'leaf');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Context</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Use all option */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={useAll}
              onCheckedChange={() => handleUseAll()}
            />
            <span>Use all pinned items (default)</span>
          </div>

          <div className="border-t pt-4">
            {/* Conversations */}
            {convPins.length > 0 && (
              <div className="mb-4">
                <div className="text-sm font-medium mb-2">Conversations</div>
                {convPins.map(pin => (
                  <div key={pin.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={selection.has(pin.id)}
                      onCheckedChange={() => handleToggle(pin.id)}
                      disabled={useAll}
                    />
                    <span className="text-sm">{pin.ref_id}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Leaves */}
            {leafPins.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Leaves</div>
                {leafPins.map(pin => (
                  <div key={pin.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={selection.has(pin.id)}
                      onCheckedChange={() => handleToggle(pin.id)}
                      disabled={useAll}
                    />
                    <span className="text-sm">{pin.ref_id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="text-sm text-muted-foreground border-t pt-4">
            {useAll
              ? `Using all ${pins.length} pins`
              : `Using ${selection.size} of ${pins.length} pins`}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Acceptance Criteria

- [ ] Lists all project pins
- [ ] Checkbox selection works
- [ ] "Use all" option sets selection to null
- [ ] Summary shows count
- [ ] Save updates context config via API

### Dependencies

- B5 (pinsStore), B3 (Context API)

---

## Issue B9: WebUI - Leaf Page

**Priority**: P3
**Estimated scope**: ~300 lines
**File**: `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx` (new)

### Description

Create the leaf detail page showing constraints, output, and assertions.

### Tasks

- [ ] Create page route structure
- [ ] Fetch leaf data
- [ ] Display constraints editor
- [ ] Display output
- [ ] Display assertions (pass/fail)
- [ ] Add PinButton
- [ ] Add "Generate" button (future)
- [ ] Add "Validate" button (future)

### Acceptance Criteria

- [ ] Page loads leaf data
- [ ] Constraints displayed and editable
- [ ] Output displayed
- [ ] Assertions show pass/fail with details
- [ ] Pin button works

### Dependencies

- B1 (Leaves API), B5 (pinsStore), B6 (PinButton)

---

## Issue B10: WebUI - Commit Detail Update

**Priority**: P3
**Estimated scope**: ~100 lines
**File**: `apps/web/src/components/canvas/NodeModal.tsx` (modify)

### Description

Update commit detail view for V4 architecture (no constraints, show source_refs).

### Tasks

- [ ] Remove constraints section (add info message about Leaf)
- [ ] Add "Pinned Sources" section showing source_refs
- [ ] Update to handle both V3 and V4 commits (migration period)

### Acceptance Criteria

- [ ] V4 commits show sentences only
- [ ] Info message explains constraints are in Leaf
- [ ] source_refs displayed
- [ ] Backwards compatible with V3

### Dependencies

- B4 (CommitV4 API)

---

## Issue B11: WebUI - UnitNode Layout Update

**Priority**: P3
**Estimated scope**: ~80 lines
**File**: `apps/web/src/components/canvas/UnitNode.tsx` (modify)

### Description

Update UnitNode to show pin indicators and context status.

### Tasks

- [ ] Add 📌 indicator on pinned conversations
- [ ] Add context indicator `[all]` / `[3 context]` / `[none]`
- [ ] Show assertion pass/fail count on leaves

### Acceptance Criteria

- [ ] Pin status visible at glance
- [ ] Context status visible
- [ ] Assertion summary visible

### Dependencies

- B5 (pinsStore)

---

## Summary: Suggested Order

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   Week 1: API Layer                                                     │
│   ─────────────────                                                     │
│   B1 (Leaves API) ──┬──► B4 (CommitV4 API)                             │
│   B2 (Pins API) ────┘                                                   │
│                                                                         │
│   Week 2: Store + Basic Components                                      │
│   ─────────────────────────────────                                     │
│   B3 (Context API) ──► B5 (pinsStore) ──► B6 (PinButton)               │
│                                                                         │
│   Week 3: UI Components                                                 │
│   ─────────────────────                                                 │
│   B7 (ContextPanel) ──► B8 (EditContextDialog)                         │
│   B9 (Leaf Page)                                                        │
│   B10 (NodeModal update)                                                │
│   B11 (UnitNode update)                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## GitHub Issue Creation Commands

```bash
# B1
gh issue create --title "feat(api): implement leaves CRUD routes" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b1-api-routes---leaves-crud"

# B2
gh issue create --title "feat(api): implement pins CRUD routes" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b2-api-routes---pins-crud"

# B3
gh issue create --title "feat(api): add conversation context endpoints" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b3-api-routes---conversation-context"

# B4
gh issue create --title "feat(api): implement commits_v4 CRUD routes" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b4-api-routes---commitv4-crud"

# B5
gh issue create --title "feat(web): create pinsStore for state management" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b5-webui-store---pinsstore"

# B6
gh issue create --title "feat(web): create PinButton component" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b6-webui-component---pinbutton"

# B7
gh issue create --title "feat(web): create ContextPanel component" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b7-webui-component---contextpanel"

# B8
gh issue create --title "feat(web): create EditContextDialog component" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b8-webui-component---editcontextdialog"

# B9
gh issue create --title "feat(web): create Leaf detail page" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b9-webui---leaf-page"

# B10
gh issue create --title "feat(web): update NodeModal for V4 commits" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b10-webui---commit-detail-update"

# B11
gh issue create --title "feat(web): update UnitNode with pin indicators" --label "track-b,v4" --body "See docs/plans/v4-track-b-issues.md#issue-b11-webui---unitnode-layout-update"
```
