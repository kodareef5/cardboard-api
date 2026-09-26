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
  function cardSVG(
    card,
    { theme = 'evergreen', faceDown = false, id = 'card-preview', assets } = {},
  ) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="200" viewBox="-1 -1 72 102" role="img" aria-label="${esc(faceDown ? 'Face-down card' : card.name)}">${faceMarkup(card, T.themes[theme], faceDown, id, assets)}</svg>`;
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

    function playerHeader(panel, player, focus = false) {
      const { x, y, w } = panel;
      let result = `<circle cx="${x + 26}" cy="${y + 24}" r="10" fill="${player.color}" fill-opacity=".2"/><circle cx="${x + 26}" cy="${y + 24}" r="3.7" fill="${player.color}"/>`;
      const nameMax = Math.max(
        6,
        Math.floor(
          (w - (state.view.stats === 'hidden' ? 65 : state.view.stats === 'full' ? 195 : 125)) /
            9,
        ),
      );
      result += text(
        x + 45,
        y + 29,
        short(player.name, nameMax),
        15,
        theme.ink,
        'font-weight="600"',
      );
      if (state.view.stats !== 'hidden') {
        const stats = Object.entries(player.stats);
        const value =
          state.view.stats === 'compact'
            ? `${stats[0]?.[0] === 'life' ? '♥ ' : (stats[0]?.[0] || '') + ' '}${stats[0]?.[1] ?? 0}`
            : stats
                .slice(0, focus ? 6 : 2)
                .map(([key, val]) => `${short(key, 9)} ${val}`)
                .join('   ·   ');
        result += text(x + w - 18, y + 29, value, 13, theme.accent, 'text-anchor="end"');
      }
      return result;
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
      layout.cards.forEach((card) => {
        const definition = faceDown ? null : T.cardAt(state, player, z, card.index);
        if (definition?.scryfallId)
          requestedAssets.set(T.scryfallAssetKey(definition), definition);
        const id = `art-${renderedCards++}`;
        result += `<g transform="translate(${num(card.x)} ${num(card.y)}) rotate(${num(card.angle)} ${num(card.w / 2)} ${num(card.h * 0.9)})"><g transform="scale(${num(card.w / 70)})" filter="url(#card-shadow)">${faceMarkup(definition, theme, faceDown, id, assets)}</g></g>`;
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
      out += playerHeader({ x: 48, y: 142, w: W - 96 }, player, true);
      out += drawZone(player, z, { x: 48, y: 204, w: W - 96, h: H - 386 }, true);
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
    return renderer(state, options);
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
