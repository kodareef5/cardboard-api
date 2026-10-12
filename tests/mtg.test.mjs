import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import T from '../tabletop.mjs';
import '../design/fixtures.js';

const definitions = JSON.parse(
  await readFile(new URL('../design/fixtures/cards.json', import.meta.url)),
);
const cards = definitions.map(({ id, name }, i) => ({ id, name, art: i % 4 }));
const make = (options = {}) => T.createMtgStudy(cards, { count: 4, ...options });

test('MTG 26 preset has portable defaults, explicit overrides and independent helper results', async () => {
  const preset = T.themePreset('mtg26');
  assert.ok(T.listThemePresets().some((p) => p.id === 'mtg26'));
  preset.stage.width = 64;
  assert.equal(T.themePreset('mtg26').stage.width, 1920);
  const state = T.normalize({ theme: 'mtg26' });
  assert.equal(state.scene, 'mtg');
  assert.equal(state.view.viewerId, 'p1');
  assert.equal(state.view.mtg.background, 'sunrise');
  assert.equal(state.stage.height, 1080);
  assert.equal(state.players.length, 2);
  assert.deepEqual(
    state.players[0].zones.map((z) => z.id),
    ['library', 'battlefield', 'graveyard', 'exile', 'hand', 'command', 'stack'],
  );
  assert.deepEqual(T.normalize(state), state);
  const custom = T.normalize({
    theme: 'mtg26',
    players: 3,
    stage: { width: 1080, height: 1920, texture: true },
    view: {
      mode: 'overview',
      viewerId: null,
      mtg: { background: 'rose', focus: 'combat' },
    },
  });
  assert.equal(custom.stage.width, 1080);
  assert.equal(custom.stage.height, 1920);
  assert.equal(custom.stage.texture, true);
  assert.equal(custom.view.viewerId, null);
  assert.equal(custom.view.mtg.background, 'rose');
  assert.deepEqual(await T.decodeRequest(await T.encodeRequest(custom)), custom);
  assert.equal(T.normalize().scene, 'tabletop');
  for (const theme of ['unknown', 'toString', null, 26])
    assert.throws(() => T.normalize({ theme }), /theme/i);
  for (const mtg of [null, [], 'bad'])
    assert.throws(() => T.normalize({ theme: 'mtg26', view: { mtg } }), /MTG/);
});

test('recipient batches preserve explicit focus while respecting self scope', () => {
  const state = make({ focus: 'graveyard', selectedId: 'p3' });
  for (const { state: next } of T.playerRequests(state)) {
    assert.equal(next.view.playerId, 'p3');
    assert.equal(next.view.mtg.focus, 'graveyard');
  }
  state.view.mode = 'focus';
  state.view.zoneId = 'exile';
  const next = T.forPlayer(state, 'p2');
  assert.equal(next.view.mtg.focus, 'zone');
  assert.equal(next.view.zoneId, 'exile');
  const self = T.forPlayer(make({ focus: 'card', selectedId: 'p3' }), 'p2', {
    scope: 'self',
  });
  assert.ok(!T.render(self).includes('data-player-panel="p3"'));
});

test('card compositions retain bounded geometry, unique SVG IDs, and concealed card privacy', () => {
  for (const format of ['landscape', 'portrait'])
    for (const layout of ['showcase', 'sidecar', 'spotlight']) {
      const state = make({ format, focus: 'card', spells: true });
      state.extras.focus.layout = layout;
      state.extras.focus.target = { playerId: 'p2', zoneId: 'hand', index: 0 };
      state.extras.focus.title = 'SECRET FOCUS TITLE';
      state.extras.focus.caption = 'SECRET FOCUS CAPTION';
      const result = T.renderDetailed(state);
      assert.equal(result.metrics.focusLayout, layout);
      assert.match(result.svg, /data-focus-visibility="backs"/);
      assert.doesNotMatch(result.svg, /SECRET FOCUS|NaN|undefined|Infinity/);
      assert.ok(result.metrics.visibleZoneCards <= result.metrics.totalCards);
      const ids = [...result.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length);
      if (layout !== 'showcase') assert.match(result.svg, /data-base-scene="true"/);
    }
});

test('MTG views fit both video formats for every 2–4 player seat and focus without mutating the scene', () => {
  for (const count of [2, 3, 4])
    for (const format of ['landscape', 'portrait'])
      for (let seat = 1; seat <= count; seat++) {
        for (const focus of [...T.mtg.focuses, 'card']) {
          const state = make({
            count,
            format,
            viewerId: `p${seat}`,
            focus,
            spells: true,
            phase: 'combat',
            crowded: true,
          });
          const before = JSON.stringify(state),
            layout = T.mtg.layout(state),
            result = T.renderDetailed(state);
          assert.doesNotMatch(result.svg, /NaN|undefined|Infinity/);
          assert.equal(JSON.stringify(state), before);
          assert.ok(result.metrics.renderedCards < 250);
          for (const r of [
            ...layout.boards,
            layout.hand,
            layout.detail,
            layout.roster,
            layout.stack,
          ].filter(Boolean)) {
            assert.ok(r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0);
            assert.ok(r.x + r.w <= layout.W + 0.01 && r.y + r.h <= layout.H + 0.01);
          }
          assert.equal(result.metrics.viewerId, `p${seat}`);
          assert.equal(result.metrics.width, format === 'portrait' ? 1080 : 1920);
        }
      }
});

