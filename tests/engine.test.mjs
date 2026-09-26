import test from 'node:test';
import assert from 'node:assert/strict';
import T from '../tabletop.mjs';

const getZone = (state, playerId, zoneId) => {
  const player = state.players.find((p) => p.id === playerId);
  return { player, zone: player.zones.find((z) => z.id === zoneId) };
};
const cardsIn = (state, playerId, zoneId, count) => {
  const { player, zone } = getZone(state, playerId, zoneId);
  return Array.from({ length: count }, (_, i) => T.cardAt(state, player, zone, i).id);
};

test('default scene is a portable 512-square two-player table with a full standard deck', () => {
  const state = T.normalize();
  assert.equal(state.stage.width, 512);
  assert.equal(state.stage.height, 512);
  assert.equal(state.players.length, 2);
  assert.equal(state.players[0].zones.length, 4);
  const deck = state.decks.find((deck) => deck.id === 'standard');
  assert.equal(deck.cards.length, 52);
  assert.equal(new Set(deck.cards.map((card) => card.id)).size, 52);
  assert.deepEqual(T.normalize(T.toConfig(state)), state);
});

test('invalid commands are atomic and do not enter history or emit events', () => {
  const engine = T.createEngine(),
    before = engine.state;
  let emitted = 0;
  engine.subscribe(() => emitted++);
  const commands = [
    { type: 'stage.update', payload: { width: 0 } },
    { type: 'stage.update', payload: { height: 4097 } },
    { type: 'stage.update', payload: { theme: '__proto__' } },
    { type: 'view.update', payload: { playerId: 'missing' } },
    { type: 'view.update', payload: { zoneId: 'missing' } },
    { type: 'player.count', payload: { count: 9 } },
    { type: 'zone.update', payload: { playerId: 'p1', zoneId: 'hand', count: -1 } },
    { type: 'zone.update', payload: { playerId: 'p1', zoneId: 'hand', count: 1.5 } },
    {
      type: 'zone.update',
      payload: { playerId: 'p1', zoneId: 'hand', cardIds: ['missing-card'] },
    },
    { type: 'unknown.command' },
  ];
  commands.forEach((command) => {
    assert.throws(() => engine.dispatch(command));
    assert.deepEqual(engine.state, before);
  });
  assert.equal(emitted, 0);
  assert.equal(engine.revision, 0);
  assert.equal(engine.canUndo, false);
});

test('snapshots and subscriber snapshots cannot mutate internal state; history branches correctly', () => {
  const engine = T.createEngine();
  const snapshot = engine.state;
  snapshot.players[0].zones[0].count = 123;
  assert.equal(engine.state.players[0].zones[0].count, 32);
  engine.subscribe((state) => {
    state.stage.width = 64;
  });
  engine.dispatch({ type: 'stage.update', payload: { width: 1024 } });
  assert.equal(engine.state.stage.width, 1024);
  engine.undo();
  assert.equal(engine.state.stage.width, 512);
  assert.equal(engine.canRedo, true);
  engine.redo();
  assert.equal(engine.state.stage.width, 1024);
  engine.undo();
  engine.dispatch({ type: 'stage.update', payload: { height: 720 } });
  assert.equal(engine.canRedo, false);
  assert.equal(engine.state.stage.height, 720);
});

test('a transfer preserves the identity and order of moved cards, remaining cards, and destination cards', () => {
  const engine = T.createEngine();
  const original = engine.state;
  const source = cardsIn(original, 'p1', 'library', 12),
    target = cardsIn(original, 'p1', 'hand', 5);
  engine.dispatch({
    type: 'zone.transfer',
    payload: {
      from: { playerId: 'p1', zoneId: 'library' },
      to: { playerId: 'p1', zoneId: 'hand' },
      count: 3,
    },
  });
  assert.deepEqual(cardsIn(engine.state, 'p1', 'hand', 8), [...source.slice(0, 3), ...target]);
  assert.deepEqual(cardsIn(engine.state, 'p1', 'library', 9), source.slice(3));
  engine.dispatch({
    type: 'zone.transfer',
    payload: {
      from: { playerId: 'p1', zoneId: 'hand' },
      to: { playerId: 'p2', zoneId: 'graveyard' },
      count: 4,
    },
  });
  assert.deepEqual(cardsIn(engine.state, 'p2', 'graveyard', 4), [
    ...source.slice(0, 3),
    target[0],
  ]);
  assert.deepEqual(cardsIn(engine.state, 'p1', 'hand', 4), target.slice(1));
  const total = (state) =>
    state.players.flatMap((p) => p.zones).reduce((n, z) => n + z.count, 0);
  assert.equal(total(engine.state), total(original));
  engine.undo();
  engine.undo();
  assert.deepEqual(engine.state, original);
});

