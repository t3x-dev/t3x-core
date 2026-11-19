# WebUI Design Principles

Apply these principles when designing, changing, or reviewing a WebUI surface.
They describe the expected design for affected areas. The
[architecture](architecture.md) and [business contracts](business.md) govern
what the UI can do and what its states mean.

## 1. General principles

- **Start with the task.** Identify what the user came to read, compare, edit,
  or decide. Give that work the main content area and place key controls near
  the objects they affect. On narrow screens, protect the primary task and give
  secondary panels a discoverable entry.
- **Make the reading order clear.** Use alignment, grouping, spacing, and type
  to distinguish content, evidence, actions, and metadata. Keep time, counts,
  and secondary controls subordinate to the information needed for the task.
- **Protect the user's attention.** Default to clear labels, short rows, and
  actionable status. Omit prose that repeats what the interface already shows.
  Keep long explanatory blocks off the default workbench surface. Use a
  tooltip for a brief supplementary hint and an explicit disclosure for
  optional details or examples. Keep essential instructions, decision
  evidence, risks, and recovery visible at the point of use. Long-form
  content such as a README has its own reading region.
- **Keep names and controls consistent.** Use the same label and interaction
  for the same concept across views. Show the current location and make page
  destinations, filters, and view switches recognizable. Follow the
  [navigation rules](architecture.md#url-and-navigation-rules).
- **Make state and consequences visible.** Name the effect and scope of an
  action. Show pending work, confirmed outcomes, and actionable failures near
  the affected content. Keep consequential feedback available in the workflow.
  Follow the [failure and recovery contract](business.md#b-05-failure-and-recovery-feedback)
  for covered writes.
- **Keep controls stable and usable.** Hover, loading, and count changes should
  preserve the position of nearby controls. Let content reflow for long
  labels, text enlargement, and small screens. Keep key content and actions
  available to keyboard and touch users.

## 2. T3X product character

T3X is version control for structured state. Design around the user's task
and the object or version it concerns. Help users inspect what changed, what
was verified, what was decided, and what entered history. Use task-oriented
projections and introduce protocol terms where they help explain the work.
Follow the [product frame](../../../AGENTS.md#project-frame).

- **Precise and trustworthy.** Distinguish draft, verification, decision, and
  commit. For example, a Review can show that a check passed and a decision
  is pending at the same time. Preserve failed findings when an authorized
  override is recorded. Follow the [Review contracts](business.md#review-history-and-export)
  and [check scope rules](business.md#b-07-check-scope-and-readiness).
- **Direct and calm.** Keep the main task easy to resume and the evidence
  needed for a decision visible. Give secondary technical detail a clear way
  to expand. Use concise labels that identify the action, such as **Save
  draft**, **Verify**, or **Commit**.
- **Easy to enter.** Let navigation show where the user is and what is
  available. Introduce an unfamiliar page through its primary task or empty
  state. Use a skippable, reopenable walkthrough when a task genuinely needs
  sequential instruction.

## 3. Visual and interaction standards

### Page structure

Give the header responsibility for page identity, scope, navigation, and
page-level actions. Group task content below it. Put feedback and tools that
apply to one module next to that module. Use a shared content alignment for
page regions, with a max-width where the task benefits from it. Full-width
backgrounds can extend past those alignment lines.

For State, keep Header above the scroll region and place Content and Footer
inside it. Let Content fill the available height when short. As Content
grows, Footer moves to its actual end. Overview and Structure share the
same Header and alignment. Keep the header stable at a given width across
view, loading, and error states. Put commit summaries and State notices in
Content. At narrower widths, let the header reflow.
[State scroll and footer](../src/components/project/StatePageFrame.tsx)

### Cards and modules

Use cards for distinct objects or cohesive work areas. Give each module a
clear label and keep its content, feedback, and controls together. Inside a
module, use aligned rows, lists, or light dividers for related fields. Add an
inner boundary for a distinct child object when it communicates ownership.

For example, State Overview groups README, repository information, structure
preview, and current version into four modules. State Structure has one
workbench with Details inside it. On narrow screens, secondary modules can
stack while retaining their relationship to the main content.

### Layout and density

Choose density by region and task. A single page can use both patterns.

| Pattern | Where it helps | How to apply it |
| --- | --- | --- |
| Compact workbench | Scanning, comparing, editing, or reviewing | Align repeated fields, keep row actions in predictable positions, and group related controls. Give long evidence and explanations room to read. |
| Browsing and presentation | Recognizing a project or person, browsing items, or reading an introduction | Give names, identity, previews, and descriptions space according to their role. Use paragraph rhythm and a comfortable reading width. |

For short forms and sparse tools, constrain the content width, align the
content near the top, and let the controls and content set the height. Wide
tables, editors, and side-by-side Diff views can use the space their task
requires. Use local scrolling for wide or bounded content and keep key
controls reachable. State can pair compact Structure controls with a more
spacious README. Schema can prioritize Fields when room for Details is limited.

Check the main content area with zero, few, many, and long items. Distinguish
uncreated content, a filter with no matches, loading, and failure. Provide a
relevant next step when available. Keep normal row spacing with few items.
For many items, choose grouping, pagination, or scrolling based on the task.
Wrap or expand long values and offer a keyboard- and touch-accessible way to
read any truncated information.

### Color and tokens

Build workbench surfaces and typography on a grayscale hierarchy. Use white
and near-white grays in light mode, with dark grays in dark mode. Establish
the page and card boundaries through luminance, spacing, and fine dividers.
Use small, distinctly colored icons where hue helps identify an object type
or status. Keep routine navigation and control icons neutral. Pair colored
icons, statuses, and Diff marks with readable names, shapes, or structure so
their meaning survives grayscale. Choose a soft fill or a solid accent when
the action or state needs additional emphasis.

| Meaning | Color |
| --- | --- |
| Links, local selection, focus, and emphasized primary actions | Blue accent |
| Commit action | Blue |
| Push action | Green |
| Successful outcome or passed verification | Green with a result label |
| Errors and destructive actions | Red |
| Warnings | Amber |
| Diff | Green added, red removed, amber modified, neutral unchanged |

Use distinct action and result labels even when they share a hue. For
example, **Push** names an action, **Pushed** reports its confirmed result,
and **Verification passed** reports the outcome of a check.

For shared light-theme mappings, the selected blue baseline is `#0969DA`
for text and solid fill and `#DDF4FF` for soft fill. The green baseline is
`#1A7F37` for text, `#1F883D` for solid fill, and `#DAFBE1` for soft fill.
Use white on the specified solid fills. Choose dark-theme values for their
actual foreground and background pairings. Select hover, pressed, selected,
focus, and disabled treatments by control role. Check the existing mapping
before applying these design baselines.
[Primer color primitives](https://primer.style/product/primitives/color/)

Reuse the closest matching [UI primitives](../src/components/ui/) or
[shared components](../src/components/shared/). Get runtime values from
the semantic tokens in [globals.css](../src/app/globals.css) and check
existing [theme mappings](../src/utils/theme.ts). Prefer shared tokens and
component variants over component-local color, radius, or shadow literals.
Follow the [root typography configuration](../src/app/layout.tsx) and use
monospace for code, YAML, hashes, and logs. Use the existing scale, typically
12px for metadata and 14–15px for body text. Use the spacing scale and grouping
to adjust density before reducing type size.

### Interaction and accessibility

- Use the existing control that matches the interaction. Give each icon
  button an accessible name and keep keyboard focus visible. For dialogs,
  move focus inside on open and restore it to a logical control on close.
  Make touch targets easy to reach and activate accurately.
- Keep essential information available without hover, animation, or a
  transient toast. Use motion for feedback or orientation and respect
  reduced-motion preferences.
- Check actual text and background pairs across relevant states and themes.
  Use 4.5:1 for normal text and 3:1 for qualifying large text, with the
  standard's exceptions. Verify that text can reach 200% without losing
  content or functionality.
  [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
  [WCAG text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)

## Design review

1. Identify the task, primary action, object or version, and evidence the user
   needs. Check that wording and available actions match the governing contracts.
2. Review the affected states, including content extremes and failure or
   recovery where relevant. In grayscale, check page and card boundaries and
   object and status recognition. With optional disclosure closed, check that
   the user can still complete the main task. Check that layout and alignment
   survive longer content, narrower widths, and larger text.
3. For visual changes, inspect rendered screenshots from the intended checkout
   for the relevant content states, widths, and themes. Check interactions such
   as focus, keyboard navigation, and recovery with the appropriate separate
   checks. Record any visual coverage gap. Follow the
   [repository verification policy](../../../AGENTS.md#verification) for code
   checks and business-flow acceptance.
