(function (global) {
  'use strict';
  const T = global.Tabletop,
    M = T.mtg,
    esc = T.escape,
    scriptURL = global.document?.currentScript?.src;
  // Node sets T.assetBase to the package's own assets folder, so a local rasterizer finds them from any directory.
  const asset = (name) =>
    T.assetBase ? `${T.assetBase}${name}` : scriptURL ? new URL(`../assets/${name}`, scriptURL).href : `assets/${name}`;
  const n = (v) => Number(v.toFixed(2)),
    ink = '#f4edda';
  // The frame palette. A primary colour sets the table, panels and shadows; a secondary sets the metal
  // trim and labels. Each tone is [family, hue offset in degrees, lightness, saturation ratio] against
  // the original green and gold, so those reproduce the original design exactly, and any other pair
  // keeps its contrast: lightness stays, while hue and saturation follow the chosen colour.
  const PRIMARY = '#133d33',
    SECONDARY = '#d9bf84';
  const TONES = {
    table: ['p', 0, 0.157, 1.0],
    panel: ['p', 6, 0.09, 1.16],
    bar: ['p', -1, 0.078, 1.33],
    shade: ['p', -1, 0.076, 1.12],
    medallion: ['p', -5, 0.165, 0.86],
    medallionEdge: ['p', 1, 0.059, 1.14],
    vignette: ['p', -2, 0.161, 0.84],
    vignetteEdge: ['p', -3, 0.049, 1.9],
    cardShadow: ['p', -3, 0.047, 1.9],
    frameShadow: ['p', 1, 0.035, 1.9],
    cardBack: ['p', 5, 0.122, 0.8],
    pileBack: ['p', 4, 0.139, 0.62],
    slot: ['p', -4, 0.563, 0.73],
    zone: ['p', 0, 0.186, 0.74],
    field: ['p', 3, 0.212, 1.09],
    lifeRing: ['p', 5, 0.071, 1.06],
    pipEmpty: ['p', -16, 0.357, 0.23],
    muted: ['p', -24, 0.733, 0.31],
    gold: ['s', 0, 0.684, 1.0],
    metal0: ['s', -2, 0.404, 0.5],
    metal1: ['s', 3, 0.706, 0.88],
    metal2: ['s', 1, 0.384, 0.44],
    metal3: ['s', 2, 0.816, 1.37],
    metal4: ['s', -2, 0.48, 0.58],
    edge: ['s', 1, 0.492, 0.57],
    edgeLight: ['s', 5, 0.904, 1.89],
    glint: ['s', 3, 0.886, 1.89],
    cardLine: ['s', -2, 0.59, 0.53],
    pileLine: ['s', 2, 0.571, 0.41],
    faint: ['s', 2, 0.661, 0.54],
    pipFull: ['s', 2, 0.796, 1.13],
    slotLine: ['s', 29, 0.802, 0.62],
    fieldLine: ['s', 18, 0.735, 0.77],
  };
  function hsl(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
      max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      l = (max + min) / 2,
      d = max - min;
    if (!d) return [0, 0, l];
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, l > 0.5 ? d / (2 - max - min) : d / (max + min), l];
  }
  function hex(h, s, l) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p = 2 * l - q;
    const channel = (t) => {
      t = (t + 1) % 1;
      const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
      return Math.round(v * 255).toString(16).padStart(2, '0');
    };
    return `#${channel(h / 360 + 1 / 3)}${channel(h / 360)}${channel(h / 360 - 1 / 3)}`;
  }
  function palette(colors = {}) {
    const from = { p: hsl(colors.primary || PRIMARY), s: hsl(colors.secondary || SECONDARY) };
    return Object.fromEntries(
      Object.entries(TONES).map(([name, [family, shift, l, ratio]]) => {
        const [h, s] = from[family];
        return [name, hex((h + shift + 360) % 360, Math.min(1, s * ratio), l)];
      }),
    );
  }
  M.palette = palette;
  // The palette of the render in progress. Rendering is synchronous, so the helpers below read it here.
  let C = palette(),
    muted = C.muted,
    gold = C.gold,
    dark = C.panel;
  const text = (x, y, value, size = 14, fill = ink, extra = '') =>
    `<text x="${n(x)}" y="${n(y)}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
  const fit = (x, y, value, size, width, fill = ink, extra = '') =>
    text(
      x,
      y,
      value,
      size,
      fill,
      `${extra}${String(value).length * (size * 0.64 + Number(extra.match(/letter-spacing="([\d.]+)"/)?.[1] || 0)) > width ? ` textLength="${n(Math.max(1, width))}" lengthAdjust="spacingAndGlyphs"` : ''}`,
    );
  const inset = (r, d) => ({
    x: r.x + d,
    y: r.y + d,
    w: r.w - 2 * d,
    h: r.h - 2 * d,
  });
  const zoneOf = (p, id) => p.zones.find((z) => z.id === id);
  const indices = (z, limit = 80) =>
    Array.from({ length: Math.min(z?.count || 0, limit) }, (_, i) => i);
  function polygon(r, cut = 18, lean = 0) {
    const { x, y, w, h } = r,
      c = Math.min(cut, w * 0.16, h * 0.2),
      s = Math.min(lean, w * 0.07);
    return `M${n(x + c + s)} ${n(y)}H${n(x + w - c - s)}L${n(x + w - s)} ${n(y + c)}L${n(x + w)} ${n(y + h - c)}L${n(x + w - c)} ${n(y + h)}H${n(x + c)}L${n(x)} ${n(y + h - c)}L${n(x + s)} ${n(y + c)}Z`;
  }
  function frame(
    r,
    { opacity = 0.82, cut = 18, lean = 0, bright = false, fill = dark } = {},
  ) {
    return `<g><path d="${polygon(r, cut, lean)}" fill="${fill}" fill-opacity="${opacity}" stroke="url(#mtg-metal)" stroke-width="${bright ? 2 : 1.15}" filter="url(#mtg-frame-shadow)"/><path d="${polygon(inset(r, 6), Math.max(4, cut - 3), lean)}" fill="none" stroke="${gold}" stroke-opacity=".32" stroke-width=".65"/><path d="M${n(r.x + cut)} ${n(r.y + r.h - 2)}H${n(r.x + r.w - cut)}" fill="none" stroke="url(#mtg-edge)" stroke-width="${bright ? 2 : 1}"/>${bright ? `<circle cx="${n(r.x + cut)}" cy="${n(r.y + r.h - 2)}" r="3" fill="${C.glint}" filter="url(#mtg-glint)"/><circle cx="${n(r.x + r.w - cut)}" cy="${n(r.y + r.h - 2)}" r="2.4" fill="${C.glint}" filter="url(#mtg-glint)"/>` : ''}</g>`;
  }
  function label(x, y, value, size = 13, width = 300) {
    const length = Math.min(width * 0.7, String(value).length * (size * 0.8 + 2));
    return `<g><path d="M${n(x - length / 2 - 40)} ${n(y - 4)}h25m${n(length + 30)} 0h25" stroke="${gold}" stroke-opacity=".65"/>${fit(x, y, value.toUpperCase(), size, length, gold, 'text-anchor="middle" font-family="Georgia,serif" letter-spacing="3.5"')}</g>`;
  }
  function sigil(x, y, size, opacity = 1) {
    return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 100)})" fill="none" stroke="${gold}" opacity="${opacity}"><circle r="19" stroke-width="3"/><circle r="10" stroke-width="2"/><path d="M0-70V-19M-7-56V-24M7-56V-24M0 19V70M-7 24V56M7 24V56M-65 0h46M19 0h46" stroke-width="2"/><path d="M0-33l7 10-7 5-7-5Zm0 66 7-10-7-5-7 5Z"/></g>`;
  }
  function icon(id, x, y, size = 24) {
    const paths = {
      library: 'M-9-12H7V10H-9ZM-5-16H11V6M-1-20H15V2',
      graveyard: 'M-12-2a12 12 0 0 1 24 0v7H6v8H-6V5h-6ZM-5-2h1m8 0h1M0 4v3',
      exile: 'M11-8a13 13 0 1 0 2 14M5-5a7 7 0 1 0 2 9M-1-14l6 2-3 5',
      command: 'M-15-9l7 6 8-12 8 12 7-6-4 19h-22ZM-11 14h22',
      mana: 'M0-18l12 18L0 18-12 0ZM0-9l5 9-5 9-5-9Z',
      energy: 'M3-18L-10 2H0L-3 18 11-4H1Z',
      poison: 'M0-11V11M-11 0H11',
      stack: 'M0-15L15-6 0 3-15-6ZM-15 2L0 11 15 2M-15 10L0 19 15 10',
    };
    return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 36)})" stroke="${gold}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="${paths[id] || paths.mana}"/></g>`;
  }
  function render(state, { assets, seenZones = new Set() } = {}) {
    if (
      state.extras.focus &&
      state.view.viewerId &&
      state.view.playerScope === 'self' &&
      state.extras.focus.target.playerId !== state.view.viewerId
    )
      return render({ ...state, extras: { ...state.extras, focus: null } }, { assets });
    const l = M.layout(state),
      c = l.context,
      { W, H } = l,
      requested = new Map(),
      counted = seenZones;
    C = palette(c.colors);
    ({ muted, gold, panel: dark } = C);
    let renderedCards = 0,
      visibleZoneCards = 0,
      serial = 0;
    const totalCards = state.players.reduce(
      (sum, p) => sum + p.zones.reduce((s, z) => s + z.count, 0),
      0,
    );
    const canSee = (p, z) => T.canSeeFaces(state, p, z),
      inScope = (id) =>
        state.view.playerScope !== 'self' || !l.viewer || id === l.viewer.id;
    const active = state.players.find((p) => p.id === c.activePlayerId),
      priority = state.players.find((p) => p.id === c.priorityPlayerId);
    const countZone = (p, z) => {
      if (z && !counted.has(`${p.id}:${z.id}`)) {
        counted.add(`${p.id}:${z.id}`);
        visibleZoneCards += z.count;
      }
    };
    const roles = new Map();
    c.combat.forEach((a) => {
      roles.set(M.key(a.attacker), 'ATTACKING');
      a.blockers.forEach((b) => roles.set(M.key(b), 'BLOCKING'));
    });
    const refs = (p, z, i) => ({ playerId: p.id, zoneId: z.id, index: i });
    function zoneLink(p, z, content) {
      if (!z) return content;
      countZone(p, z);
      return `<g data-player="${esc(p.id)}" data-zone="${esc(z.id)}" data-card-visibility="${canSee(p, z) ? 'faces' : 'backs'}" style="cursor:pointer"><title>${esc(`${p.name} · ${z.name} · ${z.count} cards`)}</title>${content}</g>`;
    }
    function avatar(p, r, round = false) {
      const id = `mtg-portrait-${serial++}`,
        shape = round
          ? `<ellipse cx="${n(r.x + r.w / 2)}" cy="${n(r.y + r.h / 2)}" rx="${n(r.w / 2)}" ry="${n(r.h / 2)}"/>`
          : `<path d="${polygon(r, 12)}"/>`;
      const svg = T.avatarSVG(p, { size: 100 }).replace(
        'width="100" height="100"',
        `width="${n(r.w)}" height="${n(r.h)}" preserveAspectRatio="xMidYMid slice"`,
      );
      return `<defs><clipPath id="${id}">${shape}</clipPath></defs><g clip-path="url(#${id})"><g transform="translate(${n(r.x)} ${n(r.y)})">${svg}</g><rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="url(#mtg-portrait-shade)"/></g><g fill="none" stroke="url(#mtg-metal)" stroke-width="1.4">${shape}</g>`;
    }
    function life(p, x, y, r, small = false) {
      if (state.view.stats === 'hidden') return '';
      const value =
          T.playerCounters(p).find((v) => /life/i.test(v.name))?.count ?? p.stats.life,
        exact = T.formatCounter(value);
      return `<g data-counter="life"><title>${esc(`${p.name}: ${exact} life`)}</title><circle cx="${n(x)}" cy="${n(y)}" r="${n(r + 4)}" fill="${C.lifeRing}" stroke="${gold}" stroke-opacity=".45" filter="url(#mtg-frame-shadow)"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#mtg-medallion)" stroke="url(#mtg-metal)" stroke-width="1.7"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r - 4)}" fill="none" stroke="${gold}" stroke-opacity=".4" stroke-width=".6"/>${fit(x, y + (small ? 7 : 8), exact, small ? r * 0.9 : r * 0.87, r * 1.65, ink, 'text-anchor="middle" font-family="Georgia,serif"')}${small ? '' : text(x, y + r * 0.54, 'LIFE', Math.max(7, r * 0.19), gold, 'text-anchor="middle" letter-spacing="2"')}</g>`;
    }
    function card(
      p,
      z,
      index,
      r,
      {
        angle = 0,
        caption = false,
        badge = true,
        physicalTap = false,
        upright = false,
      } = {},
    ) {
      countZone(p, z);
      const a = T.annotationAt(state, p, z, index),
        concealed = !canSee(p, z) || a.faceDown === true,
        definition = concealed ? null : T.cardAt(state, p, z, index);
      if (definition?.scryfallId)
        requested.set(T.scryfallAssetKey(definition), definition);
      const role = roles.get(M.key(refs(p, z, index))),
        glow = T.highlightAt(state, p, z, index, definition),
        accent =
          role === 'ATTACKING'
            ? '#f3a378'
            : role === 'BLOCKING'
              ? '#b1e6e5'
              : glow
                ? glow.color || T.glowEffect(glow.preset).color
                : null;
      const id = `mtg-card-${renderedCards++}`,
        cw = Math.max(1, Math.min(r.w, (r.h - (caption ? 21 : 0)) * 0.7)),
        ch = cw / 0.7,
        x = r.x + (r.w - cw) / 2,
        y = r.y + (r.h - ch - (caption ? 21 : 0)) / 2;
      const turn = concealed || upright ? 0 : (a.rotation ?? (a.tapped ? 90 : 0)),
        rad = (turn * Math.PI) / 180,
        scale = physicalTap
          ? 1
          : Math.min(
              1,
              cw / (cw * Math.abs(Math.cos(rad)) + ch * Math.abs(Math.sin(rad))),
              ch / (ch * Math.abs(Math.cos(rad)) + cw * Math.abs(Math.sin(rad))),
            );
      let out = `<g data-player="${esc(p.id)}" data-zone="${esc(z.id)}" data-card-index="${index}" data-card-state="${concealed ? 'concealed' : 'visible'}"${definition ? ` data-card-id="${esc(definition.id)}"` : ''} transform="rotate(${n(angle)} ${n(x + cw / 2)} ${n(y + ch * 0.8)})" style="cursor:pointer"><title>${esc(concealed ? 'Concealed card' : definition.name)}</title><g transform="translate(${n(x + cw / 2)} ${n(y + ch / 2)}) rotate(${turn}) scale(${n(scale)}) translate(${n(-cw / 2)} ${n(-ch / 2)})" filter="url(#mtg-card-shadow)">`;
      if (accent)
        out += `<rect x="-3" y="-3" width="${n(cw + 6)}" height="${n(ch + 6)}" rx="5" fill="none" stroke="${accent}" stroke-width="2.5"/>`;
      if (concealed)
        out += `<svg width="${n(cw)}" height="${n(ch)}" viewBox="0 0 70 100"><rect x="1" y="1" width="68" height="98" rx="4" fill="${C.cardBack}" stroke="${C.cardLine}" stroke-width="1.3"/><rect x="5" y="5" width="60" height="90" rx="2" fill="none" stroke="${C.cardLine}" stroke-opacity=".6"/><path d="M35 20L48 50 35 80 22 50Z" fill="none" stroke="${C.cardLine}" stroke-opacity=".6"/><path d="M35 29V71M29 37V63M41 37V63M23 44V56M47 44V56" stroke="${C.faint}" stroke-width="2"/><circle cx="35" cy="50" r="8" fill="${C.cardBack}" stroke="${C.faint}"/></svg>`;
      else
        out += T.cardSVG(definition, {
          theme: state.stage.theme,
          assets,
          id,
        }).replace('width="140" height="200"', `width="${n(cw)}" height="${n(ch)}"`);
      out += '</g>';
      if (!concealed && badge) {
        const badges = [
          role,
          a.badge,
          ...(a.counters || []).map((v) => `${v.name} ${T.formatCounter(v.count)}`),
          ...(a.tags || []),
        ].filter(Boolean);
        if (badges.length)
          out += `<rect x="${n(x)}" y="${n(y + ch - 18)}" width="${n(cw)}" height="18" rx="2" fill="${dark}" fill-opacity=".96"/>${fit(x + cw / 2, y + ch - 5, badges.join(' · '), 10, cw - 8, accent || gold, 'text-anchor="middle"')}`;
      }
      if (caption && !concealed)
        out += fit(
          x + cw / 2,
          y + ch + 17,
          definition.name,
          11,
          cw + 10,
          ink,
          'text-anchor="middle"',
        );
      return out + '</g>';
    }
    function overflow(x, y, count) {
      return count > 0
        ? `<g><rect x="${n(x - 28)}" y="${n(y - 15)}" width="56" height="22" rx="4" fill="${dark}" stroke="${gold}" stroke-opacity=".6"/>${text(x, y, `+${T.countLabel(count)}`, 12, gold, 'text-anchor="middle"')}</g>`
        : '';
    }
    function spread(
      p,
      z,
      list,
      r,
      {
        maxWidth = 180,
        gap = 24,
        cap = 20,
        total = list.length,
        ghosts = false,
        caption = false,
        overlap = false,
      } = {},
    ) {
      if (!z) return '';
      countZone(p, z);
      const shown = list.slice(0, cap),
        count = shown.length;
      let out = '';
      if (ghosts) {
        const slots = Math.max(5, Math.min(7, count)),
          cw = Math.min(maxWidth, (r.w - (slots - 1) * 12) / slots, r.h * 0.7),
          ch = cw / 0.7,
          space = Math.min(cw * 1.13, (r.w - cw) / (slots - 1));
        for (let i = 0; i < slots; i++)
          out += `<rect x="${n(r.x + r.w / 2 - (space * (slots - 1) + cw) / 2 + i * space)}" y="${n(r.y + (r.h - ch) / 2)}" width="${n(cw)}" height="${n(ch)}" rx="5" fill="${C.slot}" fill-opacity=".025" stroke="${C.slotLine}" stroke-opacity=".24" stroke-width=".8"/>`;
      }
      if (!count) return out;
      const cols = overlap
          ? count
          : Math.min(
              count,
              Math.max(
                1,
                Math.floor((r.w + gap) / (Math.min(maxWidth, r.h * 0.7) + gap)),
              ),
            ),
        rows = Math.ceil(count / cols),
        labelH = caption ? 21 : 0;
      const cw = Math.max(
          2,
          Math.min(
            maxWidth,
            ((r.h - (rows - 1) * 16) / rows - labelH) * 0.7,
            (r.w - (cols - 1) * (overlap ? 0 : gap)) /
              (overlap ? 1 + (cols - 1) * 0.67 : cols),
          ),
        ),
        ch = cw / 0.7 + labelH,
        step = overlap ? cw * 0.67 : cw + gap;
      shown.forEach((index, i) => {
        const row = Math.floor(i / cols),
          nc = Math.min(cols, count - row * cols),
          rowW = cw + (nc - 1) * step;
        out += card(
          p,
          z,
          index,
          {
            x: r.x + (r.w - rowW) / 2 + (i % cols) * step,
            y: r.y + (r.h - (rows * ch + (rows - 1) * 16)) / 2 + row * (ch + 16),
            w: cw,
            h: ch,
          },
          { caption },
        );
      });
      return out + overflow(r.x + r.w - 26, r.y + r.h - 7, total - count);
    }
    function fan(p, z, r, { large = false, opponent = false } = {}) {
      if (!z) return '';
      countZone(p, z);
      const count = Math.min(z.count, large ? 18 : opponent ? 7 : 12);
      if (!count) return label(r.x + r.w / 2, r.y + r.h * 0.5, 'Empty hand', 11, r.w);
      const cw = Math.min(
          large ? 250 : opponent ? 72 : 150,
          r.h * 0.53,
          r.w / (1.35 + Math.max(0, count - 1) * 0.72),
        ),
        ch = cw / 0.7,
        span = Math.min(r.w - cw * 1.6, cw * (count - 1) * 0.71),
        curve = Math.min(large ? 65 : 32, r.h * 0.13);
      let out = '';
      for (let i = 0; i < count; i++) {
        const unit = count === 1 ? 0 : i / (count - 1) - 0.5,
          y = r.y + (r.h - ch) * 0.46 + Math.abs(unit) * 2 * curve;
        out += card(
          p,
          z,
          i,
          { x: r.x + r.w / 2 - cw / 2 + unit * span, y, w: cw, h: ch },
          { angle: unit * (opponent ? 12 : 27), badge: !opponent },
        );
      }
      return out + overflow(r.x + r.w - 27, r.y + r.h - 4, z.count - count);
    }
    const countBadge = (x, y, value) =>
      `<circle cx="${n(x)}" cy="${n(y)}" r="12" fill="${dark}" stroke="${gold}" stroke-opacity=".8"/>${text(x, y + 4, T.countLabel(value), 10, gold, 'text-anchor="middle"')}`;
    function pile(p, z, r, { framed = true } = {}) {
      if (!z) return '';
      countZone(p, z);
      const compact = r.h < 140,
        area = {
          x: r.x + 12,
          y: r.y + 15,
          w: r.w - 24,
          h: r.h - (compact ? 38 : 43),
        };
      let out = framed ? frame(r, { opacity: 0.75, cut: 15 }) : '';
      if (z.count) {
        if (z.id === 'library') {
          const cw = Math.min(area.w - 10, area.h * 0.7 - 7),
            ch = cw / 0.7,
            x = area.x + (area.w - cw) / 2,
            y = area.y + (area.h - ch) / 2;
          out += `<rect x="${n(x - 7)}" y="${n(y - 5)}" width="${n(cw)}" height="${n(ch)}" rx="4" fill="${C.pileBack}" stroke="${C.pileLine}"/><rect x="${n(x - 3)}" y="${n(y - 2)}" width="${n(cw)}" height="${n(ch)}" rx="4" fill="${C.pileBack}" stroke="${C.pileLine}"/>`;
        }
        out += card(p, z, 0, area, {
          angle: z.id === 'library' ? -3 : 1,
          badge: false,
        });
      } else {
        const cw = Math.min(area.w * 0.75, area.h * 0.7),
          ch = cw / 0.7;
        out += `<rect x="${n(area.x + (area.w - cw) / 2)}" y="${n(area.y + (area.h - ch) / 2)}" width="${n(cw)}" height="${n(ch)}" rx="4" fill="${C.zone}" fill-opacity=".3" stroke="${gold}" stroke-opacity=".2"/>${icon(z.id, area.x + area.w / 2, area.y + area.h / 2, compact ? 24 : 37)}`;
      }
      out +=
        fit(
          r.x + r.w / 2,
          r.y + r.h - 11,
          z.name.toUpperCase(),
          compact ? 9 : 11,
          r.w - 12,
          gold,
          'text-anchor="middle" font-family="Georgia,serif" letter-spacing="2"',
        ) + countBadge(r.x + r.w - 18, r.y + 18, z.count);
      return zoneLink(p, z, out);
    }
    function hero(p, r) {
      if (!r) return '';
      const compact = l.portrait,
        photo = {
          x: r.x + 14,
          y: r.y + 67,
          w: compact ? r.w - 28 : r.w * 0.6,
          h: compact ? r.h * 0.49 : r.h * 0.57,
        };
      let out = `<g data-player-panel="${esc(p.id)}" data-recipient="${p.id === state.view.viewerId}">${frame(r, { opacity: 0.88, cut: 25, bright: true })}${icon('mana', r.x + 29, r.y + 29, 25)}${text(r.x + 54, r.y + 32, p.id === state.view.viewerId ? 'YOU' : 'PLAYER', 17, ink, 'font-family="Georgia,serif" letter-spacing="2.5"')}${fit(r.x + 54, r.y + 49, p.name, 12, r.w - 78, muted, 'letter-spacing=".7"')}${avatar(p, photo)}`;
      const lr = Math.min(compact ? 37 : 45, r.w * 0.17),
        ly = photo.y + photo.h + 1;
      out += life(p, photo.x + photo.w / 2, ly, lr);
      const counters = T.playerCounters(p).filter((v) => !/life|score/i.test(v.name));
      if (!compact && state.view.stats !== 'hidden' && counters.length) {
        const rail = {
          x: photo.x + photo.w + 13,
          y: photo.y + photo.h * 0.14,
          w: r.x + r.w - photo.x - photo.w - 26,
          h: photo.h * 0.88,
        };
        out += frame(rail, { opacity: 0.75, cut: 12 });
        counters.slice(0, 3).forEach((v, i) => {
          const y = rail.y + 29 + (i * (rail.h - 30)) / 3;
          out +=
            icon(
              /energy/i.test(v.name)
                ? 'energy'
                : /poison/i.test(v.name)
                  ? 'poison'
                  : 'mana',
              rail.x + 20,
              y + 3,
              25,
            ) +
            fit(
              rail.x + 43,
              y - 6,
              v.name.toUpperCase(),
              8,
              rail.w - 50,
              gold,
              'letter-spacing="1.4"',
            );
          const count = Number(v.count);
          if (Number.isInteger(count) && count >= 0 && count <= 5) {
            const pitch = Math.min(13, (rail.w - 55) / (Math.max(3, count) - 1));
            for (let pip = 0; pip < Math.max(3, count); pip++)
              out += `<circle cx="${n(rail.x + 47 + pip * pitch)}" cy="${n(y + 10)}" r="4" fill="${pip < count ? C.pipFull : C.pipEmpty}" stroke="${gold}" stroke-opacity=".5"/>`;
          } else
            out += fit(
              rail.x + 43,
              y + 13,
              T.formatCounter(v.count),
              15,
              rail.w - 51,
              ink,
            );
        });
      }
      const bottom = compact ? ly + lr + 28 : r.y + r.h - 55;
      if (compact && state.view.stats !== 'hidden' && counters.length)
        out += fit(
          r.x + r.w / 2,
          bottom,
          counters
            .slice(0, 3)
            .map((v) => `${v.name} ${T.formatCounter(v.count)}`)
            .join(' · '),
          10,
          r.w - 28,
          muted,
          'text-anchor="middle"',
        );
      else
        out +=
          text(
            r.x + r.w / 2,
            bottom,
            'GREAT IDEAS',
            9,
            gold,
            'text-anchor="middle" letter-spacing="3"',
          ) +
          text(
            r.x + r.w / 2,
            bottom + 18,
            'ENDURE',
            9,
            gold,
            'text-anchor="middle" letter-spacing="3"',
          );
      return (
        out +
        `<path d="M${n(r.x + r.w / 2 - 13)} ${n(r.y + r.h - 18)}h26" stroke="${gold}" stroke-opacity=".65"/></g>`
      );
    }
    function fieldCards(p, r, { small = false } = {}) {
      const z = zoneOf(p, 'battlefield');
      if (!z) return '';
      const lands = new Set(c.lands[p.id] || []),
        important = [...roles.keys()]
          .filter((k) => k.startsWith(`${p.id}:battlefield:`))
          .map((k) => Number(k.slice(k.lastIndexOf(':') + 1))),
        list = [...new Set([...important, ...indices(z)])].filter((i) => !lands.has(i));
      return zoneLink(
        p,
        z,
        spread(p, z, list, r, {
          maxWidth: small ? 110 : 190,
          gap: small ? 13 : 30,
          cap: small ? 8 : 18,
          total: z.count - lands.size,
          ghosts: !small,
        }),
      );
    }
    function opponent(panel) {
      const { player: p, ...r } = panel,
        compact = r.w < 750,
        tall = compact && r.h > 210;
      let out = `<g data-player-panel="${esc(p.id)}" data-recipient="false" transform="rotate(${panel.tilt || 0} ${n(r.x + r.w / 2)} ${n(r.y + r.h / 2)})">${frame(r, { opacity: 0.72, lean: 8, cut: 22, bright: p.id === c.activePlayerId })}`;
      if (compact) {
        out +=
          avatar(p, { x: r.x + 18, y: r.y + 16, w: 42, h: 42 }, true) +
          fit(
            r.x + 73,
            r.y + 31,
            p.name,
            15,
            r.w - 150,
            ink,
            'font-family="Georgia,serif" letter-spacing="1.6"',
          ) +
          text(
            r.x + 73,
            r.y + 48,
            p.id === c.activePlayerId ? 'ACTIVE TURN' : 'OPPONENT',
            8,
            gold,
            'letter-spacing="1.6"',
          ) +
          life(p, r.x + r.w - 35, r.y + 36, 24, true);
        const hand = zoneOf(p, 'hand');
        if (hand)
          out += zoneLink(
            p,
            hand,
            fan(
              p,
              hand,
              {
                x: r.x + r.w * 0.39,
                y: r.y + (tall ? 58 : 52),
                w: r.w * 0.53,
                h: tall ? 50 : 31,
              },
              { opponent: true },
            ),
          );
        out += fieldCards(
          p,
          {
            x: r.x + 19,
            y: r.y + (tall ? 116 : 88),
            w: r.w - 38,
            h: r.h - (tall ? 155 : 117),
          },
          { small: true },
        );
        out += landCards(
          p,
          { x: r.x + 20, y: r.y + (tall ? 70 : 60), w: r.w * 0.31, h: tall ? 29 : 22 },
          true,
        );
        const summaries = p.zones.filter(
            (z) =>
              ['library', 'graveyard', 'exile', 'hand'].includes(z.id) ||
              (z.id === 'command' && z.count),
          ),
          step = (r.w - 34) / summaries.length;
        summaries.forEach((z, i) => {
          out += zoneLink(
            p,
            z,
            text(
              r.x + 17 + i * step,
              r.y + r.h - 14,
              `${{ library: 'LIBRARY', graveyard: 'GRAVE', exile: 'EXILE', hand: 'HAND', command: 'CMD' }[z.id]} ${T.countLabel(z.count)}`,
              8,
              muted,
              'letter-spacing=".8"',
            ),
          );
        });
      } else {
        out +=
          avatar(p, { x: r.x + 25, y: r.y + 18, w: 62, h: 62 }, true) +
          text(
            r.x + 102,
            r.y + 36,
            'OPPONENT',
            15,
            ink,
            'font-family="Georgia,serif" letter-spacing="2.3"',
          ) +
          fit(r.x + 102, r.y + 53, p.name, 11, r.w * 0.18 - 98, muted) +
          life(p, r.x + 132, r.y + 108, 35);
        if (p.id === c.activePlayerId)
          out += text(
            r.x + 34,
            r.y + r.h - 17,
            'ACTIVE TURN',
            9,
            gold,
            'letter-spacing="1.8"',
          );
        const centre = {
            x: r.x + r.w * 0.24,
            y: r.y + 9,
            w: r.w * 0.52,
            h: r.h - 20,
          },
          hand = zoneOf(p, 'hand');
        if (hand)
          out += zoneLink(
            p,
            hand,
            fan(
              p,
              hand,
              {
                x: centre.x + centre.w * 0.22,
                y: centre.y - 5,
                w: centre.w * 0.56,
                h: r.h * 0.39,
              },
              { opponent: true },
            ),
          );
        out += fieldCards(
          p,
          {
            x: centre.x + centre.w * 0.26,
            y: r.y + r.h * 0.43,
            w: centre.w * 0.74,
            h: r.h * 0.43,
          },
          { small: true },
        );
        out += landCards(
          p,
          { x: centre.x - 12, y: r.y + r.h * 0.57, w: centre.w * 0.25, h: r.h * 0.28 },
          true,
        );
        const landCount = (c.lands[p.id] || []).length;
        const exile = zoneOf(p, 'exile');
        if (exile)
          out += zoneLink(
            p,
            exile,
            text(
              centre.x - 12,
              r.y + r.h - 8,
              `EXILE ${exile.count}`,
              8,
              muted,
              'letter-spacing="1"',
            ),
          );
        out += text(
          centre.x + centre.w / 2,
          r.y + r.h - 8,
          `BATTLEFIELD${landCount ? `  /  ${landCount} LANDS` : ''}`,
          8,
          gold,
          'text-anchor="middle" letter-spacing="2"',
        );
        const pileW = r.w * 0.082,
          pileY = r.y + 12,
          pileH = r.h - 23;
        out +=
          pile(
            p,
            zoneOf(p, 'graveyard'),
            { x: r.x + r.w * 0.79, y: pileY, w: pileW, h: pileH },
            { framed: false },
          ) +
          pile(
            p,
            zoneOf(p, 'library'),
            { x: r.x + r.w * 0.89, y: pileY, w: pileW, h: pileH },
            { framed: false },
          );
      }
      return out + '</g>';
    }
    function battlefield(p, r) {
      let out = frame(r, {
        opacity: 0.19,
        cut: 24,
        lean: l.portrait ? 8 : 25,
        bright: true,
        fill: C.field,
      });
      const x = r.x + r.w / 2,
        y = r.y + r.h * 0.4,
        rad = Math.min(r.w * 0.19, r.h * 0.59);
      out += `<g fill="none" stroke="${C.fieldLine}" stroke-opacity=".19"><circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(rad + 8)}"/><path d="M${n(x)} ${n(r.y + 10)}v${n(r.h - 24)}M${n(r.x + 24)} ${n(y)}h${n(r.w - 48)}"/></g>${sigil(x, y, 75, 0.3)}`;
      return (
        out +
        fieldCards(p, { x: r.x + 36, y: r.y + 30, w: r.w - 72, h: r.h - 85 }) +
        label(x, r.y + r.h - 20, 'Battlefield', 15, r.w)
      );
    }
    function landCards(p, r, small = false) {
      const z = zoneOf(p, 'battlefield');
      if (!z) return '';
      const all = c.lands[p.id] || [],
        list = all.slice(0, small ? 8 : 16),
        gap = small ? 4 : 12;
      const factors = list.map((i) => {
        const a = T.annotationAt(state, p, z, i),
          turn = canSee(p, z) && !a.faceDown ? (a.rotation ?? (a.tapped ? 90 : 0)) : 0,
          rad = (turn * Math.PI) / 180;
        return Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)) / 0.7;
      });
      const cw = Math.max(
          2,
          Math.min(
            small ? 40 : 125,
            r.h * 0.7,
            (r.w - gap * Math.max(0, list.length - 1)) /
              Math.max(
                1,
                factors.reduce((s, v) => s + v, 0),
              ),
          ),
        ),
        ch = cw / 0.7;
      const totalWidth =
        factors.reduce((s, v) => s + v * cw, 0) + gap * Math.max(0, list.length - 1);
      let x = r.x + (r.w - totalWidth) / 2,
        out = '';
      list.forEach((index, i) => {
        const footprint = factors[i] * cw;
        out += card(
          p,
          z,
          index,
          {
            x: x + (footprint - cw) / 2,
            y: r.y + (r.h - ch) / 2,
            w: cw,
            h: ch,
          },
          { physicalTap: true, badge: !small },
        );
        x += footprint + gap;
      });
      return zoneLink(
        p,
        z,
        out + overflow(r.x + r.w - 27, r.y + r.h - 7, all.length - list.length),
      );
    }
    function lands(p, r) {
      const z = zoneOf(p, 'battlefield');
      if (!z) return '';
      return (
        frame(r, { opacity: 0.52, cut: 18, lean: 13 }) +
        landCards(p, { x: r.x + 17, y: r.y + 12, w: r.w - 34, h: r.h - 38 }) +
        label(r.x + r.w / 2, r.y + r.h - 11, 'Lands', 12, r.w)
      );
    }
    function hand(p, r, large = false) {
      const z = zoneOf(p, 'hand');
      if (!z) return '';
      const x = r.x + r.w / 2,
        path = `M${n(r.x)} ${n(r.y + r.h * 0.3)}Q${n(x)} ${n(r.y - r.h * 0.23)} ${n(r.x + r.w)} ${n(r.y + r.h * 0.3)}L${n(r.x + r.w)} ${n(r.y + r.h - 20)}L${n(r.x + r.w - 22)} ${n(r.y + r.h)}H${n(r.x + 22)}L${n(r.x)} ${n(r.y + r.h - 20)}Z`;
      return zoneLink(
        p,
        z,
        `<path d="${path}" fill="${dark}" fill-opacity=".86" stroke="url(#mtg-metal)" stroke-width="1.2" filter="url(#mtg-frame-shadow)"/><path d="M${n(r.x + 9)} ${n(r.y + r.h * 0.33)}Q${n(x)} ${n(r.y - r.h * 0.17)} ${n(r.x + r.w - 9)} ${n(r.y + r.h * 0.33)}" fill="none" stroke="${gold}" stroke-opacity=".35"/>` +
          fan(p, z, { x: r.x + 22, y: r.y - 3, w: r.w - 44, h: r.h - 24 }, { large }) +
          label(
            x,
            r.y + r.h - 10,
            p.id === state.view.viewerId ? 'Your hand' : `${p.name} · hand`,
            12,
            r.w,
          ) +
          countBadge(r.x + r.w - 27, r.y + r.h - 24, z.count),
      );
    }
    function ownerPiles(p, r) {
      let out = '';
      if (l.portrait) {
        const zones = [
          'exile',
          'graveyard',
          'library',
          ...(zoneOf(p, 'command')?.count ? ['command'] : []),
        ];
        const w = (r.w - 10 * (zones.length - 1)) / zones.length;
        zones.forEach((id, i) => {
          out += pile(p, zoneOf(p, id), {
            x: r.x + i * (w + 10),
            y: r.y,
            w,
            h: r.h,
          });
        });
      } else {
        const w = (r.w - 14) / 2,
          h = r.h * 0.51;
        out +=
          pile(p, zoneOf(p, 'exile'), { x: r.x, y: r.y, w, h }) +
          pile(p, zoneOf(p, 'graveyard'), { x: r.x + w + 14, y: r.y, w, h }) +
          pile(p, zoneOf(p, 'library'), {
            x: r.x + r.w * 0.225,
            y: r.y + h + 12,
            w: r.w * 0.55,
            h: r.h - h - 12,
          });
      }
      return out;
    }
    function roster(r) {
      const players = state.players.filter((p) => inScope(p.id)),
        w = (r.w - 12 * (players.length - 1)) / players.length;
      return players
        .map((p, i) => {
          const x = r.x + i * (w + 12),
            rr = { x, y: r.y, w, h: r.h };
          return `<g data-player-panel="${esc(p.id)}">${frame(rr, { cut: 13, opacity: 0.83, bright: p.id === c.activePlayerId })}${avatar(p, { x: x + 12, y: r.y + 12, w: Math.min(42, r.h - 24), h: Math.min(42, r.h - 24) }, true)}${fit(x + 65, r.y + r.h * 0.45, p.name, 12, w - 114, ink, 'font-family="Georgia,serif"')}${fit(x + 65, r.y + r.h * 0.69, p.id === state.view.viewerId ? 'YOU' : p.id === c.activePlayerId ? 'ACTIVE' : 'OPPONENT', 8, w - 114, gold, 'letter-spacing="1.3"')}${life(p, x + w - 26, r.y + r.h / 2, 18, true)}</g>`;
        })
        .join('');
    }
    const focusTitle = (r, name, subtitle = '') =>
      label(r.x + r.w / 2, r.y - 14, name, l.portrait ? 19 : 22, r.w) +
      (subtitle
        ? text(
            r.x + r.w / 2,
            r.y + 10,
            subtitle,
            11,
            muted,
            'text-anchor="middle" letter-spacing="1.4"',
          )
        : '');
    function zoneDetail(r) {
      const p = l.selected,
        id = c.focus === 'zone' ? state.view.zoneId : c.focus,
        z = zoneOf(p, id);
      if (!z)
        return (
          focusTitle(r, id) +
          frame(r, { opacity: 0.5 }) +
          text(
            r.x + r.w / 2,
            r.y + r.h / 2,
            `${p.name} has no ${id} zone`,
            20,
            muted,
            'text-anchor="middle"',
          )
        );
      if (id === 'hand')
        return (
          focusTitle(
            r,
            `${p.name} · Hand`,
            canSee(p, z) ? 'YOUR CARDS, AT A GLANCE' : 'CARD FACES CONCEALED',
          ) + hand(p, { ...r, y: r.y + r.h * 0.13, h: r.h * 0.79 }, true)
        );
      if (id === 'battlefield')
        return (
          focusTitle(r, `${p.name} · Battlefield`) +
          battlefield(p, { ...r, y: r.y + 35, h: r.h * 0.72 }) +
          lands(p, {
            x: r.x + r.w * 0.06,
            y: r.y + r.h * 0.8,
            w: r.w * 0.88,
            h: r.h * 0.2,
          })
        );
      let out =
        frame(r, { opacity: 0.58, cut: 25, bright: true }) +
        focusTitle(
          r,
          `${p.name} · ${z.name}`,
          `${z.count} ${z.count === 1 ? 'CARD' : 'CARDS'}${canSee(p, z) ? '' : ' · FACES CONCEALED'}`,
        );
      if (!z.count)
        return zoneLink(
          p,
          z,
          out +
            icon(id, r.x + r.w / 2, r.y + r.h * 0.44, 80) +
            label(r.x + r.w / 2, r.y + r.h * 0.6, 'Empty zone', 14, r.w),
        );
      if (id === 'library' && !canSee(p, z)) {
        out +=
          pile(
            p,
            z,
            {
              x: r.x + r.w * 0.31,
              y: r.y + r.h * 0.09,
              w: r.w * 0.38,
              h: r.h * 0.78,
            },
            { framed: false },
          ) +
          text(
            r.x + r.w / 2,
            r.y + r.h * 0.94,
            'THE LIBRARY REMAINS CONCEALED',
            11,
            muted,
            'text-anchor="middle" letter-spacing="2"',
          );
      } else
        out += spread(
          p,
          z,
          indices(z),
          { x: r.x + 32, y: r.y + 36, w: r.w - 64, h: r.h - 65 },
          { maxWidth: 260, cap: 24, gap: 28, caption: true, total: z.count },
        );
      return zoneLink(p, z, out);
    }
    function stackDetail(r) {
      const entries = c.stack.filter((v) => inScope(v.playerId));
      let out =
        frame(r, { opacity: 0.54, cut: 24, bright: true }) +
        focusTitle(r, 'The stack', 'TOP RESOLVES FIRST');
      if (!entries.length)
        return (
          out +
          icon('stack', r.x + r.w / 2, r.y + r.h * 0.42, 70) +
          label(r.x + r.w / 2, r.y + r.h * 0.61, 'The stack is empty', 14, r.w)
        );
      const shown = entries.slice(0, l.portrait ? 6 : 8),
        cols = l.portrait ? Math.min(2, shown.length) : Math.min(4, shown.length),
        rows = Math.ceil(shown.length / cols),
        w = (r.w - 60) / cols,
        h = (r.h - 65) / rows;
      shown.forEach((v, i) => {
        const { player: p, zone: z, index } = M.reference(state, v),
          x = r.x + 30 + (i % cols) * w,
          y = r.y + 35 + Math.floor(i / cols) * h;
        out +=
          text(
            x + w / 2,
            y + 8,
            `${i === 0 ? 'TOP · ' : ''}${i + 1} / ${p.name}`,
            12,
            i === 0 ? gold : muted,
            'text-anchor="middle" letter-spacing="1.4"',
          ) +
          card(
            p,
            z,
            index,
            { x: x + 25, y: y + 30, w: w - 50, h: h - 48 },
            { angle: i % 2 ? 3 : -3, caption: true },
          );
      });
      return (
        out + overflow(r.x + r.w - 35, r.y + r.h - 19, entries.length - shown.length)
      );
    }
    function combatDetail(r) {
      const attacks = c.combat.filter(
        (a) => inScope(a.attacker.playerId) && inScope(a.defenderId),
      );
      let out =
        frame(r, { opacity: 0.5, cut: 25, bright: true }) +
        focusTitle(r, 'Combat', c.step || 'ATTACKS & BLOCKS');
      if (!attacks.length)
        return (
          out +
          sigil(r.x + r.w / 2, r.y + r.h * 0.4, 120, 0.5) +
          label(r.x + r.w / 2, r.y + r.h * 0.62, 'No combat assignments', 13, r.w)
        );
      const shown = attacks.slice(0, l.portrait ? 5 : 4),
        cols = l.portrait ? 1 : shown.length,
        rows = Math.ceil(shown.length / cols),
        w = (r.w - 40) / cols,
        h = (r.h - 55) / rows;
      shown.forEach((a, i) => {
        const cell = {
            x: r.x + 20 + (i % cols) * w,
            y: r.y + 30 + Math.floor(i / cols) * h,
            w,
            h,
          },
          attacker = M.reference(state, a.attacker),
          defender = state.players.find((p) => p.id === a.defenderId);
        out += fit(
          cell.x + w / 2,
          cell.y + 11,
          `${attacker.player.name} → ${a.target || defender.name}`,
          14,
          w - 28,
          gold,
          'text-anchor="middle" font-family="Georgia,serif" letter-spacing="1"',
        );
        const cw = Math.min(
            l.portrait ? 148 : 190,
            w * 0.39,
            (h - 65) * (l.portrait ? 0.7 : 0.3),
          ),
          ch = cw / 0.7,
          ar = l.portrait
            ? { x: cell.x + 20, y: cell.y + 35, w: cw, h: ch }
            : { x: cell.x + (w - cw) / 2, y: cell.y + 35, w: cw, h: ch };
        out += card(attacker.player, attacker.zone, attacker.index, ar, {
          angle: -2,
        });
        const br = l.portrait
          ? { x: cell.x + cw + 150, y: ar.y, w: w - cw - 176, h: ch }
          : {
              x: cell.x + 12,
              y: ar.y + ch + 48,
              w: w - 24,
              h: Math.max(15, h - ch - 106),
            };
        const ax = ar.x + ar.w / 2,
          ay = ar.y + ar.h,
          bx = br.x + br.w / 2,
          by = br.y;
        out += l.portrait
          ? `<path d="M${n(ar.x + ar.w + 15)} ${n(ar.y + ch / 2)}H${n(br.x - 22)}" stroke="#eec19a" stroke-width="1.6" marker-end="url(#mtg-arrow)"/>`
          : `<path d="M${n(ax)} ${n(ay + 10)}Q${n(ax + 20)} ${n((ay + by) / 2)} ${n(bx)} ${n(by - 14)}" fill="none" stroke="#eec19a" stroke-width="1.6" marker-end="url(#mtg-arrow)"/>`;
        if (!a.blockers.length)
          out += label(br.x + br.w / 2, br.y + br.h / 2, 'Unblocked', 10, br.w);
        const blockers = a.blockers.slice(0, 3);
        blockers.forEach((b, j) => {
          const v = M.reference(state, b),
            bw = br.w / blockers.length;
          out += card(
            v.player,
            v.zone,
            v.index,
            { x: br.x + j * bw + 5, y: br.y, w: bw - 10, h: br.h },
            { angle: 2 },
          );
        });
        out += overflow(
          br.x + br.w - 25,
          br.y + br.h - 5,
          a.blockers.length - blockers.length,
        );
      });
      return (
        out + overflow(r.x + r.w - 30, r.y + r.h - 12, attacks.length - shown.length)
      );
    }
    function baseScene(r, landscape = false) {
      const base = render(
        {
          ...state,
          stage: landscape ? { ...state.stage, width: 1920, height: 1080 } : state.stage,
          extras: { ...state.extras, focus: null },
        },
        { assets, seenZones: counted },
      );
      base.assets.forEach((definition) =>
        requested.set(T.scryfallAssetKey(definition), definition),
      );
      renderedCards += base.metrics.renderedCards;
      visibleZoneCards += base.metrics.visibleZoneCards;
      // Each nested scene owns its definitions, including card and portrait clips.
      const svg = base.svg
        .replace(/\sid="([^"]+)"/g, ' id="context-$1"')
        .replace(/url\(#([^)]+)\)/g, 'url(#context-$1)')
        .replace(
          /<svg\b[^>]*>/,
          (tag) =>
            tag.replace(/\s(?:x|y|width|height)="[^"]*"/g, '').slice(0, -1) +
            ` x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}">`,
        );
      return `<g data-base-scene="true">${svg}</g>`;
    }
    function cardDetail(r) {
      const focus = state.extras.focus,
        { player: p, zone: z, index } = M.reference(state, focus.target);
      if (!inScope(p.id)) return zoneDetail(r);
      const annotation = T.annotationAt(state, p, z, index),
        concealed = !canSee(p, z) || annotation.faceDown === true,
        definition = concealed ? null : T.cardAt(state, p, z, index);
      const title = concealed ? 'Concealed card' : focus.title || definition.name;
      const subtitle = `${p.name} · ${z.name}`;
      if (focus.layout === 'sidecar' || focus.layout === 'spotlight') {
        const sidecar = focus.layout === 'sidecar';
        const scene = sidecar
          ? l.portrait
            ? { x: r.x, y: r.y + 42, w: r.w, h: (r.w * 9) / 16 }
            : { x: r.x, y: r.y + r.h * 0.13, w: r.w * 0.65, h: (r.w * 0.65 * 9) / 16 }
          : { x: 0, y: 0, w: W, h: H };
        let out = baseScene(scene, sidecar && l.portrait);
        if (!sidecar)
          out += `<rect width="${W}" height="${H}" fill="${dark}" opacity="${focus.dim ?? 0.74}"/>`;
        out += focusTitle(r, title, subtitle);
        const region = sidecar
          ? l.portrait
            ? {
                x: r.x + r.w * 0.08,
                y: scene.y + scene.h + 40,
                w: r.w * 0.84,
                h: r.y + r.h - scene.y - scene.h - 40,
              }
            : { x: r.x + r.w * 0.69, y: r.y + 25, w: r.w * 0.3, h: r.h - 25 }
          : { x: r.x + r.w * 0.12, y: r.y + 45, w: r.w * 0.76, h: r.h - 45 };
        const area = { ...region, h: region.h - 82 };
        out +=
          `<g data-card-focus="${focus.layout}" data-focus-visibility="${concealed ? 'backs' : 'faces'}">` +
          card(p, z, index, area, { angle: -1.5, badge: false, upright: true });
        const info = { x: region.x, y: region.y + region.h - 60, w: region.w, h: 60 };
        out +=
          frame(info, { cut: 10, opacity: 0.9 }) +
          fit(
            info.x + info.w / 2,
            info.y + 25,
            title,
            17,
            info.w - 30,
            ink,
            'text-anchor="middle" font-family="Georgia,serif"',
          ) +
          fit(
            info.x + info.w / 2,
            info.y + 45,
            concealed ? subtitle : focus.caption || subtitle,
            11,
            info.w - 30,
            gold,
            'text-anchor="middle"',
          );
        return out + '</g>';
      }
      let out =
        `<g data-card-focus="showcase" data-focus-visibility="${concealed ? 'backs' : 'faces'}">` +
        focusTitle(r, title, subtitle);
      const area = l.portrait
        ? { x: r.x + r.w * 0.17, y: r.y + 55, w: r.w * 0.66, h: r.h * 0.76 }
        : { x: r.x + 38, y: r.y + 26, w: r.w * 0.46, h: r.h - 47 };
      out += card(p, z, index, area, { angle: -2, badge: false, upright: true });
      const info = l.portrait
        ? { x: r.x + 24, y: r.y + r.h * 0.83, w: r.w - 48, h: r.h * 0.15 }
        : {
            x: r.x + r.w * 0.57,
            y: r.y + r.h * 0.2,
            w: r.w * 0.38,
            h: r.h * 0.52,
          };
      out +=
        frame(info, { opacity: 0.78, cut: 20 }) +
        icon('mana', info.x + info.w / 2, info.y + 34, 35) +
        fit(
          info.x + info.w / 2,
          info.y + 76,
          concealed ? 'CARD FACES CONCEALED' : definition.name,
          18,
          info.w - 30,
          ink,
          'text-anchor="middle" font-family="Georgia,serif"',
        ) +
        fit(
          info.x + info.w / 2,
          info.y + 101,
          `${p.name} · ${z.name}`,
          12,
          info.w - 30,
          muted,
          'text-anchor="middle"',
        );
      if (!concealed) {
        const details = [
          focus.caption,
          annotation.badge,
          ...(annotation.tapped ? ['Tapped'] : []),
          ...(annotation.tags || []),
          ...(annotation.counters || []).map(
            (v) => `${v.name}: ${T.formatCounter(v.count)}`,
          ),
        ].filter(Boolean);
        details.slice(0, 3).forEach((v, i) => {
          out += fit(
            info.x + info.w / 2,
            info.y + 132 + i * 23,
            v,
            12,
            info.w - 30,
            gold,
            'text-anchor="middle"',
          );
        });
      }
      return out + '</g>';
    }
    const audience = l.viewer ? `${l.viewer.name}'s perspective` : 'Public table';
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${state.stage.width}" height="${state.stage.height}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`MTG 26 · ${audience} · ${c.focus}`)}"><defs>
    <linearGradient id="mtg-metal" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="${C.metal0}"/><stop offset=".24" stop-color="${C.metal1}"/><stop offset=".48" stop-color="${C.metal2}"/><stop offset=".73" stop-color="${C.metal3}"/><stop offset="1" stop-color="${C.metal4}"/></linearGradient>
    <linearGradient id="mtg-edge"><stop stop-color="${C.edge}" stop-opacity="0"/><stop offset=".5" stop-color="${C.edgeLight}"/><stop offset="1" stop-color="${C.edge}" stop-opacity="0"/></linearGradient>
    <linearGradient id="mtg-portrait-shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="${C.shade}" stop-opacity="0"/><stop offset="1" stop-color="${C.shade}" stop-opacity=".6"/></linearGradient>
    <radialGradient id="mtg-medallion"><stop stop-color="${C.medallion}"/><stop offset="1" stop-color="${C.medallionEdge}"/></radialGradient>
    <radialGradient id="mtg-vignette"><stop offset=".23" stop-color="${C.vignette}" stop-opacity="0"/><stop offset="1" stop-color="${C.vignetteEdge}" stop-opacity=".74"/></radialGradient>
    <filter id="mtg-card-shadow" x="-45%" y="-30%" width="190%" height="180%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="6" stdDeviation="3" flood-color="${C.cardShadow}" flood-opacity=".8"/></filter>
    <filter id="mtg-frame-shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="${C.frameShadow}" flood-opacity=".55"/></filter>
    <filter id="mtg-glint" x="-600%" y="-600%" width="1300%" height="1300%"><feGaussianBlur stdDeviation="5"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <marker id="mtg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5 0 10 3 5Z" fill="#eec19a"/></marker><clipPath id="mtg-crop"><rect width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#mtg-crop)" font-family="Arial,Helvetica,sans-serif"><rect width="${W}" height="${H}" fill="${C.table}"/>`;
    // A caller's backgroundUrl replaces the named background; either is decoration, drawn under the vignette.
    const backdrop = c.backgroundUrl || (c.background !== 'none' ? asset(`backgrounds/guardian-${c.background}.png`) : '');
    if (backdrop)
      out += `<image data-background-image="true" href="${esc(backdrop)}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`;
    out += `<rect width="${W}" height="${H}" fill="url(#mtg-vignette)"/><rect x="9" y="9" width="${W - 18}" height="${H - 18}" fill="none" stroke="${gold}" stroke-opacity=".24"/><rect width="${W}" height="29" fill="${C.bar}" fill-opacity=".79"/>${text(23, 19, 'MTG 26', 10, gold, 'font-family="Georgia,serif" letter-spacing="2.5"')}${fit(111, 19, audience, 9, W * 0.22, muted, 'letter-spacing=".6"')}`;
    const phaseX = W * (l.portrait ? 0.36 : 0.34),
      phaseWidth = (W * (l.portrait ? 0.41 : 0.34)) / M.phases.length;
    M.phases.forEach((phase, i) => {
      const x = phaseX + i * phaseWidth,
        current = c.phase === phase;
      out += text(
        x,
        19,
        M.phaseNames[i].toUpperCase(),
        l.portrait ? 7 : 8,
        current ? ink : muted,
        `letter-spacing="1" opacity="${current ? 1 : 0.55}"`,
      );
      if (current)
        out += `<path d="M${n(x)} 25h${n(phaseWidth - 14)}" stroke="${gold}"/>`;
    });
    if (!l.stack)
      out += fit(
        W - 23,
        19,
        `${c.turn ? `TURN ${c.turn} · ` : ''}${active ? active.name.toUpperCase() : ''}`,
        9,
        W * 0.2,
        gold,
        'text-anchor="end" letter-spacing="1"',
      );
    if (l.table) {
      l.boards.forEach((p) => {
        out += opponent(p);
      });
      if (l.crest) {
        out +=
          frame(l.crest, { opacity: 0.79, cut: 24 }) +
          sigil(l.crest.x + l.crest.w / 2, l.crest.y + l.crest.h * 0.3, 62) +
          text(
            l.crest.x + l.crest.w / 2,
            l.crest.y + l.crest.h * 0.65,
            'GREAT',
            10,
            gold,
            'text-anchor="middle" letter-spacing="3"',
          ) +
          text(
            l.crest.x + l.crest.w / 2,
            l.crest.y + l.crest.h * 0.74,
            'IDEAS',
            10,
            gold,
            'text-anchor="middle" letter-spacing="3"',
          ) +
          text(
            l.crest.x + l.crest.w / 2,
            l.crest.y + l.crest.h * 0.83,
            'ENDURE',
            10,
            gold,
            'text-anchor="middle" letter-spacing="3"',
          );
      }
      out +=
        battlefield(l.owner, l.battlefield) +
        lands(l.owner, l.lands) +
        ownerPiles(l.owner, l.piles);
      if (l.command) out += pile(l.owner, zoneOf(l.owner, 'command'), l.command);
    } else {
      if (l.roster) out += roster(l.roster);
      if (state.extras.focus) out += cardDetail(l.detail);
      else if (c.focus === 'combat') out += combatDetail(l.detail);
      else if (c.focus === 'stack') out += stackDetail(l.detail);
      else out += zoneDetail(l.detail);
    }
    out += hero(l.owner, l.hero);
    if (l.hand) out += hand(l.viewer || l.owner, l.hand);
    if (l.stack)
      out += `<g data-focus="stack" style="cursor:pointer">${frame(l.stack, { opacity: 0.94, cut: 7 })}${text(l.stack.x + l.stack.w / 2, l.stack.y + l.stack.h * 0.68, `STACK · ${c.stack.length}  ↗`, 9, gold, 'text-anchor="middle" letter-spacing="1.5"')}</g>`;
    out +=
      fit(
        22,
        H - 9,
        `${priority ? `${priority.name.toUpperCase()} HAS PRIORITY` : 'MTG 26'}${c.step ? `  /  ${c.step.toUpperCase()}` : ''}`,
        8,
        W * 0.65,
        gold,
        'letter-spacing="1.2"',
      ) +
      text(
        W - 22,
        H - 9,
        'MAGIC: THE GATHERING · SCRYFALL',
        7,
        gold,
        'text-anchor="end" letter-spacing="1"',
      ) +
      '</g></svg>';
    return {
      svg: out,
      handlesFocus: true,
      assets: [...requested.values()],
      metrics: {
        renderedCards,
        totalCards,
        visibleZoneCards,
        width: state.stage.width,
        height: state.stage.height,
        viewerId: state.view.viewerId,
        focus: state.extras.focus ? 'card' : c.focus,
        ...(state.extras.focus
          ? {
              focusLayout: state.extras.focus.layout,
              focusedCard: { ...state.extras.focus.target },
            }
          : {}),
      },
    };
  }
  T.registerScene('mtg', render);
})(globalThis);
