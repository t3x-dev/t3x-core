import { Bot } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function AgentAccessLink({ href }: { href: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>
        <Bot aria-hidden="true" className="size-4" />
        Agent access
      </Link>
    </Button>
  );
}
