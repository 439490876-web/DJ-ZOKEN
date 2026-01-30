import React, { useState } from 'react'
import { GlassCard } from './GlassCard'
import { Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { SetList } from '../types'

interface SavedSetLibraryProps {
  savedSets: SetList[]
  currentSetId: string
  isSetDirty: boolean
  isCurrentSetSaved: boolean
  onLoadSet: (setList: SetList) => void
  onRenameSet: (setList: SetList) => void
  onDeleteSet: (setList: SetList) => void
}

export const SavedSetLibrary: React.FC<SavedSetLibraryProps> = ({
  savedSets,
  currentSetId,
  isSetDirty,
  isCurrentSetSaved,
  onLoadSet,
  onRenameSet,
  onDeleteSet,
}) => {
  const [open, setOpen] = useState(false)

  return (
    <GlassCard className="rounded-lg p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider">已保存 Set 库</div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
        >
          {open ? (
            <>
              收起已保存 Set <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              展开已保存 Set <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      </div>

      {open && (
        <div className="saved-set-scroll max-h-[calc(100vh-260px)] overflow-y-auto custom-scrollbar space-y-1">
          {savedSets.map((setList, index) => {
            const isCurrent = setList.id === currentSetId
            return (
              <button
                key={`${setList.id}-${index}`}
                onClick={() => onLoadSet(setList)}
                disabled={isCurrent}
                className={`w-full text-left px-2 py-2 rounded-md border transition-colors ${
                  isCurrent
                    ? 'bg-gradient-to-r from-dj-accent/30 to-dj-primary/20 border-dj-primary/30 text-white'
                    : 'bg-slate-900/40 border-slate-800/60 text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold truncate">{setList.name}</div>
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                        isCurrent
                          ? 'border-dj-primary/30 text-dj-primary'
                          : 'border-slate-700 text-slate-400'
                      }`}
                    >
                      {isCurrent ? '当前' : setList.type}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRenameSet(setList)
                      }}
                      className="p-1 rounded btn-secondary text-slate-400 hover:text-white"
                      title="重命名"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteSet(setList)
                      }}
                      className="p-1 rounded btn-secondary text-slate-400 hover:text-rose-200"
                      title="删除"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>
                    {setList.tracks?.length ?? 0} 首 · {setList.totalDuration || '00:00'}
                  </span>
                  {isCurrent && (isSetDirty || !isCurrentSetSaved) && (
                    <span className="text-amber-400">未保存</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </GlassCard>
  )
}
