(function (global) {
  'use strict';

  const T = (global.Tabletop = global.Tabletop || {});
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const MAX_CARDS = 1000000;
  const COLORS = [
    '#e2b878',
    '#91b9af',
    '#c49dd1',
    '#92a9da',
    '#df9a85',
    '#b8c988',
    '#d6a8bc',
    '#83b9ca',
  ];
  const THEME_PRESETS = {
    mtg26: {
      name: 'MTG 26',
      description:
        'A cinematic Magic table with player portraits, gold frames, and perspective layouts.',
      config: {
        scene: 'mtg',
        stage: { width: 1920, height: 1080, theme: 'evergreen', texture: false },
        view: { mode: 'player', mtg: { background: 'sunrise' } },
      },
    },
  };
  const THEMES = {
    evergreen: {
      name: 'Evergreen',
      background: '#123c34',
      surface: '#17473d',
      border: '#3c6254',
      ink: '#efe7d2',
      muted: '#93aa99',
      accent: '#dbb87b',
      back: '#b96d4d',
      light: false,
    },
    midnight: {
      name: 'Midnight',
      background: '#1b2437',
      surface: '#222f45',
      border: '#44516b',
      ink: '#eee9dc',
      muted: '#98a7be',
      accent: '#a8baf0',
      back: '#506996',
      light: false,
    },
    parchment: {
      name: 'Parchment',
      background: '#e7dfcc',
      surface: '#ded4bc',
      border: '#bfb39a',
      ink: '#4d4939',
      muted: '#82775f',
      accent: '#96633e',
      back: '#8b7960',
      light: true,
    },
    plum: {
      name: 'After hours',
      background: '#362b3c',
      surface: '#423249',
      border: '#67516a',
      ink: '#f0e0dc',
      muted: '#b69dac',
      accent: '#dea893',
      back: '#956a87',
      light: false,
    },
  };
  const suitNames = {
    spades: 'Spades',
    hearts: 'Hearts',
    clubs: 'Clubs',
    diamonds: 'Diamonds',
  };
  const standard = {
    id: 'standard',
    name: 'Standard playing cards',
    cards: Object.keys(suitNames).flatMap((suit) =>
      ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((rank) => ({
        id: `${rank}-${suit}`,
        name: `${rank} of ${suitNames[suit]}`,
        rank,
        suit,
      })),
    ),
  };
  const arcanaNames = [
    'The Sun',
    'The Moon',
    'The Mountain',
    'The Wanderer',
    'The Garden',
    'The Tower',
    'The Star',
    'The Ocean',
    'The Oracle',
    'The Gate',
    'The Forest',
    'The Flame',
  ];
  const arcana = {
    id: 'arcana',
    name: 'Arcana · original demo',
    cards: arcanaNames.map((name, i) => ({
      id: `arcana-${i + 1}`,
      name,
      rank: String(i + 1).padStart(2, '0'),
      suit: '',
      art: i % 4,
    })),
  };

  function fail(message) {
    throw new Error(message);
  }
  function integer(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max)
      fail(`${label} must be a whole number from ${min} to ${max.toLocaleString('en-US')}.`);
  }
  function str(value, label, max = 100) {
    if (typeof value !== 'string' || !value.trim() || value.length > max)
      fail(`${label} must contain 1–${max} characters.`);
  }
  function unique(items, label) {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      fail(`${label} must have unique IDs.`);
  }
  function validArt(url) {
    if (!url) return true;
    if (typeof url !== 'string') return false;
    if (/^data:image\/(png|jpeg|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(url)) return true;
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  }
  function validateAvatar(player) {
    if (!player || typeof player !== 'object' || Array.isArray(player))
      fail('An avatar needs a player object.');
    if (player.name !== undefined) str(player.name, 'Player name', 40);
    if (player.color !== undefined && !/^#[a-f0-9]{6}$/i.test(player.color))
      fail('Player color must be a six-digit hex color.');
    if (
      player.avatarUrl != null &&
      (typeof player.avatarUrl !== 'string' || !validArt(player.avatarUrl))
    )
      fail('Avatar URL must be HTTP(S) or a base64 PNG, JPEG, WebP, GIF, or AVIF image.');
    return player;
  }
  const scryfallID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function normalizeCard(input) {
    if (typeof input === 'string' && scryfallID.test(input)) input = { scryfallId: input };
    const card = clone(input);
    if (card?.scryfallId !== undefined) {
      if (typeof card.scryfallId !== 'string' || !scryfallID.test(card.scryfallId))
        fail('Scryfall ID must be a card UUID, such as 683a5707-cddb-494d-9b41-51b4584ded69.');
      card.scryfallId = card.scryfallId.toLowerCase();
      card.face ??= 'front';
      card.id ??= card.scryfallId + (card.face === 'back' ? '-back' : '');
      card.name ??= 'Scryfall card';
    }
    return card;
  }
  function normalizeDeck(input) {
    const deck = clone(input);
    if (Array.isArray(deck.cards)) deck.cards = deck.cards.map(normalizeCard);
    return validateDeck(deck);
  }
  function validateDeck(deck) {
    str(deck.id, 'Deck ID', 80);
    str(deck.name, 'Deck name');
    if (!Array.isArray(deck.cards) || !deck.cards.length || deck.cards.length > 5000)
      fail('A deck needs 1–5,000 card definitions.');
    unique(deck.cards, 'Cards');
    for (const card of deck.cards) {
      str(card.id, 'Card ID', 100);
      str(card.name, 'Card name', 150);
      if (card.scryfallId !== undefined) {
        normalizeCard(card);
        if (card.face !== undefined && !['front', 'back'].includes(card.face))
          fail('Scryfall face must be front or back.');
        if (card.artUrl || card.art !== undefined || card.suit)
          fail('Choose a Scryfall card or custom artwork, rather than both.');
      }
      if (card.rank !== undefined && (typeof card.rank !== 'string' || card.rank.length > 8))
        fail('Card rank must be text of up to 8 characters.');
      if (card.suit && !Object.hasOwn(suitNames, card.suit))
        fail('Card suit must be spades, hearts, clubs, or diamonds.');
      if (!validArt(card.artUrl))
        fail('Artwork must use an HTTP(S) URL or a PNG, JPEG, WebP, GIF, or AVIF data URL.');
      if (card.artMode !== undefined && !['illustration', 'full-card'].includes(card.artMode))
        fail('Artwork mode must be illustration or full-card.');
      if (card.artMode === 'full-card' && !card.artUrl)
        fail('Full card scans need an artwork URL or uploaded image.');
      if (card.art !== undefined) integer(card.art, 0, 3, 'Demo artwork');
    }
    return deck;
  }
  function zone(id, name, count, layout, faceDown = false) {
    return {
      id,
      name,
      count,
      layout,
      faceDown,
      visibility: id === 'hand' ? 'owner' : faceDown ? 'hidden' : 'public',
      cardIds: [],
      offset: 0,
    };
  }
  function makePlayer(index, setup = 'standard') {
    const poker = setup === 'poker',
      commander = setup === 'commander';
    return {
      id: `p${index + 1}`,
      name: `Player ${String(index + 1).padStart(2, '0')}`,
      color: COLORS[index],
      stats: { life: commander ? 40 : 20, score: 0 },
      zones: [
        zone(
          'library',
          poker ? 'Draw pile' : 'Library',
          poker ? 43 : commander ? 84 : 32,
          'stack',
          true,
        ),
        zone('battlefield', poker ? 'Table' : 'Main area', poker ? 5 : 3, 'grid'),
        zone('graveyard', poker ? 'Discard' : 'Graveyard', poker ? 0 : 2, 'stack'),
        zone('hand', 'Hand', poker ? 2 : 5, 'fan', index > 0),
        ...(commander ? [zone('command', 'Command', 1, 'grid')] : []),
      ],
    };
  }
  function normalize(config = {}) {
    if (!config || typeof config !== 'object' || Array.isArray(config))
      fail('Configuration must be a JSON object.');
    if (config.theme !== undefined) {
      if (typeof config.theme !== 'string') fail('Theme preset must be a name.');
      const preset = THEME_PRESETS[config.theme];
      if (!Object.hasOwn(THEME_PRESETS, config.theme)) fail('Unknown theme preset.');
      if (
        config.view?.mtg !== undefined &&
        (!config.view.mtg || typeof config.view.mtg !== 'object' || Array.isArray(config.view.mtg))
      )
        fail('MTG: view.mtg must be an object.');
      config = {
        ...preset.config,
        ...config,
        stage: { ...preset.config.stage, ...config.stage },
        view: {
          ...preset.config.view,
          ...config.view,
          mtg: { ...preset.config.view.mtg, ...config.view?.mtg },
        },
      };
    }
    const setup = config.setup || 'standard';
    if (!['standard', 'poker', 'commander'].includes(setup))
      fail('Unknown setup. Choose standard, poker, or commander.');
    const deckMap = new Map([standard, arcana].map((deck) => [deck.id, clone(deck)]));
    if (config.decks !== undefined) {
      if (!Array.isArray(config.decks)) fail('decks must be an array.');
      unique(config.decks, 'Decks');
      config.decks.forEach((deck) => {
        const normalized = normalizeDeck(deck);
        deckMap.set(normalized.id, normalized);
      });
    }
    let players;
    if (Array.isArray(config.players)) players = clone(config.players);
    else {
      const count = config.players ?? (setup === 'commander' || setup === 'poker' ? 4 : 2);
      integer(count, 1, 8, 'Player count');
      players = Array.from({ length: count }, (_, i) => makePlayer(i, setup));
      if (config.theme === 'mtg26')
        players.forEach((player) => {
          player.zones = [
            zone('library', 'Library', 60, 'stack', true),
            zone('battlefield', 'Battlefield', 0, 'grid'),
            zone('graveyard', 'Graveyard', 0, 'stack'),
            zone('exile', 'Exile', 0, 'stack'),
            zone('hand', 'Hand', 0, 'fan'),
            zone('command', 'Command', 0, 'grid'),
            zone('stack', 'Stack', 0, 'grid'),
          ];
        });
    }
    players.forEach((player) => {
      if (player.avatarUrl === null || player.avatarUrl === '') delete player.avatarUrl;
      player.stats = { life: 20, score: 0, ...player.stats };
      if (player.counters !== undefined) player.counters = T.normalizeCounters(player.counters);
      if (Array.isArray(player.zones))
        player.zones.forEach((z) => {
          z.cardIds ??= [];
          z.offset ??= 0;
          z.faceDown ??= false;
          z.layout ??= 'grid';
          z.visibility ??= z.id === 'hand' ? 'owner' : z.faceDown ? 'hidden' : 'public';
        });
    });
    const state = {
      ...(config.theme !== undefined ? { theme: config.theme } : {}),
      version: config.version ?? 1,
      scene: config.scene ?? 'tabletop',
      setup,
      seed: config.seed ?? 42,
      stage: { width: 512, height: 512, theme: 'evergreen', texture: true, ...config.stage },
      view: {
        mode: 'overview',
        playerId: players[0]?.id,
        zoneId: 'hand',
        zoom: 1,
        density: 'balanced',
        stats: 'compact',
        counterFormat: 'exact',
        counterCap: 99,
        labels: true,
        viewerId: null,
        playerScope: 'table',
        ...config.view,
      },
      activeDeckId: config.activeDeckId ?? (setup === 'commander' ? 'arcana' : 'standard'),
      decks: [...deckMap.values()],
      players,
      extras: T.normalizeExtras(config.extras),
    };
    if (state.view.mode === 'player' && state.view.viewerId === null)
      state.view.viewerId = state.view.playerId;
    validate(state);
    return state;
  }
  function validate(state) {
    if (state.theme !== undefined && !Object.hasOwn(THEME_PRESETS, state.theme))
      fail('Unknown theme preset.');
    if (state.version !== 1) fail('Unsupported state version. This engine uses version 1.');
    if (typeof state.scene !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(state.scene))
      fail('Invalid scene ID.');
    if (!['standard', 'poker', 'commander'].includes(state.setup)) fail('Unknown setup.');
    integer(state.seed, 0, 2147483646, 'Seed');
    integer(state.stage.width, 64, 4096, 'Width');
    integer(state.stage.height, 64, 4096, 'Height');
    if (!Object.hasOwn(THEMES, state.stage.theme)) fail('Unknown theme.');
    if (typeof state.stage.texture !== 'boolean') fail('Texture must be true or false.');
    if (!Array.isArray(state.players)) fail('players must be an array.');
    integer(state.players.length, 1, 8, 'Player count');
    unique(state.players, 'Players');
    if (!Array.isArray(state.decks) || state.decks.length > 30) fail('Use at most 30 decks.');
    unique(state.decks, 'Decks');
    state.decks.forEach(validateDeck);
    const active = state.decks.find((deck) => deck.id === state.activeDeckId);
    if (!active) fail('Active deck does not exist.');
    const cardIds = new Set(active.cards.map((card) => card.id));
    for (const player of state.players) {
      validateAvatar(player);
      str(player.id, 'Player ID', 80);
      str(player.name, 'Player name', 40);
      if (!/^#[a-f0-9]{6}$/i.test(player.color))
        fail('Player color must be a six-digit hex color.');
      if (!player.stats || typeof player.stats !== 'object')
        fail('Player stats must be an object.');
      for (const [name, value] of Object.entries(player.stats)) {
        str(name, 'Stat name', 24);
        if (!Number.isFinite(value) || Math.abs(value) > 1000000000)
          fail('Stats must be finite numbers between −1 billion and 1 billion.');
      }
      if (Object.keys(player.stats).length > 8) fail('Use at most eight stats per player.');
      if (!Array.isArray(player.zones)) fail('Player zones must be an array.');
      integer(player.zones.length, 1, 16, 'Zones per player');
      unique(player.zones, 'Zones');
      player.zones.forEach((z) => {
        str(z.id, 'Zone ID', 80);
        str(z.name, 'Zone name', 32);
        integer(z.count, 0, MAX_CARDS, 'Card count');
        integer(z.offset, 0, Number.MAX_SAFE_INTEGER - MAX_CARDS, 'Zone offset');
        if (!['stack', 'fan', 'grid'].includes(z.layout))
          fail('Zone layout must be stack, fan, or grid.');
        if (typeof z.faceDown !== 'boolean') fail('faceDown must be true or false.');
        if (!['public', 'owner', 'hidden'].includes(z.visibility))
          fail('Zone visibility must be public, owner, or hidden.');
        if (!Array.isArray(z.cardIds) || z.cardIds.length > z.count || z.cardIds.length > 10000)
          fail('Explicit card IDs must fit the zone count, up to 10,000 IDs.');
        if (z.cardIds.some((id) => !cardIds.has(id)))
          fail('A zone references a card outside the active deck.');
      });
    }
    const view = state.view;
    if (!['overview', 'focus', 'player'].includes(view.mode))
      fail('View mode must be overview, focus, or player.');
    if (!['table', 'self'].includes(view.playerScope))
      fail('Player scope must be table or self.');
    if (view.viewerId !== null && !state.players.some((p) => p.id === view.viewerId))
      fail('The viewing player must exist.');
    if (view.mode === 'player' && view.viewerId === null)
      fail('A player view needs a viewing player.');
    if (!['calm', 'balanced', 'dense'].includes(view.density)) fail('Unknown density.');
    if (!['hidden', 'compact', 'full'].includes(view.stats)) fail('Unknown stats display.');
    if (typeof view.labels !== 'boolean') fail('Zone labels must be true or false.');
    if (!Number.isFinite(view.zoom) || view.zoom < 0.6 || view.zoom > 1.8)
      fail('Zoom must be between 0.6 and 1.8.');
    const player = state.players.find((p) => p.id === view.playerId);
    if (!player || !player.zones.some((z) => z.id === view.zoneId))
      fail('The selected player and zone must exist.');
    T.validateExtras(state);
    if (state.scene === 'mtg' && T.validateMtg) T.validateMtg(state);
    return state;
  }
  function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++)
      value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return value >>> 0;
  }
  const shuffledDecks = new WeakMap();
  function cardAt(state, player, z, index) {
    const deck = state.decks.find((d) => d.id === state.activeDeckId);
    if (index < z.cardIds.length)
      return deck.cards.find((card) => card.id === z.cardIds[index]);
    let orders = shuffledDecks.get(deck);
    if (!orders) {
      orders = new Map();
      shuffledDecks.set(deck, orders);
    }
    const key = `${state.seed}:${player.id}:${z.id}`;
    let order = orders.get(key);
    if (!order) {
      order = Array.from({ length: deck.cards.length }, (_, i) => i);
      let random = hash(key) || 1;
      for (let i = order.length - 1; i > 0; i--) {
        random ^= random << 13;
        random ^= random >>> 17;
        random ^= random << 5;
        const j = (random >>> 0) % (i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      orders.set(key, order);
    }
    return deck.cards[order[(z.offset + index - z.cardIds.length) % deck.cards.length]];
  }
  function locate(state, playerId, zoneId) {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) fail('Player not found.');
    if (zoneId === undefined) return { player };
    const z = player.zones.find((item) => item.id === zoneId);
    if (!z) fail('Zone not found.');
    return { player, zone: z };
  }
  function repairSelection(state) {
    const player = state.players.find((p) => p.id === state.view.playerId) || state.players[0];
    state.view.playerId = player.id;
    if (!player.zones.some((z) => z.id === state.view.zoneId))
      state.view.zoneId = player.zones[0].id;
    if (
      state.view.viewerId !== null &&
      !state.players.some((p) => p.id === state.view.viewerId)
    )
      state.view.viewerId = player.id;
    T.repairExtras(state);
  }
  function clearReferences(state) {
    state.extras = T.normalizeExtras();
    state.players.forEach((p) =>
      p.zones.forEach((z) => {
        z.cardIds = [];
        z.offset = 0;
      }),
    );
  }
  function reduce(current, command) {
    if (!command || typeof command.type !== 'string') fail('A command needs a type.');
    let next = clone(current);
    const p = command.payload || {};
    switch (command.type) {
      case 'stage.update':
        Object.assign(next.stage, p);
        break;
      case 'view.update': {
        Object.assign(next.view, p);
        if (p.mode === 'overview' && p.viewerId === undefined) next.view.viewerId = null;
        if (next.view.mode === 'player' && next.view.viewerId === null)
          next.view.viewerId = next.view.playerId;
        if (p.playerId !== undefined) locate(next, p.playerId);
        if (p.zoneId !== undefined) locate(next, next.view.playerId, p.zoneId);
        if (p.viewerId !== undefined && p.viewerId !== null) locate(next, p.viewerId);
        repairSelection(next);
        break;
      }
      case 'player.count': {
        integer(p.count, 1, 8, 'Player count');
        next.players = next.players.slice(0, p.count);
        while (next.players.length < p.count) {
          const player = makePlayer(next.players.length, next.setup);
          while (next.players.some((item) => item.id === player.id)) player.id += '-new';
          next.players.push(player);
        }
        repairSelection(next);
        break;
      }
      case 'player.update': {
        const { player } = locate(next, p.playerId);
        if (p.name !== undefined) player.name = p.name;
        if (p.color !== undefined) player.color = p.color;
        if (p.avatarUrl !== undefined) {
          if (p.avatarUrl === null || p.avatarUrl === '') delete player.avatarUrl;
          else player.avatarUrl = p.avatarUrl;
        }
        if (p.stats !== undefined) player.stats = { ...player.stats, ...p.stats };
        if (p.counters !== undefined) player.counters = T.normalizeCounters(p.counters);
        break;
      }
      case 'zone.update': {
        const { zone: z } = locate(next, p.playerId, p.zoneId);
        for (const key of ['name', 'count', 'layout', 'faceDown', 'visibility', 'cardIds'])
          if (p[key] !== undefined) z[key] = p[key];
        if (p.count !== undefined && p.cardIds === undefined)
          z.cardIds = z.cardIds.slice(0, p.count);
        T.repairExtras(next);
        break;
      }
      case 'extras.update':
        next.extras = T.normalizeExtras({ ...next.extras, ...p });
        break;
      case 'zone.add': {
        const { player } = locate(next, p.playerId);
        player.zones.push({
          ...zone(p.id, p.name || 'Special area', p.count ?? 0, p.layout || 'grid'),
          ...p.zone,
        });
        break;
      }
      case 'zone.remove': {
        const { player } = locate(next, p.playerId, p.zoneId);
        if (player.zones.length === 1) fail('A player needs at least one zone.');
        player.zones = player.zones.filter((z) => z.id !== p.zoneId);
        repairSelection(next);
        break;
      }
      case 'zone.transfer': {
        integer(p.count ?? 1, 1, 1000, 'Cards per transfer');
        const count = p.count ?? 1;
        const source = locate(next, p.from?.playerId, p.from?.zoneId);
        const target = locate(next, p.to?.playerId, p.to?.zoneId);
        if (!source.zone || !target.zone || source.zone === target.zone)
          fail('Choose two different zones.');
        if (source.zone.count < count) fail('There are not enough cards in the source zone.');
        const moved = Array.from(
          { length: count },
          (_, i) => cardAt(next, source.player, source.zone, i).id,
        );
        source.zone.offset += Math.max(0, count - source.zone.cardIds.length);
        source.zone.cardIds = source.zone.cardIds.slice(count);
        source.zone.count -= count;
        target.zone.cardIds = [...moved, ...target.zone.cardIds];
        target.zone.count += count;
        T.transferExtras(next, p.from, p.to, count);
        break;
      }
      case 'deck.select':
        next.activeDeckId = p.id;
        clearReferences(next);
        break;
      case 'deck.import': {
        const deck = normalizeDeck(p.deck);
        const index = next.decks.findIndex((d) => d.id === deck.id);
        if (index === -1) next.decks.push(deck);
        else next.decks[index] = deck;
        next.activeDeckId = deck.id;
        clearReferences(next);
        break;
      }
      case 'card.upsert': {
        const deck = next.decks.find((d) => d.id === (p.deckId || next.activeDeckId));
        if (!deck) fail('Deck not found.');
        const card = normalizeCard(p.card);
        const index = deck.cards.findIndex((item) => item.id === card.id);
        if (index === -1) deck.cards.push(card);
        else deck.cards[index] = card;
        break;
      }
      case 'card.remove': {
        const deck = next.decks.find((d) => d.id === (p.deckId || next.activeDeckId));
        if (!deck) fail('Deck not found.');
        if (!deck.cards.some((card) => card.id === p.id)) fail('Card not found.');
        deck.cards = deck.cards.filter((card) => card.id !== p.id);
        if (deck.id === next.activeDeckId) next.extras = T.normalizeExtras();
        if (deck.id === next.activeDeckId)
          next.players.forEach((player) =>
            player.zones.forEach((z) => {
              z.cardIds = z.cardIds.filter((id) => id !== p.id);
            }),
          );
        break;
      }
      case 'setup.load': {
        next = normalize({
          setup: p.setup,
          stage: next.stage,
          decks: next.decks,
          seed: next.seed,
          view: {
            density: next.view.density,
            stats: next.view.stats,
            counterFormat: next.view.counterFormat,
            counterCap: next.view.counterCap,
            labels: next.view.labels,
          },
        });
        break;
      }
      case 'scene.load':
        next.scene = p.id;
        break;
      case 'state.replace':
        next = normalize(p.state);
        break;
      case 'session.shuffle':
        next.seed = (next.seed + 7919) % 2147483647;
        clearReferences(next);
        break;
      default:
        fail(`Unknown command: ${command.type}`);
    }
    return validate(next);
  }
  function createEngine(config) {
    let state = normalize(config),
      revision = 0;
    const past = [],
      future = [],
      listeners = new Set();
    function emit(type) {
      revision++;
      for (const listener of listeners) listener(clone(state), { type, revision });
      return clone(state);
    }
    return {
      get state() {
        return clone(state);
      },
      get revision() {
        return revision;
      },
      get canUndo() {
        return past.length > 0;
      },
      get canRedo() {
        return future.length > 0;
      },
      dispatch(command) {
        const next = reduce(state, command);
        past.push(state);
        if (past.length > 40) past.shift();
        future.length = 0;
        state = next;
        return emit(command.type);
      },
      undo() {
        if (!past.length) return clone(state);
        future.push(state);
        state = past.pop();
        return emit('history.undo');
      },
      redo() {
        if (!future.length) return clone(state);
        past.push(state);
        state = future.pop();
        return emit('history.redo');
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }
  function toConfig(state) {
    const result = clone(state);
    result.decks = state.decks.filter(
      (deck) =>
        ![standard, arcana].some(
          (builtIn) =>
            builtIn.id === deck.id && JSON.stringify(builtIn) === JSON.stringify(deck),
        ),
    );
    if (!result.decks.length) delete result.decks;
    return result;
  }
  Object.assign(T, {
    listThemePresets: () =>
      Object.entries(THEME_PRESETS).map(([id, preset]) => ({
        id, name: preset.name, description: preset.description,
      })),
    themePreset: (id) => {
      if (!Object.hasOwn(THEME_PRESETS, id)) fail('Unknown theme preset.');
      return { theme: id, ...clone(THEME_PRESETS[id].config) };
    },
    createEngine,
    normalize,
    validate,
    validateDeck,
    validateAvatar,
    normalizeCard,
    normalizeDeck,
    cardAt,
    toConfig,
    themes: THEMES,
    builtInDecks: clone([standard, arcana]),
    limits: { maxCards: MAX_CARDS, maxZones: 16 },
    clone,
  });
})(globalThis);
