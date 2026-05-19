export const CHAT_COLUMN_MIN_WIDTH = 520;
export const WORKSPACE_PANEL_MIN_WIDTH = 480;
export const WORKSPACE_PANEL_FALLBACK_WIDTH = 700;
export const WORKSPACE_PANEL_DEFAULT_RATIO = 1 / 2;
export const WORKSPACE_DRAG_HANDLE_WIDTH = 4;

export function getPreferredWorkspacePanelWidth(containerWidth: number) {
  return Math.round(containerWidth * WORKSPACE_PANEL_DEFAULT_RATIO);
}

export function clampWorkspacePanelWidth(
  requestedWidth: number,
  containerWidth: number,
  {
    minPanelWidth = WORKSPACE_PANEL_MIN_WIDTH,
    minChatWidth = CHAT_COLUMN_MIN_WIDTH,
    dragHandleWidth = WORKSPACE_DRAG_HANDLE_WIDTH,
  }: {
    minPanelWidth?: number;
    minChatWidth?: number;
    dragHandleWidth?: number;
  } = {}
) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return Math.max(minPanelWidth, requestedWidth);
  }

  const maxWidthThatKeepsChatVisible = containerWidth - minChatWidth - dragHandleWidth;
  const maxWidth = Math.max(minPanelWidth, maxWidthThatKeepsChatVisible);
  return Math.max(minPanelWidth, Math.min(maxWidth, requestedWidth));
}
