import test from 'node:test';
import assert from 'node:assert/strict';
import T from '../tabletop.mjs';
const target = (index = 0, zoneId = 'battlefield', playerId = 'p1') => ({
  playerId,
  zoneId,
  index,
});
function fixture() {
  const state = T.normalize({
    players: 2,
    activeDeckId: 'cards',
    decks: [
      {
        id: 'cards',
        name: 'Fixture',
        cards: [
          { id: 'a', name: 'Public card', art: 0 },
          {
            id: 'secret',
            name: 'Secret identity',
            artUrl: 'https://secret.example/hidden.png',
          },
        ],
      },
    ],
  });
  for (const player of state.players)
    for (const zone of player.zones) {
      zone.count = ['battlefield', 'hand'].includes(zone.id) ? 3 : 0;
      zone.cardIds = Array(zone.count).fill(zone.id === 'hand' ? 'secret' : 'a');
    }
  return state;
}

test('counter formats preserve exact boundary values, infinity, signs, and huge integer strings', () => {
  const values = [
    99,
    100,
    999,
    9999,
    99999999,
    'infinity',
    -5,
    '123456789012345678901234567890',
  ];
  assert.deepEqual(
    values.map((v) => T.formatCounter(v)),
    [
      '99',
      '100',
      '999',
      '9,999',
      '99,999,999',
      '∞',
      '−5',
      '123,456,789,012,345,678,901,234,567,890',
    ],
  );
  assert.deepEqual(
    [99, 100, 999, 9999, 99999999].map((v) => T.formatCounter(v, { format: 'compact' })),
    ['99', '100', '999', '9.99K', '99.99M'],
  );
  assert.deepEqual(
    [99, 100, 999, -100, '∞'].map((v) => T.formatCounter(v, { format: 'capped' })),
    ['99', '99+', '99+', '< −99', '∞'],
  );
  assert.equal(T.formatCounter(99999999, { format: 'scientific' }), '9.99e7');
  assert.equal(T.formatCounter('1000000000000000000', { format: 'compact' }), '1e18');
  assert.equal(T.formatCounter('-infinity', { format: 'capped' }), '−∞');
  assert.equal(T.formatCounter(3.25), '3.25'); // Existing stats objects remain readable.
  for (const value of [
    Infinity,
    NaN,
    Number.MAX_SAFE_INTEGER + 1,
    '1e100',
    'a lot',
    null,
    '1'.repeat(61),
  ])
    assert.throws(() => T.normalizeCount(value));
});

test('counter lists and visual extras survive URL round trips without mutating callers or discarding digits', async () => {
  const state = fixture();
  state.players[0].counters = [
    { name: 'Life', count: '∞' },
    {
      name: 'Mana',
      count: '900719925474099312345',
      format: 'capped',
      cap: 999,
      color: '#aabbcc',
    },
  ];
  state.extras = {
    highlights: [{ target: target(1), preset: 'arcane', strength: 2 }],
    focus: { target: target(1), layout: 'showcase' },
    cards: [
      {
        target: target(1),
        badge: '*/4',
        tapped: true,
        tags: ['Token'],
        counters: [{ name: 'Shield', count: 2 }],
      },
    ],
  };
  const original = structuredClone(state),
    normalized = T.normalize(state);
  const decoded = await T.decodeRequest(await T.encodeRequest(state));
  assert.deepEqual(decoded, normalized);
  assert.deepEqual(state, original);
  assert.equal(T.playerCounters(decoded.players[0])[1].count, '900719925474099312345');
  assert.equal(T.render(decoded), T.render(normalized));
});

test('invalid counter, effect, focus, and card targets are rejected atomically', () => {
  const engine = T.createEngine(fixture()),
    before = engine.state;
  for (const extras of [
    { highlights: [{ target: target(3), preset: 'halo' }] },
    { highlights: [{ target: { cardId: 'absent' }, preset: 'halo' }] },
    { highlights: [{ target: target(), preset: 'remote-script' }] },
    { highlights: [{ target: target(), preset: 'halo', color: 'url(javascript:1)' }] },
    { highlights: [{ target: target(), preset: 'halo', strength: 100 }] },
    { focus: { target: target(), layout: 'unknown' } },
    { focus: { target: target(), layout: 'spotlight', dim: 2 } },
    { cards: [{ target: target(), rotation: 360 }] },
    { cards: [{ target: target() }, { target: target() }] },
  ]) {
    assert.throws(() => engine.dispatch({ type: 'extras.update', payload: extras }));
    assert.deepEqual(engine.state, before);
  }
  for (const counters of [
    [{ name: 'Life', count: Infinity }],
    [{ name: 'Life', count: 1, cap: 0 }],
    [{ name: 'Life', count: 1, format: 'rounded' }],
  ]) {
    assert.throws(() =>
      engine.dispatch({ type: 'player.update', payload: { playerId: 'p1', counters } }),
    );
    assert.deepEqual(engine.state, before);
  }
  assert.equal(engine.canUndo, false);
});

