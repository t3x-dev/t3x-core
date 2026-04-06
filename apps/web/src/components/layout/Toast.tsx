/**
 * Toast notification utilities using Sonner
 */

import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/**
 * Show a toast notification
 * This is the callback signature expected by stores
 */
export function showToast(message: string, type: ToastType, action?: ToastAction) {
  const options = action
    ? {
        action: {
          label: action.label,
          onClick: action.onClick,
        },
      }
    : undefined;

  switch (type) {
    case 'success':
      toast.success(message, options);
      break;
    case 'error':
      toast.error(message, options);
      break;
    case 'warning':
      toast.warning(message, options);
      break;
  }
}

// Re-export toast for direct usage
export { toast };
