import { AlertTriangle, X } from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'

export function DeletionConfirmDialog() {
  const deletionConfirmation = useCanvasStore((state) => state.deletionConfirmation)
  const confirmDeletion = useCanvasStore((state) => state.confirmDeletion)
  const cancelDeletion = useCanvasStore((state) => state.cancelDeletion)

  if (!deletionConfirmation) {
    return null
  }

  const { message, nodeIds, edgeIds } = deletionConfirmation
  const itemCount = nodeIds.length + edgeIds.length

  return (
    <div className="deletion-confirm__overlay" role="dialog" aria-modal="true">
      <div className="deletion-confirm__dialog">
        <div className="deletion-confirm__header">
          <AlertTriangle size={24} className="deletion-confirm__icon" />
          <h3 className="deletion-confirm__title">Confirm Deletion</h3>
          <button
            className="deletion-confirm__close"
            onClick={cancelDeletion}
            aria-label="Cancel"
          >
            <X size={18} />
          </button>
        </div>

        <div className="deletion-confirm__body">
          {message.split('\n').map((line, idx) => (
            <p key={idx} className="deletion-confirm__message">{line}</p>
          ))}
          <p className="deletion-confirm__summary">
            {nodeIds.length > 0 && `${nodeIds.length} node(s)`}
            {nodeIds.length > 0 && edgeIds.length > 0 && ' and '}
            {edgeIds.length > 0 && `${edgeIds.length} connection(s)`}
            {' will be removed.'}
          </p>
        </div>

        <div className="deletion-confirm__footer">
          <button
            className="deletion-confirm__btn deletion-confirm__btn--cancel"
            onClick={cancelDeletion}
          >
            Cancel
          </button>
          <button
            className="deletion-confirm__btn deletion-confirm__btn--confirm"
            onClick={confirmDeletion}
          >
            Delete {itemCount > 1 ? `(${itemCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