test('position highlights distinguish duplicate cards; identity and zone selectors can highlight many', () => {
  const state = fixture();
  state.extras.highlights = [{ target: target(1), preset: 'neon' }];
  assert.equal((T.render(state).match(/data-glow="neon"/g) || []).length, 1);
  state.extras.highlights = [
    { target: { playerId: 'p1', zoneId: 'battlefield' }, preset: 'halo' },
  ];
  assert.equal((T.render(state).match(/data-glow="halo"/g) || []).length, 3);
  state.extras.highlights = [{ target: { cardId: 'a' }, preset: 'frost' }];
  assert.equal((T.render(state).match(/data-glow="frost"/g) || []).length, 6);
  state.players[0].zones.find((z) => z.id === 'battlefield').count = 1000000;
  state.extras.highlights = [{ target: target(999999), preset: 'arcane' }];
  const result = T.renderDetailed(state);
  assert.ok(result.svg.includes('data-card-index="999999"'));
  assert.ok(result.metrics.renderedCards < 100);
});

test('hidden focus cards reveal neither artwork, annotations, captions, nor identity-based highlights', () => {
  const state = fixture();
  state.extras.cards = [
    {
      target: target(0, 'hand'),
      badge: 'SECRET BADGE',
      tags: ['SECRET TAG'],
      counters: [{ name: 'SECRET COUNT', count: 777 }],
    },
  ];
  state.extras.highlights = [{ target: { cardId: 'secret', playerId: 'p1' }, preset: 'toxic' }];
  state.extras.focus = {
    target: target(0, 'hand'),
    layout: 'showcase',
    title: 'SECRET TITLE',
    caption: 'SECRET CAPTION',
  };
  const svg = T.render(T.forPlayer(state, 'p2'));
  const focus = svg.slice(svg.indexOf('<g data-card-focus='));
  assert.match(focus, /data-focus-visibility="backs"/);
  for (const value of ['SECRET', 'secret.example', 'Secret identity', 'data-glow="toxic"'])
    assert.ok(!focus.includes(value), value);
  assert.equal((svg.match(/data-glow="toxic"/g) || []).length, 0);
  const self = T.render(T.forPlayer(state, 'p2', { scope: 'self' }));
  assert.ok(!self.includes('data-card-focus'));
  const own = T.render(T.forPlayer(state, 'p1'));
  assert.ok(own.includes('SECRET TITLE') && own.includes('SECRET COUNT'));
});

test('per-card concealment hides only that occurrence in a public zone', () => {
  const state = fixture();
  state.players[0].zones.find((z) => z.id === 'battlefield').cardIds = ['secret', 'a', 'a'];
  state.players[0].zones.find((z) => z.id === 'hand').count = 0;
  state.players[0].zones.find((z) => z.id === 'hand').cardIds = [];
  state.extras.cards = [{ target: target(), faceDown: true, badge: 'SECRET BADGE' }];
  const svg = T.render(T.forPlayer(state, 'p1', { scope: 'self' }));
  assert.ok(!svg.includes('secret.example'));
  assert.ok(!svg.includes('SECRET BADGE'));
  assert.equal((svg.match(/data-card-state="visible"/g) || []).length, 2);
});

test('a focused Scryfall card outside the base sample is hydrated; concealed focus never fetches it', async () => {
  const id = '683a5707-cddb-494d-9b41-51b4584ded69';
  const state = T.normalize({
    players: 1,
    activeDeckId: 'mtg',
    decks: [
      {
        id: 'mtg',
        name: 'MTG',
        cards: [
          { id: 'ordinary', name: 'Ordinary', art: 0 },
          { id: 'rare', scryfallId: id },
        ],
      },
    ],
  });
  state.players[0].zones.forEach((z) => {
    z.count = 0;
    z.cardIds = [];
  });
  const board = state.players[0].zones.find((z) => z.id === 'battlefield');
  board.count = 80;
  board.cardIds = Array(80).fill('ordinary');
  board.cardIds[79] = 'rare';
  state.extras.focus = { target: target(79), layout: 'sidecar' };
  const loaded = [];
  const client = {
    load: async (card) => {
      loaded.push(card.id);
      return {
        name: 'Resolved rare card',
        artist: 'Artist',
        image: 'data:image/png;base64,aA==',
      };
    },
  };
  assert.equal(T.renderDetailed({ ...state, extras: {} }).assets.length, 0);
  const result = await T.renderDetailedAsync(state, { client });
  assert.deepEqual(loaded, ['rare']);
  assert.ok(result.svg.includes('Resolved rare card'));
  assert.ok(!result.svg.includes('Loading card'));
  loaded.length = 0;
  state.extras.cards = [{ target: target(79), faceDown: true }];
  await T.renderDetailedAsync(state, { client });
  assert.deepEqual(loaded, []);
});

