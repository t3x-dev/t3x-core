import { notFound } from 'next/navigation';

// Reserve the retired URL so it cannot fall through to the namespace route.
export default function RetiredInsightsPage() {
  notFound();
}
