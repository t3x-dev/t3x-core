'use client';

import { useState } from 'react';
import { useTriageStore } from '@/store/triageStore';

/**
 * AddFromChatForm — Mini form shown when user selects text in chat during review.
 * Blue-bordered card. Lets user pick a target triage item, set key/value, and add
 * a manual slot.
 */

interface AddFromChatFormProps {
  selectedText: string;
  onClose: () => void;
}

export function AddFromChatForm({ selectedText, onClose }: AddFromChatFormProps) {
  const items = useTriageStore((s) => s.items);
  const decisions = useTriageStore((s) => s.decisions);
  const addManualSlot = useTriageStore((s) => s.addManualSlot);

  // Only accepted items are valid targets
  const acceptedItems = items.filter((item) => decisions[item.id] === 'accepted');

  const [targetId, setTargetId] = useState(acceptedItems[0]?.id ?? '');
  const [key, setKey] = useState('');
  const [value, setValue] = useState(selectedText);

  const handleAdd = () => {
    if (!targetId || !key.trim() || !value.trim()) return;
    addManualSlot(targetId, key.trim(), value.trim());
    onClose();
  };

  return (
    <div
      style={{
        margin: '8px 12px',
        padding: 10,
        background: 'var(--surface-panel)',
        border: '1px solid rgba(96,165,250,0.3)',
        borderRadius: 8,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-1"
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: '#60a5fa',
          marginBottom: 6,
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add to extraction
      </div>

      {/* Selected text preview */}
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          marginBottom: 6,
          padding: '4px 6px',
          background: 'var(--surface-raised)',
          borderRadius: 4,
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        }}
      >
        &ldquo;{selectedText}&rdquo;
      </div>

      {/* Node selector */}
      <div className="flex gap-1.5 items-center" style={{ marginBottom: 6 }}>
        <span
          style={{
            fontSize: 9,
            color: 'var(--text-tertiary)',
            width: 40,
            textAlign: 'right',
          }}
        >
          Node:
        </span>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="flex-1"
          style={{
            padding: '3px 6px',
            border: '1px solid var(--stroke-default)',
            borderRadius: 4,
            background: 'var(--surface-raised)',
            fontSize: 10,
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        >
          {acceptedItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
      </div>

      {/* Key input */}
      <div className="flex gap-1.5 items-center" style={{ marginBottom: 6 }}>
        <span
          style={{
            fontSize: 9,
            color: 'var(--text-tertiary)',
            width: 40,
            textAlign: 'right',
          }}
        >
          Key:
        </span>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="slot_key"
          className="flex-1"
          style={{
            padding: '4px 8px',
            border: '1px solid var(--stroke-default)',
            borderRadius: 4,
            background: 'var(--surface-raised)',
            fontSize: 10,
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
      </div>

      {/* Value input */}
      <div className="flex gap-1.5 items-center" style={{ marginBottom: 6 }}>
        <span
          style={{
            fontSize: 9,
            color: 'var(--text-tertiary)',
            width: 40,
            textAlign: 'right',
          }}
        >
          Value:
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
          style={{
            padding: '4px 8px',
            border: '1px solid var(--stroke-default)',
            borderRadius: 4,
            background: 'var(--surface-raised)',
            fontSize: 10,
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-1 justify-end">
        <button
          type="button"
          className="cursor-pointer"
          style={{
            padding: '3px 10px',
            borderRadius: 4,
            border: '1px solid var(--stroke-default)',
            fontSize: 9,
            fontWeight: 600,
            background: 'transparent',
            color: 'var(--text-tertiary)',
          }}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="cursor-pointer"
          style={{
            padding: '3px 10px',
            borderRadius: 4,
            border: 'none',
            fontSize: 9,
            fontWeight: 600,
            background: '#60a5fa',
            color: '#fff',
          }}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>
    </div>
  );
}
