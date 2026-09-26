(function (global) {
  'use strict';
  const T = global.Tabletop;
  const TTL = 3 * 24 * 60 * 60 * 1000;
  const MAX_IMAGE_BYTES = 10000000;
  const assetKey = (card) => `${card.scryfallId}:${card.face || 'front'}`;

  // IndexedDB keeps image bytes out of saved scenes and localStorage's small quota.
  function browserStore() {
    let database;
    function open() {
      return (database ||= new Promise((resolve, reject) => {
        if (!global.indexedDB) return reject(new Error('IndexedDB is unavailable.'));
        const request = global.indexedDB.open('tabletop-scryfall-v1', 1);
        request.onupgradeneeded = () => {
          const records = request.result.createObjectStore('records');
          records.createIndex('expiresAt', 'expiresAt');
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => db.close();
          // Expired entries are disposable. Refresh only what the next render needs.
          const tx = db.transaction('records', 'readwrite');
          const cursor = tx
            .objectStore('records')
            .index('expiresAt')
            .openCursor(IDBKeyRange.upperBound(Date.now()));
          cursor.onsuccess = () => {
            if (cursor.result) {
              cursor.result.delete();
              cursor.result.continue();
            }
          };
          resolve(db);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Scryfall cache is unavailable.'));
      }));
    }
    async function transact(mode, action) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', mode);
        const request = action(tx.objectStore('records'));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Cache unavailable.'));
      });
    }
    return {
      get: (key) => transact('readonly', (store) => store.get(key)),
      set: (key, record) => transact('readwrite', (store) => store.put(record, key)),
      clear: () => transact('readwrite', (store) => store.clear()),
    };
  }
  async function imageData(blob) {
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read Scryfall image.'));
        reader.readAsDataURL(blob);
      });
    }
    return `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
  }
  function createScryfallClient({
    store = browserStore(),
    fetch: fetcher = (...args) => global.fetch(...args),
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    intervalMs = 120,
  } = {}) {
    const memory = new Map(),
      inflight = new Map(),
      resolved = new Map();
    let queue = Promise.resolve(),
      nextRequest = 0,
      blockedUntil = 0,
      generation = 0;
    let persistent = !!store;
    function remember(map, key, value) {
      map.delete(key);
      map.set(key, value);
      if (map.size > 256) map.delete(map.keys().next().value);
    }
    function fresh(record) {
      return record && Number.isFinite(record.expiresAt) && record.expiresAt > now();
    }
    async function cached(key, produce) {
      if (fresh(memory.get(key))) return memory.get(key);
      if (inflight.has(key)) return inflight.get(key);
      const version = generation;
      const promise = (async () => {
        let record;
        try {
          record = await store?.get(key);
        } catch {
          persistent = false;
        }
        if (!fresh(record)) {
          record = { value: await produce(), expiresAt: now() + TTL };
          if (version === generation) {
            try {
              await store?.set(key, record);
            } catch {
              persistent = false;
            }
          }
        }
        if (version === generation) remember(memory, key, record);
        return record;
      })();
      inflight.set(key, promise);
      try {
        return await promise;
      } finally {
        if (inflight.get(key) === promise) inflight.delete(key);
      }
    }
    function apiCard(id) {
      const request = queue.then(async () => {
        if (now() < blockedUntil)
          throw new Error('Scryfall asked us to slow down. Try again in a minute.');
        const wait = nextRequest - now();
        if (wait > 0) await sleep(wait);
        nextRequest = now() + intervalMs;
        const headers = { Accept: 'application/json' };
        if (typeof window === 'undefined') headers['User-Agent'] = 'TabletopSceneStudio/0.1';
        const response = await fetcher(`https://api.scryfall.com/cards/${id}`, {
          headers,
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        if (response.status === 429) {
          const retry = response.headers.get('Retry-After');
          const delay = /^\d+$/.test(retry || '')
            ? Number(retry) * 1000
            : Date.parse(retry) - now();
          blockedUntil = now() + Math.max(60000, Number.isFinite(delay) ? delay : 0);
          throw new Error('Scryfall asked us to slow down. Try again in a minute.');
        }
        if (response.status === 404) throw new Error(`Scryfall card ${id} was not found.`);
        if (!response.ok) throw new Error(`Scryfall card lookup failed (${response.status}).`);
        const card = await response.json();
        if (card.object !== 'card' || card.id !== id || typeof card.name !== 'string')
          throw new Error('Scryfall returned invalid card data.');
        return card;
      });
      // A failed request doesn't poison future lookups; 429 has its own cooldown.
      queue = request.catch(() => {});
      return request;
    }
    async function load(input) {
      const card = T.normalizeCard(typeof input === 'string' ? { scryfallId: input } : input);
      T.validateDeck({ id: 'scryfall', name: 'Scryfall', cards: [card] });
      if (!card.scryfallId) throw new Error('A Scryfall card ID is required.');
      const key = assetKey(card),
        version = generation;
      if (fresh(resolved.get(key))) return { ...resolved.get(key).value };
      try {
        const metadata = await cached(`card:${card.scryfallId}`, () =>
          apiCard(card.scryfallId),
        );
        const data = metadata.value;
        const face = data.image_uris
          ? card.face === 'back'
            ? null
            : data
          : data.card_faces?.[card.face === 'back' ? 1 : 0];
        const url =
          face?.image_uris?.large ||
          face?.image_uris?.display ||
          face?.image_uris?.normal ||
          face?.image_uris?.png;
        if (!url) throw new Error(`No ${card.face} image is available for ${data.name}.`);
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'cards.scryfall.io')
          throw new Error('Scryfall returned an unsupported image host.');
        const artwork = await cached(`image:${url}`, async () => {
          const headers = { Accept: 'image/*' };
          if (typeof window === 'undefined') headers['User-Agent'] = 'TabletopSceneStudio/0.1';
          const response = await fetcher(url, {
            headers,
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok)
            throw new Error(`Scryfall artwork request failed (${response.status}).`);
          const blob = await response.blob();
          if (
            !/^image\/(jpeg|png|webp)$/.test(blob.type) ||
            !blob.size ||
            blob.size > MAX_IMAGE_BYTES
          )
            throw new Error('Scryfall artwork must be a valid image smaller than 10 MB.');
          if (typeof createImageBitmap === 'function') {
            const image = await createImageBitmap(blob);
            image.close();
          }
          return imageData(blob);
        });
        const value = {
          scryfallId: card.scryfallId,
          face: card.face,
          name: face.name || data.name,
          artist: face.artist || data.artist || '',
          source: `https://scryfall.com/card/${card.scryfallId}`,
          image: artwork.value,
        };
        if (version === generation)
          remember(resolved, key, {
            value,
            expiresAt: Math.min(metadata.expiresAt, artwork.expiresAt),
          });
        return { ...value };
      } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError')
          throw new Error(`Scryfall timed out for ${card.scryfallId}. Try again.`);
        if (error instanceof TypeError)
          throw new Error(
            `Could not reach Scryfall for ${card.scryfallId}. Check your connection and retry.`,
          );
        throw error;
      }
    }
    return {
      ttlMs: TTL,
      get persistent() {
        return persistent;
      },
      load,
      peek(card) {
        const record = resolved.get(assetKey(card));
        return fresh(record) ? { ...record.value } : null;
      },
      async clear() {
        generation++;
        // Finish pending writes before clearing the persistent store.
        await Promise.allSettled([...inflight.values()]);
        memory.clear();
        resolved.clear();
        try {
          await store?.clear();
        } catch {
          persistent = false;
        }
      },
    };
  }
  async function resolveScryfall(cards, { client = T.scryfall } = {}) {
    const unique = new Map(
      cards.filter((card) => card.scryfallId).map((card) => [assetKey(card), card]),
    );
    const entries = [...unique],
      assets = new Map();
    let cursor = 0,
      failure;
    await Promise.all(
      Array.from({ length: Math.min(4, entries.length) }, async () => {
        while (cursor < entries.length && !failure) {
          const [key, card] = entries[cursor++];
          try {
            assets.set(key, await client.load(card));
          } catch (error) {
            failure ||= error;
          }
        }
      }),
    );
    if (failure) throw failure;
    return assets;
  }
  Object.assign(T, { createScryfallClient, resolveScryfall, scryfallAssetKey: assetKey });
  T.scryfall = createScryfallClient();
})(globalThis);
