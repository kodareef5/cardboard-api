(function (global) {
  'use strict';
  const T = global.Tabletop;
  const catalog = [
    {
      id: 'mtg-commander',
      name: 'Commander table',
      game: 'Magic: The Gathering',
      description:
        'Life, poison, energy, commander damage, tokens, tapped cards, and special zones.',
    },
    {
      id: 'mtg-stack',
      name: 'Spell on the stack',
      game: 'Magic: The Gathering',
      description: 'A featured spell beside the scene, with custom card counters and a glow.',
    },
    {
      id: 'pokemon-battle',
      name: 'Active & bench',
      game: 'Pokémon',
      description:
        'HP, damage, attached energy, status tags, prizes, and an active-card showcase.',
    },
    {
      id: 'yugioh-duel',
      name: 'Duel spotlight',
      game: 'Yu-Gi-Oh!',
      description:
        'Life points, ATK/DEF, counters, defense position, Extra Deck, and extra monster zones.',
    },
    {
      id: 'poker-showdown',
      name: 'Showdown',
      game: 'Playing cards',
      description: 'Hole cards, community cards, chips, a pot, and several highlighted cards.',
    },
    {
      id: 'counter-limits',
      name: 'Number extremes',
      game: 'Counter laboratory',
      description:
        '99 through 99,999,999, infinity, negative life, and an exact 30-digit total.',
    },
    {
      id: 'glow-library',
      name: 'All six glows',
      game: 'Effect library',
      description: 'Compare the reusable effects side by side.',
    },
  ];
  const counter = (name, count, extra = {}) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    count,
    ...extra,
  });
  const zone = (id, name, count, layout = 'grid', visibility = 'public', cardIds = []) => ({
    id,
    name,
    count,
    layout,
    visibility,
    faceDown: visibility !== 'public',
    cardIds,
  });
  const target = (zoneId, index = 0, playerId = 'p1') => ({ playerId, zoneId, index });
  function illustrated(state, name, names) {
    state.activeDeckId = 'fixture';
    state.decks = [
      {
        id: 'fixture',
        name,
        cards: names.map((name, i) => ({ id: `demo-${i}`, name, art: i % 4 })),
      },
    ];
  }
  function example(id) {
    if (!catalog.some((item) => item.id === id)) throw new Error('Unknown example.');
    const state = T.normalize({
      players: 1,
      stage: { width: 1024, height: 1024, theme: 'midnight' },
      view: { stats: 'full' },
    });
    const player = state.players[0];
    player.name = 'Alex';
    if (id.startsWith('mtg-')) {
      const base = T.normalize({
        setup: 'commander',
        players: id === 'mtg-stack' ? 2 : 4,
        stage: { width: 1280, height: 960 },
        view: {
          mode: 'player',
          viewerId: 'p1',
          playerId: 'p1',
          stats: 'full',
          density: 'balanced',
        },
      });
      Object.assign(state, base);
      illustrated(state, 'Commander · visual fixture', [
        'Verdant Commander',
        'Growing Creature',
        'Forest',
        'Shield Artifact',
        'Aura',
        'Spell on the Stack',
        'Creature Token',
      ]);
      state.players.forEach((p, i) => {
        p.name = ['Alex', 'Blair', 'Casey', 'Drew'][i];
        p.counters = [
          counter('Life', 40 - i * 3),
          counter('Poison', i ? 0 : 3),
          counter('Energy', i ? 0 : 4),
          counter('Experience', i ? 0 : 2),
          ...state.players
            .filter((other) => other.id !== p.id)
            .map((other) => counter(`Cmdr dmg · ${other.id}`, other.id === 'p2' ? 9 : 0)),
        ];
        p.zones = [
          zone('library', 'Library', 77, 'stack', 'hidden'),
          zone('battlefield', 'Battlefield', 6, 'grid', 'public', [
            'demo-1',
            'demo-2',
            'demo-3',
            'demo-4',
            'demo-6',
            'demo-2',
          ]),
          zone('graveyard', 'Graveyard', 7, 'stack'),
          zone('hand', 'Hand', 7, 'fan', 'owner'),
          zone('command', 'Command', 1, 'grid', 'public', ['demo-0']),
          zone('exile', 'Exile', 1, 'stack'),
          zone('stack', 'Stack', 1, 'grid', 'public', ['demo-5']),
        ];
      });
      state.extras = {
        highlights: [
          { target: target('battlefield'), preset: 'toxic' },
          { target: target('command'), preset: 'arcane' },
          { target: target('stack'), preset: 'neon' },
        ],
        focus:
          id === 'mtg-stack'
            ? {
                target: target('stack'),
                layout: 'sidecar',
                preset: 'arcane',
                title: 'A spell on the stack',
                caption: 'The caller supplies priority and targets.',
              }
            : null,
        cards: [
          {
            target: target('battlefield'),
            badge: '5 / 5',
            tags: ['Trample'],
            counters: [counter('+1/+1', 2), counter('Shield', 1)],
          },
          { target: target('battlefield', 1), tapped: true, tags: ['Land'] },
          { target: target('battlefield', 3), tags: ['Attached to creature'] },
          { target: target('battlefield', 4), badge: '1 / 1', tags: ['Token', 'Flying'] },
          {
            target: target('command'),
            counters: [counter('Times cast', 2), counter('Commander tax', 4)],
          },
          {
            target: target('stack'),
            tags: ['Target selected'],
            counters: [counter('Mana value', 5)],
          },
        ],
      };
    } else if (id === 'pokemon-battle') {
      illustrated(state, 'Pokémon · visual fixture', [
        'Active Partner',
        'Bench Partner',
        'Energy',
        'Trainer',
        'Stadium',
      ]);
      state.players = T.normalize({ players: 2 }).players;
      state.players.forEach((p, i) => {
        p.name = ['Alex', 'Blair'][i];
        p.counters = [counter('Prizes remaining', i ? 4 : 3), counter('Turn', 6)];
        p.zones = [
          zone('active', 'Active', 1, 'grid', 'public', ['demo-0']),
          zone('bench', 'Bench', 3, 'grid', 'public', ['demo-1', 'demo-1', 'demo-1']),
          zone('prizes', 'Prize cards', i ? 4 : 3, 'grid', 'hidden'),
          zone('hand', 'Hand', 5, 'fan', 'owner'),
          zone('library', 'Deck', 34, 'stack', 'hidden'),
          zone('graveyard', 'Discard', 13, 'stack'),
          zone('stadium', 'Stadium', 1, 'grid', 'public', ['demo-4']),
        ];
      });
      state.stage.theme = 'parchment';
      state.extras = {
        highlights: [{ target: target('active'), preset: 'frost' }],
        focus: {
          target: target('active'),
          layout: 'showcase',
          preset: 'frost',
          caption: 'Original demo artwork · replace with your card URL.',
        },
        cards: [
          {
            target: target('active'),
            badge: 'HP 220',
            tags: ['Poisoned'],
            counters: [
              counter('HP', 220),
              counter('Damage', 70),
              counter('Energy attached', 3),
              counter('Tools attached', 1),
            ],
          },
        ],
      };
    } else if (id === 'yugioh-duel') {
      illustrated(state, 'Yu-Gi-Oh! · visual fixture', [
        'Featured Monster',
        'Defending Monster',
        'Spell',
        'Trap',
        'Extra Monster',
      ]);
      state.players = T.normalize({ players: 2 }).players;
      state.players.forEach((p, i) => {
        p.name = ['Alex', 'Blair'][i];
        p.counters = [counter('Life points', i ? 6400 : 8000), counter('Turn', 4)];
        p.zones = [
          zone('monsters', 'Main monsters', 3, 'grid', 'public', [
            'demo-0',
            'demo-1',
            'demo-0',
          ]),
          zone('spells', 'Spell & Trap', 2, 'grid', 'public', ['demo-2', 'demo-3']),
          zone('extra-monsters', 'Extra monsters', 1, 'grid', 'public', ['demo-4']),
          zone('field', 'Field spell', 0),
          zone('hand', 'Hand', 4, 'fan', 'owner'),
          zone('library', 'Deck', 29, 'stack', 'hidden'),
          zone('extra-deck', 'Extra Deck', 12, 'stack', 'hidden'),
          zone('graveyard', 'Graveyard', 5, 'stack'),
          zone('banished', 'Banished', 2, 'stack'),
        ];
      });
      state.extras = {
        highlights: [{ target: target('monsters'), preset: 'ember' }],
        focus: { target: target('monsters'), layout: 'spotlight', preset: 'ember' },
        cards: [
          {
            target: target('monsters'),
            tags: ['Attack position'],
            counters: [
              counter('ATK', 2500),
              counter('DEF', 2100),
              counter('Spell counters', 3),
              counter('Materials', 2),
            ],
          },
          { target: target('monsters', 1), rotation: 90, tags: ['Defense position'] },
          { target: target('spells', 1), faceDown: true },
        ],
      };
    } else if (id === 'poker-showdown') {
      state.stage = { width: 1280, height: 720, theme: 'evergreen', texture: true };
      player.counters = [
        counter('Chips', 99999999, { format: 'compact' }),
        counter('Pot', 125000),
        counter('Bet', 2500),
      ];
      player.zones = [
        zone('hand', 'Hole cards', 2, 'fan', 'owner', ['A-spades', 'K-spades']),
        zone('board', 'Community cards', 5, 'grid', 'public', [
          'Q-spades',
          'J-spades',
          '10-spades',
          '2-hearts',
          '7-clubs',
        ]),
        zone('library', 'Deck', 42, 'stack', 'hidden'),
        zone('burn', 'Burn cards', 3, 'stack', 'hidden'),
      ];
      state.view.mode = 'player';
      state.view.viewerId = 'p1';
      state.extras.highlights = [0, 1, 2].map((index) => ({
        target: target('board', index),
        preset: 'halo',
      }));
      state.extras.highlights.push({
        target: { playerId: 'p1', zoneId: 'hand' },
        preset: 'halo',
      });
    } else if (id === 'counter-limits') {
      state.stage.theme = 'parchment';
      player.name = 'Every digit matters';
      player.counters = [
        99,
        100,
        999,
        9999,
        99999999,
        'infinity',
        -5,
        '123456789012345678901234567890',
      ].map((count, i) =>
        counter(
          [
            'Life · 99',
            'Life · 100',
            'Life · 999',
            'Life · 9999',
            'Life · 99999999',
            'Infinity',
            'Negative total',
            'Beyond safe integers',
          ][i],
          count,
        ),
      );
    } else {
      state.stage = { width: 1440, height: 810, theme: 'midnight', texture: true };
      player.name = 'Glow library';
      player.zones = [
        zone('display', 'Reusable effects', 6, 'grid', 'public', [
          'A-spades',
          'K-hearts',
          'Q-clubs',
          'J-diamonds',
          '10-spades',
          '9-hearts',
        ]),
      ];
      state.view.mode = 'focus';
      state.view.zoneId = 'display';
      state.extras.highlights = T.listGlowEffects().map((effect, index) => ({
        target: target('display', index),
        preset: effect.id,
      }));
      state.extras.cards = T.listGlowEffects().map((effect, index) => ({
        target: target('display', index),
        tags: [effect.name],
      }));
    }
    return T.normalize(state);
  }
  Object.assign(T, { listExamples: () => T.clone(catalog), example });
})(globalThis);
