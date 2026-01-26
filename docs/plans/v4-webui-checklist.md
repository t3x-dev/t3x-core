# V4 WebUI Acceptance Test Checklist

> Manual testing checklist for V4 WebUI features.
> Test each item and mark as passed (✅) or failed (❌).
> Date: ____________  Tester: ____________

---

## Prerequisites

- [ ] Development environment is set up
- [ ] `pnpm dev:webui` is running on port 3000
- [ ] `pnpm dev:api` is running on port 8000
- [ ] Browser console is open (F12)

---

## 1. Project List Page

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 1.1 | Navigate to http://localhost:3000 | Project list page loads | ☐ |
| 1.2 | Click "New Project" button | Create project dialog appears | ☐ |
| 1.3 | Enter project name and submit | New project appears in list | ☐ |
| 1.4 | Click on a project | Navigates to project canvas | ☐ |
| 1.5 | Check for console errors | No errors in console | ☐ |

---

## 2. Project Canvas

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 2.1 | Canvas loads with project | Canvas displays without errors | ☐ |
| 2.2 | V4 commits display as nodes | Commit nodes visible on canvas | ☐ |
| 2.3 | Zoom in/out works | Canvas zooms correctly | ☐ |
| 2.4 | Pan canvas works | Canvas pans correctly | ☐ |
| 2.5 | Click on commit node | Commit detail panel opens | ☐ |
| 2.6 | Nodes can be dragged | Node position updates | ☐ |
| 2.7 | Check for console errors | No errors in console | ☐ |

---

## 3. Commit Detail Panel

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 3.1 | Panel shows commit hash | Hash displayed correctly | ☐ |
| 3.2 | Panel shows commit message | Message displayed | ☐ |
| 3.3 | Panel shows author info | Author type/name shown | ☐ |
| 3.4 | Panel shows sentences list | Sentences displayed (NOT constraints) | ☐ |
| 3.5 | Sentences have text content | Each sentence shows text | ☐ |
| 3.6 | No constraints section | V4 commits don't show constraints at commit level | ☐ |
| 3.7 | "Create Leaf" button visible | Button to create leaf exists | ☐ |
| 3.8 | Close panel works | Panel closes correctly | ☐ |

---

## 4. Leaf Creation

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 4.1 | Click "Create Leaf" from commit | Leaf creation dialog/form opens | ☐ |
| 4.2 | Select leaf type | Type dropdown works (deploy_agent, tweet, etc.) | ☐ |
| 4.3 | Enter leaf title | Title input works | ☐ |
| 4.4 | Add constraints | Can add require/exclude constraints | ☐ |
| 4.5 | Submit leaf creation | Leaf created successfully | ☐ |
| 4.6 | New leaf appears | Leaf visible in UI | ☐ |
| 4.7 | Check for console errors | No errors during creation | ☐ |

---

## 5. Leaf Detail Page

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 5.1 | Navigate to leaf detail | Leaf detail page loads | ☐ |
| 5.2 | Shows leaf type | Type displayed correctly | ☐ |
| 5.3 | Shows leaf title | Title displayed | ☐ |
| 5.4 | Shows linked commit hash | Commit reference shown | ☐ |
| 5.5 | Shows constraints list | Constraints displayed with type (require/exclude) | ☐ |
| 5.6 | Constraints show match_mode | exact/semantic mode visible | ☐ |
| 5.7 | Edit constraints works | Can modify constraints | ☐ |
| 5.8 | Delete leaf works | Leaf deleted successfully | ☐ |

---

## 6. Pin Functionality

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 6.1 | Pin button visible on leaf | Pin/unpin toggle exists | ☐ |
| 6.2 | Click pin on unpinned leaf | Leaf becomes pinned, toast confirms | ☐ |
| 6.3 | Pin icon updates | Visual indicator shows pinned state | ☐ |
| 6.4 | Click unpin on pinned leaf | Leaf becomes unpinned | ☐ |
| 6.5 | Duplicate pin prevented | Cannot pin same leaf twice | ☐ |
| 6.6 | Pin persists after refresh | Pin state maintained | ☐ |

