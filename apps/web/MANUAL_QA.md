# Manual QA Checklist

> 8 flows to verify product quality. Run after major changes.
> Each flow has prerequisites, steps, and expected results.

---

## Flow 1: Chat → Extract → Review YAML

**Prerequisites**: Running dev server (`pnpm dev:webui` + `pnpm dev:api`), LLM provider configured

- [ ] New conversation, send 3+ messages with structured info (e.g., travel planning with budget, dates, preferences)
- [ ] Click extract button
- [ ] YAML appears in extraction panel
- [ ] Frames are grouped (not 10+ flat frames)
- [ ] Slot values match conversation content
- [ ] Hover YAML item — source text highlights in chat
- [ ] Send 2 more messages with updates
- [ ] Re-extract — verify incremental changes shown
- [ ] Topic name is specific (not generic like "conversation")

---

## Flow 2: Commit → Diff → Merge

**Prerequisites**: Project with at least 1 existing commit

- [ ] Create first commit from extraction
- [ ] Create branch
- [ ] Add more turns, extract, commit on branch
- [ ] Canvas shows two commit nodes
- [ ] Open diff between two commits
- [ ] Word-level highlighting visible for changes
- [ ] Added/removed/modified clearly distinguished
- [ ] Start merge — conflicts display correctly
- [ ] Resolve conflicts — merged result is correct

---

## Flow 3: Leaf Generation → Validation

**Prerequisites**: Project with at least 1 commit

- [ ] Create leaf from commit
- [ ] Add 3+ constraints (mix of require + exclude)
- [ ] Generate output
- [ ] Assertions show pass/fail correctly
- [ ] Edit output manually
- [ ] "Learn from edit" suggestions appear
- [ ] Re-generate — verify quality improved

---

## Flow 4: Project Settings → Provider Fallback

**Prerequisites**: Multiple LLM providers configured

- [ ] Open project settings
- [ ] Drag-reorder LLM providers
- [ ] Verify extraction uses first available provider
- [ ] Disable primary provider — verify fallback works
- [ ] Reset to global default — verify reset works

---

## Flow 5: Canvas Navigation

**Prerequisites**: Project with 3+ conversations, 5+ commits

- [ ] Canvas renders all nodes and edges correctly
- [ ] Zoom/pan works smoothly
- [ ] Right-click node — context menu appears
- [ ] Navigate: canvas → commit detail → diff → back to canvas
- [ ] Node positions persist after page reload

---

## Flow 6: Sharing

**Prerequisites**: Project with commits and leaves

- [ ] Share a commit — verify link generated
- [ ] Open link in incognito — verify read-only view
- [ ] Share a leaf — verify output + constraints visible
- [ ] Revoke share link — verify link stops working

---

## Flow 7: Search

**Prerequisites**: 2+ projects with different topics

- [ ] Keyword search — results from correct project
- [ ] Semantic search — related results appear
- [ ] Filter by project — filter works correctly

---

## Flow 8: Error Recovery

- [ ] Disconnect network during extraction — graceful error message
- [ ] Send empty message — appropriate feedback
- [ ] Create commit with empty content — error shown
- [ ] Navigate to non-existent project URL — 404 page
- [ ] API server down — WebUI shows connection error

---

## Notes

- Run all flows on Chrome. Spot-check Firefox and Safari.
- Record any issues as GitHub issues with `bug` label.
- Update this checklist when new features are added.
