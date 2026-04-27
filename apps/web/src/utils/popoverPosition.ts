type HorizontalAlign = 'start' | 'end';

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface FixedPopoverOptions {
  width: number;
  viewportWidth: number;
  viewportHeight?: number;
  estimatedHeight?: number;
  align?: HorizontalAlign;
  gap?: number;
  margin?: number;
  zIndex?: number;
}

export function getFixedPopoverStyle(
  anchor: AnchorRect,
  {
    width,
    viewportWidth,
    viewportHeight,
    estimatedHeight = 0,
    align = 'start',
    gap = 4,
    margin = 8,
    zIndex = 9999,
  }: FixedPopoverOptions
) {
  const desiredLeft = align === 'end' ? anchor.right - width : anchor.left;
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const left = Math.max(margin, Math.min(desiredLeft, maxLeft));
  const style: {
    position: 'fixed';
    top?: number;
    bottom?: number;
    left: number;
    zIndex: number;
  } = {
    position: 'fixed',
    top: anchor.bottom + gap,
    left,
    zIndex,
  };

  if (viewportHeight && estimatedHeight > 0) {
    const spaceBelow = viewportHeight - anchor.bottom - margin;
    const openUpward = spaceBelow < Math.min(estimatedHeight, 220) && anchor.top > spaceBelow;
    if (openUpward) {
      delete style.top;
      style.bottom = viewportHeight - anchor.top + gap;
    }
  }

  return style;
}
