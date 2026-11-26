import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExampleChat } from './ExampleChat';

export const metadata: Metadata = { title: 'Example Chat · T3X Agent access' };

export default async function ChatPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string; authorize?: string; paused?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const query = await searchParams;
  const chatId = query.chat === 'choose' ? 'choose' : 'editorial';
  return (
    <ExampleChat key={chatId} chatId={chatId} requestId={query.authorize} pausedId={query.paused} />
  );
}
