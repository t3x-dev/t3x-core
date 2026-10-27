import { notFound } from 'next/navigation';

/** Keep retired archive URLs from falling through to the repository catch-all. */
export default function RetiredLeafRoute(): never {
  notFound();
}
