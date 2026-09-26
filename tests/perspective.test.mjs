import test from 'node:test';
import assert from 'node:assert/strict';
import T from '../tabletop.mjs';

function fixture(count = 2) {
  const state = T.normalize({
    players: count,
    activeDeckId: 'private-test',
    decks: [
      {
        id: 'private-test',
        name: 'Audience test',
        cards: Array.from({ length: count }, (_, i) => [
          {
            id: `hand-${i + 1}`,
            name: `Secret hand ${i + 1}`,
            artUrl: `https://art.example/secret-hand-${i + 1}.png`,
          },
          {
            id: `board-${i + 1}`,
            name: `Public board ${i + 1}`,
            artUrl: `https://art.example/public-board-${i + 1}.png`,
          },
          {
            id: `library-${i + 1}`,
            name: `Secret deck ${i + 1}`,
            artUrl: `https://art.example/secret-deck-${i + 1}.png`,
          },
        ]).flat(),
      },
    ],
  });
  state.players.forEach((player, i) =>
    player.zones.forEach((zone) => {
      const id = {
        hand: `hand-${i + 1}`,
        battlefield: `board-${i + 1}`,
        library: `library-${i + 1}`,
      }[zone.id];
      zone.count = id ? 1 : 0;
      zone.cardIds = id ? [id] : [];
      zone.faceDown = false; // Audience policy must conceal information even when the operator shows it.
    }),
  );
  return state;
}

test('existing scenes gain owner-only hands, public boards, and concealed libraries', () => {
  const old = T.normalize({ players: 4 });
  delete old.view.viewerId;
  delete old.view.playerScope;
  old.players.forEach((p) => p.zones.forEach((z) => delete z.visibility));
  const state = T.normalize(old);
  assert.equal(state.view.viewerId, null);
  for (const player of state.players) {
    assert.equal(player.zones.find((z) => z.id === 'hand').visibility, 'owner');
    assert.equal(player.zones.find((z) => z.id === 'battlefield').visibility, 'public');
    assert.equal(player.zones.find((z) => z.id === 'library').visibility, 'hidden');
  }
  assert.deepEqual(T.normalize(T.toConfig(state)), state);
});

test('every whole-table image shows only the recipient hand and all public boards', () => {
  const state = fixture(8),
    before = JSON.stringify(state);
  for (const player of state.players) {
    const svg = T.renderPlayer(state, player.id, { scope: 'table' });
    const index = state.players.indexOf(player) + 1;
    assert.ok(svg.includes(`secret-hand-${index}.png`));
    for (let i = 1; i <= 8; i++) {
      assert.ok(svg.includes(`public-board-${i}.png`), `missing player ${i} public board`);
      assert.ok(!svg.includes(`secret-deck-${i}.png`));
      if (i !== index) {
        assert.ok(!svg.includes(`secret-hand-${i}.png`));
        assert.ok(!svg.includes(`Secret hand ${i}`));
      }
    }
  }
  assert.equal(JSON.stringify(state), before);
});

test('self images contain the recipient board and hand and omit every other player panel', () => {
  const state = fixture(4);
  for (let i = 1; i <= 4; i++) {
    const svg = T.renderPlayer(state, `p${i}`, { scope: 'self' });
    assert.ok(svg.includes(`secret-hand-${i}.png`));
    assert.ok(svg.includes(`public-board-${i}.png`));
    assert.equal((svg.match(/data-player-panel=/g) || []).length, 1);
    for (let other = 1; other <= 4; other++)
      if (other !== i) {
        assert.ok(!svg.includes(`data-player="p${other}"`));
        assert.ok(!svg.includes(`public-board-${other}.png`));
        assert.ok(!svg.includes(`secret-hand-${other}.png`));
      }
  }
});

test('owner-only and concealed boards follow the same rules as hands', () => {
  const state = fixture();
  const board = state.players[1].zones.find((z) => z.id === 'battlefield');
  board.visibility = 'owner';
  assert.ok(!T.renderPlayer(state, 'p1').includes('public-board-2.png'));
  assert.ok(T.renderPlayer(state, 'p2').includes('public-board-2.png'));
  board.visibility = 'hidden';
  assert.ok(!T.renderPlayer(state, 'p2').includes('public-board-2.png'));
  state.players[1].zones.find((z) => z.id === 'hand').visibility = 'public';
  assert.ok(T.renderPlayer(state, 'p1').includes('secret-hand-2.png'));
});

