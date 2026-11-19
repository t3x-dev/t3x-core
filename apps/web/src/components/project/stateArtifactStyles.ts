// The preview and standalone exports use the same self-contained styles.
export const stateArtifactStyles = `
.t3x-state-artifact {
  --card-padding: clamp(16px, 4cqw, 28px);
  --card-divider: var(--stroke-default);
  --card-muted: var(--text-secondary);
  box-sizing: border-box; width: 100%; max-width: 44rem; container-type: inline-size;
  color: var(--text-primary); background: var(--surface-elevated); border: 1px solid var(--stroke-strong);
  border-radius: 12px; overflow: hidden; font: 14px/1.6 system-ui, sans-serif;
}
.t3x-state-artifact * { box-sizing: border-box; }
.t3x-state-artifact > header {
  display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 14px; align-items: start;
  padding: 24px var(--card-padding); border-bottom: 1px solid var(--card-divider);
  background: var(--surface-panel);
}
.t3x-state-artifact .t3x-artifact-icon {
  display: grid; place-items: center; width: 38px; height: 38px;
  border-radius: 9px; color: var(--accent-conversation); background: color-mix(in oklab, var(--accent-conversation) 12%, transparent);
}
.t3x-state-artifact .t3x-artifact-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--card-muted); font-size: 12px; }
.t3x-state-artifact .t3x-artifact-tag-kind {
  padding: 2px 8px; border-radius: 6px; font-weight: 600;
  background: color-mix(in oklab, var(--accent-conversation) 12%, transparent); color: var(--accent-conversation);
}
.t3x-state-artifact h2, .t3x-state-artifact h3, .t3x-state-artifact h4,
.t3x-state-artifact p, .t3x-state-artifact dl, .t3x-state-artifact dd { margin: 0; }
.t3x-state-artifact h2 { margin-top: 8px; font-size: 24px; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
.t3x-state-artifact .t3x-artifact-description { margin-top: 8px; color: var(--card-muted); }
.t3x-state-artifact section { padding: 20px var(--card-padding); }
.t3x-state-artifact .t3x-artifact-section-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.t3x-state-artifact h3 { font-size: 14px; font-weight: 650; }
.t3x-state-artifact .t3x-artifact-note { color: var(--card-muted); font-size: 12px; }
.t3x-state-artifact .t3x-artifact-group + .t3x-artifact-group { margin-top: 20px; }
.t3x-state-artifact h4 { padding-bottom: 6px; border-bottom: 1px solid var(--card-divider); font-size: 13px; font-weight: 650; overflow-wrap: anywhere; white-space: pre-wrap; }
.t3x-state-artifact dl > div {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr);
  gap: 8px 20px; align-items: baseline; padding: 8px 0;
}
.t3x-state-artifact dl > div + div { border-top: 1px solid var(--card-divider); }
.t3x-state-artifact dt { color: var(--card-muted); font-size: 13px; }
.t3x-state-artifact dt, .t3x-state-artifact dd, .t3x-state-artifact .t3x-artifact-value,
.t3x-state-artifact .t3x-artifact-excerpt { overflow-wrap: anywhere; white-space: pre-wrap; min-width: 0; }
.t3x-state-artifact .t3x-artifact-scope { margin-top: 16px; color: var(--card-muted); font-size: 12px; }
.t3x-state-artifact summary { cursor: pointer; }
.t3x-state-artifact summary:focus-visible, .t3x-state-artifact pre:focus-visible { outline: 2px solid var(--accent-commit); outline-offset: 2px; }
.t3x-state-artifact .t3x-artifact-text > summary { display: block; list-style: none; }
.t3x-state-artifact .t3x-artifact-text > summary::-webkit-details-marker { display: none; }
.t3x-state-artifact .t3x-artifact-excerpt { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.t3x-state-artifact .t3x-artifact-more, .t3x-state-artifact .t3x-artifact-less { display: block; margin-top: 4px; color: var(--accent-commit); font-size: 12px; font-weight: 600; }
.t3x-state-artifact .t3x-artifact-text > summary:hover .t3x-artifact-more,
.t3x-state-artifact .t3x-artifact-text > summary:hover .t3x-artifact-less { text-decoration: underline; }
.t3x-state-artifact .t3x-artifact-less,
.t3x-state-artifact .t3x-artifact-text[open] .t3x-artifact-more,
.t3x-state-artifact .t3x-artifact-text[open] .t3x-artifact-excerpt { display: none; }
.t3x-state-artifact .t3x-artifact-text[open] .t3x-artifact-less { display: block; margin: 0 0 4px; }
.t3x-state-artifact .t3x-artifact-disclosure { border-top: 1px solid var(--card-divider); }
.t3x-state-artifact .t3x-artifact-disclosure > summary { display: list-item; padding: 12px var(--card-padding); font-size: 13px; font-weight: 600; }
.t3x-state-artifact .t3x-artifact-disclosure > summary:hover { background: var(--surface-panel); }
.t3x-state-artifact .t3x-artifact-disclosure > summary:focus-visible { outline-offset: -3px; }
.t3x-state-artifact .t3x-artifact-metadata { margin: 0 var(--card-padding) 16px; }
.t3x-state-artifact pre {
  margin: 0 var(--card-padding) var(--card-padding); padding: 12px; max-height: 19rem; overflow: auto;
  border: 1px solid var(--card-divider); border-radius: 7px; background: var(--surface-panel);
  white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2;
}
.t3x-state-artifact code { font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
.t3x-state-artifact pre code { display: block; }
@container (max-width: 26rem) {
  .t3x-state-artifact > header { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .t3x-state-artifact .t3x-artifact-icon { display: none; }
  .t3x-state-artifact h2 { font-size: 21px; }
  .t3x-state-artifact dl > div { grid-template-columns: minmax(0, 1fr); gap: 3px; }
}
`;
