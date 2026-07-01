import { CacheEntry } from "../types/cache";

export class LRUCache<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): CacheEntry<V> | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    
    // Check TTL on read to lazily evict
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.map.delete(key);
      return undefined;
    }

    // Refresh position to maintain LRU order (most recently used at the end)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: K, value: CacheEntry<V>): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);

    if (this.map.size > this.maxSize) {
      // The first item in a Map iterator is the oldest inserted item
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  [Symbol.iterator](): IterableIterator<[K, CacheEntry<V>]> {
    return this.map[Symbol.iterator]();
  }
}
