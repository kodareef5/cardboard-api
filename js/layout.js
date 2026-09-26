(function (global) {
  'use strict';
  const T = global.Tabletop;
  function stageSize(stage) {
    const scale = 1000 / Math.min(stage.width, stage.height);
    return { width: stage.width * scale, height: stage.height * scale };
  }
  function playerPanels(state, width, height) {
    const count = state.players.length,
      aspect = width / height;
    let columns =
      count <= 2
        ? aspect > 1.4
          ? count
          : 1
        : count <= 4
          ? aspect < 0.7
            ? 1
            : 2
          : aspect > 1.4
            ? 3
            : 2;
    const rows = Math.ceil(count / columns),
      gap = 24;
    const available = { x: 48, y: 150, w: width - 96, h: height - 224 };
    const w = (available.w - (columns - 1) * gap) / columns;
    const h = (available.h - (rows - 1) * gap) / rows;
    return state.players.map((player, index) => {
      const row = Math.floor(index / columns),
        col = index % columns;
      const lastCount = count - row * columns;
      const rowOffset = lastCount < columns ? ((columns - lastCount) * (w + gap)) / 2 : 0;
      return {
        player,
        x: available.x + col * (w + gap) + rowOffset,
        y: available.y + row * (h + gap),
        w,
        h,
      };
    });
  }
  function zonePanels(panel) {
    const { player, x, y, w, h } = panel;
    const margin = 14,
      header = 47,
      gap = 10;
    const area = { x: x + margin, y: y + header, w: w - margin * 2, h: h - header - margin };
    const isStandard =
      player.zones.length === 4 &&
      ['library', 'battlefield', 'graveyard', 'hand'].every((id) =>
        player.zones.some((z) => z.id === id),
      );
    if (isStandard && w > h * 1.25) {
      const side = Math.min(128, area.w * 0.19),
        topH = area.h * 0.59;
      const rects = {
        library: { x: area.x, y: area.y, w: side, h: topH },
        battlefield: { x: area.x + side + gap, y: area.y, w: area.w - 2 * (side + gap), h: topH },
        graveyard: { x: area.x + area.w - side, y: area.y, w: side, h: topH },
        hand: { x: area.x, y: area.y + topH + gap, w: area.w, h: area.h - topH - gap },
      };
      return player.zones.map((zone) => ({ zone, ...rects[zone.id] }));
    }
    const cols = player.zones.length <= 2 ? player.zones.length : area.w / area.h > 1.7 ? 3 : 2;
    const rows = Math.ceil(player.zones.length / cols);
    const zw = (area.w - gap * (cols - 1)) / cols,
      zh = (area.h - gap * (rows - 1)) / rows;
    return player.zones.map((zone, i) => ({
      zone,
      x: area.x + (i % cols) * (zw + gap),
      y: area.y + Math.floor(i / cols) * (zh + gap),
      w: zw,
      h: zh,
    }));
  }
  function perspectivePanels(state, width, height) {
    const recipient = state.players.find((p) => p.id === state.view.viewerId);
    const others =
      state.view.playerScope === 'self' ? [] : state.players.filter((p) => p !== recipient);
    const area = { x: 48, y: 150, w: width - 96, h: height - 224 };
    if (!others.length) return [{ player: recipient, ...area, recipient: true }];
    const gap = 24,
      wide = width / height > 1.4;
    const owner = wide
      ? { x: area.x + (area.w + gap) * 0.43, y: area.y, w: (area.w - gap) * 0.57, h: area.h }
      : { x: area.x, y: area.y + (area.h + gap) * 0.42, w: area.w, h: (area.h - gap) * 0.58 };
    const remaining = wide
      ? { ...area, w: (area.w - gap) * 0.43 }
      : { ...area, h: (area.h - gap) * 0.42 };
    const columns = Math.min(others.length, wide ? 2 : others.length > 4 ? 4 : 2);
    const rows = Math.ceil(others.length / columns),
      spacing = 12;
    const w = (remaining.w - (columns - 1) * spacing) / columns;
    const h = (remaining.h - (rows - 1) * spacing) / rows;
    return [
      ...others.map((player, i) => ({
        player,
        x: remaining.x + (i % columns) * (w + spacing),
        y: remaining.y + Math.floor(i / columns) * (h + spacing),
        w,
        h,
        compact: true,
      })),
      { player: recipient, ...owner, recipient: true },
    ];
  }
  function recipientZones(panel) {
    const { player, x, y, w, h } = panel;
    const hand = player.zones.find((z) => z.id === 'hand');
    if (!hand || player.zones.length === 1) return zonePanels(panel);
    const area = { x: x + 14, y: y + 47, w: w - 28, h: h - 61 };
    const handHeight = (area.h - 12) * 0.46;
    const boards = player.zones.filter((z) => z !== hand);
    const boardHeight = area.h - handHeight - 12;
    const classic =
      boards.length === 3 &&
      ['library', 'battlefield', 'graveyard'].every((id) => boards.some((z) => z.id === id));
    let rects;
    if (classic) {
      const side = Math.min(145, area.w * 0.2);
      const positions = {
        library: { x: area.x, w: side },
        battlefield: { x: area.x + side + 10, w: area.w - 2 * (side + 10) },
        graveyard: { x: area.x + area.w - side, w: side },
      };
      rects = boards.map((zone) => ({ zone, ...positions[zone.id], y: area.y, h: boardHeight }));
    } else {
      const columns = Math.min(boards.length, boards.length > 4 ? 3 : 2);
      const rows = Math.ceil(boards.length / columns);
      const zw = (area.w - 10 * (columns - 1)) / columns;
      const zh = (boardHeight - 10 * (rows - 1)) / rows;
      rects = boards.map((zone, i) => ({
        zone,
        x: area.x + (i % columns) * (zw + 10),
        y: area.y + Math.floor(i / columns) * (zh + 10),
        w: zw,
        h: zh,
      }));
    }
    return [
      ...rects,
      { zone: hand, x: area.x, y: area.y + boardHeight + 12, w: area.w, h: handHeight },
    ];
  }
  function cardsInZone(rect, zone, density, focus = false) {
    const { x, y, w, h } = rect;
    if (!zone.count || w < 8 || h < 8) return { cards: [], hidden: 0 };
    const level = { calm: 0, balanced: 1, dense: 2 }[density];
    const maxWidth = focus ? [166, 138, 110][level] : [88, 78, 68][level];
    const cap = focus ? [12, 28, 60][level] : [5, 12, 24][level];
    let cards = [];
    if (zone.layout === 'stack') {
      const n = Math.min(zone.count, 5),
        offset = Math.min(3.3, h * 0.018);
      const cw = Math.max(
        2,
        Math.min(focus ? 235 : maxWidth, w * 0.64, (h - (n - 1) * offset) * 0.7),
      );
      const ch = cw / 0.7,
        sx = x + (w - cw - (n - 1) * offset) / 2,
        sy = y + (h - ch - (n - 1) * offset) / 2;
      cards = Array.from({ length: n }, (_, i) => ({
        x: sx + i * offset,
        y: sy + i * offset,
        w: cw,
        h: ch,
        angle: 0,
        index: n - 1 - i,
      }));
    } else if (zone.layout === 'fan') {
      let cw = Math.min(maxWidth * (focus ? 1.15 : 1), h * 0.57, w * 0.65);
      const capacity = Math.max(1, Math.floor((w / cw - 1.6) / 0.35) + 1);
      const n = Math.min(zone.count, cap, capacity);
      const spread = Math.min(w - cw * 1.5, (n - 1) * cw * 0.5);
      const angleRange = Math.min(32, (n - 1) * 6),
        ch = cw / 0.7;
      cards = Array.from({ length: n }, (_, i) => {
        const unit = n === 1 ? 0 : i / (n - 1) - 0.5;
        return {
          x: x + w / 2 - cw / 2 + unit * spread,
          y: y + (h - ch) / 2 - Math.abs(unit) * ch * 0.04,
          w: cw,
          h: ch,
          angle: unit * angleRange,
          index: i,
        };
      });
    } else {
      const n = Math.min(zone.count, cap),
        gap = Math.min(10, h * 0.06);
      const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * w) / (h * 0.7)))));
      const rows = Math.ceil(n / cols);
      const cw = Math.max(
        2,
        Math.min(maxWidth, (w - (cols - 1) * gap) / cols, ((h - (rows - 1) * gap) * 0.7) / rows),
      );
      const ch = cw / 0.7,
        gridH = rows * ch + (rows - 1) * gap;
      cards = Array.from({ length: n }, (_, i) => {
        const row = Math.floor(i / cols),
          countInRow = Math.min(cols, n - row * cols),
          gridW = countInRow * cw + (countInRow - 1) * gap;
        return {
          x: x + (w - gridW) / 2 + (i % cols) * (cw + gap),
          y: y + (h - gridH) / 2 + row * (ch + gap),
          w: cw,
          h: ch,
          angle: 0,
          index: i,
        };
      });
    }
    return { cards, hidden: Math.max(0, zone.count - cards.length) };
  }
  T.layout = {
    stageSize,
    playerPanels,
    zonePanels,
    perspectivePanels,
    recipientZones,
    cardsInZone,
  };
})(globalThis);