test('MTG audience policy applies to private zone focus, individual card focus, and public overview', () => {
  const state = make({ count: 4 });
  const deck = state.decks.find((d) => d.id === state.activeDeckId);
  for (const p of state.players) {
    for (const id of ['hand', 'library']) {
      const cardId = `${p.id}-secret-${id}`;
      deck.cards.push({
        id: cardId,
        name: cardId,
        artUrl: `https://example.com/${cardId}.png`,
        artMode: 'full-card',
      });
      const zone = p.zones.find((z) => z.id === id);
      zone.count = 1;
      zone.cardIds = [cardId];
      zone.faceDown = false;
    }
  }
  for (const viewerId of [null, 'p1', 'p2', 'p3', 'p4']) {
    for (const subject of state.players)
      for (const focus of ['table', 'hand', 'library', 'card']) {
        const request = structuredClone(state);
        request.view.viewerId = viewerId;
        request.view.mode = viewerId ? 'player' : 'overview';
        request.view.playerId = subject.id;
        request.view.mtg.focus = focus === 'card' ? 'table' : focus;
        if (focus === 'card')
          request.extras.focus = {
            target: { playerId: subject.id, zoneId: 'hand', index: 0 },
            layout: 'sidecar',
          };
        const { svg } = T.renderDetailed(request);
        for (const p of state.players) {
          assert.ok(!svg.includes(`${p.id}-secret-library`));
          if (p.id !== viewerId) assert.ok(!svg.includes(`${p.id}-secret-hand`));
        }
        if (viewerId === subject.id && focus === 'hand')
          assert.ok(svg.includes(`${subject.id}-secret-hand`));
      }
  }
});

test('active player, priority and phase never change the viewing seat or explicit focus', async () => {
  const state = make({ focus: 'graveyard', selectedId: 'p3' }),
    engine = T.createEngine(state);
  for (const phase of T.mtg.phases)
    for (const activePlayerId of ['p1', 'p2', 'p3', 'p4']) {
      engine.dispatch({
        type: 'view.update',
        payload: {
          mtg: {
            ...state.view.mtg,
            phase,
            activePlayerId,
            priorityPlayerId: 'p4',
          },
        },
      });
      assert.equal(engine.state.view.viewerId, 'p1');
      assert.equal(engine.state.view.playerId, 'p3');
      assert.equal(T.renderDetailed(engine.state).metrics.focus, 'graveyard');
    }
  assert.deepEqual(
    await T.decodeRequest(await T.encodeRequest(engine.state)),
    engine.state,
  );
});

test('shared stack order is caller supplied, complete, unique and validated atomically', () => {
  const state = make({ spells: true, focus: 'stack' });
  const before = JSON.stringify(state);
  const rendered = T.render(state);
  assert.ok(
    rendered.indexOf('data-card-id="counterspell"') <
      rendered.indexOf('data-card-id="lightning-bolt"'),
  );
  const engine = T.createEngine(state);
  for (const stack of [
    [],
    [state.view.mtg.stack[0]],
    [state.view.mtg.stack[0], state.view.mtg.stack[0]],
    [{ playerId: 'p1', zoneId: 'hand', index: 0 }, state.view.mtg.stack[1]],
  ]) {
    assert.throws(
      () =>
        engine.dispatch({
          type: 'view.update',
          payload: { mtg: { ...state.view.mtg, stack } },
        }),
      /MTG/,
    );
    assert.equal(JSON.stringify(engine.state), before);
  }
  assert.equal(engine.canUndo, false);
});

test('MTG metadata validates references and escapes caller labels', () => {
  const state = make({ phase: 'combat' });
  for (const edit of [
    { lands: { p1: [1000] } },
    { lands: { missing: [] } },
    { focus: 'random' },
    { activePlayerId: 'missing' },
    { combat: [{}] },
    { turn: -1 },
    { phase: 'random' },
    { background: 'javascript:bad' },
  ])
    assert.throws(
      () =>
        T.normalize({
          ...state,
          view: { ...state.view, mtg: { ...state.view.mtg, ...edit } },
        }),
      /MTG/,
    );
  state.view.mtg.step = '<script>bad</script>';
  const svg = T.render(state);
  assert.match(svg, /&lt;script&gt;bad&lt;\/script&gt;/i);
  assert.ok(!svg.includes('<script>'));
});
