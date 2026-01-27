export interface StylePrediction {
  style?: string;
  prob?: number;
  genre?: string | null;
  djStyle?: string;
}

export interface StyleAnalysisResult extends StylePrediction {
  status: 'ok' | 'failed';
  filenameDisplay?: string;
  error?: string | null;
  debug?: StyleDebugPayload;
}

interface StyleDebugPayload {
  raw_top_k?: StylePrediction[];
  policy_top_k?: Array<StylePrediction & { adjusted_prob?: number; raw_prob?: number }>;
  bpm_debug?: { raw_bpm?: number | null; effective_bpm?: number | null };
  camp_debug?: { active_camp?: string | null; matched_evidence?: string[]; suppress?: string[] };
  hit_rules?: { synthetic_rules?: string[]; remix_guard?: boolean };
}

interface StyleAnalysisResponse {
  top_styles?: StylePrediction[];
  candidate_top_styles?: StylePrediction[];
  dj_style?: string;
  filename_display?: string;
  error?: { code?: string; message?: string } | null;
  debug?: StyleDebugPayload;
}

const resolveApiBase = (value: string): string => {
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
const styleApiBase = resolveApiBase((import.meta as any).env?.VITE_STYLE_API || 'http://localhost:8000');
const buildStyleEndpoint = () =>
  `${styleApiBase}/predict?segment_mode=drop&drop_strategy=energy&drop_seconds=20&drop_candidate_top_n=2`;

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number, signal?: AbortSignal) => {
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  let timeoutTriggered = false;
  const timer = window.setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      if (timeoutTriggered) {
        throw new Error(`request timeout (${Math.round(timeoutMs / 1000)}s)`);
      }
      throw new Error('request cancelled');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
};
const STYLE_SAMPLE_RATE = 16000;
const STYLE_SEGMENT_SECONDS = 45;
const STYLE_MAX_SECONDS = 90;
const STYLE_CONCURRENCY_MIN = 1;
const STYLE_CONCURRENCY_MAX = 4;
const STYLE_CONCURRENCY_INITIAL = 2;
const styleQueue = {
  running: 0,
  pending: [] as Array<{ id?: string; priority: number; run: () => void }>,
  concurrency: STYLE_CONCURRENCY_INITIAL,
  recentDurations: [] as number[],
  consecutiveSuccesses: 0
};
const styleAbortMap = new Map<string, AbortController>();
const cancelledStyleTasks = new Set<string>();

const recordStyleOutcome = (ok: boolean, durationMs: number, timedOut: boolean) => {
  if (Number.isFinite(durationMs)) {
    styleQueue.recentDurations.push(durationMs);
    if (styleQueue.recentDurations.length > 8) styleQueue.recentDurations.shift();
  }
  const avg = styleQueue.recentDurations.length
    ? styleQueue.recentDurations.reduce((acc, v) => acc + v, 0) / styleQueue.recentDurations.length
    : durationMs;
  if (!ok || timedOut || durationMs > 55000 || avg > 45000) {
    styleQueue.consecutiveSuccesses = 0;
    styleQueue.concurrency = Math.max(STYLE_CONCURRENCY_MIN, styleQueue.concurrency - 1);
    return;
  }
  styleQueue.consecutiveSuccesses += 1;
  if (styleQueue.consecutiveSuccesses >= 3 && avg < 20000) {
    styleQueue.concurrency = Math.min(STYLE_CONCURRENCY_MAX, styleQueue.concurrency + 1);
    styleQueue.consecutiveSuccesses = 0;
  }
};

const drainStyleQueue = () => {
  while (styleQueue.running < styleQueue.concurrency && styleQueue.pending.length > 0) {
    const next = styleQueue.pending.shift();
    if (!next) return;
    next.run();
  }
};

const BLOCKED_STYLE_KEYS = new Set(['cloudrap', 'kpop', 'couldrap', 'grime']);

const normalizeStyleKey = (value?: string): string => {
  if (!value) return '';
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
};

const isBlockedStyle = (value?: string): boolean => {
  if (!value) return false;
  return BLOCKED_STYLE_KEYS.has(normalizeStyleKey(value));
};

