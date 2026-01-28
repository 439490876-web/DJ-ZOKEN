export type HeatRefreshCandidate = {
  id?: string | null;
  heatSource?: string | null;
  heatError?: string | null;
};

export const getHeatRefreshIds = (
  library: HeatRefreshCandidate[],
  localFileMap: Record<string, File | undefined>,
  expectedSource: string
): string[] => {
  return library
    .filter(track =>
      Boolean(track?.id) &&
      track?.heatError === 'heat_model_mismatch' &&
      track?.heatSource !== expectedSource &&
      Boolean(localFileMap[track.id as string])
    )
    .map(track => track.id as string);
};
