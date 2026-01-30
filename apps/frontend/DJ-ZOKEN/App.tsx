import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import { Track, SetList, TransitionAnalysis, SetType, AISuggestion } from './types';
import { trackService, getGenreCategory } from './services/trackService';
import { analyzeTransitionAi, getAiSuggestions } from './services/geminiService';
import { analyzeSet, toCamelotKey } from './services/analysisService';
import { analyzeStyle, cancelAllStyleTasks, cancelStyleTask } from './services/styleAnalysisService';
import { HEAT_MODEL_VERSION, buildIdentifyEndpoints, getHeatApiBase, shouldRetryWithProxy, buildHeatCacheKey } from './services/heatApi';
import { formatHeatMeta } from './services/heatMeta';
import { getHeatRefreshIds } from './services/heatRefresh';
import { ExportPayload } from './services/exportService';
import { calculateTotalSetDuration, formatSecondsToDuration } from './services/cueService';
import { getMetricDisplay } from './services/metricDisplay';
import { normalizeHeatSource, normalizePendingMetrics } from './services/trackMetrics';
import { attachFilePath, getFilePath } from './services/filePath';
import EnergyChart from './components/EnergyChart';
import { SetBuilder } from './components/SetBuilder';
import { ExportDialog } from './components/ExportDialog';
import { ResetConfirmDialog } from './components/ResetConfirmDialog';
import { SavedSetLibrary } from './components/SavedSetLibrary';
import { ThemeToggle } from './components/ThemeToggle';
import { Search, Library, Plus, Save, RotateCcw, Sunrise, Sun, Sunset, ArrowUp, ArrowDown, Zap, Flame, Activity, Music, X, Tag, Disc, Sparkles, Bot, Loader2, PieChart, Target, Filter, AlertTriangle, CheckCircle2, BarChart3, ScanEye, Pencil, FolderPlus, Folder, Trash2, ListOrdered, ArrowUpRight } from 'lucide-react';

type SortKey = 'bpm' | 'key' | 'energy' | 'resonance' | 'import';
interface SortCriterion {
    key: SortKey;
    order: 'asc' | 'desc';
}

const FALLBACK_COVER = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%2320283a"/></svg>';