test('transfers reject insufficient cards, same-zone moves, and target overflow without side effects', () => {
  const engine = T.createEngine();
  engine.dispatch({
    type: 'zone.update',
    payload: { playerId: 'p1', zoneId: 'hand', count: 1000000 },
  });
  const before = engine.state;
  for (const [to, count] of [
    ['hand', 1],
    ['library', 1],
    ['graveyard', 1000],
  ]) {
    assert.throws(() =>
      engine.dispatch({
        type: 'zone.transfer',
        payload: {
          from: { playerId: 'p1', zoneId: 'library' },
          to: { playerId: 'p1', zoneId: to },
          count,
        },
      }),
    );
    assert.deepEqual(engine.state, before);
  }
});

test('removing players and zones repairs focus, and the final zone cannot be removed', () => {
  const engine = T.createEngine({
    players: 8,
    view: { playerId: 'p8', zoneId: 'hand', mode: 'focus' },
  });
  engine.dispatch({ type: 'player.count', payload: { count: 1 } });
  assert.equal(engine.state.view.playerId, 'p1');
  for (const zoneId of ['hand', 'library', 'graveyard'])
    engine.dispatch({ type: 'zone.remove', payload: { playerId: 'p1', zoneId } });
  assert.equal(engine.state.view.zoneId, 'battlefield');
  assert.throws(
    () =>
      engine.dispatch({
        type: 'zone.remove',
        payload: { playerId: 'p1', zoneId: 'battlefield' },
      }),
    /at least one/,
  );
  assert.equal(engine.state.players[0].zones.length, 1);
});

test('deck editing is validated; switching decks clears explicit references; edited built-ins survive export', () => {
  const engine = T.createEngine();
  engine.dispatch({
    type: 'zone.transfer',
    payload: {
      from: { playerId: 'p1', zoneId: 'library' },
      to: { playerId: 'p1', zoneId: 'hand' },
    },
  });
  engine.dispatch({ type: 'deck.select', payload: { id: 'arcana' } });
  assert.equal(getZone(engine.state, 'p1', 'hand').zone.cardIds.length, 0);
  engine.dispatch({
    type: 'card.upsert',
    payload: {
      card: { id: 'special', name: 'New card', artUrl: 'https://example.com/card.png' },
    },
  });
  const config = T.toConfig(engine.state);
  assert.equal(config.decks.length, 1);
  assert.equal(config.decks[0].id, 'arcana');
  assert.deepEqual(T.normalize(config), engine.state);
  assert.throws(
    () =>
      engine.dispatch({
        type: 'deck.import',
        payload: {
          deck: {
            id: 'bad',
            name: 'Bad',
            cards: [{ id: '1', name: 'No', artUrl: 'javascript:alert(1)' }],
          },
        },
      }),
    /Artwork/,
  );
  assert.throws(() => T.validateDeck({ id: 'empty', name: 'Empty', cards: [] }), /1–5,000/);
  assert.throws(
    () =>
      T.validateDeck({
        id: 'dupes',
        name: 'Duplicates',
        cards: [
          { id: '1', name: 'One' },
          { id: '1', name: 'Two' },
        ],
      }),
    /unique/,
  );
});

test('implicit fixtures are seeded shuffled deck cycles and serialize deterministically', () => {
  const state = T.normalize();
  const first = cardsIn(state, 'p1', 'library', 52);
  assert.equal(new Set(first).size, 52);
  assert.deepEqual(first, cardsIn(T.normalize(T.toConfig(state)), 'p1', 'library', 52));
  const engine = T.createEngine(state);
  engine.dispatch({ type: 'session.shuffle' });
  assert.notDeepEqual(cardsIn(engine.state, 'p1', 'library', 52), first);
  assert.equal(T.render(state), T.render(T.normalize(T.toConfig(state))));
});