---

## 7. Context Panel

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 7.1 | Context panel visible | Panel shows in conversation view | ☐ |
| 7.2 | Shows pinned items count | "Using X pins" displayed | ☐ |
| 7.3 | Lists pinned conversations | Conversation pins shown | ☐ |
| 7.4 | Lists pinned leaves | Leaf pins shown | ☐ |
| 7.5 | Expand/collapse works | Panel toggles correctly | ☐ |
| 7.6 | Settings button works | Opens edit context dialog | ☐ |
| 7.7 | Export button visible | Download icon button exists | ☐ |

---

## 8. Edit Context Dialog

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 8.1 | Dialog opens | Edit context dialog appears | ☐ |
| 8.2 | Shows all available pins | List of project pins displayed | ☐ |
| 8.3 | Can select/deselect pins | Checkbox toggles work | ☐ |
| 8.4 | "Use all pins" option | Can set to use all pins | ☐ |
| 8.5 | Save changes | Context config updates | ☐ |
| 8.6 | Cancel closes dialog | Dialog closes without saving | ☐ |
| 8.7 | Changes reflect in panel | Context panel updates after save | ☐ |

---

## 9. Export Functionality

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 9.1 | Click export dropdown | Dropdown menu appears | ☐ |
| 9.2 | "Export as JSON" option | Option visible in dropdown | ☐ |
| 9.3 | Click Export as JSON | JSON file downloads | ☐ |
| 9.4 | JSON file valid | File contains metadata and context | ☐ |
| 9.5 | "Export as Markdown" option | Option visible in dropdown | ☐ |
| 9.6 | Click Export as Markdown | Markdown file downloads | ☐ |
| 9.7 | Markdown file valid | File has proper formatting | ☐ |
| 9.8 | "Copy to Clipboard" option | Option visible in dropdown | ☐ |
| 9.9 | Click Copy to Clipboard | Context copied, toast confirms | ☐ |
| 9.10 | Loading state shown | Spinner during export | ☐ |
| 9.11 | Error handling | Toast shown on failure | ☐ |

---

## 10. Error Handling

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 10.1 | API error shows toast | Error message displayed | ☐ |
| 10.2 | 404 page for invalid routes | Not found page shown | ☐ |
| 10.3 | Invalid project ID | Error handled gracefully | ☐ |
| 10.4 | Network disconnect | Appropriate error shown | ☐ |
| 10.5 | Form validation errors | Validation messages display | ☐ |

---

## 11. Performance

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 11.1 | Project list loads < 2s | Fast initial load | ☐ |
| 11.2 | Canvas loads < 3s | Canvas renders quickly | ☐ |
| 11.3 | No UI freezing | Smooth interactions | ☐ |
| 11.4 | Large data handling | Works with many commits/leaves | ☐ |

---

## 12. Accessibility

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 12.1 | Keyboard navigation | Can navigate with Tab key | ☐ |
| 12.2 | Focus indicators | Focused elements visible | ☐ |
| 12.3 | Button labels | Buttons have accessible names | ☐ |
| 12.4 | Color contrast | Text readable | ☐ |
| 12.5 | Screen reader | Major elements announced | ☐ |

---

## Key Test Scenarios Summary

| # | Scenario | Status |
|---|----------|--------|
| 1 | V4 commits display in canvas | ☐ |
| 2 | Commit detail shows sentences (not constraints) | ☐ |
| 3 | Create leaf from commit | ☐ |
| 4 | Pin/unpin leaf | ☐ |
| 5 | Context panel shows pins | ☐ |
| 6 | Export context works | ☐ |

---

## Test Results Summary

- **Total Tests**: 72
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___

### Issues Found

| # | Section | Test # | Description | Severity |
|---|---------|--------|-------------|----------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

### Notes

_Add any additional observations here._

---

## Sign-off

- [ ] All critical tests passed
- [ ] No P0/P1 bugs found
- [ ] Ready for release

**Tester Signature**: _________________ **Date**: _____________
