import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import T from '../tabletop.mjs';

const baseURL = 'https://example.test/tools/tabletop/render.html';
const token = (json) => `v1.json.${Buffer.from(json).toString('base64url')}`;

test('URL requests reproduce default, focused, and both player framings without changing the input', async () => {
  for (const request of [
    {},
    {
      stage: { width: 1080, height: 1920, theme: 'plum' },
      view: { mode: 'focus', zoneId: 'hand' },
    },
    T.forPlayer({ players: 8 }, 'p8', { scope: 'table' }),
    T.forPlayer({ players: 8 }, 'p1', { scope: 'self' }),
  ]) {
    const before = structuredClone(request);
    const url = await T.createRenderURL(request, { baseURL });
    assert.match(url, /render\.html#scene=v1\.gz\./);
    const state = await T.readRenderURL(url);
    assert.deepEqual(state, T.normalize(request));
    assert.equal(T.render(state), T.render(request));
    assert.deepEqual(request, before);
  }
});

test('Unicode, card URLs, player names, Scryfall faces, and visibility survive both encodings', async () => {
  const request = T.normalize({
    activeDeckId: 'custom',
    decks: [
      {
        id: 'custom',
        name: '魔法 🂡 & friends',
        cards: [
          {
            id: 'art',
            name: 'Étoile 🌙 <&>',
            artUrl: 'https://example.test/art.png?a=1&b=2#blue',
          },
          { scryfallId: '683a5707-cddb-494d-9b41-51b4584ded69', face: 'back' },
        ],
      },
    ],
  });
  request.players[0].name = 'Zoë 🃏';
  request.players[0].zones[1].visibility = 'owner';
  for (const compress of [false, true]) {
    const encoded = await T.encodeRequest(request, { compress });
    assert.match(encoded, compress ? /^v1\.gz\./ : /^v1\.json\./);
    assert.deepEqual(await T.decodeRequest(encoded), request);
  }
});

test('encoding captures the request before awaiting compression', async () => {
  const request = T.normalize();
  const before = structuredClone(request);
  const encoding = T.encodeRequest(request);
  request.stage.width = 1920;
  request.players[0].name = 'Changed';
  assert.deepEqual(await T.decodeRequest(await encoding), before);
});

test('plain JSON fragments let external applications build links without this library', async () => {
  const request = { stage: { width: 640, height: 360 }, players: 3 };
  const url = `${baseURL}#config=${encodeURIComponent(JSON.stringify(request))}`;
  assert.deepEqual(await T.readRenderURL(url), T.normalize(request));
  assert.equal(await T.readRenderURL(baseURL), null);
  assert.equal(await T.readRenderURL(`${baseURL}#stage`), null);
});

test('link builders preserve nested hosting paths, use fragments, and support clean embedding and file URLs', async () => {
  const url = new URL(
    await T.createRenderURL({}, { baseURL: `${baseURL}?old=1#old`, embed: true }),
  );
  assert.equal(url.pathname, '/tools/tabletop/render.html');
  assert.equal(url.search, '?embed=1');
  assert.ok(!url.searchParams.has('scene'));
  assert.ok(new URLSearchParams(url.hash.slice(1)).has('scene'));
  const file = await T.createRenderURL({}, { baseURL: 'file:///tmp/tabletop/render.html' });
  assert.deepEqual(await T.readRenderURL(file), T.normalize());
  await assert.rejects(T.createRenderURL({}), /baseURL/);
  await assert.rejects(T.createRenderURL({}, { baseURL: 'javascript:alert(1)' }), /HTTP/);
});

test('unknown versions, bad encodings, invalid JSON, duplicate payloads, and invalid scene fields fail explicitly', async () => {
  for (const encoded of [
    'v2.gz.abc',
    'v1.xml.abc',
    'v1.gz.',
    'v1.json.*',
    'v1.json.a',
    'v1.gz.YWJj',
  ])
    await assert.rejects(T.decodeRequest(encoded));
  await assert.rejects(T.decodeRequest(token('{broken')), /valid JSON/);
  await assert.rejects(T.decodeRequest(token('[]')), /JSON object/);
  await assert.rejects(T.decodeRequest(token('{"stage":{"width":1}}')), /Width/);
  await assert.rejects(T.decodeRequest('v1.json._w'), /invalid text/);
  for (const hash of [
    'scene=a&scene=b',
    'scene=a&config=%7B%7D',
    'config=%7B%7D&config=%7B%7D',
  ])
    await assert.rejects(T.readRenderURL(`${baseURL}#${hash}`), /one scene or config/);
});

test('URL length, decoded bytes, and expansion limits are enforced before rendering', async () => {
  await assert.rejects(T.decodeRequest(`v1.json.${'x'.repeat(64001)}`), /too long/);
  await assert.rejects(T.readRenderURL(`${baseURL}#config=${'x'.repeat(64001)}`), /too long/);
  const bomb = `v1.gz.${gzipSync(' '.repeat(1000001)).toString('base64url')}`;
  await assert.rejects(T.decodeRequest(bomb), /too large/);
  const huge = {
    activeDeckId: 'large',
    decks: [
      {
        id: 'large',
        name: 'Large',
        cards: [
          {
            id: 'large',
            name: 'Large',
            artUrl: `data:image/png;base64,${'A'.repeat(1000000)}`,
          },
        ],
      },
    ],
  };
  await assert.rejects(T.encodeRequest(huge), /too large/);
});

test('the codec also works when browser compression is unavailable', async () => {
  const original = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  try {
    const encoded = await T.encodeRequest({});
    assert.match(encoded, /^v1\.json\./);
    assert.deepEqual(await T.decodeRequest(encoded), T.normalize());
  } finally {
    globalThis.CompressionStream = original;
  }
});

test('URL requests are render inputs, not an authorization or hidden-data redaction system', async () => {
  const state = T.forPlayer({}, 'p1');
  state.players[1].zones.find((z) => z.id === 'hand').cardIds = ['A-spades'];
  const restored = await T.decodeRequest(await T.encodeRequest(state));
  assert.equal(restored.players[1].zones.find((z) => z.id === 'hand').cardIds[0], 'A-spades');
  assert.equal(
    T.canSeeFaces(restored, restored.players[1], restored.players[1].zones.at(-1)),
    false,
  );
});