test('SVG escapes imported content and rejects unsafe artwork protocols', () => {
  const state = T.normalize({
    activeDeckId: 'custom',
    decks: [
      {
        id: 'custom',
        name: '<script>alert(1)</script>',
        cards: [
          {
            id: 'quote',
            name: '<img onerror="bad">',
            artUrl: 'https://example.com/a.png?x="&y=2',
          },
        ],
      },
    ],
  });
  const svg = T.render(state);
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('<img '));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('&quot;&amp;y=2'));
  for (const artUrl of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<script>'])
    assert.throws(() =>
      T.validateDeck({ id: 'bad', name: 'Bad', cards: [{ id: 'bad', name: 'Bad', artUrl }] }),
    );
});

test('zero to a million cards remain bounded in all supported aspect ratios, densities, and player counts', () => {
  const dimensions = [
    [64, 64],
    [512, 512],
    [1080, 1920],
    [1920, 1080],
    [4096, 64],
    [64, 4096],
  ];
  for (const players of [1, 2, 4, 8]) {
    for (const density of ['calm', 'balanced', 'dense']) {
      for (const [width, height] of dimensions) {
        const state = T.normalize({ players, stage: { width, height }, view: { density } });
        for (const count of [0, 1, 7, 1000000]) {
          state.players.forEach((p) =>
            p.zones.forEach((z) => {
              z.count = count;
            }),
          );
          const { svg, metrics } = T.renderDetailed(state);
          assert.equal(metrics.totalCards, count * players * 4);
          assert.ok(metrics.renderedCards <= players * 4 * 24);
          assert.ok(!/NaN|Infinity|undefined/.test(svg));
          assert.ok(svg.startsWith('<svg '));
          assert.ok(svg.includes(`width="${width}" height="${height}"`));
          if (!count) assert.equal(metrics.renderedCards, 0);
        }
      }
    }
  }
});

test('focused layouts and custom zones keep valid geometry with overflow', () => {
  const engine = T.createEngine({
    setup: 'commander',
    view: { mode: 'focus', playerId: 'p1', zoneId: 'command' },
  });
  for (let i = 1; i <= T.limits.maxZones - 5; i++)
    engine.dispatch({
      type: 'zone.add',
      payload: { playerId: 'p1', id: `extra-${i}`, name: `Extra ${i}` },
    });
  assert.throws(() =>
    engine.dispatch({
      type: 'zone.add',
      payload: { playerId: 'p1', id: 'too-many', name: 'Too many' },
    }),
  );
  for (const layout of ['fan', 'grid', 'stack']) {
    engine.dispatch({
      type: 'zone.update',
      payload: { playerId: 'p1', zoneId: 'command', layout, count: 1000000 },
    });
    const result = T.renderDetailed(engine.state);
    assert.ok(result.metrics.renderedCards <= 60);
    assert.ok(!/NaN|Infinity|undefined/.test(result.svg));
    const positions = T.layout.cardsInZone(
      { x: 0, y: 0, w: 880, h: 500 },
      getZone(engine.state, 'p1', 'command').zone,
      'dense',
      true,
    );
    assert.ok(positions.hidden > 0);
    positions.cards.forEach((card) => {
      assert.ok(card.x >= 0 && card.y >= 0);
      assert.ok(card.x + card.w <= 881);
      assert.ok(card.y + card.h <= 501);
    });
  }
});

test('scene registry accepts another renderer without changing the state or layout services', () => {
  T.registerScene('test-scene', (state) => ({
    svg: `<svg width="${state.stage.width}"/>`,
    metrics: { renderedCards: 0 },
  }));
  assert.ok(T.listScenes().includes('test-scene'));
  assert.equal(T.render({ scene: 'test-scene', stage: { width: 700 } }), '<svg width="700"/>');
  assert.throws(() => T.render({ scene: 'missing-scene' }), /not registered/);
});
