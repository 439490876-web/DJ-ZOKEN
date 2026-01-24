const CACHE_KEY = 'dj_library_cache_v1'

export const createLibraryCache = (storage: Storage) => {
  return {
    load: () => {
      try {
        const raw = storage.getItem(CACHE_KEY)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },
    save: (payload: unknown) => {
      storage.setItem(CACHE_KEY, JSON.stringify(payload))
    },
    clear: () => storage.removeItem(CACHE_KEY)
  }
}
