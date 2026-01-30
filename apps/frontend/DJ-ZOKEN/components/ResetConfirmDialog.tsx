import React from 'react'
import { GlassButton } from './GlassButton'

interface ResetConfirmDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

export const ResetConfirmDialog: React.FC<ResetConfirmDialogProps> = ({
  open,
  onCancel,
  onConfirm,
}) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl glass-panel p-5 shadow-xl">
        <div className="mb-3 text-lg font-semibold text-white">确认重置当前 SET</div>
        <p className="text-sm text-slate-300">
          重置将清空当前编排的所有曲目，此操作不可撤销。
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <GlassButton
            onClick={onCancel}
            variant="secondary"
            className="rounded-full px-4 py-2 text-sm"
          >
            取消
          </GlassButton>
          <GlassButton
            onClick={onConfirm}
            variant="danger"
            className="rounded-full px-4 py-2 text-sm font-semibold"
          >
            确认重置
          </GlassButton>
        </div>
      </div>
    </div>
  )
}