const pickFirstAllowed = (preds: StylePrediction[]): StylePrediction | null => {
  for (const pred of preds) {
    if (pred?.style && !isBlockedStyle(pred.style)) {
      return pred;
    }
  }
  return preds[0] ?? null;
};

const encodeWav = (buffer: AudioBuffer): ArrayBuffer => {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return wavBuffer;
};

const pickEnergySegment = (decoded: AudioBuffer, targetSeconds: number): { startSample: number; length: number } => {
  const sampleRate = decoded.sampleRate;
  const totalSamples = decoded.length;
  const maxLength = Math.min(totalSamples, Math.floor(targetSeconds * sampleRate));
  if (maxLength >= totalSamples) {
    return { startSample: 0, length: totalSamples };
  }

  const channel = decoded.getChannelData(0);
  const frameSize = Math.max(1, Math.floor(sampleRate)); // 1s frames
  const totalFrames = Math.ceil(totalSamples / frameSize);
  const metrics = new Array<number>(totalFrames);

  for (let i = 0; i < totalFrames; i += 1) {
    const start = i * frameSize;
    const end = Math.min(start + frameSize, totalSamples);
    let sumSquares = 0;
    let peak = 0;
    const count = end - start;
    for (let j = start; j < end; j += 1) {
      const v = channel[j];
      const av = Math.abs(v);
      if (av > peak) peak = av;
      sumSquares += v * v;
    }
    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    metrics[i] = rms * 0.8 + peak * 0.2;
  }

  const segmentFrames = Math.max(1, Math.floor(maxLength / frameSize));
  let bestSum = -Infinity;
  let bestStart = 0;
  let windowSum = 0;

  for (let i = 0; i < totalFrames; i += 1) {
    windowSum += metrics[i] ?? 0;
    if (i >= segmentFrames) {
      windowSum -= metrics[i - segmentFrames] ?? 0;
    }
    if (i >= segmentFrames - 1 && windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = i - segmentFrames + 1;
    }
  }

  const startSample = Math.min(bestStart * frameSize, totalSamples - maxLength);
  return { startSample, length: maxLength };
};

const downsampleForStyle = async (file: File): Promise<File> => {
  try {
    const AudioContextImpl = (window as any).AudioContext || (window as any).webkitAudioContext;
    const OfflineAudioContextImpl = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioContextImpl || !OfflineAudioContextImpl) return file;

    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContextImpl();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const segment = pickEnergySegment(decoded, STYLE_SEGMENT_SECONDS);
    const segmentDuration = segment.length / decoded.sampleRate;
    const maxDuration = Math.min(segmentDuration, STYLE_MAX_SECONDS);
    const frameCount = Math.max(1, Math.floor(maxDuration * STYLE_SAMPLE_RATE));
    const offline = new OfflineAudioContextImpl(1, frameCount, STYLE_SAMPLE_RATE);
    const source = offline.createBufferSource();
    const segmentBuffer = audioContext.createBuffer(
      decoded.numberOfChannels,
      segment.length,
      decoded.sampleRate
    );
    for (let ch = 0; ch < decoded.numberOfChannels; ch += 1) {
      const data = decoded.getChannelData(ch).subarray(segment.startSample, segment.startSample + segment.length);
      segmentBuffer.getChannelData(ch).set(data);
    }
    source.buffer = segmentBuffer;
    source.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    await audioContext.close();
    const wavBuffer = encodeWav(rendered);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const baseName = file.name.replace(/\.[^/.]+$/, '').trim() || 'audio';
    return new File([blob], `${baseName}.wav`, { type: 'audio/wav' });
  } catch (error) {
    console.warn('Style downsample failed', error);
    return file;
  }
};

export interface StyleAnalysisOptions {
  debug?: boolean;
  bpm?: number | null;
  force?: boolean;
  taskId?: string;
  priority?: number;
}

const pickDebugTop = (debug?: StyleDebugPayload): StylePrediction | null => {
  const policy = Array.isArray(debug?.policy_top_k) ? debug?.policy_top_k : [];
  const normalized = policy.map((item) => ({
    style: item?.style,
    prob: typeof item?.adjusted_prob === 'number' ? item.adjusted_prob : item?.prob,
    genre: item?.genre ?? null
  }));
  return pickFirstAllowed(normalized);
};