test('focusing or selecting an opponent never changes the viewing player', () => {
  const engine = T.createEngine(T.forPlayer(fixture(), 'p1'));
  engine.dispatch({
    type: 'view.update',
    payload: { mode: 'focus', playerId: 'p2', zoneId: 'hand' },
  });
  assert.equal(engine.state.view.viewerId, 'p1');
  assert.ok(!T.render(engine.state).includes('secret-hand-2.png'));
  engine.dispatch({ type: 'view.update', payload: { playerId: 'p1', zoneId: 'hand' } });
  assert.ok(T.render(engine.state).includes('secret-hand-1.png'));
  engine.dispatch({ type: 'view.update', payload: { mode: 'overview' } });
  assert.equal(engine.state.view.viewerId, null);
});

test('batch rendering emits both versions from one unmodified state with unique filenames', () => {
  const state = fixture(3),
    before = JSON.stringify(state);
  state.players.forEach((p) => {
    p.name = '../Same name';
  });
  const modified = JSON.stringify(state);
  const files = T.renderPlayers(state, { scope: 'both' });
  assert.equal(files.length, 6);
  assert.equal(new Set(files.map((file) => file.filename)).size, 6);
  for (const file of files) {
    assert.ok(!file.filename.includes('..'));
    assert.ok(!file.filename.includes('/'));
    assert.equal(file.svg, T.renderPlayer(state, file.playerId, { scope: file.scope }));
    assert.equal(file.metrics.viewerId, file.playerId);
  }
  assert.equal(JSON.stringify(state), modified);
  assert.notEqual(modified, before);
});

test('invalid audiences, visibility rules, and single-image scopes fail without changing state', () => {
  const engine = T.createEngine(fixture()),
    before = engine.state;
  assert.throws(() => T.forPlayer(before, 'missing'), /viewing player/);
  assert.throws(() => T.forPlayer(before, 'p1', { scope: 'both' }), /scope/);
  assert.throws(() => T.renderPlayers(before, { scope: 'invalid' }), /scope/);
  assert.throws(() => engine.dispatch({ type: 'view.update', payload: { viewerId: 'missing' } }));
  assert.throws(() =>
    engine.dispatch({
      type: 'zone.update',
      payload: { playerId: 'p1', zoneId: 'hand', visibility: 'sometimes' },
    }),
  );
  assert.deepEqual(engine.state, before);
  assert.equal(engine.canUndo, false);
});

test('recipient removal repairs the audience and visibility edits participate in history', () => {
  const engine = T.createEngine(T.forPlayer(fixture(4), 'p4'));
  engine.dispatch({ type: 'player.count', payload: { count: 1 } });
  assert.equal(engine.state.view.viewerId, 'p1');
  engine.undo();
  assert.equal(engine.state.view.viewerId, 'p4');
  engine.dispatch({
    type: 'zone.update',
    payload: { playerId: 'p4', zoneId: 'hand', visibility: 'hidden' },
  });
  assert.ok(!T.render(engine.state).includes('secret-hand-4.png'));
  engine.undo();
  assert.ok(T.render(engine.state).includes('secret-hand-4.png'));
});

test('player images keep bounded, finite layouts for all framings, counts, and aspect ratios', () => {
  for (const players of [1, 2, 4, 8])
    for (const scope of ['self', 'table'])
      for (const [width, height] of [
        [64, 64],
        [512, 512],
        [1080, 1920],
        [1920, 1080],
        [64, 4096],
        [4096, 64],
      ]) {
        const state = T.normalize({ players, stage: { width, height } });
        state.players.forEach((p) =>
          p.zones.forEach((z) => {
            z.count = 1000000;
          }),
        );
        const result = T.renderDetailed(T.forPlayer(state, `p${players}`, { scope }));
        assert.ok(!/NaN|Infinity|undefined/.test(result.svg));
        assert.ok(result.metrics.renderedCards <= 4 * 60 + (players - 1) * 4 * 24);
        const { width: w, height: h } = T.layout.stageSize(state.stage);
        const panels = T.layout.perspectivePanels(
          T.forPlayer(state, `p${players}`, { scope }),
          w,
          h,
        );
        for (const panel of panels) {
          assert.ok(panel.w > 0 && panel.h > 0);
          assert.ok(panel.x >= 0 && panel.x + panel.w <= w + 0.01);
          assert.ok(panel.y >= 0 && panel.y + panel.h <= h + 0.01);
        }
      }
});
