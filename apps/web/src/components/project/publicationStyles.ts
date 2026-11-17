export const publicationStyles = `
.publication-document { box-sizing: border-box; max-width: 920px; width: 100%; margin: 24px auto; padding: 32px; color: var(--text-primary, #24292f); background: var(--surface-card, #fff); font: 14px/1.65 system-ui, sans-serif; overflow-wrap: anywhere; }
.publication-document * { box-sizing: border-box; }
.publication-document h1 { font-size: 26px; line-height: 1.3; margin: 6px 0 12px; font-weight: 650; }
.publication-document h2 { font-size: 18px; margin: 0 0 8px; font-weight: 600; }
.publication-document p { margin: 6px 0; white-space: pre-wrap; }
.publication-document .pub-meta { color: var(--text-secondary, #57606a); font-size: 12px; }
.publication-document .pub-stage { display: inline-block; font-size: 12px; font-weight: 600; border: 1px solid var(--stroke-default, #d0d7de); padding: 2px 8px; border-radius: 5px; }
.publication-document header { border-bottom: 1px solid var(--stroke-divider, #d8dee4); padding-bottom: 20px; margin-bottom: 24px; }
.publication-document dl { margin: 0; }
.publication-document .pub-field { padding: 10px 0; border-bottom: 1px solid var(--stroke-divider, #d8dee4); }
.publication-document dt { font-weight: 600; font-size: 12px; color: var(--text-secondary, #57606a); }
.publication-document dd { margin: 4px 0 0; white-space: pre-wrap; }
.publication-document dd > dl { border-left: 2px solid var(--stroke-divider, #d8dee4); padding-left: 16px; }
.publication-document .pub-items { list-style: none; margin: 0; padding: 0; }
.publication-document .pub-item { padding: 20px 0; border-bottom: 1px solid var(--stroke-divider, #d8dee4); }
.publication-document .pub-schedule .pub-item { display: grid; grid-template-columns: minmax(100px, 25%) minmax(0, 1fr); gap: 24px; }
.publication-document .pub-checklist .pub-item { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 12px; }
.publication-document .pub-check { font-size: 22px; line-height: 1.5; }
.publication-document .pub-brief h2 { font-size: 21px; }
.publication-document pre { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; max-width: 100%; font: 12px/1.6 ui-monospace, monospace; }
.publication-document details { border-top: 1px solid var(--stroke-divider, #d8dee4); padding-top: 14px; margin-top: 24px; }
.publication-document summary { cursor: pointer; font-weight: 600; }
.publication-document footer { margin-top: 24px; color: var(--text-secondary, #57606a); font-size: 11px; }
@media (max-width: 600px) { .publication-document { padding: 16px; margin: 12px auto; } .publication-document .pub-schedule .pub-item { grid-template-columns: 1fr; gap: 8px; } }
@media print { @page { margin: 16mm; } .publication-document { color: #24292f; background: #fff; max-width: none; padding: 0; margin: 0; font-size: 11pt; } .publication-document h1, .publication-document h2, .publication-document dt { break-after: avoid; } .publication-document p { orphans: 3; widows: 3; } .publication-document .pub-item, .publication-document .pub-field, .publication-document pre { break-inside: auto; } .publication-document details > * { display: block !important; } .publication-document details::details-content { content-visibility: visible !important; display: block !important; } .publication-document summary { list-style: none; } }
`;
