export const hydrateCoverUrls = async (
  library: Array<{ coverKey?: string | null; coverUrl?: string | null }>,
  coverCache: { get: (key: string) => Promise<Blob | null> },
  makeObjectUrl: (blob: Blob) => string
) => {
  const next = [...library]
  for (let i = 0; i < next.length; i += 1) {
    const key = next[i].coverKey
    if (key && !next[i].coverUrl) {
      const blob = await coverCache.get(key)
      if (blob) {
        next[i] = { ...next[i], coverUrl: makeObjectUrl(blob) }
      }
    }
  }
  return next
}
