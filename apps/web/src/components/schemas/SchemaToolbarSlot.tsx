'use client';
import { createContext, type ReactNode, useContext } from 'react';
import { createPortal } from 'react-dom';

export const SchemaToolbarContext = createContext<HTMLElement | null>(null);
export function SchemaToolbarSlot({ children }: { children: ReactNode }) {
  const target = useContext(SchemaToolbarContext);
  return target ? createPortal(children, target) : children;
}
