import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import T, { createScryfallDiskStore } from '../tabletop.mjs';

const ID = '683a5707-cddb-494d-9b41-51b4584ded69';
const OTHER = '11111111-2222-3333-4444-555555555555';
const THIRD = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TTL = 259200000;
const imageURL = (id, face = 'front') => `https://cards.scryfall.io/large/${face}/${id}.jpg`;
const metadata = (id) => ({
  object: 'card',
  id,
  name: `Card ${id}`,
  artist: 'Test Artist',
  image_uris: { large: imageURL(id) },
});
function harness({ store, response, start = 1000 } = {}) {
  let clock = start;
  const records = new Map(),
    requests = [],
    starts = [];
  const storage = store || {
    async get(key) {
      return structuredClone(records.get(key));
    },
    async set(key, record) {
      records.set(key, structuredClone(record));
    },
    async clear() {
      records.clear();
    },
  };
  const client = T.createScryfallClient({
    store: storage,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.startsWith('https://api.')) starts.push(clock);
      if (response) return response(url, options);
      return url.startsWith('https://api.')
        ? Response.json(metadata(url.split('/').pop()))
        : new Response('test image bytes', { headers: { 'Content-Type': 'image/jpeg' } });
    },
  });
  return {
    client,
    records,
    requests,
    starts,
    store: storage,
    advance: (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
}
function config(cards = [{ scryfallId: ID }]) {
  return {
    activeDeckId: 'mtg',
    players: 2,
    decks: [{ id: 'mtg', name: 'Magic: The Gathering', cards }],
  };
}

test('ID-only cards normalize without mutating requests, validate commands, and round-trip as references', () => {
  const request = config([{ scryfallId: ID.toUpperCase() }, { scryfallId: ID, face: 'back' }]);
  const before = structuredClone(request),
    engine = T.createEngine(request);
  const cards = engine.state.decks.find((d) => d.id === 'mtg').cards;
  assert.equal(cards[0].id, ID);
  assert.equal(cards[1].id, `${ID}-back`);
  assert.equal(cards[0].name, 'Scryfall card');
  assert.deepEqual(request, before);
  assert.deepEqual(T.normalize(T.toConfig(engine.state)), engine.state);
  engine.dispatch({ type: 'card.upsert', payload: { card: { scryfallId: OTHER } } });
  assert.equal(engine.state.decks.at(-1).cards.length, 3);
  const snapshot = engine.state;
  for (const card of [
    { scryfallId: '../../secret' },
    { scryfallId: ID, face: 'side' },
    { scryfallId: ID, artUrl: 'https://example.com/art.png' },
  ]) {
    assert.throws(() => engine.dispatch({ type: 'card.upsert', payload: { card } }));
    assert.deepEqual(engine.state, snapshot);
  }
  assert.equal(T.normalize(config([ID])).decks.at(-1).cards[0].id, ID);
});

test('metadata and image bytes are reused for exactly three days, including across client restarts', async () => {
  const h = harness();
  const image = await h.client.load(ID);
  assert.equal(h.client.ttlMs, TTL);
  assert.match(image.image, /^data:image\/jpeg;base64,/);
  assert.equal(h.requests.length, 2);
  h.advance(TTL - 1);
  assert.deepEqual(await h.client.load(ID), image);
  assert.equal(h.requests.length, 2);
  const restarted = harness({ store: h.store, start: h.now() });
  assert.deepEqual(await restarted.client.load(ID), image);
  assert.equal(restarted.requests.length, 0);
  h.advance(1);
  assert.equal(h.client.peek({ scryfallId: ID }), null);
  await h.client.load(ID);
  assert.equal(h.requests.length, 4);
  await h.client.clear();
  assert.equal(h.records.size, 0);
  await h.client.load(ID);
  assert.equal(h.requests.length, 6);
});

test('overlapping renders deduplicate lookups and image downloads and throttle uncached API traffic', async () => {
  const h = harness();
  await Promise.all([
    h.client.load(ID),
    h.client.load(ID),
    h.client.load(OTHER),
    h.client.load(THIRD),
  ]);
  assert.equal(h.requests.length, 6);
  assert.equal(h.starts.length, 3);
  assert.ok(h.starts[1] - h.starts[0] >= 120);
  assert.ok(h.starts[2] - h.starts[1] >= 120);
  const api = h.requests[0].options;
  assert.equal(api.headers.Accept, 'application/json');
  assert.match(api.headers['User-Agent'], /TabletopSceneStudio/);
  assert.equal(api.credentials, 'omit');
});

test('double-faced cards share metadata but cache separate full images; single-faced backs fail clearly', async () => {
  const h = harness({
    response: (url) =>
      url.startsWith('https://api.')
        ? Response.json({
            object: 'card',
            id: ID,
            name: 'Front // Back',
            card_faces: [
              { name: 'Front', image_uris: { large: imageURL(ID) } },
              { name: 'Back', image_uris: { large: imageURL(ID, 'back') } },
            ],
          })
        : new Response(url, { headers: { 'Content-Type': 'image/jpeg' } }),
  });
  const [front, back] = await Promise.all([
    h.client.load(ID),
    h.client.load({ scryfallId: ID, face: 'back' }),
  ]);
  assert.equal(front.name, 'Front');
  assert.equal(back.name, 'Back');
  assert.notEqual(front.image, back.image);
  assert.equal(h.requests.length, 3);
  const single = harness();
  await assert.rejects(single.client.load({ scryfallId: ID, face: 'back' }), /No back image/);
  assert.equal(single.requests.length, 1);
});

test('failed fetches are not cached and expired artwork never silently substitutes stale data', async () => {
  let failing = true;
  const h = harness({
    response: (url) => {
      if (url.startsWith('https://api.')) return Response.json(metadata(ID));
      return failing
        ? new Response('Unavailable', { status: 503 })
        : new Response('image', { headers: { 'Content-Type': 'image/jpeg' } });
    },
  });
  await assert.rejects(h.client.load(ID), /503/);
  assert.equal(h.records.size, 1);
  failing = false;
  await h.client.load(ID);
  assert.equal(h.requests.length, 3);
  h.advance(TTL);
  failing = true;
  await assert.rejects(h.client.load(ID), /503/);
  assert.equal(h.client.peek({ scryfallId: ID }), null);
});

test('429 stops queued lookups and obeys Retry-After without automatic retry storms', async () => {
  const h = harness({
    response: () =>
      new Response('Slow down', {
        status: 429,
        headers: { 'Retry-After': '90' },
      }),
  });
  const results = await Promise.allSettled([h.client.load(ID), h.client.load(OTHER)]);
  assert.ok(
    results.every((r) => r.status === 'rejected' && /slow down/.test(r.reason.message)),
  );
  assert.equal(h.requests.length, 1);
  h.advance(60000);
  await assert.rejects(h.client.load(ID), /slow down/);
  assert.equal(h.requests.length, 1);
  h.advance(30000);
  await assert.rejects(h.client.load(ID), /slow down/);
  assert.equal(h.requests.length, 2);
  assert.equal(h.records.size, 0);
});

test('network work is limited to visible sampled card faces, preserving player privacy and input state', async () => {
  const state = T.normalize(
    config([{ scryfallId: ID }, { scryfallId: OTHER }, { scryfallId: THIRD }]),
  );
  state.players.forEach((player, i) =>
    player.zones.forEach((zone) => {
      zone.count = zone.id === 'hand' || zone.id === 'library' ? 1 : 0;
      zone.cardIds = zone.count ? [zone.id === 'library' ? THIRD : i === 0 ? ID : OTHER] : [];
    }),
  );
  const original = structuredClone(state);
  for (const scope of ['self', 'table']) {
    const h = harness();
    const view = T.forPlayer(state, 'p1', { scope });
    const svg = await T.renderAsync(view, { client: h.client });
    assert.equal(h.requests.length, 2);
    assert.match(h.requests[0].url, new RegExp(ID));
    assert.ok(!svg.includes(OTHER) && !svg.includes(THIRD));
    assert.ok(svg.includes('data:image/jpeg;base64,'));
    assert.ok(svg.includes('preserveAspectRatio="xMidYMid meet"'));
    assert.ok(!svg.includes('Loading card'));
  }
  assert.deepEqual(state, original);
  const huge = T.normalize(config());
  huge.players.forEach((p) =>
    p.zones.forEach((z) => {
      z.count = 1000000;
    }),
  );
  const h = harness();
  await T.renderAsync(huge, { client: h.client });
  assert.equal(h.requests.length, 2);
});

test('async renders snapshot configuration before awaiting assets', async () => {
  const state = config(),
    original = structuredClone(state);
  const h = harness();
  const promise = T.renderAsync(state, { client: h.client });
  state.players = 8;
  state.decks[0].cards[0].scryfallId = OTHER;
  const svg = await promise;
  assert.ok(svg.includes('02 PLAYERS'));
  assert.equal(svg, await T.renderAsync(original, { client: h.client }));
  assert.equal(h.requests.length, 2);
});

test('invalid IDs and unsupported image hosts fail before unsafe requests', async () => {
  const h = harness({
    response: () =>
      Response.json({
        ...metadata(ID),
        image_uris: {
          large: 'http://127.0.0.1/private',
        },
      }),
  });
  await assert.rejects(h.client.load('not-a-uuid'), /UUID/);
  assert.equal(h.requests.length, 0);
  await assert.rejects(h.client.load(ID), /unsupported image host/);
  assert.equal(h.requests.length, 1);
});

test('unavailable persistent storage falls back to memory without breaking renders', async () => {
  const h = harness({
    store: {
      async get() {
        throw new Error('Disabled');
      },
      async set() {
        throw new Error('Quota exceeded');
      },
    },
  });
  await h.client.load(ID);
  await h.client.load(ID);
  assert.equal(h.requests.length, 2);
  assert.equal(h.client.persistent, false);
});

test('disk cache survives new clients, refreshes expiry, and clears only its configured directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tabletop-scryfall-test-'));
  try {
    const first = harness({ store: createScryfallDiskStore(directory) });
    await first.client.load(ID);
    const second = harness({ store: createScryfallDiskStore(directory) });
    await second.client.load(ID);
    assert.equal(second.requests.length, 0);
    second.advance(TTL);
    await second.client.load(ID);
    assert.equal(second.requests.length, 2);
    await second.client.clear();
    const third = harness({ store: createScryfallDiskStore(directory) });
    await third.client.load(ID);
    assert.equal(third.requests.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
