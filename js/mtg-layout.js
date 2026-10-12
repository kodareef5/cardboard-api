(function (global) {
  'use strict';
  const T = global.Tabletop;
  const focuses = [
    'table',
    'self',
    'combat',
    'stack',
    'hand',
    'battlefield',
    'graveyard',
    'exile',
    'library',
    'command',
    'zone',
  ];
  const phases = ['beginning', 'precombat-main', 'combat', 'postcombat-main', 'ending'];
  const phaseNames = ['Beginning', 'Main 1', 'Combat', 'Main 2', 'Ending'];
  const backgrounds = ['none', 'sunrise', 'eclipse', 'rose'];
  const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const fail = (message) => {
    throw new Error(`MTG: ${message}`);
  };
  const key = (ref) => `${ref.playerId}:${ref.zoneId}:${ref.index}`;
  function context(state) {
    return {
      focus:
        state.view.mode === 'focus'
          ? 'zone'
          : state.view.playerScope === 'self'
            ? 'self'
            : 'table',
      background: 'none',
      lands: {},
      combat: [],
      stack: [],
      ...state.view.mtg,
      ...(state.view.mode === 'focus' ? { focus: 'zone' } : {}),
    };
  }
  function reference(state, ref) {
    const player = state.players.find((p) => p.id === ref?.playerId);
    const zone = player?.zones.find((z) => z.id === ref?.zoneId);
    if (
      !object(ref) ||
      !zone ||
      !Number.isInteger(ref.index) ||
      ref.index < 0 ||
      ref.index >= zone.count
    )
      fail('Card references need an existing player, zone, and card index.');
    return { player, zone, index: ref.index };
  }
  function validate(state) {
    if (state.players.length < 2 || state.players.length > 4)
      fail('The MTG layout supports 2–4 players.');
    if (state.view.mtg !== undefined && !object(state.view.mtg))
      fail('view.mtg must be an object.');
    const c = context(state);
    if (!focuses.includes(c.focus)) fail('Unknown focus.');
    if (!backgrounds.includes(c.background)) fail('Unknown background.');
    if (c.phase !== undefined && !phases.includes(c.phase)) fail('Unknown phase.');
    if (c.step !== undefined && (typeof c.step !== 'string' || c.step.length > 50))
      fail('Step must be text up to 50 characters.');
    if (c.turn !== undefined && (!Number.isSafeInteger(c.turn) || c.turn < 1))
      fail('Turn must be a positive integer.');
    for (const field of ['activePlayerId', 'priorityPlayerId'])
      if (c[field] != null && !state.players.some((p) => p.id === c[field]))
        fail(`${field} must identify an existing player.`);
    if (!object(c.lands)) fail('lands must map player IDs to battlefield indices.');
    for (const [playerId, indices] of Object.entries(c.lands)) {
      if (
        !Array.isArray(indices) ||
        indices.length > 1000 ||
        new Set(indices).size !== indices.length
      )
        fail('Land indices must be a unique list of up to 1,000 positions.');
      if (!state.players.some((p) => p.id === playerId)) fail('Land player must exist.');
      indices.forEach((index) =>
        reference(state, { playerId, zoneId: 'battlefield', index }),
      );
    }
    if (!Array.isArray(c.stack) || c.stack.length > 128)
      fail('Stack must be an ordered list of up to 128 references, top first.');
    c.stack.forEach((ref) => {
      const { zone } = reference(state, ref);
      if (zone.id !== 'stack') fail('Stack references must point to stack zones.');
    });
    if (new Set(c.stack.map(key)).size !== c.stack.length)
      fail('Stack references must be unique.');
    const stackCount = state.players.reduce(
      (sum, p) => sum + (p.zones.find((z) => z.id === 'stack')?.count || 0),
      0,
    );
    if (stackCount !== c.stack.length)
      fail('Supply every stack position in its shared resolution order.');
    if (!Array.isArray(c.combat) || c.combat.length > 128)
      fail('Combat must be a list of up to 128 attacks.');
    const attackers = new Set();
    c.combat.forEach((attack) => {
      if (!object(attack)) fail('Each combat entry must be an object.');
      const { zone } = reference(state, attack.attacker);
      if (zone.id !== 'battlefield') fail('Attackers must be on the battlefield.');
      if (attackers.has(key(attack.attacker))) fail('Each attacker must appear once.');
      attackers.add(key(attack.attacker));
      if (!state.players.some((p) => p.id === attack.defenderId))
        fail('Combat defender must exist.');
      if (
        attack.target !== undefined &&
        (typeof attack.target !== 'string' || attack.target.length > 60)
      )
        fail('Combat target label must be text up to 60 characters.');
      if (!Array.isArray(attack.blockers) || attack.blockers.length > 128)
        fail('Blockers must be a list.');
      attack.blockers.forEach((ref) => {
        if (reference(state, ref).zone.id !== 'battlefield')
          fail('Blockers must be on the battlefield.');
      });
    });
  }
  function layout(state) {
    const { width: W, height: H } = T.layout.stageSize(state.stage);
    const portrait = W / H < 1.2;
    const c = context(state);
    const viewer = state.players.find((p) => p.id === state.view.viewerId);
    const selected = state.players.find((p) => p.id === state.view.playerId);
    const owner = viewer || selected;
    const start = state.players.indexOf(owner);
    const ordered = [...state.players.slice(start + 1), ...state.players.slice(0, start)];
    const others = state.view.playerScope === 'self' || c.focus === 'self' ? [] : ordered;
    const rect = (x, y, w, h) => ({ x: x * W, y: y * H, w: w * W, h: h * H });
    const table = ['table', 'self'].includes(c.focus) && !state.extras.focus;
    const boards = [];
    let hero, battlefield, lands, hand, piles, crest, command, detail, roster, stack;
    if (!portrait) {
      hero = rect(0.01, 0.553, 0.226, 0.424);
      battlefield = rect(
        0.125,
        table && others.length ? 0.251 : 0.108,
        0.749,
        table && others.length ? 0.291 : 0.434,
      );
      lands = rect(0.255, 0.559, 0.538, 0.174);
      hand = viewer ? rect(0.244, 0.754, 0.556, 0.225) : null;
      piles = rect(0.812, 0.558, 0.176, 0.417);
      crest = rect(0.015, 0.281, 0.099, 0.256);
      command = rect(0.89, 0.331, 0.098, 0.206);
      if (table)
        others.forEach((player, i) => {
          const count = others.length;
          const r =
            count === 1
              ? rect(0.135, 0.05, 0.73, 0.177)
              : rect(0.025 + (i * 0.95) / count, 0.056, 0.95 / count - 0.012, 0.178);
          boards.push({
            player,
            ...r,
            tilt: count === 1 ? 0 : (i - (count - 1) / 2) * 1.2,
          });
        });
      roster = !table ? rect(0.245, 0.064, 0.741, 0.088) : null;
      detail = !table ? rect(0.248, 0.183, 0.733, 0.57) : null;
      if (!table) hero = rect(0.014, 0.235, 0.217, 0.58);
      if (!table && ['hand', 'zone'].includes(c.focus)) {
        detail = rect(0.26, 0.2, 0.716, 0.737);
        hand = null;
      }
      if (state.extras.focus) {
        detail = rect(0.25, 0.178, 0.73, 0.66);
        hand = null;
      }
    } else {
      hero = rect(0.02, 0.57, 0.258, 0.233);
      lands = rect(0.302, 0.573, 0.67, 0.113);
      hand = viewer ? rect(0.024, 0.825, 0.952, 0.155) : null;
      piles = rect(0.304, 0.707, 0.668, 0.096);
      const top =
        others.length === 3
          ? 0.366
          : others.length === 2
            ? 0.263
            : others.length
              ? 0.216
              : 0.079;
      battlefield = rect(0.025, top, 0.95, 0.554 - top);
      crest = null;
      command = null;
      if (table) {
        if (others.length === 1)
          boards.push({
            player: others[0],
            ...rect(0.055, 0.052, 0.89, 0.137),
            tilt: 0,
          });
        else if (others.length === 2)
          others.forEach((player, i) =>
            boards.push({
              player,
              ...rect(0.027 + i * 0.49, 0.06, 0.46, 0.174),
              tilt: i ? 1.5 : -1.5,
            }),
          );
        else if (others.length >= 3) {
          boards.push({
            player: others[1],
            ...rect(0.15, 0.048, 0.7, 0.12),
            tilt: 0,
          });
          [others[0], others[2]].forEach((player, i) =>
            boards.push({
              player,
              ...rect(0.027 + i * 0.49, 0.182, 0.46, 0.16),
              tilt: i ? 1.5 : -1.5,
            }),
          );
        }
      }
      roster = !table ? rect(0.025, 0.054, 0.95, 0.055) : null;
      detail = !table ? rect(0.025, 0.148, 0.95, 0.635) : null;
      if (!table) hero = null;
      if (!table && ['hand', 'zone'].includes(c.focus)) {
        detail = rect(0.025, 0.164, 0.95, 0.788);
        hand = null;
      }
      if (state.extras.focus) {
        detail = rect(0.025, 0.143, 0.95, 0.808);
        hand = null;
      }
    }
    if (state.extras.focus && state.extras.focus.layout !== 'showcase') {
      hero = null;
      roster = null;
      detail = portrait ? rect(0.025, 0.08, 0.95, 0.87) : rect(0.025, 0.12, 0.95, 0.81);
    }
    if (!viewer && table)
      hand = portrait
        ? rect(0.024, 0.825, 0.952, 0.155)
        : rect(0.244, 0.754, 0.556, 0.225);
    stack =
      c.stack.length && table
        ? rect(
            portrait ? 0.69 : 0.66,
            portrait ? 0.016 : 0.011,
            portrait ? 0.27 : 0.13,
            portrait ? 0.023 : 0.026,
          )
        : null;
    return {
      W,
      H,
      portrait,
      context: c,
      viewer,
      owner,
      selected,
      others,
      boards,
      hand,
      detail,
      roster,
      hero,
      battlefield,
      lands,
      piles,
      crest,
      command,
      stack,
      table,
    };
  }
  T.validateMtg = validate;
  T.mtg = {
    context,
    reference,
    key,
    layout,
    focuses,
    phases,
    phaseNames,
    backgrounds,
  };
})(globalThis);
