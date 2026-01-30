import React, { useEffect, useMemo, useState } from 'react'
import { GlassCard } from './GlassCard'
import { GlassButton } from './GlassButton'
import { SetList, Track } from '../types'
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
  currentTracks: Track[]
  savedSets: SetList[]
  defaultSetName: string
  resolveFilePath?: (track: Track) => string | null
  submitting?: boolean
  error?: string | null
  success?: string | null
  successPath?: string | null
  successTarget?: ExportTarget | null
  canExport?: boolean
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onClose,
  onConfirm,
  currentTracks,
  savedSets,
  defaultSetName,
  resolveFilePath,
  submitting = false,
  error = null,
  success = null,
  successPath = null,
  successTarget = null,
  canExport = true,
}) => {
  const [sourceType, setSourceType] = useState<'current' | 'saved'>('current')
  const [selectedSetId, setSelectedSetId] = useState('')
  const [target, setTarget] = useState<ExportTarget>('serato')
  const [setName, setSetName] = useState(defaultSetName)

  useEffect(() => {
    if (open) {
      setSourceType('current')
      setSelectedSetId('')
      setTarget('serato')
      setSetName(defaultSetName)
    }
  }, [open, defaultSetName])

  const selectedSet = useMemo(
    () => savedSets.find((item) => item.id === selectedSetId),
    [savedSets, selectedSetId]
  )
  const activeTracks = useMemo(
    () => (sourceType === 'current' ? currentTracks : selectedSet?.tracks ?? []),
    [sourceType, currentTracks, selectedSet]
  )

  useEffect(() => {
    if (sourceType === 'saved' && selectedSet?.name) {
      setSetName(selectedSet.name)
    }
  }, [sourceType, selectedSet])

  const filePaths = useMemo(
    () => activeTracks.map((track) => {
      if (resolveFilePath) return resolveFilePath(track)
      return track.filePath ?? null
    }),
    [activeTracks, resolveFilePath]
  )
  const missing = useMemo(() => getMissingFilePaths(filePaths), [filePaths])
  const missingTracks = useMemo(() => {
    return activeTracks.filter((track, index) => {
      const path = filePaths[index]
      return typeof path !== 'string' || path.trim().length == 0
    })
  }, [activeTracks, filePaths])
  const payload = useMemo(
    () => buildExportPayload(target, setName.trim(), filePaths, activeTracks),
    [target, setName, filePaths, activeTracks]
  )
  const hasSelectedSet = sourceType === 'current' || Boolean(selectedSetId)
  const canConfirm = canExport
    && !submitting
    && payload.filePaths.length > 0
    && setName.trim().length > 0
    && hasSelectedSet

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl glass-panel p-5 shadow-xl">
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
              className="w-full glass-input rounded-full px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-dj-accent/40"
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
              className="w-full glass-input rounded-full px-3 py-2 text-sm"
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value as 'current' | 'saved')}
            >
              <option value="current">当前编排</option>
              <option value="saved">已保存 Set</option>
            </select>
          </div>

          {sourceType === 'saved' && (
            <div>
              <label
                htmlFor="export-saved-set"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                选择已保存 Set
              </label>
              <select
                id="export-saved-set"
                aria-label="已保存 Set"
                className="w-full glass-input rounded-full px-3 py-2 text-sm"
                value={selectedSetId}
                onChange={(event) => setSelectedSetId(event.target.value)}
              >
                <option value="">请选择</option>
                {savedSets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || '未命名 Set'} · {item.tracks?.length ?? 0} 首 · {item.totalDuration || '00:00'}
                  </option>
                ))}
              </select>
            </div>
          )}

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

          <GlassCard className="rounded-md p-3 text-xs text-slate-400">
            {target === 'rekordbox'
              ? 'Rekordbox 将更新固定的 ZOKEN SETGPT.xml（导入一次后可刷新，曲库用于索引）'
              : '导出位置：将自动检测目标软件目录'}
          </GlassCard>

          <GlassCard className="rounded-md p-3 text-xs text-slate-400">
            将导出 {payload.filePaths.length} 首 / 共 {activeTracks.length} 首
          </GlassCard>

          {!hasSelectedSet && sourceType === 'saved' && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              请先选择要导出的 Set
            </div>
          )}

          {missing.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 space-y-1">
              <div>缺少 {missing.length} 首文件路径</div>
              <div className="text-[10px] text-amber-100/90">
                {missingTracks.slice(0, 5).map((track) => (
                  <div key={track.id}>• {track.title} — {track.artist}</div>
                ))}
                {missingTracks.length > 5 && (
                  <div>… 还有 {missingTracks.length - 5} 首未显示</div>
                )}
              </div>
            </div>
          )}

          {!canExport && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              当前环境未检测到桌面端导出能力
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              导出失败：{error}
            </div>
          )}

          {success && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              导出成功：{success}
            </div>
          )}

          {successTarget === 'rekordbox' && successPath && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100 space-y-1">
              <div className="font-semibold">Rekordbox 导入提示</div>
              <div>1. 打开 Rekordbox</div>
              <div>2. File → Import → Rekordbox XML</div>
              <div className="text-[10px] text-emerald-100/80 break-all">XML: {successPath}</div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <GlassButton
            onClick={onClose}
            variant="secondary"
            className="rounded-full px-4 py-2 text-sm"
          >
            取消
          </GlassButton>
          <GlassButton
            onClick={() => onConfirm(payload)}
            disabled={!canConfirm}
            variant="primary"
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "导出中..." : "确认导出"}
          </GlassButton>
        </div>
      </div>
    </div>
  )
}
