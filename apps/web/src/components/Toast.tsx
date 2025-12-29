/**
 * Toast notification utilities using Sonner
 */

import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'warning';

/**
 * Show a toast notification
 * This is the callback signature expected by stores
 */
export function showToast(message: string, type: ToastType) {
  switch (type) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'warning':
      toast.warning(message);
      break;
  }
}

// Re-export toast for direct usage
export { toast };
