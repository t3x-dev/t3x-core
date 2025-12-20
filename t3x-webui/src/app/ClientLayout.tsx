'use client';

import { useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Toast, useToast } from '@/components/Toast';
import { useProjectStore } from '@/store/projectStore';
import './App.css';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { messages, addToast, dismissToast } = useToast();
  const setNotifyCallback = useProjectStore((state) => state.setNotifyCallback);

  // Register toast callback with project store
  useEffect(() => {
    setNotifyCallback(addToast);
    return () => setNotifyCallback(null);
  }, [setNotifyCallback, addToast]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-content">{children}</main>
      <Toast messages={messages} onDismiss={dismissToast} />
    </div>
  );
}
