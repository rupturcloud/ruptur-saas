/**
 * StorageService
 * Fachada para acesso ao armazenamento local (preparado para IndexedDB futuro).
 */
export const StorageService = {
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('StorageService.set failed', e);
    }
  },

  get(key, defaultValue = null) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch (e) {
      console.warn('StorageService.get failed', e);
      return defaultValue;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('StorageService.remove failed', e);
    }
  },

  clear() {
    try {
      localStorage.clear();
    } catch (e) {
      console.warn('StorageService.clear failed', e);
    }
  }
};
