/** LRU + absolute TTL, byte/entry bounds, isolated values and coalesced concurrent loads. */
export class Cache {
  #entries = new Map();
  #pending = new Map();
  #bytes = 0;
  constructor(ttlMs = 60000, capacity = 32, { maxBytes = 64 * 1024 * 1024, maxEntryBytes = 16 * 1024 * 1024, now = Date.now } = {}) {
    for (const value of [ttlMs, capacity, maxBytes, maxEntryBytes]) if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Cache bounds must be positive integers');
    this.ttlMs = ttlMs; this.capacity = capacity; this.maxBytes = maxBytes; this.maxEntryBytes = maxEntryBytes; this.now = now;
  }
  #delete(key) { const entry = this.#entries.get(key); if (entry) { this.#bytes -= entry.bytes; this.#entries.delete(key); } }
  #prune() { const now = this.now(); for (const [key, entry] of this.#entries) if (entry.expires <= now) this.#delete(key); }
  get(key) {
    const entry = this.#entries.get(key);
    if (!entry || entry.expires <= this.now()) { this.#delete(key); return undefined; }
    this.#entries.delete(key); this.#entries.set(key, entry);
    return structuredClone(entry.value);
  }
  set(key, value) {
    this.#prune(); this.#delete(key);
    const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
    if (bytes > Math.min(this.maxBytes, this.maxEntryBytes)) return false;
    while (this.#entries.size >= this.capacity || this.#bytes + bytes > this.maxBytes) this.#delete(this.#entries.keys().next().value);
    this.#entries.set(key, { value: structuredClone(value), bytes, expires: this.now() + this.ttlMs });
    this.#bytes += bytes; return true;
  }
  async getOrLoad(key, loader, { refresh = false } = {}) {
    if (!refresh) { const value = this.get(key); if (value !== undefined) return { value, cached: true }; }
    let pending = this.#pending.get(key);
    if (!pending) {
      if (this.#pending.size >= this.capacity) throw new Error('Inventory collection busy; retry after active collections finish');
      pending = Promise.resolve().then(loader).then(value => { this.set(key, value); return value; }).finally(() => this.#pending.delete(key));
      this.#pending.set(key, pending);
    }
    return { value: structuredClone(await pending), cached: false };
  }
  get stats() { this.#prune(); return { entries: this.#entries.size, bytes: this.#bytes, inFlight: this.#pending.size }; }
}
