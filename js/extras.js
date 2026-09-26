(function (global) {
  'use strict';
  const T = global.Tabletop;
  const formats = ['exact', 'compact', 'capped', 'scientific'];
  const effects = [
    {
      id: 'halo',
      name: 'Golden halo',
      color: '#ffd279',
      blur: 5,
      line: 1.4,
      description: 'A soft warm glow for selection and priority.',
    },
    {
      id: 'neon',
      name: 'Electric neon',
      color: '#5ce9ff',
      blur: 2.8,
      line: 2,
      description: 'A crisp double outline for targets and active cards.',
    },
    {
      id: 'arcane',
      name: 'Arcane',
      color: '#c89bff',
      blur: 5.5,
      line: 1.1,
      description: 'Violet light and corner sigils for spells and abilities.',
    },
    {
      id: 'ember',
      name: 'Ember',
      color: '#ff9866',
      blur: 4,
      line: 1.7,
      description: 'Warm light and corner accents for attacks and damage.',
    },
    {
      id: 'frost',
      name: 'Frost',
      color: '#b9f5ee',
      blur: 3,
      line: 1.1,
      description: 'Pale light and fine corner rays for protection.',
    },
    {
      id: 'toxic',
      name: 'Verdant',
      color: '#b7ed74',
      blur: 6,
      line: 1.2,
      description: 'A broad green aura for growth, poison, or resources.',
    },
  ];
  const layouts = [
    { id: 'spotlight', name: 'Spotlight', description: 'A centered card over a dimmed scene.' },
    {
      id: 'sidecar',
      name: 'Side by side',
      description: 'The complete scene beside a featured card; stacked in portrait.',
    },
    {
      id: 'showcase',
      name: 'Showcase',
      description: 'A large card with an information panel over the scene.',
    },
  ];
  const fail = (message) => {
    throw new Error(message);
  };
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const colorOK = (value) => /^#[a-f0-9]{6}$/i.test(value);
  const labelOK = (value, length) =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= length;
  function normalizeCount(value) {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value))
        fail(
          'Counter counts must be safe integers; use a decimal string for larger integers, or "infinity".',
        );
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== 'string')
      fail('A counter needs a number, decimal integer string, or "infinity".');
    const input = value.trim().toLowerCase();
    if (['infinity', '+infinity', '∞', '+∞'].includes(input)) return 'infinity';
    if (['-infinity', '-∞'].includes(input)) return '-infinity';
    if (!/^[+-]?\d{1,60}$/.test(input))
      fail('Counter strings must be integers of up to 60 digits, or "infinity".');
    return BigInt(input).toString();
  }
  function normalizeCounters(counters, max = 16) {
    if (!Array.isArray(counters) || counters.length > max)
      fail(`Use a list of at most ${max} named counters.`);
    const result = counters.map((counter, index) => {
      if (!object(counter)) fail('A counter must be an object with a name and count.');
      const normalized = {
        ...T.clone(counter),
        id: counter.id ?? `counter-${index + 1}`,
        count: normalizeCount(counter.count),
      };
      if (!labelOK(normalized.id, 80) || !labelOK(normalized.name, 32))
        fail('Counters need an ID and a name of up to 32 characters.');
      if (counter.format !== undefined && !formats.includes(counter.format))
        fail('Unknown counter number format.');
      if (counter.cap !== undefined && (!Number.isSafeInteger(counter.cap) || counter.cap < 1))
        fail('Counter caps must be positive safe integers.');
      if (counter.color !== undefined && !colorOK(counter.color))
        fail('Counter colors must use six-digit hex values.');
      return normalized;
    });
    if (new Set(result.map((c) => c.id)).size !== result.length)
      fail('Counters need unique IDs.');
    return result;
  }
  function playerCounters(player) {
    return (
      player.counters ??
      Object.entries(player.stats).map(([name, count]) => ({ id: name, name, count }))
    );
  }
  function formatCounter(value, { format = 'exact', cap = 99 } = {}) {
    if (!formats.includes(format)) fail('Unknown counter number format.');
    if (!Number.isSafeInteger(cap) || cap < 1)
      fail('Counter caps must be positive safe integers.');
    // Older stats objects can contain fractional values. Keep these readable without migration.
    if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value))
      return String(value);
    const canonical = String(normalizeCount(value));
    if (canonical.includes('infinity')) return canonical[0] === '-' ? '−∞' : '∞';
    const negative = canonical[0] === '-',
      digits = negative ? canonical.slice(1) : canonical;
    const sign = negative ? '−' : '';
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (format === 'capped' && BigInt(digits) > BigInt(cap))
      return negative ? `< −${cap}` : `${cap}+`;
    if (format === 'scientific' && digits.length > 3) {
      const tail = digits.slice(1, 3).replace(/0+$/, '');
      return `${sign}${digits[0]}${tail ? '.' + tail : ''}e${digits.length - 1}`;
    }
    if (format === 'compact' && digits.length > 3) {
      const group = Math.floor((digits.length - 1) / 3);
      if (group > 4) return formatCounter(value, { format: 'scientific' });
      const whole = digits.length - group * 3;
      const tail = digits.slice(whole, whole + 2).replace(/0+$/, '');
      return `${sign}${digits.slice(0, whole)}${tail ? '.' + tail : ''}${['', 'K', 'M', 'B', 'T'][group]}`;
    }
    return sign + grouped;
  }
  function counterOptions(counter, view) {
    return {
      format: counter.format ?? view.counterFormat,
      cap: counter.cap ?? view.counterCap,
    };
  }
  function normalizeExtras(input = {}) {
    if (!object(input)) fail('extras must be an object.');
    const extras = { highlights: [], focus: null, cards: [], ...T.clone(input) };
    if (Array.isArray(extras.cards))
      extras.cards = extras.cards.map((card) =>
        object(card) && card.counters !== undefined
          ? { ...card, counters: normalizeCounters(card.counters, 8) }
          : card,
      );
    return extras;
  }
  function validTarget(state, target, exact = true) {
    if (!object(target)) return false;
    const player = state.players.find((p) => p.id === target.playerId);
    const zone = player?.zones.find((z) => z.id === target.zoneId);
    if (exact)
      return (
        !!zone &&
        Number.isInteger(target.index) &&
        target.index >= 0 &&
        target.index < zone.count &&
        target.cardId === undefined
      );
    if (target.index !== undefined) return validTarget(state, target);
    if (target.playerId !== undefined && !player) return false;
    if (target.zoneId !== undefined && !zone) return false;
    if (target.cardId !== undefined)
      return (
        typeof target.cardId === 'string' &&
        state.decks
          .find((d) => d.id === state.activeDeckId)
          .cards.some((c) => c.id === target.cardId)
      );
    return !!zone;
  }
  function validateGlow(glow) {
    if (!effects.some((e) => e.id === glow.preset)) fail('Unknown glow preset.');
    if (glow.color !== undefined && !colorOK(glow.color))
      fail('Glow colors must use six-digit hex values.');
    if (
      glow.strength !== undefined &&
      (!Number.isFinite(glow.strength) || glow.strength < 0.25 || glow.strength > 2)
    )
      fail('Glow strength must be from 0.25 to 2.');
  }
  function validateExtras(state) {
    if (!formats.includes(state.view.counterFormat)) fail('Unknown counter number format.');
    if (!Number.isSafeInteger(state.view.counterCap) || state.view.counterCap < 1)
      fail('Counter caps must be positive safe integers.');
    state.players.forEach((player) => {
      if (player.counters !== undefined) normalizeCounters(player.counters);
    });
    const extras = state.extras;
    if (
      !object(extras) ||
      !Array.isArray(extras.highlights) ||
      !Array.isArray(extras.cards) ||
      extras.highlights.length > 64 ||
      extras.cards.length > 128
    )
      fail('Use at most 64 highlights and 128 card annotations.');
    extras.highlights.forEach((highlight) => {
      if (!object(highlight) || !validTarget(state, highlight.target, false))
        fail('A highlight needs an existing card position, zone, or card ID.');
      validateGlow(highlight);
    });
    const positions = new Set();
    extras.cards.forEach((card) => {
      if (!object(card) || !validTarget(state, card.target))
        fail('Card annotations need an existing player, zone, and zero-based card index.');
      const key = JSON.stringify([card.target.playerId, card.target.zoneId, card.target.index]);
      if (positions.has(key)) fail('Use one annotation entry per card position.');
      positions.add(key);
      for (const key of ['tapped', 'faceDown'])
        if (card[key] !== undefined && typeof card[key] !== 'boolean')
          fail(`${key} must be true or false.`);
      if (
        card.rotation !== undefined &&
        (!Number.isFinite(card.rotation) || Math.abs(card.rotation) > 180)
      )
        fail('Card rotation must be between −180 and 180 degrees.');
      if (card.badge !== undefined && !labelOK(card.badge, 24))
        fail('A card badge must contain 1–24 characters.');
      if (
        card.tags !== undefined &&
        (!Array.isArray(card.tags) ||
          card.tags.length > 6 ||
          card.tags.some((tag) => !labelOK(tag, 24)))
      )
        fail('Use up to six short card tags.');
      if (card.counters !== undefined) normalizeCounters(card.counters, 8);
    });
    const focus = extras.focus;
    if (focus !== null) {
      if (!object(focus) || !validTarget(state, focus.target))
        fail('Card focus needs an existing player, zone, and zero-based card index.');
      if (!layouts.some((l) => l.id === focus.layout)) fail('Unknown card focus layout.');
      if (focus.preset !== undefined) validateGlow(focus);
      else if (focus.color !== undefined || focus.strength !== undefined)
        fail('Choose a glow preset before setting its color or strength.');
      if (
        focus.dim !== undefined &&
        (!Number.isFinite(focus.dim) || focus.dim < 0 || focus.dim > 0.9)
      )
        fail('Scene dimming must be between 0 and 0.9.');
      for (const [key, limit] of [
        ['title', 100],
        ['caption', 180],
      ])
        if (
          focus[key] !== undefined &&
          (typeof focus[key] !== 'string' || focus[key].length > limit)
        )
          fail(`Focus ${key} must be text of up to ${limit} characters.`);
    }
    return state;
  }
  function repairExtras(state) {
    state.extras.highlights = state.extras.highlights.filter((item) =>
      validTarget(state, item.target, false),
    );
    state.extras.cards = state.extras.cards.filter((item) => validTarget(state, item.target));
    if (state.extras.focus && !validTarget(state, state.extras.focus.target))
      state.extras.focus = null;
  }
  function transferExtras(state, from, to, count) {
    for (const item of [
      ...state.extras.highlights,
      ...state.extras.cards,
      ...(state.extras.focus ? [state.extras.focus] : []),
    ]) {
      const t = item.target;
      if (t.index === undefined) continue;
      if (t.playerId === from.playerId && t.zoneId === from.zoneId) {
        if (t.index < count) Object.assign(t, { playerId: to.playerId, zoneId: to.zoneId });
        else t.index -= count;
      } else if (t.playerId === to.playerId && t.zoneId === to.zoneId) t.index += count;
    }
  }
  function annotationAt(state, player, zone, index) {
    return (
      state.extras.cards.find(
        (item) =>
          item.target.playerId === player.id &&
          item.target.zoneId === zone.id &&
          item.target.index === index,
      ) || {}
    );
  }
  function highlightAt(state, player, zone, index, definition) {
    // Later rules win. Identity selectors never inspect concealed card definitions.
    for (let i = state.extras.highlights.length - 1; i >= 0; i--) {
      const rule = state.extras.highlights[i],
        target = rule.target;
      if (
        (target.playerId === undefined || target.playerId === player.id) &&
        (target.zoneId === undefined || target.zoneId === zone.id) &&
        (target.index === undefined || target.index === index) &&
        (target.cardId === undefined || target.cardId === definition?.id)
      )
        return { ...rule, key: `highlight-${i}` };
    }
    return null;
  }
  function counterLayout(player, view, width, height = 1000) {
    const all = playerCounters(player);
    if (view.stats === 'hidden' || !all.length)
      return { height: 47, items: [], hidden: 0, columns: 1 };
    const columns = Math.max(1, Math.min(4, Math.floor((width - 28) / 145)));
    if (view.stats === 'compact' || height < 160)
      return {
        height: 47,
        items: all.slice(0, 1),
        hidden: view.stats === 'full' ? all.length - 1 : 0,
        columns,
        inline: true,
      };
    const rows = Math.max(1, Math.min(4, Math.floor((height * 0.48 - 40) / 34)));
    const capacity = view.stats === 'compact' ? 1 : columns * rows;
    const shown = Math.min(
      all.length,
      all.length > capacity ? Math.max(1, capacity - 1) : capacity,
    );
    const overflowInline = capacity === 1 && shown < all.length;
    const slots = shown + (shown < all.length && !overflowInline ? 1 : 0);
    return {
      height: 44 + Math.ceil(slots / columns) * 34,
      items: all.slice(0, shown),
      hidden: all.length - shown,
      columns,
      overflowInline,
    };
  }
  Object.assign(T, {
    normalizeCount,
    normalizeCounters,
    playerCounters,
    formatCounter,
    counterOptions,
    normalizeExtras,
    validateExtras,
    repairExtras,
    transferExtras,
    annotationAt,
    highlightAt,
    counterLayout,
    listGlowEffects: () => T.clone(effects),
    listFocusLayouts: () => T.clone(layouts),
    glowEffect: (id) => effects.find((e) => e.id === id),
  });
})(globalThis);
