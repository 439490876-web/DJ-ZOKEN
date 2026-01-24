const DB_NAME = 'dj_cache_v1'
const STORE = 'covers'

export const createCoverCache = (idb: IDBFactory) => {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const req = idb.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest) => {
    const db = await open()
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const store = tx.objectStore(STORE)
      const req = fn(store)
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => reject(req.error)
    })
  }

  return {
    put: async (key: string, blob: Blob) => {
      await withStore('readwrite', store => store.put(blob, key))
    },
    get: async (key: string) => {
      return await withStore<Blob | null>('readonly', store => store.get(key))
    },
    clear: async () => {
      await withStore('readwrite', store => store.clear())
    }
  }
}
