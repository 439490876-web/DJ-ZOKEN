import React from 'react'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="mb-3 text-lg font-semibold text-white">确认重置当前 SET</div>
        <p className="text-sm text-slate-300">
          重置将清空当前编排的所有曲目，此操作不可撤销。
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
          >
            确认重置
          </button>
        </div>
      </div>
    </div>
  )
}
