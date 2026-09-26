import test from 'node:test';
import assert from 'node:assert/strict';
import T, { avatarSVG } from '../tabletop.mjs';

test('avatar URLs survive scene links, snapshots, player requests, and undo/redo', async () => {
  const engine = T.createEngine();
  const before = engine.state;
  const avatarUrl = 'https://images.example/avatar.png?name=Zoë&size=512';
  engine.dispatch({ type: 'player.update', payload: { playerId: 'p1', avatarUrl } });
  const state = engine.state;
  assert.equal(state.players[0].avatarUrl, avatarUrl);
  assert.deepEqual(T.normalize(T.toConfig(state)), state);
  for (const compress of [false, true])
    assert.deepEqual(await T.decodeRequest(await T.encodeRequest(state, { compress })), state);
  for (const request of T.playerRequests(state, { scope: 'both' }))
    assert.equal(request.state.players[0].avatarUrl, avatarUrl);
  engine.undo();
  assert.deepEqual(engine.state, before);
  engine.redo();
  assert.deepEqual(engine.state, state);
  for (const empty of ['', null]) {
    engine.dispatch({ type: 'player.update', payload: { playerId: 'p1', avatarUrl: empty } });
    assert.equal(engine.state.players[0].avatarUrl, undefined);
    engine.undo();
    assert.deepEqual(engine.state, state);
  }
});

test('unsafe or malformed avatar URLs fail atomically in the engine and standalone helper', () => {
  const engine = T.createEngine();
  const before = engine.state;
  for (const avatarUrl of [
    'javascript:alert(1)', 'file:///tmp/avatar.png', 'data:text/html,bad',
    'data:image/svg+xml,<svg onload="alert(1)"/>', '/relative.jpg', {}, [], false, 123,
  ]) {
    assert.throws(() => engine.dispatch({
      type: 'player.update', payload: { playerId: 'p1', avatarUrl },
    }), /Avatar URL/);
    assert.throws(() => avatarSVG({ avatarUrl }), /Avatar URL/);
    assert.deepEqual(engine.state, before);
  }
  assert.equal(engine.canUndo, false);
  for (const size of [0, -1, 1.5, '512', NaN, Infinity, 4097])
    assert.throws(() => avatarSVG({}, { size }), /Avatar size/);
  assert.throws(() => avatarSVG({ color: 'red" onload="bad' }), /Player color/);
});

test('square avatars cover from the center and keep escaped, readable initials behind the image', () => {
  const player = {
    id: 'player"<&', name: 'Alice <&>', color: '#ffffff',
    avatarUrl: 'https://images.example/portrait.png?q="&x=<tag>',
  };
  for (const size of [16, 24, 32, 64, 128, 256, 512]) {
    const svg = avatarSVG(player, { size });
    assert.match(svg, new RegExp(`width="${size}" height="${size}" viewBox="0 0 100 100"`));
    assert.match(svg, /overflow="hidden"/);
    assert.match(svg, /preserveAspectRatio="xMidYMid slice"/);
    assert.match(svg, /data-avatar-fallback="initials"/);
    assert.match(svg, />A&lt;<\/text>/);
    assert.match(svg, /fill="#17382f"/);
    assert.ok(!svg.includes('<tag>') && !svg.includes('player"<&'));
  }
  assert.match(avatarSVG({ name: 'Élodie 王', color: '#000000' }), />É王<\/text>/);
  assert.match(avatarSVG({ name: 'Solo' }), />S<\/text>/);
  assert.match(avatarSVG({ name: 'Player 02' }), />P2<\/text>/);
  assert.match(avatarSVG(), /width="512" height="512"/);
  assert.ok(!avatarSVG().includes('<image'));
  assert.equal(avatarSVG(player), avatarSVG(player));
});

test('table, zone focus, and recipient scenes render only avatars of the displayed players', () => {
  const state = T.normalize({ players: 8 });
  state.players.forEach((player, i) => { player.avatarUrl = `https://images.example/${i}.png`; });
  const before = structuredClone(state);
  for (const [width, height] of [[512, 512], [256, 256], [1080, 1920], [1920, 1080]]) {
    state.stage = { ...state.stage, width, height };
    const overview = T.render(state);
    assert.equal((overview.match(/data-avatar-image=/g) || []).length, 8);
    const table = T.renderPlayer(state, 'p3', { scope: 'table' });
    assert.equal((table.match(/data-avatar-image=/g) || []).length, 8);
    const self = T.renderPlayer(state, 'p3', { scope: 'self' });
    assert.equal((self.match(/data-avatar-image=/g) || []).length, 1);
    assert.ok(self.includes(state.players[2].avatarUrl));
    assert.ok(!self.includes(state.players[0].avatarUrl));
    assert.doesNotMatch(self, /NaN|undefined/);
  }
  const focus = T.render({ ...before, view: { mode: 'focus', playerId: 'p2', zoneId: 'hand' } });
  assert.equal((focus.match(/data-avatar-image=/g) || []).length, 1);
  assert.ok(focus.includes(before.players[1].avatarUrl));
  assert.deepEqual(state.players, before.players);
});
