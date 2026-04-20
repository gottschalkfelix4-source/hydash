import { useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

const variantStyles = {
  danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  warning: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
  primary: 'bg-hydash-600 hover:bg-hydash-700 focus:ring-hydash-500',
};

export default function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  confirmVariant = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center space-x-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-yellow-500 shrink-0" />
          <h3 className="text-xl font-semibold text-white">{title}</h3>
        </div>
        <p className="text-gray-300 text-sm mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex items-center space-x-2 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 ${variantStyles[confirmVariant]}`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}