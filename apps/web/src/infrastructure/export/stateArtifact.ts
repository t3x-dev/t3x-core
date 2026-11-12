export function downloadArtifact(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cardColorTokens = [
  '--accent-commit',
  '--accent-conversation',
  '--hover-bg',
  '--stroke-default',
  '--stroke-strong',
  '--surface-elevated',
  '--surface-panel',
  '--text-primary',
  '--text-secondary',
];

export async function exportArtifactCard(
  card: HTMLElement,
  styles: string,
  title: string,
  format: 'html' | 'png'
) {
  const { width, height } = card.getBoundingClientRect();
  const copy = card.cloneNode(true) as HTMLElement;
  copy.style.width = `${width}px`;
  // Standalone HTML and PNG cannot inherit the application's theme.
  const theme = getComputedStyle(card);
  for (const token of cardColorTokens) {
    copy.style.setProperty(token, theme.getPropertyValue(token));
  }

  if (format === 'html') {
    const doc = document.implementation.createHTMLDocument(title);
    doc.documentElement.lang = 'en';
    const charset = doc.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    const viewport = doc.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    const style = doc.createElement('style');
    style.textContent = styles;
    doc.head.prepend(charset, viewport, style);
    doc.body.style.margin = '16px';
    doc.body.style.background = theme.getPropertyValue('--surface-panel');
    copy.style.marginInline = 'auto';
    const scrollTop = card.querySelector('pre')?.scrollTop ?? 0;
    doc.body.append(copy);
    if (scrollTop) {
      const script = doc.createElement('script');
      script.textContent = `document.querySelector('pre').scrollTop = ${scrollTop};`;
      doc.body.append(script);
    }
    return new Blob(['<!doctype html>\n', doc.documentElement.outerHTML], {
      type: 'text/html;charset=utf-8',
    });
  }

  // shortcut: PNG captures the displayed card via SVG foreignObject; replace this path if broader browser support is needed.
  const imageWidth = Math.ceil(width);
  const imageHeight = Math.ceil(height);
  const scrollTop = card.querySelector('pre')?.scrollTop ?? 0;
  const pre = copy.querySelector('pre');
  if (pre && scrollTop) {
    pre.style.overflow = 'hidden';
    const code = pre.querySelector('code');
    if (code) code.style.transform = `translateY(-${scrollTop}px)`;
  }
  const surface = document.createElement('div');
  const style = document.createElement('style');
  style.textContent = styles;
  surface.append(style, copy);
  const markup = new XMLSerializer().serializeToString(surface);
  const size = `width="${imageWidth}" height="${imageHeight}"`;
  const image = new Image();
  image.src =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" ${size}><foreignObject ${size}>${markup}</foreignObject></svg>`
    );
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(2, 4096 / Math.max(imageWidth, imageHeight));
  canvas.width = Math.round(imageWidth * scale);
  canvas.height = Math.round(imageHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNG export is unavailable in this browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!context.getImageData(canvas.width / 2, 2, 1, 1).data[3]) {
    throw new Error('This browser could not render the card as PNG. Export HTML instead.');
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Unable to encode PNG.'))),
      'image/png'
    );
  });
}
