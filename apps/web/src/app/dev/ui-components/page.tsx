import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComponentDemo } from './ComponentDemo';

export const metadata: Metadata = { title: 'Feedback & overlays · T3X' };

export default function ComponentDemoPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ComponentDemo />;
}
