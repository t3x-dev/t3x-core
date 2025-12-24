'use client';

import { useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Toast, useToast } from '@/components/Toast';
import { useProjectStore } from '@/store/projectStore';
import { useCanvasStore } from '@/store/canvasStore';
import './App.css';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { messages, addToast, dismissToast } = useToast();
  const setProjectNotify = useProjectStore((state) => state.setNotifyCallback);
  const setCanvasNotify = useCanvasStore((state) => state.setNotifyCallback);

  // Register toast callback with stores
  useEffect(() => {
    setProjectNotify(addToast);
    setCanvasNotify(addToast);
    return () => {
      setProjectNotify(null);
      setCanvasNotify(null);
    };
  }, [setProjectNotify, setCanvasNotify, addToast]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-content">{children}</main>
      <Toast messages={messages} onDismiss={dismissToast} />
    </div>
  );
}
