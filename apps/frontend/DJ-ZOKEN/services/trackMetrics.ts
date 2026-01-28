export type TrackMetricSnapshot = {
  status?: 'ok' | 'failed' | 'pending' | null;
  heatStatus?: 'ok' | 'failed' | 'pending' | null;
  energy?: number | null;
  resonance?: number | null;
  heatScore?: number | null;
  heatScoreRaw?: number | null;
  heatSource?: string | null;
  heatError?: string | null;
};

export const normalizePendingMetrics = <T extends TrackMetricSnapshot>(track: T): T => {
  const next: T = { ...track };
  if (track.status && track.status !== 'ok') {
    next.energy = null;
  }
  if (track.heatStatus && track.heatStatus !== 'ok') {
    next.resonance = null;
  }
  return next;
};

export const normalizeHeatSource = <T extends TrackMetricSnapshot>(track: T, expectedSource: string): T => {
  const next: T = { ...track };
  if (track.heatSource && track.heatSource !== expectedSource) {
    next.heatSource = null;
    next.heatScore = null;
    next.heatScoreRaw = null;
    next.resonance = null;
    next.heatStatus = 'pending';
    next.heatError = 'heat_model_mismatch';
  }
  return next;
};