const App: React.FC = () => {
  // --- 全局状态 ---
  const [library, setLibrary] = useState<Track[]>([]); // 曲库数据
  const [setTracks, setSetTracks] = useState<Track[]>([]); // 当前 Set 列表
  const [setType, setSetType] = useState<SetType>('prime'); // Set 类型 (暖场/黄金/收尾)
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Cut Modes (飞歌模式) 状态提升至 App 管理，以便诊断算法能读取
  const [cutModes, setCutModes] = useState<Record<string, boolean>>({});
  
  // 排序状态
  const [sortMode, setSortMode] = useState<'single' | 'multi'>('single');
  const [sortCriteria, setSortCriteria] = useState<SortCriterion[]>([]);
  const [libraryOrder, setLibraryOrder] = useState<string[]>([]);
  const [libraryDragOverId, setLibraryDragOverId] = useState<string | null>(null);
  const [libraryDropPosition, setLibraryDropPosition] = useState<'before' | 'after' | null>(null);
  const [localFileMap, setLocalFileMap] = useState<Record<string, File>>({});
  const [isHeatRefreshing, setIsHeatRefreshing] = useState(false);
  const exportAvailable = typeof window !== 'undefined'
    && typeof (window as any)?.electronAPI?.exportSet === 'function';
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // 专注模式 (Focus Mode)
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  const resolveExportFilePath = useCallback((track: Track) => {
    if (process.env.NODE_ENV !== 'production') {
      const payload = {
        id: track.id,
        sourceId: track.sourceId,
        filePath: track.filePath,
        fileSignature: track.fileSignature,
        filename: track.filenameDisplay,
        title: track.title,
        artist: track.artist,
      };
      console.warn('[export-path] resolve ' + JSON.stringify(payload));
    }
    if (track.filePath && track.filePath.trim().length > 0) return track.filePath;
    const sourceId = track.sourceId || track.id;
    const file = localFileMap[sourceId];
    if (file) {
      const resolved = getFilePath(file as File & { path?: string });
      if (resolved) return resolved;
    }
    const libraryMatch = library.find(item => {
      return item.id === track.id || item.id === sourceId || item.sourceId === sourceId;
    });
    if (libraryMatch?.filePath && libraryMatch.filePath.trim().length > 0) {
      return libraryMatch.filePath;
    }
    const title = (track.title || '').trim().toLowerCase();
    const artist = (track.artist || '').trim().toLowerCase();
    if (title && artist) {
      const titleMatch = library.find(item => {
        return (item.title || '').trim().toLowerCase() == title
          && (item.artist || '').trim().toLowerCase() == artist
          && item.filePath
          && item.filePath.trim().length > 0;
      });
      if (titleMatch?.filePath) {
        return titleMatch.filePath;
      }
    }
    const signatureRaw = (track.fileSignature || '').trim();
    const signature = signatureRaw.toLowerCase();
    if (signature) {
      const api = (window as any)?.electronAPI;
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[export-path] api-check ' + JSON.stringify({
          hasApi: Boolean(api),
          keys: api ? Object.keys(api) : [],
          hasGetPathForFileKey: Boolean(api && typeof api.getPathForFileKey === 'function'),
        }));
      }
      if (api && typeof api.getPathForFileKey === 'function') {
        try {
          const resolved = api.getPathForFileKey(signatureRaw);
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[export-path] signature lookup ' + JSON.stringify({
              trackId: track.id,
              signature: signatureRaw,
              resolved: resolved || null,
            }));
          }
          if (typeof resolved === 'string' && resolved.trim().length > 0) {
            return resolved;
          } else if (process.env.NODE_ENV !== 'production') {
            console.warn('[export-path] signature lookup miss ' + JSON.stringify({
              trackId: track.id,
              signature: signatureRaw,
              filename: track.filenameDisplay || track.title,
            }));
          }
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[export-path] signature lookup error ' + JSON.stringify({
              trackId: track.id,
              signature: signatureRaw,
              filename: track.filenameDisplay || track.title,
              error: String(err)
            }));
          }
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[export-path] no getPathForFileKey available');
      }
      const sigMatch = library.find(item => {
        return (item.fileSignature || '').trim().toLowerCase() == signature
          && item.filePath
          && item.filePath.trim().length > 0;
      });
      if (sigMatch?.filePath) {
        return sigMatch.filePath;
      }
    }
    const filenameDisplay = (track.filenameDisplay || '').trim().toLowerCase();
    if (filenameDisplay) {
      const nameMatch = library.find(item => {
        return (item.filenameDisplay || '').trim().toLowerCase() == filenameDisplay
          && item.filePath
          && item.filePath.trim().length > 0;
      });
      if (nameMatch?.filePath) {
        return nameMatch.filePath;
      }
    }
    const normalize = (value: string) => {
      return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    };
    const titleKey = normalize(track.title || '');
    const artistKey = normalize(track.artist || '');
    if (titleKey) {
      const candidates = library.filter(item => {
        if (!item.filePath || item.filePath.trim().length == 0) return false;
        const itemTitle = normalize(item.title || '');
        if (!itemTitle) return false;
        const titleHit = itemTitle === titleKey || itemTitle.includes(titleKey) || titleKey.includes(itemTitle);
        if (!titleHit) return false;
        if (!artistKey) return true;
        const itemArtist = normalize(item.artist || '');
        if (!itemArtist) return false;
        return itemArtist === artistKey || itemArtist.includes(artistKey) || artistKey.includes(itemArtist);
      });
      if (candidates.length == 1 && candidates[0]?.filePath) {
        return candidates[0].filePath;
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[export-path] resolve:miss ' + JSON.stringify({
        id: track.id,
        sourceId: track.sourceId,
        fileSignature: track.fileSignature,
        filename: track.filenameDisplay,
        title: track.title,
        artist: track.artist,
      }));
    }
    return null;
  }, [localFileMap, library]);


  // 手动修正
  const [editTrackId, setEditTrackId] = useState<string | null>(null);
  const [editTrackForm, setEditTrackForm] = useState({
    title: '',
    artist: '',
    genre: '',
    bpm: '',
    key: '',
    energy: null,
    resonance: null
  });

  // 文件夹
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  // AI 建议
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLibraryDragOver, setIsLibraryDragOver] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [styleDebugEnabled, setStyleDebugEnabled] = useState(false);
  const [clearPersistentStorageEnabled, setClearPersistentStorageEnabled] = useState(false);
  const [currentSetId, setCurrentSetId] = useState(() => crypto.randomUUID());
  const [currentSetName, setCurrentSetName] = useState('未命名 Set');
  const [savedSetLists, setSavedSetLists] = useState<SetList[]>([]);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null);
  const [exportSuccessTarget, setExportSuccessTarget] = useState<ExportTarget | null>(null);
  const [isSetDirty, setIsSetDirty] = useState(false);
  const suppressSetDirtyRef = useRef(false);
  const hasInitSetDirtyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const LIBRARY_CACHE_KEY = 'dj_library_cache_v1';
  const CACHE_DB_NAME = 'dj_cache_v1';
  const CACHE_DB_VERSION = 1;
  const CACHE_STORE_COVERS = 'covers';
  const CACHE_STORE_ANALYSIS = 'analysis';
  const cacheDbRef = useRef<Promise<IDBDatabase> | null>(null);
  const restoredCacheRef = useRef<Set<string>>(new Set());
  const coverCachedRef = useRef<Set<string>>(new Set());

  const getCacheDb = () => {
    if (typeof indexedDB === 'undefined') return null;
    if (!cacheDbRef.current) {
      cacheDbRef.current = new Promise((resolve, reject) => {
        const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(CACHE_STORE_COVERS)) {
            db.createObjectStore(CACHE_STORE_COVERS);
          }
          if (!db.objectStoreNames.contains(CACHE_STORE_ANALYSIS)) {
            db.createObjectStore(CACHE_STORE_ANALYSIS);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return cacheDbRef.current;
  };

  const readCacheStore = async <T,>(storeName: string, key: string): Promise<T | null> => {
    const dbPromise = getCacheDb();
    if (!dbPromise) return null;
    try {
      const db = await dbPromise;
      return await new Promise<T | null>((resolve) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  };

  const writeCacheStore = async <T,>(storeName: string, key: string, value: T): Promise<void> => {
    const dbPromise = getCacheDb();
    if (!dbPromise) return;
    try {
      const db = await dbPromise;
      await new Promise<void>((resolve) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // ignore
    }
  };

  const clearCacheDb = async (): Promise<void> => {
    if (typeof indexedDB === 'undefined') return;
    try {
      if (cacheDbRef.current) {
        const db = await cacheDbRef.current;
        db.close();
      }
    } catch {
      // ignore close errors
    }
    cacheDbRef.current = null;
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(CACHE_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  };
  const resolveApiBase = (value: string) => {
    const trimmed = (value || '').trim();
    if (!trimmed || typeof window === 'undefined') return trimmed;
    try {
      const url = new URL(trimmed);
      const host = window.location.hostname;
      const normalizedHost = host === 'localhost' ? '127.0.0.1' : host;
      const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (normalizedHost && isLocal) {
        url.hostname = normalizedHost;
      }
      return url.toString().replace(/\/$/, '');
    } catch {
      return trimmed;
    }
  };
  const buildApiEndpoint = (base: string, path: string) => {
    const normalized = (base || '').replace(/\/$/, '');
    if (!normalized) return `/api/${path}`;
    const segments = normalized.split('/').filter(Boolean);
    if (segments.includes('api')) return `${normalized}/${path}`;
    return `${normalized}/api/${path}`;
  };
  const analysisApiBase = resolveApiBase((import.meta as any).env?.VITE_ANALYSIS_API || '/api');
  const analysisEndpoint = buildApiEndpoint(analysisApiBase, 'analyze');
  const identifyApiBase = resolveApiBase(getHeatApiBase((import.meta as any).env?.VITE_HEAT_API));
  const identifyEndpoints = buildIdentifyEndpoints(identifyApiBase);
  const IDENTIFY_TIMEOUT_MS = 120000;
  const IDENTIFY_CONCURRENCY = 3;
  const identifyQueueRef = useRef<{ running: number; queue: Array<{ priority: number; run: () => void }> }>({
    running: 0,
    queue: []
  });
  const identifyCacheRef = useRef<Map<string, { heatScore?: number | null; heatScoreRaw?: number | null; heatSource?: string | null; errorMessage?: string | null }>>(new Map());
  const autoHeatRefreshRef = useRef(false);

  const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  };

  const enqueueIdentify = <T,>(task: () => Promise<T>, priority = 0): Promise<T> => {
    return new Promise((resolve) => {
      const runTask = async () => {
        identifyQueueRef.current.running += 1;
        try {
          resolve(await task());
        } finally {
          identifyQueueRef.current.running -= 1;
          const next = identifyQueueRef.current.queue.shift();
          if (next) next.run();
        }
      };

      if (identifyQueueRef.current.running < IDENTIFY_CONCURRENCY) {
        void runTask();
      } else {
        const entry = { priority, run: () => void runTask() };
        if (priority > 0) {
          const queue = identifyQueueRef.current.queue;
          const idx = queue.findIndex(item => item.priority === 0);
          if (idx === -1) queue.push(entry);
          else queue.splice(idx, 0, entry);
        } else {
          identifyQueueRef.current.queue.push(entry);
        }
      }
    });
  };

  // 初始化: 加载曲库（优先使用缓存兜底）
  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        let cachedLibrary: Track[] = [];
        let cachedOrder: string[] = [];
        let cachedFolders: { id: string; name: string }[] = [];
        try {
          const raw = window.localStorage.getItem(LIBRARY_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              library?: Track[];
              libraryOrder?: string[];
              folders?: { id: string; name: string }[];
            };
            if (Array.isArray(parsed?.library)) {
              cachedLibrary = parsed.library.map(track => {
                const next = { ...track };
                const sanitized = normalizePendingMetrics(next);
                const heatNormalized = normalizeHeatSource(sanitized, HEAT_MODEL_VERSION);

                if (heatNormalized?.coverUrl && String(heatNormalized.coverUrl).startsWith('blob:')) {
                  heatNormalized.coverUrl = null;
                }
                const hasAnalysis =
                  typeof heatNormalized.bpm === 'number' ||
                  Boolean(heatNormalized.key) ||
                  typeof heatNormalized.energy === 'number' ||
                  Boolean(heatNormalized.genre) ||
                  typeof heatNormalized.resonance === 'number' ||
                  (Array.isArray(heatNormalized.analysisWarnings) && heatNormalized.analysisWarnings.length > 0);
                if ((!heatNormalized.status || heatNormalized.status === 'pending') && hasAnalysis) {
                  heatNormalized.status = 'ok';
                }
                if ((!heatNormalized.heatStatus || heatNormalized.heatStatus === 'pending') && typeof heatNormalized.resonance === 'number') {
                  heatNormalized.heatStatus = 'ok';
                }
                return heatNormalized;
              });
            }
            if (Array.isArray(parsed?.libraryOrder)) cachedOrder = parsed.libraryOrder;
            if (Array.isArray(parsed?.folders)) cachedFolders = parsed.folders;
          }
        } catch {
          // Ignore cache parse issues
        }
        if (cachedLibrary.length > 0) {
          const enriched = await Promise.all(cachedLibrary.map(async (track) => {
            const signature = track.fileSignature;
            if (!signature) return track;
            const [cover, analysis] = await Promise.all([
              track.coverUrl ? Promise.resolve(null) : getCachedCover(signature),
              getCachedAnalysis(signature)
            ]);
            let next = { ...track };
            if (cover) next.coverUrl = cover;
            if (analysis) {
              next = mergeAnalysisIntoTrack(next, analysis);
              next.status = 'ok';
              if (typeof analysis?.loudness_profile?.heat === 'number') {
                next.heatStatus = 'ok';
              }
            }
            const pending = normalizePendingMetrics(next);
            return normalizeHeatSource(pending, HEAT_MODEL_VERSION);
          }));
          setLibrary(enriched);
          setLibraryOrder(cachedOrder.length > 0 ? cachedOrder : enriched.map(track => track.id));
          setFolders(cachedFolders);
        }
        const data = await trackService.getAllTracks();
        if (data.length > 0) {
          const merged = [...cachedLibrary];
          const seen = new Set(merged.map(track => track.id));
          for (const track of data) {
            if (!seen.has(track.id)) {
              const pending = normalizePendingMetrics({ ...track });
              const normalized = normalizeHeatSource(pending, HEAT_MODEL_VERSION);
              merged.push(normalized);
              seen.add(track.id);
            }
          }
          setLibrary(merged);
          setLibraryOrder(prev => {
            const base = prev.length > 0 ? prev : (cachedOrder.length > 0 ? cachedOrder : cachedLibrary.map(track => track.id));
            const next = [...base];
            for (const track of data) {
              if (!next.includes(track.id)) next.push(track.id);
            }
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to load tracks", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLibrary();
  }, []);

  useEffect(() => {
    try {
      const sanitizedLibrary = library.map(track => {
        const next = { ...track };
        const sanitized = normalizePendingMetrics(next);

        if (heatNormalized.coverUrl) {
          heatNormalized.coverUrl = null;
        }
        return heatNormalized;
      });
      const payload = JSON.stringify({
        library: sanitizedLibrary,
        libraryOrder,
        folders,
        cachedAt: Date.now(),
      });
      window.localStorage.setItem(LIBRARY_CACHE_KEY, payload);
    } catch {
      // Ignore cache write issues
    }
  }, [library, libraryOrder, folders]);

  const fetchSetLists = useCallback(async () => {
    try {
      const data = await trackService.getSetLists();
      setSavedSetLists(data);
    } catch (err) {
      console.error('Failed to load setlists', err);
    }
  }, []);

  useEffect(() => {
    void fetchSetLists();
  }, [fetchSetLists]);

  useEffect(() => {
    const stored = window.localStorage.getItem('gemini_api_key');
    if (stored) {
      setApiKeyInput(stored);
      setHasApiKey(true);
    }
  }, []);

  useEffect(() => {
    if (!hasInitSetDirtyRef.current) {
      hasInitSetDirtyRef.current = true;
      return;
    }
    if (suppressSetDirtyRef.current) {
      suppressSetDirtyRef.current = false;
      return;
    }
    setIsSetDirty(true);
  }, [setTracks, setType, currentSetName]);

  useEffect(() => {
    if (library.length === 0) return;
    let cancelled = false;
    const restoreFromCache = async () => {
      const targets = library.filter(track => {
        const signature = track.fileSignature;
        return signature && !restoredCacheRef.current.has(signature);
      });
      if (targets.length === 0) return;
      await Promise.allSettled(targets.map(async (track) => {
        const signature = track.fileSignature as string;
        restoredCacheRef.current.add(signature);
        const [cover, analysis] = await Promise.all([
          track.coverUrl ? Promise.resolve(null) : getCachedCover(signature),
          getCachedAnalysis(signature)
        ]);
        if (cancelled) return;
        if (cover) {
          updateTrackById(track.id, { coverUrl: cover });
        }
        if (analysis) {
          applyAnalysisResultToTrack(track.id, analysis);
          updateTrackById(track.id, { status: 'ok' });
          if (typeof analysis?.loudness_profile?.heat === 'number') {
            updateTrackById(track.id, { heatStatus: 'ok' });
          }
        }
      }));
    };
    void restoreFromCache();
    return () => {
      cancelled = true;
    };
  }, [library]);

  useEffect(() => {
    if (library.length === 0) return;
    const pending: Array<Promise<void>> = [];
    for (const track of library) {
      const signature = track.fileSignature;
      if (!signature || coverCachedRef.current.has(signature)) continue;
      const coverUrl = track.coverUrl;
      if (!coverUrl || !String(coverUrl).startsWith('data:')) continue;
      coverCachedRef.current.add(signature);
      pending.push(setCachedCover(signature, coverUrl));
    }
    if (pending.length > 0) {
      void Promise.allSettled(pending);
    }
  }, [library]);

  useEffect(() => {
    setLibraryOrder(prev => {
      const existing = new Set(prev);
      const next = prev.filter(id => library.some(track => track.id === id));
      const missing = library.filter(track => !existing.has(track.id)).map(track => track.id);
      return [...next, ...missing];
    });
  }, [library]);

  const decodeDisplayName = (value?: string | null) => {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const parseLocalFileName = (fileName?: string | null) => {
    const safeName = fileName || '';
    const base = safeName.replace(/\.[^/.]+$/, '').trim();
    const parts = base.split(' - ').map(part => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { artist: parts[0], title: parts.slice(1).join(' - ') };
    }
    return { artist: 'Local', title: base || 'Untitled' };
  };

  const buildFileCacheKey = (file: File) => {
    return `${file.name}:${file.size}:${file.lastModified}`;
  };

  const getCachedCover = async (cacheKey: string): Promise<string | null> => {
    const cached = await readCacheStore<{ dataUrl?: string; cachedAt?: number } | string>(CACHE_STORE_COVERS, cacheKey);
    if (!cached) return null;
    if (typeof cached === 'string') return cached;
    return cached.dataUrl || null;
  };

  const setCachedCover = async (cacheKey: string, dataUrl: string) => {
    await writeCacheStore(CACHE_STORE_COVERS, cacheKey, { dataUrl, cachedAt: Date.now() });
  };

  const getCachedAnalysis = async (cacheKey: string) => {
    const cached = await readCacheStore<{
      data?: {
        bpm?: number | null;
        key?: string | null;
        title?: string | null;
        artist?: string | null;
        energy?: number | null;
        loudness_profile?: { heat?: number | null } | null;
        details?: { warnings?: string[]; bpm_source?: string; key_source?: string } | null;
      };
      cachedAt?: number;
    } | {
      bpm?: number | null;
      key?: string | null;
      title?: string | null;
      artist?: string | null;
      energy?: number | null;
      loudness_profile?: { heat?: number | null } | null;
      details?: { warnings?: string[]; bpm_source?: string; key_source?: string } | null;
    }>(CACHE_STORE_ANALYSIS, cacheKey);
    if (!cached) return null;
    if ('data' in cached && cached.data) return cached.data;
    return cached;
  };

  const setCachedAnalysis = async (
    cacheKey: string,
    data: {
      bpm?: number | null;
      key?: string | null;
      title?: string | null;
      artist?: string | null;
      energy?: number | null;
      loudness_profile?: { heat?: number | null } | null;
      details?: { warnings?: string[]; bpm_source?: string; key_source?: string } | null;
    }
  ) => {
    await writeCacheStore(CACHE_STORE_ANALYSIS, cacheKey, { data, cachedAt: Date.now() });
  };

  const parseLocalMetaFromFilename = (fileName?: string | null) => {
    const safeName = fileName || '';
    const base = safeName.replace(/\.[^/.]+$/, '').trim();
    let bpm: number | null = null;
    let key: string | null = null;
    const bpmMatch = base.match(/(?:^|[^0-9])(\d{2,3})\s?bpm(?:[^0-9]|$)/i);
    if (bpmMatch) {
      const bpmValue = Number.parseInt(bpmMatch[1], 10);
      if (Number.isFinite(bpmValue) && bpmValue >= 50 && bpmValue <= 220) {
        bpm = bpmValue;
      }
    }
    const camelotMatch = base.match(/(?:^|[^0-9])(\d{1,2})([AB])(?:[^0-9]|$)/i);
    if (camelotMatch) {
      key = `${parseInt(camelotMatch[1], 10)}${camelotMatch[2].toUpperCase()}`;
    }
    if (!key) {
      const keyTaggedMatch = base.match(/(?:^|[^a-z])key\s*[:\-]?\s*([A-G])([#b])?\s*(maj|major|min|minor|m)?/i);
      const keyBracketMatch = base.match(/[\[(]([A-G])([#b])?\s*(maj|major|min|minor|m)[\])]/i);
      const match = keyTaggedMatch || keyBracketMatch;
      if (match) {
        const note = `${match[1]}${match[2] || ''}`;
        const mode = match[3];
        const raw = mode ? `${note} ${mode}` : note;
        key = toCamelotKey(raw) || raw.toUpperCase();
      }
    }
    return { bpm, key };
  };

  const getDisplayKey = (value: string) => {
    return toCamelotKey(value) || value;
  };

  const normalizeErrorMessage = (value?: string | null) => {
    if (!value) return null;
    const text = String(value).replace(/^Error:\s*/i, '').trim();
    return text || null;
  };

  const normalizeEnergy = (value?: number | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 5;
    if (value >= 1 && value <= 10) return Math.round(value);
    if (value > 10 && value <= 100) return Math.round(1 + (value / 100) * 9);
    if (value >= 0 && value < 1) return Math.round(1 + value * 9);
    return Math.round(Math.max(1, Math.min(10, value)));
  };

  const clampNumber = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
  };

  const extractId3Metadata = (
    file: File
  ): Promise<{ title?: string; artist?: string; coverUrl?: string | null; bpm?: number | null; key?: string | null }> => {
    return new Promise((resolve) => {
      jsmediatags.read(file, {
        onSuccess: (tag) => {
          console.log('[id3] tags', { file: file.name, tags: tag.tags });
          const title = typeof tag.tags.title === 'string' ? tag.tags.title.trim() : undefined;
          const artist = typeof tag.tags.artist === 'string' ? tag.tags.artist.trim() : undefined;
          const rawBpm = (tag.tags as any)?.TBPM ?? (tag.tags as any)?.bpm ?? (tag.tags as any)?.BPM;
          const bpmValue = typeof rawBpm === 'number'
            ? rawBpm
            : (typeof rawBpm === 'string' ? Number.parseFloat(rawBpm) : null);
          const bpm = Number.isFinite(bpmValue as number) ? Math.round(bpmValue as number) : null;
          const rawKey = (tag.tags as any)?.TKEY ?? (tag.tags as any)?.initialkey ?? (tag.tags as any)?.key;
          const keyText = typeof rawKey === 'string' ? rawKey.trim() : null;
          const key = keyText ? (toCamelotKey(keyText) || keyText) : null;
          const picture = tag.tags.picture;
          if (!picture || !picture.data) {
            resolve({ title, artist, coverUrl: null, bpm, key });
            return;
          }
          const format = picture.format || 'image/jpeg';
          const byteArray = new Uint8Array(picture.data);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < byteArray.length; i += chunkSize) {
            const chunk = byteArray.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
          }
          const base64 = window.btoa(binary);
          const dataUrl = `data:${format};base64,${base64}`;
          resolve({ title, artist, coverUrl: dataUrl, bpm, key });
        },
        onError: () => resolve({})
      });
    });
  };

  const extractCover = async (file: File): Promise<string | null> => {
    const meta = await extractId3Metadata(file);
    return meta.coverUrl || null;
  };

  const startEditTrack = (track: Track) => {
    setEditTrackId(track.id);
    setEditTrackForm({
      title: track.title || '',
      artist: track.artist || '',
      genre: track.genre || '',
      bpm: typeof track.bpm === 'number' ? String(track.bpm) : '',
      key: track.key ? String(track.key) : '',
      energy: Number.isFinite(track.energy) ? track.energy : 5,
      resonance: Number.isFinite(track.resonance) ? track.resonance : 5
    });
  };

  const closeEditTrack = () => {
    setEditTrackId(null);
  };

  const applyEditTrack = () => {
    if (!editTrackId) return;
    const title = editTrackForm.title.trim() || '未命名';
    const artist = editTrackForm.artist.trim() || '未知';
    const genre = editTrackForm.genre.trim();
    const key = editTrackForm.key.trim();
    const bpmValue = Number(editTrackForm.bpm);
    const bpm = Number.isFinite(bpmValue) ? Math.round(bpmValue) : null;
    const energy = clampNumber(Math.round(editTrackForm.energy), 1, 10);
    const resonance = clampNumber(Math.round(editTrackForm.resonance), 1, 10);

    const updateTrack = (track: Track) => {
      const match = track.id === editTrackId || track.sourceId === editTrackId;
      if (!match) return track;
      return {
        ...track,
        title,
        artist,
        genre: genre || null,
        bpm,
        key: key || null,
        energy,
        resonance
      };
    };

    setLibrary(prev => prev.map(updateTrack));
    setSetTracks(prev => prev.map(updateTrack));
    setEditTrackId(null);
  };

  const ensureFolder = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = folders.some(f => f.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    setFolders(prev => [...prev, { id: `folder-${crypto.randomUUID()}`, name: trimmed }]);
  };

  const handleCreateFolder = () => {
    ensureFolder(newFolderName);
    setNewFolderName('');
  };

  const selectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId);
  };

  const assignTrackToFolder = (trackId: string, folderId: string) => {
    console.log('[folder] assign', { trackId, folderId });
    const updateTrack = (track: Track) => {
      const match = track.id === trackId || track.sourceId === trackId;
      if (!match) return track;
      const existing = track.folderIds || [];
      const next = Array.from(new Set([...existing, folderId]));
      return { ...track, folderIds: next };
    };
    setLibrary(prev => {
      const next = prev.map(updateTrack);
      const hit = next.find(t => t.id === trackId || t.sourceId === trackId);
      console.log('[folder] updated track', hit || 'NOT_FOUND');
      return next;
    });
    setSetTracks(prev => prev.map(updateTrack));
    setDraggingTrackId(null);
    setDragOverFolderId(null);
  };

  const reorderLibrary = (dragId: string, overId: string, position: 'before' | 'after') => {
    if (dragId === overId) return;
    setLibraryOrder(prev => {
      const filtered = prev.filter(id => id !== dragId);
      const overIndex = filtered.indexOf(overId);
      if (overIndex < 0) return prev;
      const insertIndex = position === 'after' ? overIndex + 1 : overIndex;
      filtered.splice(insertIndex, 0, dragId);
      return filtered;
    });
  };

  const removeFromLibrary = (trackId: string) => {
    cancelStyleTask(trackId);
    setLibrary(prev => prev.filter(t => t.id !== trackId));
    setSetTracks(prev => prev.filter(t => t.sourceId !== trackId && t.id !== trackId));
    setLibraryOrder(prev => prev.filter(id => id !== trackId));
    setLocalFileMap(prev => {
      const next = { ...prev };
      delete next[trackId];
      return next;
    });
  };

  const clearLibrary = () => {
    cancelAllStyleTasks();
    setLibrary([]);
    setSetTracks([]);
    setLibraryOrder([]);
    setLocalFileMap({});
  };

  const applyHeatUpdate = (trackId: string, heatScoreRaw?: number | null, heatScore?: number | null, heatSource?: string | null, errorMessage?: string | null) => {
    const resonanceFromBackend = typeof heatScoreRaw === 'number' && Number.isFinite(heatScoreRaw)
      ? Math.round(heatScoreRaw)
      : (typeof heatScore === 'number' && Number.isFinite(heatScore)
        ? Math.round(heatScore)
        : null);
    const heatReady = typeof resonanceFromBackend === 'number' && Number.isFinite(resonanceFromBackend);
    const resonance = heatReady
      ? Math.max(1, Math.min(10, resonanceFromBackend))
      : null;
    const heatStatus: Track['heatStatus'] = heatReady ? 'ok' : 'failed';
    const heatError = errorMessage || (!heatReady ? 'online_heat_unavailable' : null);
    const updateTrack = (track: Track) => {
      const match = track.id === trackId || track.sourceId === trackId;
      if (!match) return track;
      const patch: Partial<Track> = {
        heatStatus,
        heatError,
        heatScoreRaw: heatScoreRaw ?? null,
        heatSource: heatSource ?? null
      };
      if (heatReady) {
        patch.resonance = resonance;
      }
      return { ...track, ...patch };
    };
    setLibrary(prev => prev.map(updateTrack));
    setSetTracks(prev => prev.map(updateTrack));
  };

  const buildAnalysisPatch = (data: {
    bpm?: number | null;
    key?: string | null;
    title?: string | null;
    artist?: string | null;
    energy?: number | null;
    loudness_profile?: { heat?: number | null } | null;
    details?: { warnings?: string[]; bpm_source?: string; key_source?: string } | null;
  }): Partial<Track> => {
    if (!data) return {};
    const rawKey = data?.key?.trim();
    const camelotKey = toCamelotKey(rawKey);
    const warnings = Array.isArray(data?.details?.warnings) ? data?.details?.warnings : [];
    const bpmMissing = warnings.includes('bpm_missing');
    const keyDefaulted = warnings.includes('key_defaulted') || rawKey?.toLowerCase() === 'unknown';
    const patch: Partial<Track> = {};
    if (data?.title) patch.title = data.title.trim();
    if (data?.artist) patch.artist = data.artist.trim();
    if (!bpmMissing && typeof data?.bpm === 'number' && Number.isFinite(data.bpm) && data.bpm > 0) {
      patch.bpm = Math.round(data.bpm);
      patch.bpmSource = data?.details?.bpm_source || 'analysis';
    }
    if (!keyDefaulted && (camelotKey || rawKey)) {
      patch.key = camelotKey || rawKey || null;
      patch.keySource = data?.details?.key_source || 'analysis';
    }
    if (typeof data?.energy === 'number') patch.energy = normalizeEnergy(data.energy);
    if (typeof data?.loudness_profile?.heat === 'number') {
      patch.resonance = Math.max(1, Math.min(10, Math.round(1 + (data.loudness_profile.heat / 100) * 9)));
    }
    if (warnings.length > 0) {
      patch.analysisWarnings = warnings;
    }
    return patch;
  };

  const mergeAnalysisIntoTrack = (track: Track, data: {
    bpm?: number | null;
    key?: string | null;
    title?: string | null;
    artist?: string | null;
    energy?: number | null;
    loudness_profile?: { heat?: number | null } | null;
    details?: { warnings?: string[]; bpm_source?: string; key_source?: string } | null;
  }): Track => {
    const patch = buildAnalysisPatch(data);
    const next = { ...track, ...patch };
    if (track.bpmSource === 'id3' && typeof patch.bpm === 'number') {
      next.bpm = track.bpm;
      next.bpmSource = track.bpmSource;
    }
    if (track.keySource === 'id3' && patch.key) {
      next.key = track.key;
      next.keySource = track.keySource;
    }
    return next;
  };

  const applyAnalysisResultToTrack = (trackId: string, data: {
    bpm?: number | null;
    key?: string | null;
    title?: string | null;
    artist?: string | null;
    energy?: number | null;
    loudness_profile?: { heat?: number | null } | null;
    details?: { warnings?: string[]; bpm_source?: string; key_source?: string } | null;
  }) => {
    if (!data) return;
    updateTrackByIdWith(trackId, (track) => {
      return mergeAnalysisIntoTrack(track, data);
    });
  };

  const updateTrackById = (trackId: string, patch: Partial<Track>) => {
    const updateTrack = (track: Track) => {
      const match = track.id === trackId || track.sourceId === trackId;
      if (!match) return track;
      return { ...track, ...patch };
    };
    setLibrary(prev => prev.map(updateTrack));
    setSetTracks(prev => prev.map(updateTrack));
  };

  const updateTrackByIdWith = (trackId: string, updater: (track: Track) => Track) => {
    const updateTrack = (track: Track) => {
      const match = track.id === trackId || track.sourceId === trackId;
      if (!match) return track;
      return updater(track);
    };
    setLibrary(prev => prev.map(updateTrack));
    setSetTracks(prev => prev.map(updateTrack));
  };

  const refreshHeatAll = async () => {
    const entries = Object.entries(localFileMap);
    if (entries.length === 0) return;
    setIsHeatRefreshing(true);
    for (const [trackId, file] of entries) {
      updateTrackById(trackId, { heatStatus: 'pending', heatError: null });
      const result = await identifyLocalFile(file, { debug: true });
      applyHeatUpdate(trackId, result?.heatScoreRaw ?? null, result?.heatScore ?? null, result?.heatSource ?? null, result?.errorMessage ?? null);
    }
    setIsHeatRefreshing(false);
  };

  useEffect(() => {
    if (isLoading) return;
    if (autoHeatRefreshRef.current) return;
    const candidates = getHeatRefreshIds(library, localFileMap, HEAT_MODEL_VERSION);
    if (candidates.length == 0) {
      autoHeatRefreshRef.current = true;
      return;
    }
    autoHeatRefreshRef.current = true;
    candidates.forEach((trackId) => {
      const file = localFileMap[trackId];
      if (!file) return;
      updateTrackById(trackId, { heatStatus: 'pending', heatError: null });
      enqueueIdentify(() => identifyLocalFile(file), 1)
        .then((result) => {
          applyHeatUpdate(
            trackId,
            result?.heatScoreRaw ?? null,
            result?.heatScore ?? null,
            result?.heatSource ?? null,
            result?.errorMessage ?? null
          );
        })
        .catch((e) => {
          applyHeatUpdate(trackId, null, null, null, normalizeErrorMessage(String(e)) || 'identify failed');
        });
    });
  }, [isLoading, library, localFileMap]);


  const clearIndexedDB = async () => {
    if (typeof indexedDB === 'undefined') return { ok: false, reason: 'unavailable' as const };
    const databasesFn = (indexedDB as any).databases;
    if (typeof databasesFn !== 'function') return { ok: false, reason: 'unsupported' as const };
    try {
      const dbs = await databasesFn.call(indexedDB) as Array<{ name?: string | null }>;
      const names = dbs.map(db => db.name).filter((name): name is string => Boolean(name));
      await Promise.all(names.map(name => new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      })));
      return { ok: true, count: names.length };
    } catch {
      return { ok: false, reason: 'error' as const };
    }
  };

  const clearAllCaches = async () => {
    identifyCacheRef.current.clear();
    cancelAllStyleTasks();
    let statusMessage = '缓存已清除';
    try {
      window.localStorage.removeItem(LIBRARY_CACHE_KEY);
    } catch {
      // Ignore cache remove issues
    }
    void clearCacheDb();
    if (clearPersistentStorageEnabled) {
      let localStorageCleared = false;
      try {
        window.localStorage.clear();
        localStorageCleared = true;
      } catch {
        localStorageCleared = false;
      }
      const idbResult = await clearIndexedDB();
      if (localStorageCleared) {
        setApiKeyInput('');
        setHasApiKey(false);
      }
      if (idbResult.ok) {
        statusMessage = `缓存已清除（IndexedDB:${idbResult.count}, localStorage:${localStorageCleared ? 'ok' : 'fail'}）`;
      } else {
        statusMessage = `缓存已清除（localStorage:${localStorageCleared ? 'ok' : 'fail'}, IndexedDB:${idbResult.reason}）`;
      }
    }
    setImportStatus(statusMessage);
    window.setTimeout(() => setImportStatus(null), 1500);
  };

  const normalizeAnalysisPayload = (payload: any): {
    bpm?: number | null;
    key?: string | null;
    title?: string | null;
    artist?: string | null;
    energy?: number | null;
    loudness_profile?: { heat?: number | null } | null;
    details?: { warnings?: string[]; bpm_source?: string; key_source?: string } | null;
  } => {
    if (!payload) return {};
    if (payload.track) {
      const track = payload.track as any;
      return {
        bpm: typeof track.bpm === 'number' ? track.bpm : null,
        key: typeof track.key_text === 'string'
          ? track.key_text
          : (typeof track.key_camelot === 'string' ? track.key_camelot : null),
        title: typeof track.title === 'string' ? track.title : null,
        artist: typeof track.artist === 'string' ? track.artist : null,
        energy: typeof track.energy === 'number' ? track.energy : null,
        loudness_profile: track.loudness_profile || null,
        details: track.details || null
      };
    }
    return payload;
  };

  const analyzeLocalFile = async (file: File): Promise<{
    bpm?: number | null;
    key?: string | null;
    title?: string | null;
    artist?: string | null;
    energy?: number | null;
    loudness_profile?: { heat?: number | null } | null;
    details?: { warnings?: string[]; bpm_source?: string; key_source?: string } | null;
  }> => {
    const form = new FormData();
    form.append('file', file);
    const requestUrl = analysisEndpoint;
    const pageUrl = window.location.href;
    const resolvedFetchUrl = new URL(analysisEndpoint, pageUrl).toString();
    const isProxyRequest = !analysisEndpoint.startsWith('http');
    console.log('[analysis] request', {
      analysisEndpoint,
      url: requestUrl,
      resolvedFetchUrl,
      method: 'POST',
      baseUrl: analysisApiBase,
      pageUrl,
      proxy: isProxyRequest,
      fileName: file.name,
      fileBytes: file.size
    });
    let response: Response;
    try {
      response = await fetchWithTimeout(resolvedFetchUrl, {
        method: 'POST',
        body: form
      }, 60000);
      console.log('[analysis] response', {
        url: response.url,
        status: response.status
      });
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError';
      const payload = {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        abort: isAbort,
        url: resolvedFetchUrl
      };
      if (isAbort) {
        console.warn('[analysis] fetch aborted', payload);
        return {};
      }
      console.error('[analysis] fetch failed', payload);
      throw error;
    }
    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.status}`);
    }
    const payload = await response.json();
    if (payload && payload.ok === false) {
      throw new Error(payload.errors?.join(',') || 'Analysis failed');
    }
    return normalizeAnalysisPayload(payload);
  };

  const identifyLocalFile = async (
    file: File,
    options?: { debug?: boolean }
  ): Promise<{ heatScore?: number | null; heatScoreRaw?: number | null; heatSource?: string | null; errorMessage?: string | null } | null> => {
    const form = new FormData();
    form.append('file', file);
    const pageUrl = window.location.href;
    const buildRequestUrl = (endpoint: string) => {
      const url = new URL(endpoint, pageUrl);
      if (options?.debug) {
        url.searchParams.set('debug', 'true');
      }
      return url.toString();
    };

    const runIdentify = async (endpoint: string) => {
      const requestUrl = buildRequestUrl(endpoint);
      const response = await fetchWithTimeout(requestUrl, {
        method: 'POST',
        body: form
      }, IDENTIFY_TIMEOUT_MS);
      if (!response.ok) {
        let reason = `identify failed: ${response.status}`;
        try {
          const payload = await response.json();
          if (payload?.detail?.message) {
            reason = payload.detail.message;
          } else if (payload?.detail?.reason) {
            reason = payload.detail.reason;
          }
        } catch {
          // ignore parse error
        }
        console.warn('[heat] identify failed', { status: response.status, url: requestUrl, reason });
        return { errorMessage: reason };
      }
      const payload = await response.json();
      const heat = payload?.heat || null;
      console.log('[heat] identify response', {
        url: requestUrl,
        heat
      });
      if (!heat) return null;
      const heatScoreRaw = typeof heat.heat_score_raw === 'number' && Number.isFinite(heat.heat_score_raw)
        ? heat.heat_score_raw
        : null;
      const heatScore = typeof heat.heat_score === 'number' && Number.isFinite(heat.heat_score)
        ? heat.heat_score
        : (heatScoreRaw !== null ? Math.round(heatScoreRaw) : null);
      const heatSource = typeof payload?.evidence?.heat_source === 'string' ? payload.evidence.heat_source : null;
      return { heatScore, heatScoreRaw, heatSource };
    };

    try {
      return await runIdentify(identifyEndpoints.direct);
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError';
      if (isAbort) {
        console.warn('[heat] identify aborted', { url: identifyEndpoints.direct });
        return { errorMessage: 'identify timeout' };
      }
      if (shouldRetryWithProxy(error)) {
        try {
          console.warn('[heat] identify retry via proxy', { url: identifyEndpoints.proxy });
          return await runIdentify(identifyEndpoints.proxy);
        } catch (proxyError: any) {
          console.warn('[heat] identify failed via proxy', {
            name: proxyError?.name,
            message: proxyError?.message,
            url: identifyEndpoints.proxy
          });
          return { errorMessage: proxyError?.message || 'identify failed' };
        }
      }
      console.warn('[heat] identify failed', {
        name: error?.name,
        message: error?.message,
        url: identifyEndpoints.direct
      });
      return { errorMessage: error?.message || 'identify failed' };
    }
  };

  const getAudioDuration = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const cleanup = () => {
        URL.revokeObjectURL(url);
        audio.src = '';
      };

      audio.addEventListener('loadedmetadata', () => {
        const seconds = Number.isFinite(audio.duration) ? Math.max(0, Math.round(audio.duration)) : 0;
        cleanup();
        resolve(seconds > 0 ? formatSecondsToDuration(seconds) : '03:00');
      });
      audio.addEventListener('error', () => {
        cleanup();
        resolve('03:00');
      });
      audio.src = url;
    });
  };

  // 计算筛选器分类 (动态计算)
  const allCategories = useMemo(() => {
      const categories = new Set(library.map(t => getGenreCategory(t.genre)));
      const order = [
        'House / Disco', 'Techno', 'Trance', 
        'Hip Hop / R&B', 'Pop / Dance', 'Latin', 
        'Bass / DnB', 'Rock / Alt', 'Hard / Festival', 
        'Chill / Jazz', 'Tools', 'Other'
      ];
      return Array.from(categories).sort((a: string, b: string) => {
        const idxA = order.indexOf(a);
        const idxB = order.indexOf(b);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
  }, [library]);

  // --- 统计数据计算 ---
  const averageEnergy = useMemo(() => {
      if (setTracks.length === 0) return '0.0';
      const total = setTracks.reduce((sum, t) => sum + t.energy, 0);
      return (total / setTracks.length).toFixed(1);
  }, [setTracks]);

  const estimatedTotalTime = useMemo(() => {
      return calculateTotalSetDuration(setTracks, setType);
  }, [setTracks, setType]);

  const genreStats = useMemo(() => {
      const total = setTracks.length;
      if (total === 0) return [];
      const counts: Record<string, number> = {};
      setTracks.forEach(t => {
          const cat = getGenreCategory(t.genre);
          counts[cat] = (counts[cat] || 0) + 1;
      });
      return Object.entries(counts)
          .map(([name, count]) => ({ name, count, percent: Math.round((count/total)*100) }))
          .sort((a,b) => b.count - a.count);
  }, [setTracks]);

  // 全局问题诊断 (传入 cutModes)
  const globalIssues = useMemo(() => {
      return analyzeSet(setTracks, setType, 'standard', cutModes);
  }, [setTracks, setType, cutModes]);

  const issueCount = globalIssues.filter(i => i.severity === 'critical' || i.severity === 'warning').length;

  // --- 交互处理 ---
  const addToSet = (track: Track) => {
    // 生成唯一 ID 以允许重复添加同一首歌
    const newTrack = {
      ...track,
      id: `${track.id}-${crypto.randomUUID()}`,
      sourceId: track.sourceId || track.id
    };
    setSetTracks([...setTracks, newTrack]);
    setAiSuggestions(prev => prev.filter(s => s.trackId !== track.id));
  };
  
  const insertToSet = (track: Track, index: number) => {
      const newTrack = {
        ...track,
        id: `${track.id}-${crypto.randomUUID()}`,
        sourceId: track.sourceId || track.id
      };
      const newSet = [...setTracks];
      newSet.splice(index, 0, newTrack);
      setSetTracks(newSet);
  };

  const removeFromSet = (instanceId: string) => {
    setSetTracks(setTracks.filter(t => t.id !== instanceId));
    // 移除时同步清理 cutMode 状态
    setCutModes(prev => {
        const next = { ...prev };
        delete next[instanceId];
        return next;
    });
  };

  const reorderTracks = (startIndex: number, endIndex: number) => {
    const result = Array.from(setTracks);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    setSetTracks(result);
  };

  const handleToggleCutMode = (trackId: string) => {
      setCutModes(prev => ({ ...prev, [trackId]: !prev[trackId] }));
  };

  const handleTransitionAnalysis = async (trackAId: string, trackBId: string): Promise<TransitionAnalysis | null> => {
    const trackA = setTracks.find(t => t.id === trackAId);
    const trackB = setTracks.find(t => t.id === trackBId);
    if (trackA && trackB) {
      return await analyzeTransitionAi(trackA, trackB);
    }
    return null;
  };

  const handleAiSuggest = async () => {
      if (setTracks.length === 0) return;
      setIsAiSuggesting(true);
      setAiSuggestions([]); 
      
      try {
          const suggestions = await getAiSuggestions(setTracks, library, setType);
          setAiSuggestions(suggestions);
      } catch (e) {
          console.error("AI Suggest Error", e);
      } finally {
          setIsAiSuggesting(false);
      }
  };

  const handleLocalFiles = async (files: FileList | File[], targetFolderId?: string | null) => {
    const incoming = Array.from(files);
    const audioFiles = incoming.filter(file => file.type.startsWith('audio/'));
    if (audioFiles.length === 0) {
      setImportStatus('未识别到音频文件');
      return;
    }

    setImportStatus(`已加入 ${audioFiles.length} 首，正在解析...`);
    const PRIORITY_IMPORT_COUNT = 12;
    const tasks = audioFiles.map((file, index) => {
      const fallback = parseLocalFileName(file.name);
      const filenameMeta = parseLocalMetaFromFilename(file.name);
      const priority = index < PRIORITY_IMPORT_COUNT ? 1 : 0;
      const trackId = `local-${crypto.randomUUID()}`;
      const fileCacheKey = buildFileCacheKey(file);
      const placeholder: Track = attachFilePath({
        id: trackId,
        title: fallback.title,
        artist: fallback.artist,
        bpm: typeof filenameMeta.bpm === 'number' ? filenameMeta.bpm : null,
        key: filenameMeta.key || null,
        bpmSource: typeof filenameMeta.bpm === 'number' ? 'filename' : null,
        keySource: filenameMeta.key ? 'filename' : null,
        energy: null,
        resonance: null,
        heatStatus: 'pending',
        genre: null,
        duration: '03:00',
        status: 'pending',
        filenameDisplay: file.name,
        fileSignature: fileCacheKey,
        folderIds: targetFolderId ? [targetFolderId] : []
      }, file);
      if (typeof window !== 'undefined') {
        (window as any).__lastImportName = file.name;
        (window as any).__lastImportPath = placeholder.filePath || null;
      }
      setLibrary(prev => [placeholder, ...prev]);
      setLibraryOrder(prev => [trackId, ...prev]);
      setLocalFileMap(prev => ({ ...prev, [trackId]: file }));

      if (!placeholder.filePath) {
        let attempts = 0;
        const retryResolve = () => {
          const resolved = getFilePath(file as File & { path?: string });
          if (resolved) {
            updateTrackById(trackId, { filePath: resolved });
            if (typeof window !== 'undefined') {
              (window as any).__lastImportPath = resolved;
            }
            return;
          }
          attempts += 1;
          if (attempts < 3) {
            window.setTimeout(retryResolve, 150 * attempts);
          }
        };
        window.setTimeout(retryResolve, 60);
      }

      let analysisOutcome: { status: 'ok'; data: any } | { status: 'failed'; error: string } | null = null;
      let styleOutcome: { status: 'ok'; data: any } | { status: 'failed'; error: string } | null = null;

      const finalizeStatus = () => {
        if (!analysisOutcome || !styleOutcome) return;
        const status = analysisOutcome.status === 'ok' && styleOutcome.status === 'ok' ? 'ok' : 'failed';
        const error = analysisOutcome.status === 'failed'
          ? analysisOutcome.error
          : (styleOutcome.status === 'failed' ? styleOutcome.error : null);
        updateTrackById(trackId, { status, error });
      };

      const cachedCoverPromise = getCachedCover(fileCacheKey)
        .then((coverUrl) => {
          if (coverUrl) updateTrackById(trackId, { coverUrl });
          return coverUrl;
        })
        .catch(() => null);

      const metaPromise = extractId3Metadata(file)
        .then((meta) => {
          const patch: Partial<Track> = {};
          if (meta.title) patch.title = meta.title;
          if (meta.artist) patch.artist = meta.artist;
          if (typeof meta.bpm === 'number') {
            patch.bpm = meta.bpm;
            patch.bpmSource = 'id3';
          }
          if (meta.key) {
            patch.key = meta.key;
            patch.keySource = 'id3';
          }
          if (meta.coverUrl) {
            patch.coverUrl = meta.coverUrl;
            void setCachedCover(fileCacheKey, meta.coverUrl);
          }
          if (Object.keys(patch).length > 0) {
            updateTrackById(trackId, patch);
          }
          return meta;
        })
        .catch(() => ({}));

      const durationPromise = getAudioDuration(file)
        .then((duration) => {
          updateTrackById(trackId, { duration });
          return duration;
        })
        .catch(() => '03:00');

      const analysisPromise = getCachedAnalysis(fileCacheKey)
        .then((cached) => {
          if (cached) {
            analysisOutcome = { status: 'ok', data: cached };
            applyAnalysisResultToTrack(trackId, cached);
            finalizeStatus();
            return cached;
          }
          return analyzeLocalFile(file)
            .then((data) => {
              analysisOutcome = { status: 'ok', data };
              applyAnalysisResultToTrack(trackId, data);
              void setCachedAnalysis(fileCacheKey, data);
              finalizeStatus();
              return data;
            });
        })
        .catch((e) => {
          console.warn('Local analysis failed', e);
          const message = normalizeErrorMessage(String(e)) || 'analysis failed';
          analysisOutcome = { status: 'failed', error: `analysis: ${message} (${analysisEndpoint})` };
          finalizeStatus();
          return null;
        });

      const stylePromise = (styleDebugEnabled
        ? analysisPromise.then((analysisData) => {
            const bpmForStyle =
              analysisData?.bpm && Number.isFinite(analysisData.bpm) ? Math.round(analysisData.bpm) : null;
            return analyzeStyle(file, {
              debug: true,
              bpm: bpmForStyle,
              force: true,
              taskId: trackId,
              priority
            });
          })
        : analyzeStyle(file, { taskId: trackId, priority })
      ).then((result) => {
        const rawFilenameDisplay = result?.filenameDisplay || file.name;
        const filenameDisplay = decodeDisplayName(rawFilenameDisplay);
        const djStyleLabel = result?.djStyle?.trim();
        const styleLabel = result?.style?.trim();
        const genreLabel = result?.genre?.trim();
        const hasStyle = result?.status === 'ok';
        const genre = hasStyle ? (styleLabel || djStyleLabel || genreLabel || null) : null;
        updateTrackById(trackId, {
          genre,
          filenameDisplay
        });
        if (hasStyle) {
          styleOutcome = { status: 'ok', data: result };
        } else {
          styleOutcome = { status: 'failed', error: result?.error || 'style failed' };
        }
        finalizeStatus();
        return result;
      }).catch((e) => {
        console.warn('Style analysis failed', e);
        styleOutcome = { status: 'failed', error: String(e) };
        finalizeStatus();
        return null;
      });

      const identifyCacheKey = buildHeatCacheKey(file);
      const cachedIdentify = identifyCacheRef.current.get(identifyCacheKey) || null;
      const identifyPromise = (cachedIdentify
        ? Promise.resolve(cachedIdentify)
        : enqueueIdentify(() => identifyLocalFile(file), priority)
      ).then((identifyResult) => {
        if (!cachedIdentify && identifyResult) {
          identifyCacheRef.current.set(identifyCacheKey, identifyResult);
        }
        applyHeatUpdate(
          trackId,
          identifyResult?.heatScoreRaw ?? null,
          identifyResult?.heatScore ?? null,
          identifyResult?.heatSource ?? null,
          identifyResult?.errorMessage ?? null
        );
        return identifyResult;
      }).catch((e) => {
        console.warn('Heat identify failed', e);
        applyHeatUpdate(trackId, null, null, null, normalizeErrorMessage(String(e)) || 'identify failed');
        return null;
      });

      return Promise.allSettled([cachedCoverPromise, metaPromise, durationPromise, analysisPromise, stylePromise, identifyPromise]);
    });

    void Promise.all(tasks).then(() => {
      setImportStatus(`导入完成 ${audioFiles.length} 首`);
      window.setTimeout(() => setImportStatus(null), 2000);
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleLocalFiles(e.target.files, selectedFolderId);
      e.target.value = '';
    }
  };

  const handleSaveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      window.localStorage.removeItem('gemini_api_key');
      setApiKeyInput('');
      setHasApiKey(false);
      return;
    }
    window.localStorage.setItem('gemini_api_key', trimmed);
    setApiKeyInput(trimmed);
    setHasApiKey(true);
  };

  const handleClearApiKey = () => {
    window.localStorage.removeItem('gemini_api_key');
    setApiKeyInput('');
    setHasApiKey(false);
  };

  const formatDefaultSetName = () => {
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Set ${date} ${time}`;
  };

  const buildCurrentSetList = (overrides: Partial<SetList> = {}, useAutoName = false): SetList => {
    const rawName = (overrides.name ?? currentSetName).trim();
    const name = rawName || (useAutoName ? formatDefaultSetName() : '未命名 Set');
    return {
      id: overrides.id ?? currentSetId,
      name,
      tracks: overrides.tracks ?? setTracks,
      type: overrides.type ?? setType,
      totalDuration: overrides.totalDuration ?? estimatedTotalTime
    };
  };

  const upsertSetList = (setList: SetList) => {
    setSavedSetLists(prev => {
      const filtered = prev.filter(item => item.id !== setList.id);
      return [setList, ...filtered];
    });
  };

  const persistSetList = async (setList: SetList): Promise<SetList | null> => {
    try {
      const saved = await trackService.saveSetList(setList);
      upsertSetList(saved);
      void fetchSetLists();
      return saved;
    } catch (err) {
      console.error('Failed to save setlist', err);
      setImportStatus('Set 保存失败，请稍后重试');
      window.setTimeout(() => setImportStatus(null), 2000);
      return null;
    }
  };

  const ensureCurrentSetSaved = async () => {
    const alreadySaved = savedSetLists.some(item => item.id === currentSetId);
    const trimmedName = currentSetName.trim();
    const hasContent = setTracks.length > 0 || (trimmedName.length > 0 && trimmedName !== '未命名 Set');
    if (!hasContent) return;
    if (!isSetDirty && alreadySaved) return;
    const setList = buildCurrentSetList({}, true);
    if (!currentSetName.trim()) {
      suppressSetDirtyRef.current = true;
      setCurrentSetName(setList.name);
    }
    const saved = await persistSetList(setList);
    if (saved) {
      setIsSetDirty(false);
    }
  };

  const handleOpenExport = () => {
    if (!exportAvailable) {
      setExportError('当前环境未检测到桌面端导出能力');
    } else {
      setExportError(null);
    }
    setExportSuccess(null);
    setExportSuccessPath(null);
    setExportSuccessTarget(null);
    setIsExportOpen(true);
  };

  const handleConfirmExport = async (payload: ExportPayload) => {
    if (!exportAvailable) {
      setExportError('当前环境未检测到桌面端导出能力');
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[export-payload] ' + JSON.stringify(payload));
    }
    setIsExporting(true);
    setExportError(null);
    try {
      const result = await (window as any).electronAPI.exportSet(payload);
      if (result?.ok) {
        const exportPath = result?.xmlPath || result?.cratePath || result?.playlistName || result?.message || payload.target;
        setExportSuccess(exportPath || payload.target);
        setExportSuccessPath(result?.xmlPath || null);
        setExportSuccessTarget(payload.target);
        setImportStatus(`导出成功：${exportPath}`);
        window.setTimeout(() => setImportStatus(null), 4000);
      } else {
        setExportError(result?.message || '导出失败');
      }
    } catch (err) {
      const message = normalizeErrorMessage(String(err)) || '导出失败';
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  };

  const saveSet = async () => {
    if (setTracks.length === 0) {
      setImportStatus('当前 Set 为空，无法保存');
      window.setTimeout(() => setImportStatus(null), 2000);
      return;
    }
    if (isCurrentSetSaved && isSetDirty) {
      const confirmed = window.confirm('该 Set 已存在，是否覆盖保存？');
      if (!confirmed) return;
    }
    const setList = buildCurrentSetList({}, true);
    if (!currentSetName.trim()) {
      suppressSetDirtyRef.current = true;
      setCurrentSetName(setList.name);
    }
    const saved = await persistSetList(setList);
    if (saved) {
      setIsSetDirty(false);
      alert(`Set (${setType} 模式) 已保存!`);
    }
  };

  const handleNewSet = async () => {
    await ensureCurrentSetSaved();
    suppressSetDirtyRef.current = true;
    setCurrentSetId(crypto.randomUUID());
    setCurrentSetName('未命名 Set');
    setSetTracks([]);
    setCutModes({});
    setIsSetDirty(false);
  };

  const handleLoadSet = async (setList: SetList) => {
    if (!setList || setList.id === currentSetId) return;
    await ensureCurrentSetSaved();
    suppressSetDirtyRef.current = true;
    setCurrentSetId(setList.id);
    setCurrentSetName(setList.name);
    setSetTracks(setList.tracks || []);
    setSetType(setList.type);
    setCutModes({});
    setIsSetDirty(false);
  };

  const handleRenameSet = async (setList: SetList) => {
    const nextName = window.prompt('输入新的 Set 名称', setList.name || '');
    if (nextName === null) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === setList.name) return;
    const updated = { ...setList, name: trimmed };
    const saved = await persistSetList(updated);
    if (saved && setList.id === currentSetId) {
      suppressSetDirtyRef.current = true;
      setCurrentSetName(saved.name);
      setIsSetDirty(false);
    }
  };

  const handleDeleteSet = async (setList: SetList) => {
    const confirmed = window.confirm(`确认删除 Set「${setList.name}」？`);
    if (!confirmed) return;
    try {
      await trackService.deleteSetList(setList.id);
      setSavedSetLists(prev => prev.filter(item => item.id !== setList.id));
      if (setList.id === currentSetId) {
        setImportStatus('已删除该 Set 的保存记录');
        window.setTimeout(() => setImportStatus(null), 1500);
        setIsSetDirty(true);
      }
    } catch (err) {
      console.error('Failed to delete setlist', err);
      setImportStatus('删除失败，请稍后重试');
      window.setTimeout(() => setImportStatus(null), 2000);
    }
  };

  // --- 排序逻辑 ---
  const handleSort = (key: SortKey) => {
      setSortCriteria(prev => {
          if (key === 'import') {
              setSortMode('single');
              return [{ key, order: 'asc' }];
          }
          const existingIndex = prev.findIndex(c => c.key === key);
          if (sortMode === 'single') {
              if (existingIndex >= 0) {
                  return [{ key, order: prev[existingIndex].order === 'asc' ? 'desc' : 'asc' }];
              } else {
                  return [{ key, order: 'asc' }];
              }
          } else {
              if (existingIndex >= 0) {
                  const newCriteria = [...prev];
                  newCriteria[existingIndex] = { 
                      ...newCriteria[existingIndex], 
                      order: newCriteria[existingIndex].order === 'asc' ? 'desc' : 'asc' 
                  };
                  return newCriteria;
              } else {
                  return [...prev, { key, order: 'asc' }];
              }
          }
      });
  };

  const clearSort = () => {
      setSortCriteria([]);
  };

  const toggleSortMode = () => {
      setSortMode(prev => {
          const newMode = prev === 'single' ? 'multi' : 'single';
          if (newMode === 'single' && sortCriteria.length > 1) {
              setSortCriteria([sortCriteria[0]]);
          }
          return newMode;
      });
  };
  
  const handleSetGenreClick = (genre: string) => {
    if (!genre) {
        setSelectedCategory(null);
    } else {
        const cat = getGenreCategory(genre);
        setSelectedCategory(cat);
    }
  };

  const isImportSort = sortCriteria.length === 1 && sortCriteria[0].key === 'import';
  const isCurrentSetSaved = savedSetLists.some(item => item.id === currentSetId);
  const savedSetDisplayList = useMemo(() => {
    return savedSetLists;
  }, [savedSetLists]);

  // --- 曲库过滤与排序 ---
  const processedLibrary = useMemo(() => {
    let result = [...library];
    const orderIndex = new Map(libraryOrder.map((id, index) => [id, index]));
    
    // 1. 分类过滤
    if (selectedCategory) {
        result = result.filter(t => getGenreCategory(t.genre) === selectedCategory);
    }
    // 1.5 文件夹过滤（单选）
    if (selectedFolderId) {
        result = result.filter(t => {
            const folders = t.folderIds || [];
            return folders.includes(selectedFolderId);
        });
    }
    // 2. 搜索过滤
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        result = result.filter(t => 
            t.title.toLowerCase().includes(lowerTerm) || 
            t.artist.toLowerCase().includes(lowerTerm)
        );
    }
    // 3. 专注模式过滤 (根据 Set 类型隐藏不合适的歌)
    if (isFocusMode) {
        if (setType === 'warmup') result = result.filter(t => t.heatStatus !== 'ok' || t.resonance <= 7);
        else if (setType === 'prime') result = result.filter(t => t.heatStatus !== 'ok' || t.resonance >= 6);
        else if (setType === 'closing') result = result.filter(t => t.heatStatus !== 'ok' || t.resonance >= 7);
    }
    // 4. 排序执行
    if (sortCriteria.length > 0) {
        const parseKey = (k: string) => {
             if (!k) return 0;
             const normalized = toCamelotKey(k) || k;
             const match = normalized.match(/(\d+)([AB])/);
             if (!match) return 0;
             return parseInt(match[1]) * 10 + (match[2] === 'A' ? 0 : 5);
        };
        result.sort((a, b) => {
            for (const criterion of sortCriteria) {
                let valA: any = a[criterion.key];
                let valB: any = b[criterion.key];
                if (criterion.key === 'import') {
                    valA = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
                    valB = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
                }
                if (criterion.key === 'key') {
                    valA = parseKey(typeof a.key === 'string' ? a.key : '');
                    valB = parseKey(typeof b.key === 'string' ? b.key : '');
                }
                if (valA < valB) return criterion.order === 'asc' ? -1 : 1;
                if (valA > valB) return criterion.order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }
    return result;
  }, [library, libraryOrder, searchTerm, sortCriteria, selectedCategory, selectedFolderId, isFocusMode, setType]);

  const focusModeDescription = useMemo(() => {
      if (!isFocusMode) return "开启专注模式以过滤不适合当前时段的歌曲";
      if (setType === 'warmup') return "暖场模式: 已隐藏高共鸣金曲 (>7)";
      if (setType === 'prime') return "黄金模式: 已隐藏低共鸣铺垫曲 (<6)";
      if (setType === 'closing') return "收尾模式: 已隐藏非经典曲目 (<7)";
      return "";
  }, [isFocusMode, setType]);

  if (isLoading) {
      return <div className="h-screen w-full flex items-center justify-center bg-dj-dark text-dj-accent animate-pulse">正在初始化 SpinFlow...</div>
  }

  return (
    <div className="h-screen w-full bg-transparent flex flex-col text-slate-200 overflow-hidden font-sans app-shell">

      <div className="app-topbar">
        <div className="app-topbar-title">
          <span className="app-topbar-dot"></span>
          <span>SpinFlow Studio</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex-1 flex overflow-hidden">
      {/* 左侧: 曲库面板 */}
      <div className="w-[28%] min-w-[320px] max-w-[420px] flex flex-col glass-panel panel-soft">
        <div className="p-4 glass-card z-10 flex flex-col gap-3">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-dj-accent shadow-[0_0_12px_rgba(180,138,166,0.7)]"></div>
            SPIN<span className="text-dj-accent">FLOW</span>
          </h1>
          
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input 
              type="text"
              placeholder="搜索曲库..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full glass-input text-sm pl-10 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-dj-accent/40 transition-all placeholder-slate-500"
            />
          </div>

          {/* 专注模式开关 */}
          <button
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`w-full py-2 px-3 rounded-full flex items-center justify-between text-xs font-bold transition-all ${
                isFocusMode 
                ? 'btn-primary text-slate-900'
                : 'glass-pill hover:text-white'
            }`}
          >
             <div className="flex items-center gap-2">
                 <Target className="w-4 h-4" />
                 <span>专注选曲 (Smart Focus)</span>
             </div>
             {isFocusMode && (
                 <span className="bg-dj-accent text-slate-900 px-1.5 py-0.5 rounded text-[10px]">ON</span>
             )}
          </button>
          
          {isFocusMode && (
              <div className="glass-card rounded px-2 py-1.5 flex items-center gap-2 text-[10px] text-slate-400 animate-in fade-in slide-in-from-top-1">
                  <Filter className="w-3 h-3 text-slate-500" />
                  {focusModeDescription}
              </div>
          )}

          {/* 风格过滤器 */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            <button 
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === null 
                    ? 'btn-primary text-slate-900 shadow-md' 
                    : 'glass-pill hover:text-white'
                }`}
            >
                全部
            </button>
            {allCategories.map(cat => (
                <button 
                    key={cat}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        selectedCategory === cat 
                        ? 'btn-primary text-slate-900 shadow-md' 
                        : 'glass-pill hover:text-white'
                    }`}
                >
                    {cat}
                </button>
            ))}
          </div>

          {/* 文件夹管理 */}
          <div className="rounded-lg glass-card overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-2 font-semibold text-slate-300">
                <Folder className="w-3.5 h-3.5" /> 曲库文件夹
              </span>
              {selectedFolderId && (
                <button
                  onClick={() => setSelectedFolderId(null)}
                  className="text-[10px] text-slate-500 hover:text-slate-200"
                >
                  全部
                </button>
              )}
            </div>

            <div className="max-h-40 overflow-y-auto">
              <button
                onClick={() => selectFolder(null)}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 rounded-md transition-colors ${
                  selectedFolderId === null
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Folder className="w-3.5 h-3.5" /> 全部
              </button>

              {folders.map(folder => {
                const active = selectedFolderId === folder.id;
                return (
                  <div
                    key={folder.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectFolder(folder.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectFolder(folder.id);
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDragEnter={() => {
                      console.log('[folder] drag enter', { folderId: folder.id });
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() => setDragOverFolderId(prev => (prev === folder.id ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[folder] drop', {
                        folderId: folder.id,
                        types: Array.from(e.dataTransfer.types || [])
                      });
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleLocalFiles(e.dataTransfer.files, folder.id);
                        return;
                      }
                      const trackId = e.dataTransfer.getData('application/x-track-id')
                        || e.dataTransfer.getData('text/plain')
                        || e.dataTransfer.getData('text')
                        || draggingTrackId;
                      console.log('[folder] drop trackId', { trackId });
                      if (trackId) assignTrackToFolder(trackId, folder.id);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 rounded-md transition-colors cursor-pointer select-none ${
                      active
                        ? 'bg-indigo-600/20 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                    title="拖拽歌曲到此文件夹"
                  >
                    <Folder className="w-3.5 h-3.5" /> {folder.name}
                  </div>
                );
              })}
            </div>

            <div className="p-3 flex gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="新建文件夹"
                className="flex-1 glass-input rounded px-2 py-1 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-dj-accent/40"
              />
              <button
                onClick={handleCreateFolder}
                className="px-2 py-1 rounded-full btn-secondary text-xs flex items-center gap-1"
              >
                <FolderPlus className="w-3 h-3" /> 新建
              </button>
            </div>
          </div>

          {/* 排序控制 */}
          <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                      <span className="font-medium">排序模式:</span>
                      <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700">
                          <button 
                            onClick={() => sortMode !== 'single' && toggleSortMode()}
                            className={`px-2 py-0.5 rounded text-[10px] transition-all ${sortMode === 'single' ? 'bg-slate-600 text-white shadow-sm' : 'hover:text-slate-300'}`}
                          >
                              单项
                          </button>
                          <button 
                            onClick={() => sortMode !== 'multi' && toggleSortMode()}
                            className={`px-2 py-0.5 rounded text-[10px] transition-all ${sortMode === 'multi' ? 'bg-dj-accent text-slate-900 font-bold shadow-sm' : 'hover:text-slate-300'}`}
                          >
                              多项
                          </button>
                      </div>
                  </div>
                  
                  {sortCriteria.length > 0 && (
                      <button onClick={clearSort} className="text-[10px] flex items-center gap-1 hover:text-white transition-colors">
                          <X className="w-3 h-3" /> 重置
                      </button>
                  )}
              </div>

              <div className="flex gap-1 flex-wrap">
                  {[
                      { id: 'import', label: '拖入顺序', icon: <ListOrdered className="w-3 h-3" /> },
                      { id: 'bpm', label: 'BPM', icon: <Activity className="w-3 h-3" /> },
                      { id: 'key', label: '调性', icon: <Music className="w-3 h-3" /> },
                      { id: 'energy', label: '能量', icon: <Zap className="w-3 h-3" /> },
                      { id: 'resonance', label: '共鸣', icon: <Flame className="w-3 h-3" /> }
                  ].map((opt) => {
                      const activeIndex = sortCriteria.findIndex(c => c.key === opt.id);
                      const isActive = activeIndex >= 0;
                      const activeSort = isActive ? sortCriteria[activeIndex] : null;

                      return (
                          <button
                            key={opt.id}
                            onClick={() => handleSort(opt.id as SortKey)}
                            className={`px-2 py-1.5 rounded flex items-center gap-1.5 transition-all text-xs border border-transparent ${
                                isActive 
                                ? 'bg-slate-700 text-white border-slate-600 shadow-sm' 
                                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                          >
                              {opt.icon} 
                              <span>{opt.label}</span>
                              
                              {isActive && activeSort && (
                                  <span className="flex items-center ml-0.5">
                                      {sortMode === 'multi' && (
                                          <span className="bg-slate-900 text-slate-300 text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center mr-1 font-mono">
                                              {activeIndex + 1}
                                          </span>
                                      )}
                                      {activeSort.order === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                                  </span>
                              )}
                          </button>
                      );
                  })}
              </div>
              {isImportSort && (
                  <div className="text-[10px] text-slate-500 mt-1">
                      拖入顺序模式：可拖拽调整曲库顺序
                  </div>
              )}
          </div>
        </div>

        {/* 曲库列表渲染 */}
        <div
            className={`flex-1 overflow-y-auto p-2 space-y-1 transition-colors ${isLibraryDragOver ? 'bg-indigo-500/10' : ''}`}
            onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }}
            onDragEnter={() => setIsLibraryDragOver(true)}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsLibraryDragOver(false);
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                setIsLibraryDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleLocalFiles(e.dataTransfer.files, selectedFolderId);
                }
            }}
        >
            <div className={`mb-2 rounded-lg border border-dashed p-3 text-center text-xs transition-all ${
                isLibraryDragOver ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10' : 'border-slate-700 text-slate-500 bg-slate-900/30'
            }`}>
                <div className="font-bold">拖拽本地歌曲到这里</div>
                <div className="mt-1">或</div>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1 inline-flex items-center justify-center px-3 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                    点击选择文件
                </button>
                <div className="text-[10px] text-slate-600 mt-1">仅本地导入，不会上传</div>
                <label className="mt-2 inline-flex items-center gap-2 text-[10px] text-slate-400 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="accent-indigo-500"
                        checked={styleDebugEnabled}
                        onChange={(e) => setStyleDebugEnabled(e.target.checked)}
                    />
                    <span className="inline-flex items-center gap-1">
                        <ScanEye className="w-3 h-3" />
                        风格调试（debug=1 + 强制刷新）
                    </span>
                </label>
                {importStatus && <div className="text-[10px] text-indigo-300 mt-1">{importStatus}</div>}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    className="hidden"
                    onChange={handleFileInputChange}
                />
            </div>
            <div className="text-xs font-semibold text-slate-500 uppercase px-2 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2">
                    <Library className="w-3 h-3" /> 
                    曲库 ({processedLibrary.length})
                    {selectedCategory && <span className="text-indigo-400 normal-case ml-1 flex items-center gap-1"><Disc className="w-3 h-3"/> {selectedCategory}</span>}
                </span>
                <span className="flex items-center gap-2">
                    {library.length > 0 && (
                        <button
                            onClick={refreshHeatAll}
                            disabled={isHeatRefreshing || Object.keys(localFileMap).length === 0}
                            className="text-[10px] flex items-center gap-1 text-slate-500 hover:text-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="重新获取联网热度（需本地文件仍在内存）"
                        >
                            <Flame className="w-3 h-3" /> 刷新热度
                        </button>
                    )}
                    <label className="inline-flex items-center gap-1 text-[10px] text-slate-500 select-none">
                        <input
                            type="checkbox"
                            className="accent-indigo-500"
                            checked={clearPersistentStorageEnabled}
                            onChange={(e) => setClearPersistentStorageEnabled(e.target.checked)}
                            title="同时清除 IndexedDB 与 localStorage（会移除 API Key）"
                        />
                        深度清理
                    </label>
                    <button
                        onClick={clearAllCaches}
                        className="text-[10px] flex items-center gap-1 text-slate-500 hover:text-indigo-300 transition-colors"
                        title="清除风格/热度本地缓存与队列"
                    >
                        <RotateCcw className="w-3 h-3" /> 清除缓存
                    </button>
                    {library.length > 0 && (
                        <button
                            onClick={clearLibrary}
                            className="text-[10px] flex items-center gap-1 text-slate-500 hover:text-rose-300 transition-colors"
                            title="清空当前曲库（用于重新导入）"
                        >
                            <Trash2 className="w-3 h-3" /> 清空
                        </button>
                    )}
                </span>
            </div>
            
            {processedLibrary.length === 0 && (
                <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                    <Filter className="w-8 h-8 opacity-20" />
                    <p>
                      {selectedFolderId
                        ? '该文件夹暂无歌曲，可拖拽或导入后分配'
                        : '曲库为空，可拖拽导入；导入后可点击编辑修正'}
                    </p>
                    {isFocusMode && <p className="text-xs text-slate-600">专注模式已过滤部分歌曲</p>}
                </div>
            )}

            {processedLibrary.map(track => {
                const trackCategory = getGenreCategory(track.genre);
                const isCatActive = selectedCategory === trackCategory;
                const displayKey = track.key ? getDisplayKey(String(track.key)) : '—';
                const isPending = track.status === 'pending';
                const displayGenre = track.status === 'failed' ? 'Failed' : (isPending ? 'Analyzing…' : (track.genre || '—'));
                const displayBpm = typeof track.bpm === 'number' ? track.bpm : '—';
                const energyDisplay = getMetricDisplay({
                  status: track.status ?? 'ok',
                  value: track.energy,
                  error: track.error ? normalizeErrorMessage(track.error) : null
                });
                const resonanceDisplay = getMetricDisplay({
                  status: track.heatStatus ?? 'ok',
                  value: track.resonance,
                  error: track.heatError ? normalizeErrorMessage(track.heatError) : null
                });
                const heatMetaLabel = formatHeatMeta({ heatSource: track.heatSource, heatScoreRaw: track.heatScoreRaw });
                const hasHeatMeta = Boolean(track.heatSource) || (typeof track.heatScoreRaw === 'number' && Number.isFinite(track.heatScoreRaw));
                const heatReady = resonanceDisplay.state === 'ok';
                const resonanceValue = resonanceDisplay.value ?? 5;
                const errorMessage = track.status === 'failed' ? normalizeErrorMessage(track.error) : null;
                const heatErrorMessage = track.heatError ? normalizeErrorMessage(track.heatError) : null;

                return (
                    <div 
                        key={track.id} 
                        className={`relative p-2 rounded-md flex items-center justify-between group border border-transparent transition-all hover:bg-slate-800 hover:border-slate-700 ${isImportSort && libraryDragOverId === track.id ? 'bg-slate-800/60' : ''}`}
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', track.id);
                            e.dataTransfer.setData('text', track.id);
                            e.dataTransfer.setData('application/x-track-id', track.id);
                            e.dataTransfer.effectAllowed = 'move';
                            console.log('[folder] drag start', { trackId: track.id });
                            setDraggingTrackId(track.id);
                        }}
                        onDragEnter={() => {
                            if (isImportSort) {
                                setLibraryDragOverId(track.id);
                            }
                        }}
                        onDragOver={(e) => {
                            if (isImportSort) {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                const midpoint = rect.top + rect.height / 2;
                                const position = e.clientY < midpoint ? 'before' : 'after';
                                setLibraryDragOverId(track.id);
                                setLibraryDropPosition(position);
                            }
                        }}
                        onDragEnd={() => {
                            console.log('[folder] drag end', { draggingTrackId, dragOverFolderId });
                            if (dragOverFolderId && draggingTrackId) {
                                assignTrackToFolder(draggingTrackId, dragOverFolderId);
                            } else if (isImportSort && draggingTrackId && libraryDragOverId && libraryDropPosition) {
                                reorderLibrary(draggingTrackId, libraryDragOverId, libraryDropPosition);
                            }
                            setDraggingTrackId(null);
                            setDragOverFolderId(null);
                            setLibraryDragOverId(null);
                            setLibraryDropPosition(null);
                        }}
                    >
                        {isImportSort && libraryDragOverId === track.id && libraryDropPosition === 'before' && (
                            <div className="absolute left-2 right-2 -top-1 h-1 bg-gradient-to-r from-dj-accent via-dj-primary to-dj-accent shadow-[0_0_16px_rgba(180,138,166,0.6)] rounded-full animate-pulse" />
                        )}
                        <div className="flex items-center gap-3 overflow-hidden flex-1">
                            <img src={track.coverUrl || FALLBACK_COVER} className="w-11 h-11 rounded object-cover opacity-80 group-hover:opacity-100 bg-slate-800" />
                            <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm text-slate-200 truncate flex items-center gap-2">
                                    {track.title}
                                </div>
                                <div className="text-xs text-slate-500 truncate">{track.artist}</div>
                                {isPending && (
                                    <div className="text-[10px] text-dj-accent/80 flex items-center gap-1">
                                        <Loader2 className="w-3 h-3 animate-spin" /> 正在解析
                                    </div>
                                )}
                                {errorMessage && (
                                    <div className="text-[10px] text-rose-400 break-all" title={errorMessage}>
                                        {errorMessage}
                                    </div>
                                )}
                                {heatErrorMessage && (
                                    <div className="text-[10px] text-amber-400 break-all" title={heatErrorMessage}>
                                        热度获取失败: {heatErrorMessage}
                                    </div>
                                )}
                                
                                {/* 歌曲指标标签 */}
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <span 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedCategory(isCatActive ? null : trackCategory);
                                        }}
                                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border cursor-pointer transition-colors ${
                                            isCatActive 
                                            ? 'bg-indigo-600 text-white border-indigo-500' 
                                            : 'bg-slate-700/50 text-slate-400 border-slate-700 hover:bg-slate-600 hover:text-slate-200'
                                        }`} 
                                        title={`筛选所有 ${trackCategory} 风格`}
                                    >
                                        <Tag className="w-2.5 h-2.5" /> {displayGenre}
                                    </span>

                                    <span className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-300 font-mono">
                                        <Activity className="w-3 h-3 text-dj-accent" /> {displayBpm}
                                    </span>
                                    <span className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-300 font-mono">
                                        <Music className="w-3 h-3 text-dj-primary" /> {displayKey}
                                    </span>
                                    <span className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-300 font-mono" title={energyDisplay.reason || '能量'}>
                                        <Zap className="w-3 h-3 text-yellow-500" />
                                        {energyDisplay.state === 'pending' ? <Loader2 className="w-3 h-3 animate-spin" /> : energyDisplay.label}
                                    </span>
                                    <span className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-300 font-mono" title={(resonanceDisplay.reason || '共鸣') + (hasHeatMeta ? ` | ${heatMetaLabel}` : '')}>
                                        <Flame className={`w-3 h-3 ${heatReady && resonanceValue > 7 ? 'text-orange-500' : 'text-slate-500'}`} />
                                        {resonanceDisplay.state === 'pending' ? <Loader2 className="w-3 h-3 animate-spin" /> : resonanceDisplay.label}
                                    </span>
                                {hasHeatMeta && (
                                    <div className="text-[9px] text-slate-500 font-mono">heat {heatMetaLabel}</div>
                                )}
                                </div>
                            </div>
                        </div>
                        {isImportSort && libraryDragOverId === track.id && libraryDropPosition === 'after' && (
                            <div className="absolute left-2 right-2 -bottom-1 h-1 bg-gradient-to-r from-dj-accent via-dj-primary to-dj-accent shadow-[0_0_16px_rgba(180,138,166,0.6)] rounded-full animate-pulse" />
                        )}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => startEditTrack(track)}
                                className="p-1.5 rounded-full bg-slate-700 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-600 hover:text-white transition-all transform hover:scale-105"
                                title="编辑数值"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => removeFromLibrary(track.id)}
                                className="p-1.5 rounded-full bg-slate-700 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-rose-600 hover:text-white transition-all transform hover:scale-105"
                                title="从曲库删除"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => addToSet(track)}
                                className="p-1.5 rounded-full bg-slate-700 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-dj-accent hover:text-white transition-all transform hover:scale-105"
                                title="添加到 Set"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
      </div>

      {/* 中间: Set 编排区 */}
      <div className="flex-1 flex flex-col bg-transparent relative">
        <div className="px-6 pt-4 pb-0 flex items-center justify-between">
            <div className="flex glass-card p-1 rounded-full">
                <button
                    onClick={() => setSetType('warmup')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        setType === 'warmup' 
                        ? 'btn-primary text-slate-900 shadow-lg' 
                        : 'glass-pill hover:text-white'
                    }`}
                >
                    <Sunrise className="w-4 h-4" /> 暖场 (Warm-up)
                </button>
                <button
                    onClick={() => setSetType('prime')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        setType === 'prime' 
                        ? 'btn-primary text-slate-900 shadow-lg' 
                        : 'glass-pill hover:text-white'
                    }`}
                >
                    <Sun className="w-4 h-4" /> 黄金时段 (Prime)
                </button>
                <button
                    onClick={() => setSetType('closing')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        setType === 'closing' 
                        ? 'btn-primary text-slate-900 shadow-lg' 
                        : 'glass-pill hover:text-white'
                    }`}
                >
                    <Sunset className="w-4 h-4" /> 收尾 (Closing)
                </button>
            </div>
            
            <div className="text-xs text-slate-500 hidden xl:block">
                {setType === 'warmup' && "策略: 控制能量，避免过早消耗金曲"}
                {setType === 'prime' && "策略: 高能量输出，保持舞池热度"}
                {setType === 'closing' && "策略: 情感共鸣，回归经典"}
            </div>
        </div>

        <div className="px-6 pt-3 pb-2 space-y-3">
            <div className="flex items-center gap-2">
                <input
                    value={currentSetName}
                    onChange={(e) => setCurrentSetName(e.target.value)}
                    placeholder="当前 Set 名称"
                    className="flex-1 glass-input rounded-full px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-dj-accent/40"
                />
                <button
                    onClick={handleNewSet}
                    className="px-3 py-2 rounded-full btn-secondary text-[12px] font-semibold transition-colors"
                >
                    新建 Set
                </button>
                <span className={`text-[10px] font-semibold ${isSetDirty || !isCurrentSetSaved ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {isSetDirty || !isCurrentSetSaved ? '未保存' : '已保存'}
                </span>
            </div>
            <SavedSetLibrary
                savedSets={savedSetDisplayList}
                currentSetId={currentSetId}
                isSetDirty={isSetDirty}
                isCurrentSetSaved={isCurrentSetSaved}
                onLoadSet={handleLoadSet}
                onRenameSet={(setList) => { void handleRenameSet(setList); }}
                onDeleteSet={(setList) => { void handleDeleteSet(setList); }}
            />
        </div>

        <div className="flex-1 p-6 overflow-hidden flex flex-col">
            <SetBuilder 
                setTracks={setTracks}
                onRemoveTrack={removeFromSet}
                onReorderTracks={reorderTracks}
                onInsertTrack={insertToSet}
                onAnalyzeTransition={handleTransitionAnalysis}
                setType={setType}
                onGenreClick={handleSetGenreClick}
                highlightedCategory={selectedCategory}
                library={library}
                cutModes={cutModes}
                onToggleCutMode={handleToggleCutMode}
            />
        </div>
        
        {/* Set 操作区 (重置/保存/导出) */}
        <div className="p-4 glass-panel flex gap-3">
          <button 
            onClick={() => setShowResetConfirm(true)}
            className="flex-1 py-3 rounded-full btn-secondary flex items-center justify-center gap-2 text-sm transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> 重置
          </button>
          <button
            onClick={handleOpenExport}
            disabled={setTracks.length === 0}
            className="flex-1 py-3 rounded-full btn-secondary flex items-center justify-center gap-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowUpRight className="w-4 h-4" /> 导出
          </button>
          <button 
            onClick={saveSet}
            className="flex-1 py-3 rounded-full btn-primary text-slate-900 font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> 保存 Setlist
          </button>
        </div>
      </div>

      {/* 右侧: 分析与 AI 面板 */}
      <div className="w-[28%] min-w-[320px] max-w-[420px] flex flex-col glass-panel panel-soft">
        
        {/* 上半部分: 实时诊断与数据 */}
        <div className="flex flex-col shadow-xl z-10 max-h-[55%] min-h-[40%] resize-y overflow-hidden relative">
             <div className="glass-card px-4 py-3 flex items-center gap-2 sticky top-0 z-20">
                 <BarChart3 className="w-4 h-4 text-dj-accent" />
                 <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">实时诊断 & 数据</h3>
             </div>

             <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-900/20">
                {/* 诊断报告模块 */}
                <div className="glass-card rounded-lg p-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>诊断报告</span>
                        {issueCount === 0 ? (
                            <span className="text-emerald-500 flex items-center gap-1 text-[9px] bg-emerald-900/20 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-2.5 h-2.5" /> 健康
                            </span>
                        ) : (
                            <span className="text-amber-500 flex items-center gap-1 text-[9px] bg-amber-900/20 px-1.5 py-0.5 rounded-full border border-amber-500/20 animate-pulse">
                                <AlertTriangle className="w-2.5 h-2.5" /> {issueCount} 异常
                            </span>
                        )}
                    </h3>
                    
                    {issueCount === 0 && (
                        <div className="text-[10px] text-slate-600 italic text-center py-1">
                            Set 编排流畅
                        </div>
                    )}

                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                        {globalIssues
                            .filter(i => i.severity === 'critical' || i.severity === 'warning')
                            .map((issue, idx) => {
                                const trackIndex = parseInt(issue.id.split('-').pop() || '0') + 1;
                                return (
                                    <div key={idx} className={`text-[10px] p-1.5 rounded border flex items-start gap-2 ${
                                        issue.severity === 'critical' 
                                        ? 'bg-red-900/20 border-red-500/30 text-red-300' 
                                        : 'bg-amber-900/20 border-amber-500/30 text-amber-300'
                                    }`}>
                                        <span className="font-mono font-bold opacity-70 mt-px">#{trackIndex}</span>
                                        <div className="flex-1 leading-tight">
                                            {issue.message}
                                        </div>
                                    </div>
                                );
                        })}
                    </div>
                </div>

                {/* 简要统计卡片 */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="glass-card p-2 rounded">
                        <div className="text-slate-500 text-[9px]">预计总时长</div>
                        <div className="text-sm font-mono text-white text-emerald-400">
                            {estimatedTotalTime}
                        </div>
                    </div>
                    <div className="glass-card p-2 rounded">
                        <div className="text-slate-500 text-[9px]">歌曲数</div>
                        <div className="text-sm font-mono text-white">{setTracks.length}</div>
                    </div>
                    <div className="glass-card p-2 rounded">
                        <div className="text-slate-500 text-[9px]">平均能量</div>
                        <div className="text-sm font-mono text-white flex items-center gap-1">
                            <Zap className="w-3 h-3 text-yellow-500" />
                            {averageEnergy}
                        </div>
                    </div>
                    <div className="glass-card p-2 rounded overflow-hidden">
                        <div className="text-slate-500 text-[9px]">主导风格</div>
                        <div className="text-xs font-medium text-white truncate">
                            {genreStats.length > 0 ? genreStats[0].name.split('/')[0] : '-'}
                        </div>
                    </div>
                </div>
                
                {/* 能量流向图表 */}
                <EnergyChart tracks={setTracks} />
             </div>
        </div>

        {/* 下半部分: AI 选曲助手 */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950/30">
             <div className="glass-card px-4 py-3 flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-2">
                     <Sparkles className="w-4 h-4 text-indigo-400" />
                     <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">AI 选曲助手</h3>
                 </div>
                 {isAiSuggesting && <Loader2 className="w-3 h-3 animate-spin text-indigo-500"/>}
             </div>

             <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
                 <div className="mb-3 glass-card rounded-md p-2">
                     <div className="flex items-center justify-between mb-1">
                         <span className="text-[10px] text-slate-400 uppercase tracking-wider">Gemini API Key</span>
                         <span className={`text-[9px] font-bold ${hasApiKey ? 'text-emerald-400' : 'text-amber-400'}`}>
                             {hasApiKey ? '已设置' : '未设置'}
                         </span>
                     </div>
                     <div className="flex items-center gap-2">
                         <input
                             type="password"
                             value={apiKeyInput}
                             onChange={(e) => setApiKeyInput(e.target.value)}
                             placeholder="粘贴你的 Gemini API Key"
                             className="flex-1 glass-input rounded-full px-2 py-1 text-[11px] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-dj-accent/40"
                             autoComplete="off"
                         />
                         <button
                             onClick={handleSaveApiKey}
                             className="px-2.5 py-1 rounded-full btn-primary text-[10px] font-bold"
                         >
                             保存
                         </button>
                         <button
                             onClick={handleClearApiKey}
                             className="px-2.5 py-1 rounded-full btn-secondary transition-all text-[10px] font-bold"
                         >
                             清除
                         </button>
                     </div>
                     <p className="text-[9px] text-slate-500 mt-1">仅保存在浏览器本地，不会上传。</p>
                 </div>
                 <div className="mb-3">
                    <button 
                        onClick={handleAiSuggest} 
                        disabled={isAiSuggesting}
                        className="w-full py-2.5 px-4 rounded-full btn-primary text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                       {isAiSuggesting ? <Loader2 className="w-3 h-3 animate-spin"/> : <ScanEye className="w-3 h-3" />}
                       {isAiSuggesting ? '正在分析...' : '寻找下一首最佳衔接'}
                    </button>
                    {setTracks.length === 0 && (
                        <p className="text-[10px] text-slate-600 text-center mt-2">添加歌曲后，AI 将基于最后一首进行推荐</p>
                    )}
                 </div>

                 {/* 推荐列表渲染 */}
                 <div className="space-y-2 pb-2">
                    {aiSuggestions.map((s, idx) => {
                       const track = library.find(t => t.id === s.trackId);
                       if (!track) return null;
                       const displayKey = track.key ? getDisplayKey(String(track.key)) : '—';
                       const displayBpm = typeof track.bpm === 'number' ? track.bpm : '—';
                       const energyDisplay = getMetricDisplay({
                         status: track.status ?? 'ok',
                         value: track.energy,
                         error: track.error ? normalizeErrorMessage(track.error) : null
                       });
                       const resonanceDisplay = getMetricDisplay({
                         status: track.heatStatus ?? 'ok',
                         value: track.resonance,
                         error: track.heatError ? normalizeErrorMessage(track.heatError) : null
                       });
                       const heatReady = resonanceDisplay.state === 'ok';
                       const resonanceValue = resonanceDisplay.value ?? 5;
                       
                       return (
                           <div key={`${s.trackId}-${idx}`} className="glass-card p-2.5 rounded transition-all group relative animate-in fade-in slide-in-from-bottom-2 duration-300">
                               
                               <div className="flex gap-2.5">
                                    <img src={track.coverUrl || FALLBACK_COVER} className="w-12 h-12 rounded object-cover shadow-sm bg-slate-900 shrink-0" />
                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-bold text-xs text-slate-200 truncate pr-1">{track.title}</h4>
                                            {s.score && <span className="text-[9px] font-bold text-green-400 bg-green-950/40 px-1 rounded">{s.score}%</span>}
                                        </div>
                                        <p className="text-[10px] text-slate-400 truncate">{track.artist}</p>
                                        
                                        {/* 指标徽章 */}
                                        <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                                            <span className="text-[9px] text-slate-500 font-mono flex items-center gap-0.5 bg-slate-900/50 px-1 rounded">
                                                <Activity className="w-2.5 h-2.5" /> {displayBpm}
                                            </span>
                                            <span className="text-[9px] text-slate-500 font-mono flex items-center gap-0.5 bg-slate-900/50 px-1 rounded">
                                                <Music className="w-2.5 h-2.5" /> {displayKey}
                                            </span>
                                            <span className="text-[9px] text-yellow-500/80 font-mono flex items-center gap-0.5 bg-yellow-900/10 px-1 rounded" title={energyDisplay.reason || '能量'}>
                                                <Zap className="w-2.5 h-2.5" />
                                                {energyDisplay.state === 'pending' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : energyDisplay.label}
                                            </span>
                                            <span className="text-[9px] text-orange-500/80 font-mono flex items-center gap-0.5 bg-orange-900/10 px-1 rounded" title={resonanceDisplay.reason || '共鸣度'}>
                                                <Flame className="w-2.5 h-2.5" />
                                                {resonanceDisplay.state === 'pending' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : resonanceDisplay.label}
                                            </span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => addToSet(track)}
                                        className="self-center p-1.5 bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white rounded shadow-sm transition-colors"
                                    >
                                       <Plus className="w-3.5 h-3.5" />
                                   </button>
                               </div>

                               {/* 推荐理由 */}
                               <div className="mt-2 text-[10px] text-indigo-300 bg-indigo-900/20 p-1.5 rounded border border-indigo-500/10 leading-snug flex gap-1.5 items-start">
                                    <Bot className="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" />
                                    <span className="opacity-90">{s.reasoning}</span>
                               </div>
                           </div>
                       );
                    })}
                    
                    {aiSuggestions.length === 0 && !isAiSuggesting && setTracks.length > 0 && (
                        <div className="text-center py-6 opacity-30">
                            <Sparkles className="w-8 h-8 mx-auto mb-1" />
                            <p className="text-[10px]">点击上方按钮获取 AI 推荐</p>
                        </div>
                    )}
                 </div>
            </div>
        </div>

      </div>
    </div>

      {editTrackId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={closeEditTrack}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 text-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Pencil className="w-4 h-4 text-dj-accent" />
                修正曲目信息
              </h3>
              <button
                onClick={closeEditTrack}
                className="text-slate-500 hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <input
                type="text"
                placeholder="歌名"
                value={editTrackForm.title}
                onChange={(e) => setEditTrackForm(prev => ({ ...prev, title: e.target.value }))}
                className="glass-input rounded-full px-2 py-1 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-dj-accent/40"
              />
              <input
                type="text"
                placeholder="艺人"
                value={editTrackForm.artist}
                onChange={(e) => setEditTrackForm(prev => ({ ...prev, artist: e.target.value }))}
                className="glass-input rounded-full px-2 py-1 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-dj-accent/40"
              />
              <input
                type="text"
                placeholder="风格 / 流派"
                value={editTrackForm.genre}
                onChange={(e) => setEditTrackForm(prev => ({ ...prev, genre: e.target.value }))}
                className="glass-input rounded-full px-2 py-1 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-dj-accent/40 col-span-2"
              />
              <input
                type="number"
                inputMode="numeric"
                placeholder="BPM"
                value={editTrackForm.bpm}
                onChange={(e) => setEditTrackForm(prev => ({ ...prev, bpm: e.target.value }))}
                className="glass-input rounded-full px-2 py-1 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-dj-accent/40"
              />
              <input
                type="text"
                placeholder="调性 (8A / F# minor)"
                value={editTrackForm.key}
                onChange={(e) => setEditTrackForm(prev => ({ ...prev, key: e.target.value }))}
                className="glass-input rounded-full px-2 py-1 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-dj-accent/40"
              />
            </div>

            <div className="mt-3 space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-500" /> 能量
                  </span>
                  <span className="font-mono text-slate-200">{editTrackForm.energy}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={editTrackForm.energy}
                  onChange={(e) => setEditTrackForm(prev => ({ ...prev, energy: Number(e.target.value) }))}
                  className="w-full accent-yellow-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Flame className="w-3 h-3 text-orange-500" /> 热度
                  </span>
                  <span className="font-mono text-slate-200">{editTrackForm.resonance}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={editTrackForm.resonance}
                  onChange={(e) => setEditTrackForm(prev => ({ ...prev, resonance: Number(e.target.value) }))}
                  className="w-full accent-orange-500"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={closeEditTrack}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={applyEditTrack}
                className="px-4 py-1.5 rounded-full btn-primary text-slate-900 text-xs font-semibold transition-colors"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      <ResetConfirmDialog
        open={showResetConfirm}
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={() => {
          setSetTracks([]);
          setShowResetConfirm(false);
        }}
      />

      <ExportDialog
        open={isExportOpen}
        onClose={() => {
          setIsExportOpen(false);
          setExportSuccess(null);
          setExportSuccessPath(null);
          setExportSuccessTarget(null);
        }}
        onConfirm={handleConfirmExport}
        currentTracks={setTracks}
        savedSets={savedSetLists}
        defaultSetName={
          currentSetName.trim() && currentSetName.trim() !== '未命名 Set'
            ? currentSetName.trim()
            : formatDefaultSetName()
        }
        resolveFilePath={resolveExportFilePath}
        submitting={isExporting}
        error={exportError}
        success={exportSuccess}
        successPath={exportSuccessPath}
        successTarget={exportSuccessTarget}
        canExport={exportAvailable}
      />

    </div>
  );
};

export default App;
