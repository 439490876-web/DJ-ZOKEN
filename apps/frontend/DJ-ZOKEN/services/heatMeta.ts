export type HeatMetaInput = {
  heatSource?: string | null;
  heatScoreRaw?: number | null;
};

export const formatHeatMeta = ({ heatSource, heatScoreRaw }: HeatMetaInput): string => {
  const sourceLabel = heatSource && String(heatSource).trim() ? String(heatSource).trim() : '—';
  const rawLabel = typeof heatScoreRaw === 'number' && Number.isFinite(heatScoreRaw)
    ? heatScoreRaw.toFixed(2)
    : '—';
  return `source=${sourceLabel}, raw=${rawLabel}`;
};
