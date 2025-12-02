import { X } from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { LEAF_TYPES } from './CanvasNodes'
import type { LeafType } from '../types/nodes'

export function LeafPanel() {
  const leafPanelOpen = useCanvasStore((state) => state.leafPanelOpen)
  const closeLeafPanel = useCanvasStore((state) => state.closeLeafPanel)
  const addLeafNode = useCanvasStore((state) => state.addLeafNode)

  if (!leafPanelOpen) return null

  const handleSelectLeaf = (leafType: LeafType) => {
    addLeafNode(leafType)
  }

  return (
    <div className="leaf-panel">
      <div className="leaf-panel__header">
        <h3>Output Destinations</h3>
        <button
          className="leaf-panel__close"
          onClick={closeLeafPanel}
          aria-label="Close panel"
        >
          <X size={18} />
        </button>
      </div>
      <div className="leaf-panel__list">
        {LEAF_TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            className="leaf-panel__item"
            onClick={() => handleSelectLeaf(type)}
          >
            <div className="leaf-panel__item-icon">
              <Icon size={20} />
            </div>
            <span className="leaf-panel__item-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