const runStyleAnalysis = async (file: File, options?: StyleAnalysisOptions, signal?: AbortSignal): Promise<StyleAnalysisResult> => {
  const preparedFile = await downsampleForStyle(file);
  const form = new FormData();
  form.append('file', preparedFile);
  form.append('original_name', file.name);
  const endpoint = buildStyleEndpoint();
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const resolvedFetchUrl = typeof window !== 'undefined' ? new URL(endpoint, pageUrl) : new URL(endpoint);
  if (options?.debug) {
    resolvedFetchUrl.searchParams.set('debug', '1');
  }
  if (typeof options?.bpm === 'number' && Number.isFinite(options.bpm)) {
    resolvedFetchUrl.searchParams.set('bpm', String(Math.round(options.bpm)));
  }
  if (options?.force) {
    resolvedFetchUrl.searchParams.set('_ts', String(Date.now()));
  }
  const isProxyRequest = !endpoint.startsWith('http');
  console.log('[style] request', {
    endpoint,
    resolvedFetchUrl: resolvedFetchUrl.toString(),
    pageUrl,
    baseUrl: styleApiBase,
    proxy: isProxyRequest,
    debug: Boolean(options?.debug),
    bpm: typeof options?.bpm === 'number' ? options?.bpm : null,
    fileName: preparedFile.name,
    fileBytes: preparedFile.size
  });
  let response: Response;
  try {
    response = await fetchWithTimeout(resolvedFetchUrl.toString(), {
      method: 'POST',
      body: form
    }, 60000, signal);
  } catch (error: any) {
    return { status: 'failed', error: `Style fetch failed: ${String(error)}` };
  }
  if (!response.ok) {
    return { status: 'failed', error: `Style analysis failed: ${response.status} (${endpoint})` };
  }
  const data = (await response.json()) as StyleAnalysisResponse;
  if (data?.error) {
    return {
      status: 'failed',
      error: data.error.message || data.error.code || 'Style analysis failed',
      filenameDisplay: typeof data.filename_display === 'string' ? data.filename_display : undefined
    };
  }
  const djStyle = typeof data?.dj_style === 'string' ? data.dj_style : undefined;
  const debugPayload = data?.debug;
  if (options?.debug) {
    console.log('[style] debug', {
      bpm_debug: debugPayload?.bpm_debug,
      camp_debug: debugPayload?.camp_debug,
      hit_rules: debugPayload?.hit_rules,
      policy_top1: pickDebugTop(debugPayload)
    });
  }
  const candidates = Array.isArray(data?.candidate_top_styles) ? data.candidate_top_styles : [];
  const allowedCandidates = candidates.filter((item) => item?.style && !isBlockedStyle(item.style));
  if (options?.debug) {
    const debugTop = pickDebugTop(debugPayload);
    if (debugTop) {
      return {
        status: 'ok',
        style: typeof debugTop.style === 'string' ? debugTop.style : undefined,
        prob: typeof debugTop.prob === 'number' ? debugTop.prob : undefined,
        genre: typeof debugTop.genre === 'string' ? debugTop.genre : undefined,
        djStyle,
        filenameDisplay: typeof data?.filename_display === 'string' ? data.filename_display : undefined,
        debug: debugPayload
      };
    }
  }
  if (allowedCandidates.length >= 2) {
    const first = allowedCandidates[0];
    const second = allowedCandidates[1];
    const styleA = typeof first.style === 'string' ? first.style : '';
    const styleB = typeof second.style === 'string' ? second.style : '';
    const combined = [styleA, styleB].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(' / ');
    if (combined) {
      return {
        status: 'ok',
        style: combined,
        prob: typeof first.prob === 'number' ? first.prob : undefined,
        genre: typeof first.genre === 'string' ? first.genre : undefined,
        djStyle,
        filenameDisplay: typeof data?.filename_display === 'string' ? data.filename_display : undefined,
        debug: debugPayload
      };
    }
  } else if (allowedCandidates.length === 1) {
    const first = allowedCandidates[0];
    return {
      status: 'ok',
      style: typeof first.style === 'string' ? first.style : undefined,
      prob: typeof first.prob === 'number' ? first.prob : undefined,
      genre: typeof first.genre === 'string' ? first.genre : undefined,
      djStyle,
      filenameDisplay: typeof data?.filename_display === 'string' ? data.filename_display : undefined,
      debug: debugPayload
    };
  }

  const topStyles = Array.isArray(data?.top_styles) ? data.top_styles : [];
  const top = pickFirstAllowed(topStyles);
  if (!top) {
    return {
      status: 'failed',
      error: 'Style analysis returned no styles',
      filenameDisplay: typeof data?.filename_display === 'string' ? data.filename_display : undefined,
      debug: debugPayload
    };
  }
  return {
    status: 'ok',
    style: typeof top.style === 'string' ? top.style : undefined,
    prob: typeof top.prob === 'number' ? top.prob : undefined,
    genre: typeof top.genre === 'string' ? top.genre : undefined,
    djStyle,
    filenameDisplay: typeof data?.filename_display === 'string' ? data.filename_display : undefined,
    debug: debugPayload
  };
};

