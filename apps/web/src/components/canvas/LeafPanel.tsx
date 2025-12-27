'use client'

import { useCanvasStore } from '@/store/canvasStore'
import { LEAF_TYPES } from './CanvasNodes'
import type { LeafType } from '@/types/nodes'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export function LeafPanel() {
  const leafPanelOpen = useCanvasStore((state) => state.leafPanelOpen)
  const closeLeafPanel = useCanvasStore((state) => state.closeLeafPanel)
  const addLeafNode = useCanvasStore((state) => state.addLeafNode)

  const handleSelectLeaf = (leafType: LeafType) => {
    addLeafNode(leafType)
    closeLeafPanel()
  }

  return (
    <Sheet open={leafPanelOpen} onOpenChange={(open) => !open && closeLeafPanel()}>
      <SheetContent side="right" className="w-80 sm:max-w-80">
        <SheetHeader>
          <SheetTitle>Output Destinations</SheetTitle>
          <SheetDescription>
            Select where to publish your content
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 p-4">
          {LEAF_TYPES.map(({ type, label, icon: Icon }) => (
            <Button
              key={type}
              variant="outline"
              className="h-auto justify-start gap-3 px-4 py-3"
              onClick={() => handleSelectLeaf(type)}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                <Icon className="h-4 w-4" />
              </div>
              <span className="font-medium">{label}</span>
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
