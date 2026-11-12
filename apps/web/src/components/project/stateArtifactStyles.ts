// The preview and standalone exports use the same self-contained styles.
export const stateArtifactStyles = `
.t3x-state-artifact {
  box-sizing: border-box; width: 100%; max-width: 46rem; container-type: inline-size;
  color: #1f2328; background: #fff; border: 1px solid #d0d7de;
  border-radius: 12px; overflow: hidden; font: 14px/1.5 system-ui, sans-serif;
}
.t3x-state-artifact * { box-sizing: border-box; }
.t3x-state-artifact header, .t3x-state-artifact section, .t3x-state-artifact details {
  padding: 20px clamp(14px, 4cqw, 26px);
}
.t3x-state-artifact header { background: #f6f8fa; border-bottom: 1px solid #d8dee4; }
.t3x-state-artifact h2, .t3x-state-artifact h3, .t3x-state-artifact p,
.t3x-state-artifact dl, .t3x-state-artifact dd { margin: 0; }
.t3x-state-artifact h2 {
  font-size: 24px; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}
.t3x-state-artifact h3 { margin-bottom: 12px; font-size: 14px; font-weight: 650; }
.t3x-state-artifact .t3x-artifact-revision { margin-top: 8px; color: #424a53; font-size: 12px; }
.t3x-state-artifact dl > div {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 10px; align-items: start; padding: 9px 0; border-top: 1px solid #e8ebef;
}
.t3x-state-artifact dt, .t3x-state-artifact dd > span:last-child {
  overflow-wrap: anywhere; white-space: pre-wrap;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
.t3x-state-artifact dt { font-weight: 600; }
.t3x-state-artifact dd { display: flex; align-items: start; gap: 8px; min-width: 0; }
.t3x-state-artifact .t3x-artifact-type {
  border-radius: 4px; padding: 0 5px; background: #ddf4ff; color: #0550ae;
  font-size: 12px; white-space: nowrap;
}
.t3x-state-artifact [data-kind="List"] { background: #dafbe1; color: #116329; }
.t3x-state-artifact [data-kind="Object"] { background: #fbefff; color: #6639ba; }
.t3x-state-artifact .t3x-artifact-note { color: #424a53; }
.t3x-state-artifact details { border-top: 1px solid #d8dee4; }
.t3x-state-artifact summary { display: list-item; cursor: pointer; font-weight: 600; }
.t3x-state-artifact pre {
  margin: 12px 0 0; padding: 12px; max-height: 19rem; overflow: auto;
  border: 1px solid #d8dee4; border-radius: 6px; background: #f6f8fa;
  white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2;
}
.t3x-state-artifact code { font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
.t3x-state-artifact pre code { display: block; }
`;
