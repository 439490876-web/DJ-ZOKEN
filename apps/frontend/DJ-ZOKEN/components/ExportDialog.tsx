import React, { useEffect, useMemo, useState } from 'react'
import { Track } from '../types'
import {
  ExportPayload,
  ExportTarget,
  buildExportPayload,
  getMissingFilePaths,
} from '../services/exportService'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (payload: ExportPayload) => void
  tracks: Track[]
  defaultSetName: string
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onClose,
  onConfirm,
  tracks,
  defaultSetName,
}) => {
  const [target, setTarget] = useState<ExportTarget>('serato')
  const [setName, setSetName] = useState(defaultSetName)

  useEffect(() => {
    if (open) {
      setTarget('serato')
      setSetName(defaultSetName)
    }
  }, [open, defaultSetName])

  const filePaths = useMemo(
    () => tracks.map((track) => track.filePath ?? null),
    [tracks]
  )
  const missing = useMemo(() => getMissingFilePaths(filePaths), [filePaths])
  const payload = useMemo(
    () => buildExportPayload(target, setName.trim(), filePaths),
    [target, setName, filePaths]
  )
  const canConfirm = payload.filePaths.length > 0 && setName.trim().length > 0

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">导出 Set</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="export-set-name"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400"
            >
              Set 名称
            </label>
            <input
              id="export-set-name"
              aria-label="Set 名称"
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
          </div>

          <div>
            <label
              htmlFor="export-source"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400"
            >
              导出对象
            </label>
            <select
              id="export-source"
              aria-label="导出对象"
              className="w-full rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-300"
              value="current"
              disabled
            >
              <option value="current">当前编排</option>
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              导出目标
            </legend>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                id="export-target-serato"
                aria-label="Serato"
                type="radio"
                name="export-target"
                checked={target === 'serato'}
                onChange={() => setTarget('serato')}
              />
              Serato
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                id="export-target-rekordbox"
                aria-label="Rekordbox"
                type="radio"
                name="export-target"
                checked={target === 'rekordbox'}
                onChange={() => setTarget('rekordbox')}
              />
              Rekordbox
            </label>
          </fieldset>

          <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
            导出位置：将自动检测目标软件目录
          </div>

          {missing.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              缺少 {missing.length} 首文件路径
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(payload)}
            disabled={!canConfirm}
            className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            确认导出
          </button>
        </div>
      </div>
    </div>
  )
}
