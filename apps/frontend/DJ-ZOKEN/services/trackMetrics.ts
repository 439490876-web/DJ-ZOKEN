export type TrackMetricSnapshot = {
  status?: 'ok' | 'failed' | 'pending' | null;
  heatStatus?: 'ok' | 'failed' | 'pending' | null;
  energy?: number | null;
  resonance?: number | null;
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