const isRetryableStyleFailure = (result: StyleAnalysisResult): boolean => {
  const message = String(result?.error || '').toLowerCase();
  if (!message) return false;
  if (message.includes('timeout') || message.includes('failed to fetch') || message.includes('err_alpn')) return true;
  if (message.includes('status 429') || message.includes('status 500') || message.includes('status 502') || message.includes('status 503') || message.includes('status 504')) return true;
  return false;
};

const runStyleAnalysisWithRetry = async (file: File, options?: StyleAnalysisOptions): Promise<StyleAnalysisResult> => {
  const started = performance.now();
  let attempt = 0;
  let result: StyleAnalysisResult = { status: 'failed', error: 'Style analysis failed' };
  let timedOut = false;
  const maxAttempts = 3;
  const taskId = options?.taskId;
  const controller = taskId ? new AbortController() : null;
  if (taskId && controller) {
    styleAbortMap.set(taskId, controller);
  }
  try {
    while (attempt < maxAttempts) {
      if (taskId && cancelledStyleTasks.has(taskId)) {
        return { status: 'failed', error: 'Style analysis cancelled' };
      }
      result = await runStyleAnalysis(file, options, controller?.signal);
      const errorMessage = String(result?.error || '');
      timedOut = errorMessage.toLowerCase().includes('timeout');
      if (result.status === 'ok' || !isRetryableStyleFailure(result) || attempt === maxAttempts - 1) {
        break;
      }
      attempt += 1;
      const backoffMs = 400 * Math.pow(2, attempt);
      await new Promise((resolve) => window.setTimeout(resolve, backoffMs));
    }
    return result;
  } finally {
    const durationMs = performance.now() - started;
    recordStyleOutcome(result.status === 'ok', durationMs, timedOut);
    if (taskId) {
      styleAbortMap.delete(taskId);
    }
  }
};

export const cancelStyleTask = (taskId: string) => {
  if (!taskId) return;
  cancelledStyleTasks.add(taskId);
  const controller = styleAbortMap.get(taskId);
  if (controller) {
    controller.abort();
    styleAbortMap.delete(taskId);
  }
  styleQueue.pending = styleQueue.pending.filter(item => item.id !== taskId);
};

export const cancelAllStyleTasks = () => {
  for (const taskId of Array.from(styleAbortMap.keys())) {
    cancelStyleTask(taskId);
  }
  styleQueue.pending = [];
};

export const analyzeStyle = async (file: File, options?: StyleAnalysisOptions): Promise<StyleAnalysisResult> => {
  if (options?.taskId && cancelledStyleTasks.has(options.taskId)) {
    return { status: 'failed', error: 'Style analysis cancelled' };
  }
  return new Promise((resolve) => {
    const run = () => {
      styleQueue.running += 1;
      const taskPromise = runStyleAnalysisWithRetry(file, options);
      taskPromise.then(resolve).finally(() => {
        styleQueue.running -= 1;
        drainStyleQueue();
      });
    };
    if (styleQueue.running < styleQueue.concurrency) {
      run();
    } else {
      const entry = { id: options?.taskId, priority: options?.priority ?? 0, run };
      if (entry.priority > 0) {
        const queue = styleQueue.pending;
        const idx = queue.findIndex(item => item.priority === 0);
        if (idx === -1) queue.push(entry);
        else queue.splice(idx, 0, entry);
      } else {
        styleQueue.pending.push(entry);
      }
    }
  });
};
