import { downloadArtifact } from './stateArtifact';

/** Only the React-rendered reading document is copied, never editor controls or user HTML. */
export function publicationHtml(article: HTMLElement, styles: string, title: string) {
  const doc = document.implementation.createHTMLDocument(title);
  doc.documentElement.lang = document.documentElement.lang || 'en';
  const charset = doc.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  const viewport = doc.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1';
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content =
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
  const style = doc.createElement('style');
  style.textContent = styles;
  doc.head.prepend(charset, viewport, policy, style);
  doc.body.append(article.cloneNode(true));
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function downloadPublication(content: string, format: 'html' | 'md', version: string) {
  const name = version.replace(/[^a-z0-9_-]/gi, '-').slice(0, 96);
  downloadArtifact(
    new Blob([content], {
      type: format === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8',
    }),
    `publication-${name}.${format}`
  );
}

export function printPublication(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = 'Publication print document';
    frame.style.cssText =
      'position:fixed;width:1px;height:1px;inset:0;border:0;opacity:0;pointer-events:none';
    frame.setAttribute('aria-hidden', 'true');
    const timeout = window.setTimeout(() => {
      frame.remove();
      reject(new Error('Print document could not load. Download HTML and print it instead.'));
    }, 15000);
    frame.onload = () => {
      window.clearTimeout(timeout);
      try {
        const target = frame.contentWindow;
        if (!target) throw new Error('Print is unavailable. Download HTML and print it instead.');
        frame.contentDocument?.querySelectorAll('details').forEach((detail) => {
          detail.open = true;
        });
        target.addEventListener('afterprint', () => frame.remove(), { once: true });
        target.focus();
        target.print();
        // Some browsers do not emit afterprint for cancelled dialogs.
        window.setTimeout(() => frame.remove(), 60000);
        resolve();
      } catch (error) {
        frame.remove();
        reject(error);
      }
    };
    frame.srcdoc = html;
    document.body.append(frame);
  });
}
