import { type RefObject, useState } from 'react';
import {
  type PublicationConfig,
  type PublicationSource,
  publicationHref,
  publicationMappingIssue,
  publicationMarkdown,
  publicationValue,
} from '@/domain/project/publication';
import {
  downloadPublication,
  printPublication,
  publicationHtml,
} from '@/infrastructure/export/publication';

export function usePublicationExport(
  source: PublicationSource,
  config: PublicationConfig,
  article: RefObject<HTMLElement | null>,
  styles: string,
  commitHref?: string
) {
  const [feedback, setFeedback] = useState<{ error?: boolean; text: string } | null>(null);
  const [printing, setPrinting] = useState(false);
  const unavailable = source.value === undefined;
  const issue = publicationMappingIssue(publicationValue(source.value).value, config);
  async function exportFile(format: 'html' | 'md' | 'print') {
    if (!article.current || unavailable || issue) return;
    setFeedback(null);
    try {
      if (format === 'md')
        downloadPublication(
          publicationMarkdown(source, config),
          format,
          `${source.stage}-${source.version}`
        );
      else {
        const html = publicationHtml(article.current, styles, source.project);
        if (format === 'print') {
          setPrinting(true);
          await printPublication(html);
        } else downloadPublication(html, format, `${source.stage}-${source.version}`);
      }
    } catch (error) {
      setFeedback({
        error: true,
        text: error instanceof Error ? error.message : 'Export failed. Try again.',
      });
    } finally {
      setPrinting(false);
    }
  }
  async function share() {
    if (source.stage !== 'Committed State' || !commitHref) return;
    try {
      await navigator.clipboard.writeText(
        new URL(publicationHref(commitHref, config), window.location.origin).href
      );
      setFeedback({ text: 'Version link copied. Repository access is still required.' });
    } catch (error) {
      setFeedback({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : 'Could not copy the link. Allow clipboard access and try again.',
      });
    }
  }
  return { feedback, printing, exportFile, share };
}
