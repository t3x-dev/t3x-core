'use client';

import { Building2, Check, ChevronsUpDown, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { cn } from '@/utils/cn';

interface NamespaceAccountSelectorProps {
  collapsed: boolean;
}

export function NamespaceAccountSelector({ collapsed }: NamespaceAccountSelectorProps) {
  const router = useRouter();
  const { accounts, activeAccount, selectNamespace, isLoading, error } = useNamespaceAccounts();

  if (isLoading && !activeAccount) {
    return <div aria-hidden="true" className={collapsed ? 'h-9 w-9' : 'h-9 w-full'} />;
  }
  if (error || !activeAccount || accounts.length === 0) return null;

  const activeNamespace = activeAccount.namespace;
  const ActiveIcon = activeNamespace.kind === 'organization' ? Building2 : UserRound;
  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={`Current workspace: ${activeNamespace.display_name}`}
        className={cn(
          'flex h-9 items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
          collapsed ? 'w-9 justify-center' : 'w-full gap-2 px-2'
        )}
      >
        <ActiveIcon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-[12px] font-medium">
              {activeNamespace.display_name}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
          </>
        )}
      </button>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {activeNamespace.display_name}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        side={collapsed ? 'right' : 'top'}
        align="start"
        sideOffset={collapsed ? 4 : 8}
        className="w-64"
      >
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((account) => {
          const namespace = account.namespace;
          const NamespaceIcon = namespace.kind === 'organization' ? Building2 : UserRound;
          const selected = namespace.namespace_id === activeNamespace.namespace_id;
          return (
            <DropdownMenuItem
              key={namespace.namespace_id}
              className="flex cursor-pointer items-center gap-2"
              onSelect={() => {
                selectNamespace(namespace.namespace_id);
                router.push(`/${namespace.slug}`);
              }}
            >
              <NamespaceIcon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{namespace.display_name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {account.current_membership.role}
                </span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0" aria-label="Selected" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
