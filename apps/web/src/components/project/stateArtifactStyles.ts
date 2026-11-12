// The preview and standalone exports use the same self-contained styles.
export const stateArtifactStyles = `
.t3x-state-artifact {
  --card-padding: clamp(14px, 4cqw, 24px);
  --card-divider: #d8dee4;
  --card-muted: #4b5563;
  box-sizing: border-box; width: 100%; max-width: 44rem; container-type: inline-size;
  color: #1f2328; background: #fff; border: 1px solid #d0d7de;
  border-radius: 12px; overflow: hidden; font: 14px/1.55 system-ui, sans-serif;
}
.t3x-state-artifact * { box-sizing: border-box; }
.t3x-state-artifact header {
  display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 12px; align-items: start;
  padding: 18px var(--card-padding); border-bottom: 1px solid var(--card-divider);
  background: #f8fafc;
}
.t3x-state-artifact .t3x-artifact-icon {
  display: grid; place-items: center; width: 38px; height: 38px;
  border-radius: 9px; color: #6338a4; background: #f1e8ff;
}
.t3x-state-artifact .t3x-artifact-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.t3x-state-artifact .t3x-artifact-tags > span {
  padding: 2px 8px; border-radius: 12px; background: #eaeef2;
  color: var(--card-muted); font-size: 12px; font-weight: 600;
}
.t3x-state-artifact .t3x-artifact-tags > span:first-child { background: #f1e8ff; color: #6338a4; }
.t3x-state-artifact h2, .t3x-state-artifact h3, .t3x-state-artifact p,
.t3x-state-artifact dl, .t3x-state-artifact dd { margin: 0; }
.t3x-state-artifact h2 {
  margin-top: 6px; font-size: 22px; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}
.t3x-state-artifact section { padding: 16px var(--card-padding); }
.t3x-state-artifact h3 { margin-bottom: 6px; font-size: 13px; font-weight: 650; }
.t3x-state-artifact dl > div {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr);
  gap: clamp(12px, 3cqw, 22px); align-items: baseline;
  padding: 7px 0; border-bottom: 1px solid #e5e9ee;
}
.t3x-state-artifact dl > div:last-child { border-bottom: 0; }
.t3x-state-artifact dt, .t3x-state-artifact .t3x-artifact-value,
.t3x-state-artifact .t3x-artifact-field > span:first-child {
  overflow-wrap: anywhere; white-space: pre-wrap;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}
.t3x-state-artifact dt { color: var(--card-muted); font-weight: 600; }
.t3x-state-artifact .t3x-artifact-field {
  display: grid; grid-template-columns: clamp(3.25rem, 22%, 5.5rem) minmax(0, 1fr);
  gap: 8px; align-items: baseline;
}
.t3x-state-artifact .t3x-artifact-field + .t3x-artifact-field { margin-top: 2px; }
.t3x-state-artifact .t3x-artifact-field > span:first-child { color: var(--card-muted); font-size: 12px; }
.t3x-state-artifact .t3x-artifact-note { color: var(--card-muted); }
.t3x-state-artifact dl + .t3x-artifact-note { margin-top: 8px; }
.t3x-state-artifact details { border-top: 1px solid var(--card-divider); }
.t3x-state-artifact summary {
  display: list-item; padding: 12px var(--card-padding);
  cursor: pointer; color: #0753a0; font-weight: 600;
}
.t3x-state-artifact summary:hover { background: #f8fafc; }
.t3x-state-artifact summary:focus-visible, .t3x-state-artifact pre:focus-visible {
  outline: 2px solid #0969da; outline-offset: -2px;
}
.t3x-state-artifact pre {
  margin: 0 var(--card-padding) var(--card-padding); padding: 10px; max-height: 19rem; overflow: auto;
  border: 1px solid var(--card-divider); border-radius: 7px; background: #f6f8fa;
  white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2;
}
.t3x-state-artifact code { font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
.t3x-state-artifact pre code { display: block; }
`;
