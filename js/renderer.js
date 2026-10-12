(function (global) {
  'use strict';
  const T = global.Tabletop;
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
    );
  const num = (n) => Math.round(n * 100) / 100;
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const countLabel = (n) =>
    n >= 1000000
      ? `${num(n / 1000000)}m`
      : n >= 10000
        ? `${num(n / 1000)}k`
        : n.toLocaleString('en-US');
  const suits = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  function text(x, y, value, size, fill, extra = '') {
    return `<text x="${num(x)}" y="${num(y)}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
  }
  function artMarkup(kind, color = '#a56243') {
    const colors = ['#bb7250', '#596d80', '#7b8865', '#897294'];
    color = colors[kind] || color;
    const motifs = [
      '<circle cx="35" cy="40" r="13" fill="#edd09a"/><path d="M6 80L24 46 44 80M27 80L49 50 67 80" fill="#654f42"/><path d="M24 46L17 59 29 56Z" fill="#f1e0b7"/>',
      '<circle cx="40" cy="38" r="14" fill="#e5d9ae"/><circle cx="46" cy="33" r="13" fill="#596d80"/><path d="M5 65Q22 53 37 65T67 65M5 73Q22 61 37 73T67 73M5 81Q22 69 37 81T67 81" fill="none" stroke="#c2cbb7" stroke-width="1.5"/>',
      '<path d="M35 23L17 52H25L11 69H31V83H39V69H59L45 52H53Z" fill="#d9ddba"/><path d="M35 33V76" stroke="#526047" stroke-width="1.4"/>',
      '<path d="M35 22L40 44 59 50 40 56 35 78 30 56 11 50 30 44Z" fill="#ead3b2"/><circle cx="35" cy="50" r="7" fill="#897294"/><circle cx="15" cy="28" r="1.6" fill="#ead3b2"/><circle cx="56" cy="73" r="1.6" fill="#ead3b2"/>',
    ];
    return `<rect x="5" y="5" width="60" height="79" rx="3" fill="${color}"/><rect x="9" y="9" width="52" height="70" rx="24" fill="none" stroke="#efe2c0" stroke-opacity=".35" stroke-width=".7"/>${motifs[kind] || motifs[0]}`;
  }
  function faceMarkup(card, theme, faceDown = false, id = 'card', assets) {
    let out =
      '<rect width="70" height="100" rx="5" fill="#f5efdf" stroke="#d9d2c1" stroke-width=".7"/>';
    if (faceDown) {
      out += `<rect x="3" y="3" width="64" height="94" rx="3" fill="${theme.back}"/><rect x="7" y="7" width="56" height="86" rx="2" fill="none" stroke="#f3ddbf" stroke-opacity=".65" stroke-width=".6"/>`;
      for (let y = 12; y < 92; y += 9)
        for (let x = 12; x < 62; x += 9)
          out += `<path d="M${x} ${y - 3}l3 3-3 3-3-3Z" fill="none" stroke="#f4dcba" stroke-opacity=".25" stroke-width=".6"/>`;
      out +=
        '<path d="M35 29L51 50 35 71 19 50Z" fill="#f1ddba"/><path d="M35 35L46 50 35 65 24 50Z" fill="none" stroke="' +
        theme.back +
        '" stroke-width="1"/>';
      out += text(
        35,
        56,
        '♠',
        19,
        theme.back,
        'text-anchor="middle" font-family="Georgia,serif"',
      );
      return out;
    }
    if (card.scryfallId) {
      const asset = assets?.get(T.scryfallAssetKey(card)) || T.scryfall?.peek(card);
      if (asset)
        return `<title>${esc(asset.name)} · Magic: The Gathering · ${esc(asset.artist)}</title><image href="${esc(asset.image)}" width="70" height="100" preserveAspectRatio="xMidYMid meet"/>`;
      return (
        out +
        text(35, 45, 'MTG', 12, '#594c3c', 'text-anchor="middle"') +
        text(35, 61, 'Loading card…', 6, '#594c3c', 'text-anchor="middle"')
      );
    }
    if (card.artUrl && card.artMode === 'full-card')
      return `<title>${esc(card.name)}</title><image href="${esc(card.artUrl)}" width="70" height="100" preserveAspectRatio="xMidYMid meet"/>`;
    if (card.artUrl || card.art !== undefined || !card.suit) {
      out += artMarkup(card.art ?? 0);
      if (card.artUrl)
        out += `<defs><clipPath id="${id}"><rect x="5" y="5" width="60" height="79" rx="3"/></clipPath></defs><image href="${esc(card.artUrl)}" x="5" y="5" width="60" height="79" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
      out += text(
        35,
        92,
        short(card.name, 20),
        5.5,
        '#594c3c',
        'text-anchor="middle" font-family="Georgia,serif"',
      );
      return out;
    }
    const ink = ['hearts', 'diamonds'].includes(card.suit) ? '#ab4d40' : '#263d36';
    const symbol = suits[card.suit],
      rank = card.rank || '';
    out += `<g font-family="Georgia,serif" font-weight="bold">${text(7, 15, rank, rank.length > 1 ? 11 : 13, ink)}${text(7.3, 26, symbol, 11, ink)}<g transform="translate(70 100) rotate(180)">${text(7, 15, rank, rank.length > 1 ? 11 : 13, ink)}${text(7.3, 26, symbol, 11, ink)}</g></g>`;
    if (['J', 'Q', 'K'].includes(rank)) {
      out += `<rect x="18" y="18" width="34" height="64" rx="16" fill="${ink}" fill-opacity=".045"/><path d="M35 25L48 50 35 75 22 50Z" fill="none" stroke="${ink}" stroke-width=".7"/><path d="M27 37L24 29 31 32 35 25 39 32 46 29 43 37Z" fill="${ink}"/><g transform="translate(70 100) rotate(180)"><path d="M27 37L24 29 31 32 35 25 39 32 46 29 43 37Z" fill="${ink}"/></g>${text(35, 57, symbol, 24, ink, 'text-anchor="middle" font-family="Georgia,serif"')}`;
    } else {
      const n = rank === 'A' ? 1 : Math.min(10, Math.max(1, parseInt(rank, 10) || 1));
      const positions =
        n === 1
          ? [[35, 50]]
          : n <= 3
            ? Array.from({ length: n }, (_, i) => [35, 30 + (i * 40) / (n - 1)])
            : (() => {
                const pairs = n <= 5 ? 2 : n <= 8 ? 3 : 4;
                const p = Array.from({ length: pairs }, (_, i) => [
                  [25, 28 + (i * 44) / (pairs - 1)],
                  [45, 28 + (i * 44) / (pairs - 1)],
                ]).flat();
                for (let i = p.length; i < n; i++)
                  p.push([35, n - pairs * 2 === 1 ? 50 : i === pairs * 2 ? 39 : 61]);
                return p;
              })();
      positions.forEach(([x, y]) => {
        out += `<g transform="translate(${x} ${y})${y > 50 ? ' rotate(180)' : ''}">${text(0, n === 1 ? 12 : 5.5, symbol, n === 1 ? 39 : 17, ink, 'text-anchor="middle" font-family="Georgia,serif"')}</g>`;
      });
    }
    return out;
  }
  function fittedText(x, y, value, size, width, fill, extra = '') {
    const characters = Array.from(String(value));
    const spacing = Number(extra.match(/letter-spacing="([\d.]+)"/)?.[1] || 0);
    const estimate =
      characters.reduce(
        (sum, character) =>
          sum +
          (/[MW@#%&]/.test(character)
            ? 1
            : /[il .,:;'!]/.test(character)
              ? 0.35
              : /[\x20-\x7e]/.test(character)
                ? 0.75
                : 1),
        0,
      ) *
        size +
      characters.length * spacing;
    const fit =
      estimate > width
        ? ` textLength="${num(Math.max(1, width))}" lengthAdjust="spacingAndGlyphs"`
        : '';
    return text(x, y, value, size, fill, extra + fit);
  }
  function counterChip(counter, view, theme, x, y, w, h = 34) {
    const value = T.formatCounter(counter.count, T.counterOptions(counter, view));
    const exact = T.formatCounter(counter.count);
    const ink = counter.color || theme.accent;
    return (
      `<g data-counter="${esc(counter.id || counter.name)}" data-counter-value="${esc(counter.count)}"><title>${esc(`${counter.name}: ${exact}`)}</title><rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${h}" rx="5" fill="${ink}" fill-opacity=".065"/>` +
      fittedText(
        x + 8,
        y + 10,
        counter.name.toUpperCase(),
        7,
        w - 16,
        theme.muted,
        'letter-spacing=".7"',
      ) +
      fittedText(x + 8, y + h - 5, value, 16, w - 16, ink, 'font-weight="600"') +
      '</g>'
    );
  }
  function glowSVG(glow, id) {
    if (!glow) return '';
    const effect = T.glowEffect(glow.preset),
      color = glow.color || effect.color,
      strength = glow.strength ?? 1;
    const filter = `glow-${id}`;
    let accents = '';
    if (glow.preset === 'arcane')
      accents = '<path d="M0 6l-5-6 5-6 5 6ZM70 94l-5 6 5 6 5-6Z"/>';
    if (glow.preset === 'ember')
      accents = '<path d="M-3 17V-3h20M53 103h20V83" stroke-width="2.2"/>';
    if (glow.preset === 'frost')
      accents =
        '<path d="M-5 7h14M2 0v14M63 93h14M70 86v14M-1 2l7 10M66 88l8 10" stroke-width=".7"/>';
    if (glow.preset === 'neon')
      accents = '<rect x="-4" y="-4" width="78" height="108" rx="9" stroke-width=".65"/>';
    return `<g data-glow="${glow.preset}" pointer-events="none"><defs><filter id="${filter}" x="-70%" y="-50%" width="240%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${num(effect.blur * strength)}"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="-1.5" y="-1.5" width="73" height="103" rx="7" fill="none" stroke="${color}" stroke-width="${num(effect.line * strength + 1)}" opacity=".9" filter="url(#${filter})"/><g fill="none" stroke="${color}" stroke-width="1.2">${accents}</g></g>`;
  }
  function decoratedCard(
    state,
    definition,
    annotation,
    concealed,
    id,
    assets,
    glow,
    details = true,
  ) {
    const theme = T.themes[state.stage.theme];
    const angle = annotation.rotation ?? (annotation.tapped ? 90 : 0);
    const radians = (angle * Math.PI) / 180;
    const fit = Math.min(
      1,
      70 / (70 * Math.abs(Math.cos(radians)) + 100 * Math.abs(Math.sin(radians))),
      100 / (100 * Math.abs(Math.cos(radians)) + 70 * Math.abs(Math.sin(radians))),
    );
    let out = `<g data-card-state="${concealed ? 'concealed' : 'visible'}" transform="translate(35 50) scale(${num(fit)}) rotate(${angle}) translate(-35 -50)">${glowSVG(glow, id)}<g filter="url(#${id === 'featured-card' ? 'focus-shadow' : 'card-shadow'})">${faceMarkup(definition, theme, concealed, id, assets)}</g></g>`;
    if (concealed || !details) return out;
    const counters = annotation.counters || [];
    const badges = counters
      .slice(0, 2)
      .map((c) => `${c.name} ${T.formatCounter(c.count, T.counterOptions(c, state.view))}`);
    if (counters.length > 2) badges.push(`+${counters.length - 2} counters`);
    if (annotation.tags?.length) badges.push(annotation.tags.join(' · '));
    badges.slice(0, 3).forEach((label, index) => {
      out +=
        `<g><title>${esc(label)}</title><rect x="-3" y="${4 + index * 11}" width="76" height="10" rx="3" fill="${theme.background}" stroke="${theme.accent}" stroke-width=".4"/>` +
        fittedText(1, 11 + index * 11, label, 5.3, 68, theme.ink) +
        '</g>';
    });
    if (annotation.badge)
      out +=
        `<rect x="27" y="84" width="44" height="12" rx="4" fill="${theme.background}" stroke="${theme.accent}" stroke-width=".5"/>` +
        fittedText(31, 92.5, annotation.badge, 7, 35, theme.ink, 'font-weight="600"');
    return out;
  }
  function composeFocus(result, state, { assets } = {}) {
    const focus = state.extras.focus;
    if (!focus) return result;
    const player = state.players.find((p) => p.id === focus.target.playerId);
    if (
      state.view.viewerId &&
      state.view.playerScope === 'self' &&
      state.view.viewerId !== player.id
    )
      return result;
    const zone = player.zones.find((z) => z.id === focus.target.zoneId);
    const annotation = T.annotationAt(state, player, zone, focus.target.index);
    const concealed = !T.canSeeFaces(state, player, zone) || annotation.faceDown === true;
    const definition = concealed ? null : T.cardAt(state, player, zone, focus.target.index);
    const requested = new Map(
      (result.assets || []).map((card) => [T.scryfallAssetKey(card), card]),
    );
    if (definition?.scryfallId) requested.set(T.scryfallAssetKey(definition), definition);
    const asset =
      definition?.scryfallId &&
      (assets?.get(T.scryfallAssetKey(definition)) || T.scryfall?.peek(definition));
    const title = concealed ? 'Concealed card' : focus.title || asset?.name || definition.name;
    const caption = concealed
      ? `${player.name} · ${zone.name}`
      : focus.caption || `${player.name} · ${zone.name} · Card ${focus.target.index + 1}`;
    const { width: W, height: H } = T.layout.stageSize(state.stage),
      theme = T.themes[state.stage.theme];
    const area = { x: 48, y: 145, w: W - 96, h: H - 215 };
    let scene = { x: 0, y: 0, w: W, h: H },
      card,
      info;
    const stack = W / H < 0.8;
    if (focus.layout === 'sidecar') {
      scene = stack
        ? { x: 48, y: 140, w: W - 96, h: area.h * 0.34 }
        : { x: 32, y: 140, w: (W - 96) * 0.54, h: area.h };
      const region = stack
        ? { x: 48, y: scene.y + scene.h + 24, w: area.w, h: area.h - scene.h - 24 }
        : { x: scene.x + scene.w + 36, y: 158, w: W - scene.x - scene.w - 100, h: area.h - 20 };
      const cw = Math.min(region.w * 0.83, (region.h - 160) * 0.7);
      card = {
        x: region.x + (region.w - cw) / 2,
        y: region.y + 10,
        w: Math.max(35, cw),
        h: Math.max(50, cw / 0.7),
      };
      info = {
        x: region.x,
        y: card.y + card.h + 24,
        w: region.w,
        h: H - 60 - card.y - card.h - 24,
      };
    } else if (focus.layout === 'showcase' && !stack) {
      const cw = Math.min(area.w * 0.41, (area.h - 90) * 0.7);
      card = { x: area.x + 34, y: area.y + (area.h - cw / 0.7) / 2, w: cw, h: cw / 0.7 };
      info = {
        x: area.x + area.w * 0.51,
        y: area.y + Math.max(45, area.h * 0.15),
        w: area.w * 0.44,
        h: area.h * 0.72,
      };
    } else {
      const cw = Math.min(area.w * 0.62, (area.h - 200) * 0.7);
      card = { x: (W - cw) / 2, y: area.y + 10, w: cw, h: cw / 0.7 };
      info = {
        x: W * 0.19,
        y: card.y + card.h + 26,
        w: W * 0.62,
        h: H - 60 - card.y - card.h - 26,
      };
    }
    // Nest the existing scene unchanged: focus is a presentation layer over any registered scene.
    const base = result.svg.replace(/<svg\b[^>]*>/, (tag) => {
      let root = tag.replace(/\s(?:x|y|width|height)="[^"]*"/g, '');
      return (
        root.slice(0, -1) +
        ` x="${num(scene.x)}" y="${num(scene.y)}" width="${num(scene.w)}" height="${num(scene.h)}">`
      );
    });
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${state.stage.width}" height="${state.stage.height}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><defs><filter id="focus-shadow" x="-40%" y="-30%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-opacity=".25"/></filter></defs><rect width="${W}" height="${H}" fill="${theme.background}"/><g data-base-scene="true">${base}</g>`;
    if (focus.layout !== 'sidecar')
      out += `<rect width="${W}" height="${H}" fill="${theme.background}" opacity="${focus.dim ?? 0.7}"/>`;
    if (focus.layout === 'showcase')
      out += `<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" rx="22" fill="${theme.surface}" fill-opacity=".92" stroke="${theme.accent}" stroke-opacity=".25"/>`;
    out += `<rect width="${W}" height="126" fill="${theme.background}"/>`;
    out += `<g data-card-focus="${focus.layout}" data-focus-visibility="${concealed ? 'backs' : 'faces'}" font-family="Arial,Helvetica,sans-serif">`;
    out += text(52, 70, 'CARD STUDY', 14, theme.accent, 'font-weight="600" letter-spacing="3"');
    out += fittedText(52, 99, `${player.name} · ${zone.name}`, 15, W - 120, theme.muted);
    const glow = focus.preset
      ? focus
      : T.highlightAt(state, player, zone, focus.target.index, definition);
    out += `<g transform="translate(${num(card.x)} ${num(card.y)}) scale(${num(card.w / 70)})">${decoratedCard(state, definition, { ...annotation, rotation: 0, tapped: false }, concealed, 'featured-card', assets, glow, false)}</g>`;
    out += `<g data-focus-info="true"><title>${esc(title + ' · ' + caption)}</title>`;
    out += fittedText(info.x, info.y + 22, title, 24, info.w, theme.ink, 'font-weight="600"');
    out += fittedText(info.x, info.y + 46, caption, 12, info.w, theme.muted);
    let offset = 62;
    if (!concealed) {
      const tags = [
        ...(annotation.tags || []),
        ...(annotation.badge ? [annotation.badge] : []),
        ...(annotation.tapped ? ['Tapped / turned'] : []),
      ];
      if (tags.length) {
        out += fittedText(info.x, info.y + offset, tags.join(' · '), 11, info.w, theme.accent);
        offset += 16;
      }
      const counters = annotation.counters || [];
      const columns = Math.max(1, Math.min(3, Math.floor(info.w / 135)));
      const rows = Math.max(0, Math.floor((info.h - offset) / 40));
      const capacity = columns * rows,
        shown = Math.min(
          counters.length,
          counters.length > capacity ? Math.max(0, capacity - 1) : capacity,
        );
      counters.slice(0, shown).forEach((counter, i) => {
        out += counterChip(
          counter,
          state.view,
          theme,
          info.x + ((i % columns) * info.w) / columns,
          info.y + offset + Math.floor(i / columns) * 40,
          info.w / columns - 6,
          36,
        );
      });
      if (shown < counters.length)
        out +=
          `<g><title>${esc(
            counters
              .slice(shown)
              .map((c) => `${c.name}: ${T.formatCounter(c.count)}`)
              .join(' · '),
          )}</title>` +
          text(
            info.x,
            Math.min(H - 36, info.y + offset + Math.floor(shown / columns) * 40 + 20),
            `+${counters.length - shown} counters · use Showcase for detail`,
            10,
            theme.muted,
          ) +
          '</g>';
    }
    out += '</g></g></svg>';
    return {
      ...result,
      svg: out,
      assets: [...requested.values()],
      metrics: {
        ...result.metrics,
        renderedCards: result.metrics.renderedCards + 1,
        focusedCard: { ...focus.target },
        focusLayout: focus.layout,
      },
    };
  }
  function cardSVG(
    card,
    { theme = 'evergreen', faceDown = false, id = 'card-preview', assets } = {},
  ) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="200" viewBox="-1 -1 72 102" role="img" aria-label="${esc(faceDown ? 'Face-down card' : card.name)}">${faceMarkup(card, T.themes[theme], faceDown, id, assets)}</svg>`;
  }
  function avatarSVG(player = {}, { size = 512 } = {}) {
    T.validateAvatar(player);
    if (!Number.isInteger(size) || size < 1 || size > 4096)
      throw new Error('Avatar size must be an integer from 1 to 4096.');
    const name = player.name?.trim() || 'Player';
    const words = name.split(/\s+/u);
    const last = words[words.length - 1].replace(/^0+(?=\d)/, '');
    const initials = Array.from(
      (Array.from(words[0])[0] +
        (words.length > 1 ? Array.from(last)[0] : '')).toUpperCase(),
    ).slice(0, 2).join('');
    const color = player.color || '#52745e';
    const [r, g, b] = color.slice(1).match(/../g).map((value) => parseInt(value, 16));
    const ink = r * 0.299 + g * 0.587 + b * 0.114 > 155 ? '#17382f' : '#fffdf5';
    // The fallback sits behind the image. Nested SVG clips the centered cover crop
    // without document-wide clip IDs, even when several previews share a page.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" overflow="hidden" role="img" aria-label="${esc(`${name} avatar`)}" data-avatar="${esc(player.id || '')}"><title>${esc(`${name} avatar`)}</title><g data-avatar-fallback="initials"><rect width="100" height="100" fill="${color}"/><path d="M0 100L100 0V100Z" fill="#fff" opacity=".06"/><text x="50" y="53" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="${Array.from(initials).length > 1 ? 38 : 48}" font-weight="600" fill="${ink}">${esc(initials)}</text></g>${player.avatarUrl ? `<image data-avatar-image="true" href="${esc(player.avatarUrl)}" width="100" height="100" preserveAspectRatio="xMidYMid slice"/>` : ''}</svg>`;
  }
  function renderTabletop(state, { assets } = {}) {
    const requestedAssets = new Map();
    const { width: W, height: H } = T.layout.stageSize(state.stage);
    const theme = T.themes[state.stage.theme],
      deck = state.decks.find((d) => d.id === state.activeDeckId);
    const viewer = state.players.find((p) => p.id === state.view.viewerId);
    let renderedCards = 0,
      totalCards = 0,
      visibleCount = 0;
    state.players.forEach((p) =>
      p.zones.forEach((z) => {
        totalCards += z.count;
      }),
    );
    const font = 'Arial,Helvetica,sans-serif';
    let out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${state.stage.width}" height="${state.stage.height}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(viewer ? `Tabletop for ${viewer.name}` : state.view.mode === 'focus' ? 'Focused card zone' : 'Tabletop overview')}"><defs><radialGradient id="table-light"><stop stop-color="${theme.surface}"/><stop offset="1" stop-color="${theme.background}"/></radialGradient><pattern id="table-grain" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".48" fill="${theme.ink}" opacity=".1"/><circle cx="4" cy="4" r=".45" fill="#000" opacity=".1"/></pattern><filter id="card-shadow" color-interpolation-filters="sRGB" x="-30%" y="-20%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#071a12" flood-opacity=".26"/></filter><clipPath id="stage-crop"><rect width="${W}" height="${H}"/></clipPath></defs><g font-family="${font}" clip-path="url(#stage-crop)"><rect width="${W}" height="${H}" fill="url(#table-light)"/>`;
    if (state.stage.texture)
      out += `<rect width="${W}" height="${H}" fill="url(#table-grain)"/>`;
    out += `<rect x="23" y="23" width="${W - 46}" height="${H - 46}" rx="18" fill="none" stroke="${theme.accent}" stroke-opacity=".23" stroke-width="1.1"/><rect x="29" y="29" width="${W - 58}" height="${H - 58}" rx="14" fill="none" stroke="${theme.accent}" stroke-opacity=".07"/>`;
    out += text(52, 69, 'T A B L E T O P', 15, theme.accent, 'font-weight="600"');
    out += text(
      52,
      96,
      short(
        viewer
          ? `${viewer.name} · ${state.view.playerScope === 'self' ? 'Your board & hand' : 'Table & your hand'}`
          : deck.name,
        Math.floor((W - 300) / 8),
      ),
      16,
      theme.muted,
    );
    out += `<path d="M${W - 70} 52l9 13-9 13-9-13Z" fill="none" stroke="${theme.accent}" stroke-width="1.2"/>`;
    out += text(
      W - 97,
      70,
      `${String(state.players.length).padStart(2, '0')} PLAYERS`,
      12,
      theme.muted,
      'text-anchor="end" letter-spacing="1.5"',
    );
    out += `<line x1="48" y1="121" x2="${W - 48}" y2="121" stroke="${theme.border}" stroke-opacity=".65"/>`;

    function playerHeader(panel, player) {
      const { x, y, w } = panel;
      const counters = T.counterLayout(player, state.view, w, panel.h ?? H - 350);
      panel.header = counters.height;
      let result = `<g>${
        state.view.stats === 'hidden'
          ? ''
          : `<title>${esc(
              T.playerCounters(player)
                .map((c) => `${c.name}: ${T.formatCounter(c.count)}`)
                .join(' · '),
            )}</title>`
      }<g transform="translate(${x + 12} ${y + 7})">${avatarSVG(player, { size: 28 })}</g>`;
      if (counters.inline) {
        const cw = Math.min(160, w * 0.41);
        result += fittedText(
          x + 49,
          y + 29,
          player.name,
          15,
          w - cw - 70,
          theme.ink,
          'font-weight="600"',
        );
        const counter = { ...counters.items[0] };
        if (counters.hidden) counter.name += ` · +${counters.hidden} more`;
        result += counterChip(counter, state.view, theme, x + w - cw - 12, y + 7, cw, 32);
        return result + '</g>';
      }
      result += fittedText(
        x + 49,
        y + 29,
        player.name,
        15,
        w - (counters.overflowInline ? 139 : 69),
        theme.ink,
        'font-weight="600"',
      );
      if (counters.overflowInline)
        result += text(
          x + w - 14,
          y + 29,
          `+${counters.hidden} more`,
          10,
          theme.muted,
          'text-anchor="end"',
        );
      const cw = (w - 28) / counters.columns;
      counters.items.forEach((counter, i) => {
        result += counterChip(
          counter,
          state.view,
          theme,
          x + 14 + (i % counters.columns) * cw,
          y + 37 + Math.floor(i / counters.columns) * 34,
          cw - 5,
          31,
        );
      });
      if (counters.hidden && !counters.overflowInline) {
        const i = counters.items.length;
        result +=
          `<g data-counter-overflow="${counters.hidden}"><title>${esc(
            T.playerCounters(player)
              .slice(i)
              .map((c) => `${c.name}: ${T.formatCounter(c.count)}`)
              .join(' · '),
          )}</title>` +
          text(
            x + 22 + (i % counters.columns) * cw,
            y + 58 + Math.floor(i / counters.columns) * 34,
            `+${counters.hidden} counters`,
            11,
            theme.muted,
          ) +
          '</g>';
      }
      return result + '</g>';
    }
    function drawZone(player, z, rect, focus = false, largeCards = false) {
      const { x, y, w, h } = rect;
      const faceDown = !T.canSeeFaces(state, player, z);
      const labelHeight = state.view.labels ? (focus ? 44 : 25) : 6;
      let result = `<g data-player="${esc(player.id)}" data-zone="${esc(z.id)}" data-card-visibility="${faceDown ? 'backs' : 'faces'}" style="cursor:pointer"><title>${esc(`${player.name} · ${z.name} · ${z.count.toLocaleString('en-US')} cards${faceDown ? ' · concealed' : ''}. Click to focus.`)}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${focus ? 13 : 8}" fill="${theme.surface}" fill-opacity=".25" stroke="${theme.border}" stroke-opacity="${focus ? '.9' : '.55'}" stroke-dasharray="${z.count ? 'none' : '4 5'}"/>`;
      if (h < 40) {
        visibleCount += z.count;
        return (
          result +
          text(
            x + 6,
            y + h / 2 + 3,
            `${short(z.name, Math.max(3, Math.floor((w - 50) / 6)))} · ${countLabel(z.count)}`,
            9,
            theme.muted,
          ) +
          '</g>'
        );
      }
      if (state.view.labels) {
        result += text(
          x + (focus ? 22 : 10),
          y + (focus ? 29 : 17),
          short(z.name.toUpperCase(), Math.max(4, Math.floor((w - 58) / 6.5))),
          focus ? 14 : 10,
          theme.muted,
          `letter-spacing="${focus ? 1.6 : 0.7}"`,
        );
        result += text(
          x + w - (focus ? 22 : 10),
          y + (focus ? 29 : 17),
          countLabel(z.count),
          focus ? 15 : 11,
          theme.accent,
          'text-anchor="end"',
        );
      }
      const content = {
        x: x + 10,
        y: y + labelHeight + 5,
        w: w - 20,
        h: Math.max(4, h - labelHeight - (focus ? 32 : 13)),
      };
      if (!z.count) {
        result += text(
          x + w / 2,
          content.y + content.h / 2 + 2,
          '◇',
          focus ? 46 : 21,
          theme.muted,
          'text-anchor="middle" opacity=".4"',
        );
        if (focus || content.h > 54)
          result += text(
            x + w / 2,
            content.y + content.h / 2 + (focus ? 38 : 22),
            'Empty zone',
            focus ? 15 : 10,
            theme.muted,
            'text-anchor="middle" opacity=".6"',
          );
      }
      const layout = T.layout.cardsInZone(content, z, state.view.density, focus || largeCards);
      // Explicit position highlights in a grid/fan remain visible even beyond the sample cap.
      if (z.layout !== 'stack') {
        const requested = [
          ...new Set(
            state.extras.highlights
              .filter(
                (rule) =>
                  rule.target.playerId === player.id &&
                  rule.target.zoneId === z.id &&
                  rule.target.index !== undefined,
              )
              .map((rule) => rule.target.index),
          ),
        ];
        const missing = requested.filter(
          (index) => !layout.cards.some((card) => card.index === index),
        );
        const replaceable = layout.cards
          .filter((card) => !requested.includes(card.index))
          .reverse();
        missing.slice(0, replaceable.length).forEach((index, i) => {
          replaceable[i].index = index;
        });
      }
      layout.cards.forEach((card) => {
        const annotation = T.annotationAt(state, player, z, card.index);
        const concealed = faceDown || annotation.faceDown === true;
        const definition = concealed ? null : T.cardAt(state, player, z, card.index);
        if (definition?.scryfallId)
          requestedAssets.set(T.scryfallAssetKey(definition), definition);
        const glow = T.highlightAt(state, player, z, card.index, definition);
        const id = `art-${renderedCards++}`;
        result += `<g data-card-index="${card.index}"${definition ? ` data-card-id="${esc(definition.id)}"` : ''} transform="translate(${num(card.x)} ${num(card.y)}) rotate(${num(card.angle)} ${num(card.w / 2)} ${num(card.h * 0.9)})"><g transform="scale(${num(card.w / 70)})">${decoratedCard(state, definition, annotation, concealed, id, assets, glow)}</g></g>`;
      });
      visibleCount += z.count;
      if (layout.hidden && z.layout !== 'stack') {
        const label = `+${countLabel(layout.hidden)}`,
          bw = 22 + label.length * 7;
        result += `<rect x="${x + w - bw - 9}" y="${y + h - 25}" width="${bw}" height="19" rx="9.5" fill="${theme.background}" stroke="${theme.border}"/>${text(x + w - bw / 2 - 9, y + h - 12, label, 10, theme.ink, 'text-anchor="middle"')}`;
      }
      return result + '</g>';
    }
    out += `<g transform="translate(${W / 2} ${(H + 70) / 2}) scale(${state.view.zoom}) translate(${-W / 2} ${-(H + 70) / 2})">`;
    if (state.view.mode === 'player') {
      T.layout.perspectivePanels(state, W, H).forEach((panel) => {
        const player = panel.player;
        out += `<g data-player-panel="${esc(player.id)}" data-recipient="${!!panel.recipient}"><rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="13" fill="${theme.background}" fill-opacity=".28" stroke="${panel.recipient ? theme.accent : theme.border}" stroke-opacity="${panel.recipient ? '.7' : '.5'}"/>`;
        out += playerHeader(panel, player);
        if (panel.recipient) {
          T.layout.recipientZones(panel).forEach(({ zone, ...rect }) => {
            out += drawZone(player, zone, rect, false, true);
          });
        } else {
          const concealed = player.zones.filter(
            (z) => ['hand', 'library'].includes(z.id) && !T.canSeeFaces(state, player, z),
          );
          const boards = player.zones.filter((z) => !concealed.includes(z));
          if (boards.length) {
            const boardPanel = {
              ...panel,
              h: panel.h - (concealed.length ? 24 : 0),
              player: { ...player, zones: boards },
            };
            T.layout.zonePanels(boardPanel).forEach(({ zone, ...rect }) => {
              out += drawZone(player, zone, rect);
            });
          }
          concealed.forEach((zone, i) => {
            const x = panel.x + 14 + (i * (panel.w - 28)) / concealed.length;
            visibleCount += zone.count;
            out += `<g data-player="${esc(player.id)}" data-zone="${esc(zone.id)}" data-card-visibility="backs" style="cursor:pointer"><title>${esc(`${player.name} · ${zone.name} · ${zone.count} cards · concealed`)}</title>${text(x, panel.y + panel.h - 13, `${short(zone.name, 9)} ${countLabel(zone.count)} · ◇`, 10, theme.muted)}</g>`;
          });
        }
        out += '</g>';
      });
    } else if (state.view.mode === 'overview') {
      T.layout.playerPanels(state, W, H).forEach((panel) => {
        out += `<rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="13" fill="${theme.background}" fill-opacity=".28" stroke="${theme.border}" stroke-opacity=".45"/>`;
        out += playerHeader(panel, panel.player);
        T.layout.zonePanels(panel).forEach(({ zone, ...rect }) => {
          out += drawZone(panel.player, zone, rect);
        });
      });
    } else {
      const player = state.players.find((p) => p.id === state.view.playerId),
        z = player.zones.find((z) => z.id === state.view.zoneId);
      const header = { x: 48, y: 142, w: W - 96, h: H - 350 };
      out += playerHeader(header, player);
      const zoneY = 142 + header.header + 12;
      out += drawZone(
        player,
        z,
        { x: 48, y: zoneY, w: W - 96, h: Math.max(20, H - 182 - zoneY) },
        true,
      );
      const gap = 12,
        otherZones = player.zones.filter((item) => item.id !== z.id);
      const zw = (W - 96 - gap * (otherZones.length - 1)) / Math.max(1, otherZones.length);
      otherZones.forEach((item, i) => {
        const x = 48 + i * (zw + gap),
          y = H - 155;
        out += `<g data-player="${esc(player.id)}" data-zone="${esc(item.id)}" style="cursor:pointer"><title>${esc(item.name)} · ${item.count} cards</title><rect x="${x}" y="${y}" width="${zw}" height="64" rx="8" fill="${theme.surface}" fill-opacity=".25" stroke="${theme.border}" stroke-opacity=".5"/>${text(x + 14, y + 26, short(item.name.toUpperCase(), Math.max(4, Math.floor((zw - 30) / 8))), 11, theme.muted, 'letter-spacing="1"')}${text(x + 14, y + 48, countLabel(item.count) + ' cards', 14, theme.ink)}</g>`;
      });
    }
    out += '</g>';
    out += text(
      52,
      H - 45,
      `${theme.name.toUpperCase()}  /  ${viewer ? 'PLAYER VIEW' : state.view.mode === 'focus' ? 'ZONE STUDY' : 'TABLE STUDY'}`,
      10,
      theme.muted,
      'letter-spacing="1.3"',
    );
    out += text(
      W - 52,
      H - 45,
      requestedAssets.size ? 'MAGIC: THE GATHERING · SCRYFALL' : '♠  ♥  ♣  ♦',
      requestedAssets.size ? 9 : 16,
      theme.accent,
      'text-anchor="end" font-family="Georgia,serif"',
    );
    out += '</g></svg>';
    return {
      svg: out,
      assets: [...requestedAssets.values()],
      metrics: {
        renderedCards,
        totalCards,
        visibleZoneCards: visibleCount,
        width: state.stage.width,
        height: state.stage.height,
        viewerId: state.view.viewerId,
      },
    };
  }
  const scenes = new Map([['tabletop', renderTabletop]]);
  function renderDetailed(config = {}, options) {
    const state = T.normalize(config),
      renderer = scenes.get(state.scene);
    if (!renderer) throw new Error(`Scene "${state.scene}" is not registered.`);
    const result = renderer(state, options);
    return result.handlesFocus ? result : composeFocus(result, state, options);
  }
  async function renderDetailedAsync(config = {}, options = {}) {
    const state = T.normalize(config);
    const draft = renderDetailed(state);
    if (!draft.assets?.length) return draft;
    const assets = await T.resolveScryfall(draft.assets, options);
    return renderDetailed(state, { assets });
  }
  Object.assign(T, {
    escape: esc,
    countLabel,
    cardSVG,
    avatarSVG,
    renderDetailed,
    renderDetailedAsync,
    renderAsync: async (config, options) => (await renderDetailedAsync(config, options)).svg,
    render: (config) => renderDetailed(config).svg,
    renderPlayer: (config, playerId, options) =>
      renderDetailed(T.forPlayer(config, playerId, options)).svg,
    renderPlayers: (config, options) =>
      T.playerRequests(config, options).map(({ state, ...request }) => ({
        ...request,
        filename: T.playerFilename(state, request.playerId, request.scope, 'svg'),
        ...renderDetailed(state),
      })),
    registerScene(id, renderer) {
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(id) || typeof renderer !== 'function')
        throw new Error('A scene needs a valid ID and a renderer function.');
      scenes.set(id, renderer);
    },
    listScenes: () => [...scenes.keys()],
  });
})(globalThis);
