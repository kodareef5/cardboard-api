(function (global) {
  'use strict';
  const T = global.Tabletop;
  const zone = (id, name, ids, count = ids.length, visibility = 'public') => ({
    id,
    name,
    count,
    cardIds: ids,
    layout: ['library', 'graveyard', 'exile'].includes(id) ? 'stack' : 'grid',
    visibility,
    faceDown: visibility === 'hidden',
  });
  function create(cards, options = {}) {
    const {
      count = 2,
      viewerId = 'p1',
      activePlayerId = 'p2',
      priorityPlayerId = 'p1',
      format = 'landscape',
      focus = 'table',
      selectedId = viewerId || 'p1',
      phase = 'precombat-main',
      background = 'sunrise',
      spells = false,
      crowded = false,
      assetBase = '',
    } = options;
    const names = ['Rowan', 'Mira', 'Sol', 'Iris'];
    const colors = ['#d6bc87', '#d8a2b4', '#98b7a2', '#a7b4d4'];
    const creatures = [
      ['llanowar-elves', 'grizzly-bears', 'serra-angel'],
      ['shivan-dragon', 'grizzly-bears', 'llanowar-elves'],
      ['serra-angel', 'serra-angel', 'grizzly-bears'],
      ['grizzly-bears', 'llanowar-elves', 'shivan-dragon'],
    ];
    const lands = [
      ['forest', 'forest', 'forest', 'plains', 'plains'],
      ['mountain', 'mountain', 'forest', 'forest', 'forest'],
      ['plains', 'plains', 'plains', 'island', 'island'],
      ['island', 'island', 'mountain', 'forest', 'forest'],
    ];
    const state = {
      theme: 'mtg26',
      stage: {
        width: format === 'portrait' ? 1080 : 1920,
        height: format === 'portrait' ? 1920 : 1080,
        theme: 'evergreen',
        texture: false,
      },
      activeDeckId: 'mtg-study',
      decks: [{ id: 'mtg-study', name: 'MTG layout study', cards }],
      view: {
        mode: viewerId ? 'player' : 'overview',
        viewerId,
        playerId: selectedId,
        zoneId: 'battlefield',
        stats: 'full',
        mtg: {
          focus: focus === 'card' ? 'table' : focus,
          background,
          turn: 6,
          activePlayerId,
          priorityPlayerId,
          phase,
          step: phase === 'combat' ? 'Declare blockers' : '',
          lands: {},
          stack: [],
          combat: [],
        },
      },
      players: [],
      extras: { cards: [], highlights: [] },
    };
    for (let i = 0; i < count; i++) {
      const id = `p${i + 1}`,
        board = [
          ...creatures[i],
          ...(crowded ? [...creatures[i], ...creatures[i]] : []),
          ...lands[i],
        ];
      const hand = [
        'counterspell',
        'giant-growth',
        'serra-angel',
        'lightning-bolt',
        'forest',
        'swords-to-plowshares',
        'island',
      ];
      const hasSpell = spells && i < 2;
      if (hasSpell) hand.shift();
      state.players.push({
        id,
        name: names[i],
        color: colors[i],
        stats: { life: [18, 16, 20, 14][i] },
        counters: [
          { name: 'Life', count: [18, 16, 20, 14][i] },
          { name: 'Mana', count: [3, 2, 4, 1][i] },
          { name: 'Energy', count: [2, 0, 1, 3][i] },
          { name: 'Poison', count: 0 },
        ],
        ...(assetBase && i < 2
          ? {
              avatarUrl: new URL(
                `avatars/guardian-${i === 0 ? 'sunrise' : 'rose'}.png`,
                assetBase,
              ).href,
            }
          : {}),
        zones: [
          zone('library', 'Library', [], Math.max(0, 60 - board.length - 11), 'hidden'),
          zone('battlefield', 'Battlefield', board),
          zone('graveyard', 'Graveyard', [
            'giant-growth',
            'lightning-bolt',
            'grizzly-bears',
          ]),
          zone('exile', 'Exile', ['swords-to-plowshares']),
          zone('hand', 'Hand', hand, hand.length, 'owner'),
          zone('command', 'Command', []),
          zone(
            'stack',
            'Stack',
            hasSpell ? [i === 0 ? 'counterspell' : 'lightning-bolt'] : [],
          ),
        ],
      });
      state.view.mtg.lands[id] = lands[i].map(
        (_, j) => board.length - lands[i].length + j,
      );
      for (const index of [board.length - 1, board.length - 2])
        state.extras.cards.push({
          target: { playerId: id, zoneId: 'battlefield', index },
          tapped: true,
        });
    }
    if (spells)
      state.view.mtg.stack = [
        { playerId: 'p1', zoneId: 'stack', index: 0 },
        { playerId: 'p2', zoneId: 'stack', index: 0 },
      ];
    if (phase === 'combat') {
      const attacking = activePlayerId || 'p2';
      const defending = attacking === 'p1' ? 'p2' : 'p1';
      state.view.mtg.combat = [
        {
          attacker: { playerId: attacking, zoneId: 'battlefield', index: 1 },
          defenderId: defending,
          blockers: [{ playerId: defending, zoneId: 'battlefield', index: 2 }],
        },
        {
          attacker: { playerId: attacking, zoneId: 'battlefield', index: 0 },
          defenderId:
            count > 2 ? `p${attacking === 'p3' ? (4 <= count ? 4 : 1) : 3}` : defending,
          blockers: [],
        },
      ];
    }
    if (focus === 'card')
      state.extras.focus = {
        target: { playerId: selectedId, zoneId: 'battlefield', index: 0 },
        layout: 'sidecar',
        preset: 'halo',
      };
    return T.normalize(state);
  }
  T.createMtgStudy = create;
})(globalThis);
