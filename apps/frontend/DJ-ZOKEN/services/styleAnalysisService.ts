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
}

interface StyleAnalysisResponse {
  top_styles?: StylePrediction[];
  candidate_top_styles?: StylePrediction[];
  dj_style?: string;
  filename_display?: string;
  error?: { code?: string; message?: string } | null;
}

const styleApiBase = (import.meta as any).env?.VITE_STYLE_API || 'http://localhost:8000';
const STYLE_SAMPLE_RATE = 16000;
const STYLE_MAX_SECONDS = 240;
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

const downsampleForStyle = async (file: File): Promise<File> => {
  try {
    const AudioContextImpl = (window as any).AudioContext || (window as any).webkitAudioContext;
    const OfflineAudioContextImpl = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioContextImpl || !OfflineAudioContextImpl) return file;

    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContextImpl();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    await audioContext.close();

    const duration = Math.min(decoded.duration, STYLE_MAX_SECONDS);
    const frameCount = Math.max(1, Math.floor(duration * STYLE_SAMPLE_RATE));
    const offline = new OfflineAudioContextImpl(1, frameCount, STYLE_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    const wavBuffer = encodeWav(rendered);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const baseName = file.name.replace(/\.[^/.]+$/, '').trim() || 'audio';
    return new File([blob], `${baseName}.wav`, { type: 'audio/wav' });
  } catch (error) {
    console.warn('Style downsample failed', error);
    return file;
  }
};

export const analyzeStyle = async (file: File): Promise<StyleAnalysisResult> => {
  const preparedFile = await downsampleForStyle(file);
  const form = new FormData();
  form.append('file', preparedFile);
  form.append('original_name', file.name);
  const response = await fetch(`${styleApiBase}/predict?segment_mode=drop&drop_strategy=energy&drop_seconds=20&drop_candidate_top_n=2`, {
    method: 'POST',
    body: form
  });
  if (!response.ok) {
    return { status: 'failed', error: `Style analysis failed: ${response.status}` };
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
  const candidates = Array.isArray(data?.candidate_top_styles) ? data.candidate_top_styles : [];
  const allowedCandidates = candidates.filter((item) => item?.style && !isBlockedStyle(item.style));
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
        filenameDisplay: typeof data?.filename_display === 'string' ? data.filename_display : undefined
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
      filenameDisplay: typeof data?.filename_display === 'string' ? data.filename_display : undefined
    };
  }

  const topStyles = Array.isArray(data?.top_styles) ? data.top_styles : [];
  const top = pickFirstAllowed(topStyles);
  if (!top) {
    return {
      status: 'failed',
      error: 'Style analysis returned no styles',
      filenameDisplay: typeof data?.filename_display === 'string' ? data.filename_display : undefined
    };
  }
  return {
    status: 'ok',
    style: typeof top.style === 'string' ? top.style : undefined,
    prob: typeof top.prob === 'number' ? top.prob : undefined,
    genre: typeof top.genre === 'string' ? top.genre : undefined,
    djStyle,
    filenameDisplay: typeof data?.filename_display === 'string' ? data.filename_display : undefined
  };
};
