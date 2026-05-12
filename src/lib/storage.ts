/**
 * Persistent Storage Utility for APK/Mobile Environments
 * Uses IndexedDB (the standard "mobile storage" in WebViews) 
 * which is more reliable than localStorage for persistent data.
 */

const DB_NAME = 'WalletScannerDB';
const STORE_NAME = 'FoundWallets';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const Storage = {
  /**
   * Saves found wallets to mobile/persistent storage
   */
  async saveFoundWallets(wallets: any[]): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Clear and re-save current list to stay in sync with App state
    // In a more complex app, we'd add/remove individually
    await new Promise<void>((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        let count = 0;
        if (wallets.length === 0) resolve();
        
        wallets.forEach(wallet => {
          const addReq = store.add(wallet);
          addReq.onsuccess = () => {
            count++;
            if (count === wallets.length) resolve();
          };
          addReq.onerror = () => reject(addReq.error);
        });
      };
      clearReq.onerror = () => reject(clearReq.error);
    });
  },

  /**
   * Retrieves all saved wallets from storage
   */
  async getFoundWallets(): Promise<any[]> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Storage not ready, using fallback');
      return [];
    }
  }
};