test('card position annotations and focus follow editor transfers and are repaired on deletion', () => {
  const state = fixture();
  state.extras.highlights = [
    { target: target(0, 'hand'), preset: 'halo' },
    { target: target(2, 'hand'), preset: 'frost' },
    { target: target(0), preset: 'ember' },
  ];
  state.extras.cards = [{ target: target(0, 'hand'), badge: 'Transferred' }];
  state.extras.focus = { target: target(0, 'hand'), layout: 'spotlight' };
  const engine = T.createEngine(state);
  engine.dispatch({
    type: 'zone.transfer',
    payload: {
      from: { playerId: 'p1', zoneId: 'hand' },
      to: { playerId: 'p1', zoneId: 'battlefield' },
      count: 1,
    },
  });
  assert.deepEqual(engine.state.extras.focus.target, target(0));
  assert.deepEqual(
    engine.state.extras.highlights.map((h) => h.target),
    [target(0), target(1, 'hand'), target(1)],
  );
  engine.undo();
  assert.deepEqual(engine.state, T.normalize(state));
  engine.dispatch({ type: 'zone.remove', payload: { playerId: 'p1', zoneId: 'hand' } });
  assert.equal(engine.state.extras.focus, null);
  assert.equal(engine.state.extras.cards.length, 0);
  engine.dispatch({ type: 'session.shuffle' });
  assert.deepEqual(engine.state.extras, { highlights: [], focus: null, cards: [] });
});

test('counter labels, card annotations and focus text are escaped before SVG inclusion', () => {
  const state = fixture();
  state.players[0].counters = [{ name: '<script>&"', count: 99999999 }];
  state.extras.cards = [{ target: target(), badge: '<img onerror=x>', tags: ['<script>'] }];
  state.extras.focus = {
    target: target(),
    layout: 'showcase',
    title: '<script>alert(1)</script>',
    caption: '<img onerror=x>',
  };
  const svg = T.render(state);
  assert.ok(!svg.includes('<script>') && !svg.includes('<img'));
  assert.ok(svg.includes('&lt;script&gt;'));
});

test('full custom card scans preserve the whole image and survive serialization', async () => {
  const card = {
    id: 'scan',
    name: 'A full card',
    artUrl: 'https://cards.example/scan.png',
    artMode: 'full-card',
  };
  const state = T.normalize({
    players: 1,
    activeDeckId: 'scans',
    decks: [{ id: 'scans', name: 'Scans', cards: [card] }],
  });
  const image = T.cardSVG(card);
  assert.match(image, /width="70" height="100" preserveAspectRatio="xMidYMid meet"/);
  assert.ok(!image.includes('clip-path'));
  assert.deepEqual(await T.decodeRequest(await T.encodeRequest(state)), state);
  assert.throws(() =>
    T.normalize({
      decks: [{ id: 'bad', name: 'Bad', cards: [{ ...card, artMode: 'cover' }] }],
    }),
  );
});

test('all focus layouts and examples remain bounded across stage sizes and preserve deterministic output', () => {
  for (const sample of T.listExamples()) {
    const state = T.example(sample.id),
      before = structuredClone(state);
    for (const [width, height] of [
      [64, 64],
      [512, 512],
      [1080, 1920],
      [1920, 1080],
      [4096, 64],
      [64, 4096],
    ]) {
      state.stage.width = width;
      state.stage.height = height;
      for (const layout of T.listFocusLayouts()) {
        state.extras.focus = {
          target: {
            playerId: state.players[0].id,
            zoneId: state.players[0].zones.find((z) => z.count && z.visibility === 'public').id,
            index: 0,
          },
          layout: layout.id,
        };
        const result = T.renderDetailed(state);
        assert.doesNotMatch(result.svg, /NaN|undefined/);
        assert.doesNotMatch(
          result.svg,
          /\b(?:x|y|width|height|viewBox|r|rx|ry|cx|cy|dx|dy|font-size|transform|d|points)="[^"]*Infinity/,
        );
        assert.doesNotMatch(result.svg, /\b(?:width|height)="-\d/);
        assert.ok(result.metrics.renderedCards < 500);
        assert.equal(result.metrics.width, width);
        assert.equal(result.metrics.height, height);
      }
    }
    assert.deepEqual(T.example(sample.id), before);
    assert.equal(T.render(before), T.render(T.toConfig(before)));
  }
});
