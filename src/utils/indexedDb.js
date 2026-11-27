// IndexedDB Helper per cache locale allegati pesanti e immagini

const DB_NAME = 'MinervaAIDB_V11';
const STORE_NAME = 'project_data_store';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function saveProjectDataIDB(projectId, files, lessonsContent = {}) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ projectId, files, lessonsContent });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('IndexedDB save error:', err);
  }
}

export async function getProjectDataIDB(projectId) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(projectId);
      req.onsuccess = () => resolve(req.result || { files: [], lessonsContent: {} });
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('IndexedDB get error:', err);
    return { files: [], lessonsContent: {} };
  }
}
