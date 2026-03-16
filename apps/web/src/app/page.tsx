import { redirect } from 'next/navigation';

/**
 * Root page — redirects to /chat (the primary interface).
 * Project management is accessible via the chat sidebar.
 */
export default function RootPage() {
  redirect('/chat');
}
