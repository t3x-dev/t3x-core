/**
 * Toast notification component
 */
/* eslint-disable react-refresh/only-export-components */

import { useEffect, useState, useCallback } from 'react'

export interface ToastMessage {
  id: number
  message: string
  type: 'success' | 'error' | 'warning'
}

interface ToastProps {
  messages: ToastMessage[]
  onDismiss: (id: number) => void
}

export function Toast({ messages, onDismiss }: ToastProps) {
  return (
    <div className="toast-container">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(message.id)
    }, 4000)
    return () => clearTimeout(timer)
  }, [message.id, onDismiss])

  return (
    <div className={`toast toast--${message.type}`} onClick={() => onDismiss(message.id)}>
      <span className="toast__icon">
        {message.type === 'success' && '✓'}
        {message.type === 'error' && '✕'}
        {message.type === 'warning' && '⚠'}
      </span>
      <span className="toast__message">{message.message}</span>
    </div>
  )
}

// Hook to manage toast state
export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'warning') => {
    const id = Date.now()
    setMessages((prev) => [...prev, { id, message, type }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return { messages, addToast, dismissToast }
}
