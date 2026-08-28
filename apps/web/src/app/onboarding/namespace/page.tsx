import type { Metadata } from 'next';
import { PersonalNamespaceOnboarding } from '@/components/onboarding/PersonalNamespaceOnboarding';

export const metadata: Metadata = {
  title: 'Choose your namespace · T3X',
};

interface PersonalNamespacePageProps {
  searchParams: Promise<{ suggested?: string | string[] }>;
}

export default async function PersonalNamespacePage({ searchParams }: PersonalNamespacePageProps) {
  const params = await searchParams;
  const suggestedNamespace = Array.isArray(params.suggested)
    ? params.suggested[0]
    : params.suggested;

  return <PersonalNamespaceOnboarding suggestedNamespace={suggestedNamespace} />;
}
