(async function () {
  'use strict';
  const T = globalThis.Tabletop;
  const $ = (id) => document.getElementById(id);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = T.escape;
  const STORE = 'tabletop.studio.v1';
  let persisted,
    restoreError = '',
    storageAvailable = true;
  const initialParameters = new URLSearchParams(location.hash.slice(1));
  const initialRequest = initialParameters.has('scene') || initialParameters.has('config');
  try {
    if (initialRequest) persisted = await T.readRenderURL();
    else {
      const raw = localStorage.getItem(STORE);
      if (raw) persisted = T.normalize(JSON.parse(raw));
    }
    if (persisted) T.render(persisted);
  } catch (error) {
    restoreError = initialRequest
      ? `The URL request could not be opened: ${error.message}`
      : 'Your previous scene could not be restored. A fresh table is ready.';
    persisted = undefined;
  }
  const engine = T.createEngine(persisted);
  T.studio = engine;
  let activePage = 'stage',
    controlTab = 'stage',
    toastTimer,
    saveTimer,
    exportBusy = false;
  let editingCard = null,
    uploadedArt = null,
    cardPage = 0,
    editorDirty = false,
    previewFrame = 0;
  let lastRender = {},
    events = [];
  let stageRevision = 0,
    libraryRevision = 0,
    editorLookup = 0;
  let urlTimer,
    urlRevision = 0,
    applyingURL = false;
  function pageFromURL() {
    const hash = location.hash.slice(1);
    return ['stage', 'cards', 'api'].includes(hash)
      ? hash
      : new URLSearchParams(hash).get('page') || 'stage';
  }
  function queueURL() {
    if (applyingURL) return;
    clearTimeout(urlTimer);
    const current = ++urlRevision;
    document.body.dataset.urlStatus = 'pending';
    // Keep the current request in the address bar before any asynchronous work.
    // A refresh or copied link must not restore the scene from the previous edit.
    try {
      const url = new URL(location.href);
      url.hash = new URLSearchParams({
        page: activePage,
        config: JSON.stringify(T.toConfig(engine.state)),
      }).toString();
      if (url.href.length > T.urlLimits.maxURLCharacters)
        throw new Error('Request needs compression.');
      history.replaceState(null, '', url.href);
    } catch {
      // Large requests may fit after compression. Until then, remove stale data;
      // the existing local save still preserves edits on an immediate reload.
      try {
        history.replaceState(null, '', `#${activePage}`);
      } catch {}
    }
    urlTimer = setTimeout(async () => {
      try {
        const token = await T.encodeRequest(engine.state);
        if (current !== urlRevision) return;
        const url = new URL(location.href);
        url.hash = new URLSearchParams({ page: activePage, scene: token }).toString();
        if (url.href.length > T.urlLimits.maxURLCharacters)
          throw new Error(
            'This scene is too large for the address bar. Use a render link or save JSON.',
          );
        history.replaceState(null, '', url.href);
        document.body.dataset.urlStatus = 'ready';
        $('url-status').textContent =
          'The address bar contains the current playground request.';
      } catch (error) {
        if (current !== urlRevision) return;
        // Never leave a stale scene in the URL after an edit that can't be encoded.
        try {
          history.replaceState(null, '', `#${activePage}`);
        } catch {}
        document.body.dataset.urlStatus = 'unavailable';
        $('url-status').textContent =
          `${error.message} Your scene is still available in the playground.`;
      }
    }, 180);
  }

  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.toggle('error', error);
    $('toast').hidden = false;
    toastTimer = setTimeout(
      () => {
        $('toast').hidden = true;
      },
      error ? 9000 : 3500,
    );
  }
  function dispatch(type, payload = {}) {
    try {
      engine.dispatch({ type, payload });
      return true;
    } catch (error) {
      toast(error.message, true);
      syncControls(engine.state);
      return false;
    }
  }
  function saveLocal(state) {
    clearTimeout(saveTimer);
    $('save-indicator').textContent = 'Saving…';
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify(T.toConfig(state)));
        $('save-indicator').textContent = 'Saved locally';
        storageAvailable = true;
      } catch {
        $('save-indicator').textContent = 'Not saved';
        if (storageAvailable)
          toast(
            'Browser storage is full or unavailable. Use Save scene to keep this arrangement.',
            true,
          );
        storageAvailable = false;
      }
    }, 200);
  }
  function setValue(id, value) {
    const el = $(id);
    if (el && el.value !== String(value)) el.value = value;
  }
  function selected(state) {
    const player = state.players.find((player) => player.id === state.view.playerId);
    return { player, zone: player.zones.find((zone) => zone.id === state.view.zoneId) };
  }
  const deckOf = (state) => state.decks.find((d) => d.id === state.activeDeckId);
  function aspectLabel(w, h) {
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const d = gcd(w, h);
    return w / d > 40 || h / d > 40 ? `${(w / h).toFixed(2)}:1` : `${w / d}:${h / d}`;
  }
  function renderStage(state) {
    const revision = ++stageRevision;
    const start = performance.now(),
      result = T.renderDetailed(state);
    $('stage-image').innerHTML = result.svg;
    lastRender = { ...result.metrics, ms: Math.max(1, Math.round(performance.now() - start)) };
    $('dimension-top').textContent = `${state.stage.width} px`;
    $('dimension-side').textContent = `${state.stage.height} px`;
    $('output-size').textContent = `${state.stage.width} × ${state.stage.height} px`;
    $('render-metrics').textContent =
      `${lastRender.renderedCards} drawn / ${T.countLabel(lastRender.totalCards)} cards · ${lastRender.ms} ms`;
    fitStage(state);
    if (result.assets?.length) {
      if (!exportBusy) $('preview-status').textContent = 'Loading cards…';
      T.renderDetailedAsync(state)
        .then((loaded) => {
          if (revision !== stageRevision) return;
          $('stage-image').innerHTML = loaded.svg;
          if (!exportBusy) $('preview-status').textContent = 'Ready';
        })
        .catch((error) => {
          if (revision !== stageRevision) return;
          if (!exportBusy) $('preview-status').textContent = 'Card load failed';
          toast(error.message, true);
        });
    } else if (!exportBusy) $('preview-status').textContent = 'Ready';
  }
  function fitStage(state = engine.state) {
    if (activePage !== 'stage') return;
    const wrap = $('canvas-wrap'),
      css = getComputedStyle(wrap);
    const maxW = wrap.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const maxH = wrap.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const ratio = state.stage.width / state.stage.height;
    const width = Math.max(1, Math.min(maxW, maxH * ratio));
    $('stage-frame').style.width = `${width}px`;
    $('stage-frame').style.height = `${width / ratio}px`;
  }
  function syncControls(state) {
    const { player, zone } = selected(state),
      deck = deckOf(state);
    setValue('stage-width', state.stage.width);
    setValue('stage-height', state.stage.height);
    $('aspect-label').textContent = aspectLabel(state.stage.width, state.stage.height);
    $$('[data-size]').forEach((button) => {
      const [w, h] = button.dataset.size.split(',').map(Number);
      button.classList.toggle('active', w === state.stage.width && h === state.stage.height);
      button.setAttribute('aria-pressed', w === state.stage.width && h === state.stage.height);
    });
    $('theme-name').textContent = T.themes[state.stage.theme].name;
    $('theme-options').innerHTML = Object.entries(T.themes)
      .map(
        ([id, theme]) =>
          `<button class="theme-option ${id === state.stage.theme ? 'active' : ''}" data-theme="${id}" title="${theme.name}" aria-label="${theme.name} theme" aria-pressed="${id === state.stage.theme}" style="background:${theme.background}">${id === state.stage.theme ? icon('check') : ''}</button>`,
      )
      .join('');
    $('stage-texture').checked = state.stage.texture;
    setValue('setup-select', state.setup);
    $('setup-help').textContent = {
      standard: 'A hand, main area, library, and graveyard for each player.',
      poker: 'A visual study with two-card hands and five-card tables. Adjust every zone.',
      commander: 'Four players, 40 life, and an extra command zone. Original demo artwork.',
    }[state.setup];
    $$('[data-density]').forEach((button) => {
      const active = button.dataset.density === state.view.density;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active);
    });
    setValue('stats-select', state.view.stats);
    $('zone-labels').checked = state.view.labels;
    $$('[data-view]').forEach((button) => {
      const active = button.dataset.view === state.view.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active);
    });
    $('canvas-tip').hidden = state.view.mode !== 'overview';
    $('focus-picker').hidden = state.view.mode !== 'focus';
    $('focus-picker').innerHTML = state.players
      .map(
        (p, pi) =>
          `<optgroup label="${esc(p.name)}">${p.zones.map((z, zi) => `<option value="${pi}:${zi}" ${p.id === player.id && z.id === zone.id ? 'selected' : ''}>${esc(p.name)} · ${esc(z.name)}</option>`).join('')}</optgroup>`,
      )
      .join('');
    $('player-view-bar').hidden = state.view.viewerId === null;
    $('viewer-picker').innerHTML = state.players
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === state.view.viewerId ? 'selected' : ''}>${esc(p.name)}</option>`,
      )
      .join('');
    setValue('viewer-scope', state.view.playerScope);
    setValue('player-image-scope', state.view.playerScope);
    if (!exportBusy)
      $('player-export-help').textContent =
        `${state.players.length} images for this version, or ${state.players.length * 2} for both. Batch downloads are PNG ZIPs.`;
    setValue('scene-zoom', Math.round(state.view.zoom * 100));
    $('zoom-reset').textContent = `${Math.round(state.view.zoom * 100)}%`;
    $('zoom-out').disabled = state.view.zoom <= 0.6;
    $('zoom-in').disabled = state.view.zoom >= 1.8;
    $('undo-button').disabled = !engine.canUndo;
    $('redo-button').disabled = !engine.canRedo;
    $('summary-players').textContent =
      `${state.players.length} player${state.players.length === 1 ? '' : 's'}`;
    $('summary-zones').textContent =
      `${state.players.reduce((n, p) => n + p.zones.length, 0)} zones`;
    $('summary-cards').textContent = `${deck.cards.length} unique cards`;
    $('summary-deck').textContent = deck.name;
    $('player-count-options').innerHTML = Array.from(
      { length: 8 },
      (_, i) =>
        `<button data-player-count="${i + 1}" class="${i + 1 === state.players.length ? 'active' : ''}" aria-label="${i + 1} players" aria-pressed="${i + 1 === state.players.length}">${i + 1}</button>`,
    ).join('');
    $('player-list').innerHTML = state.players
      .map(
        (p) =>
          `<button class="player-row ${p.id === player.id ? 'active' : ''}" data-select-player="${esc(p.id)}" aria-pressed="${p.id === player.id}"><span class="player-dot" style="background:${p.color}"></span><span>${esc(p.name)}</span><span class="subtle">${p.zones.length} zones</span></button>`,
      )
      .join('');
    setValue('player-name', player.name);
    setValue('player-color', player.color);
    const library = player.zones.find((z) => z.id === 'library'),
      hand = player.zones.find((z) => z.id === 'hand');
    $('draw-card').disabled = !library?.count || !hand || hand.count >= T.limits.maxCards;
    $('zone-player').innerHTML = state.players
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === player.id ? 'selected' : ''}>${esc(p.name)}</option>`,
      )
      .join('');
    $('zone-list').innerHTML = player.zones
      .map(
        (z) =>
          `<div class="zone-row ${z.id === zone.id ? 'active' : ''}">${icon(z.layout === 'stack' ? 'stack' : 'cards')}<button data-select-zone="${esc(z.id)}" aria-pressed="${z.id === zone.id}">${esc(z.name)}</button><input data-zone-count="${esc(z.id)}" type="number" min="0" max="1000000" value="${z.count}" aria-label="${esc(z.name)} card count"></div>`,
      )
      .join('');
    $('zone-detail-title').textContent = zone.name;
    setValue('zone-name', zone.name);
    setValue('zone-layout', zone.layout);
    $('zone-face-down').checked = zone.faceDown;
    setValue('zone-visibility', zone.visibility);
    $('zone-visibility-help').textContent = {
      public: 'Every player image can show these faces. Zone counts remain visible.',
      owner: `Only ${player.name} sees these faces. Other players see concealed cards or counts.`,
      hidden: 'All player images conceal these faces. Zone counts remain visible.',
    }[zone.visibility];
    $('delete-zone').disabled = player.zones.length <= 1;
    $('add-zone').disabled = player.zones.length >= T.limits.maxZones;
    $$('[data-card-count]').forEach((button) => {
      const active = Number(button.dataset.cardCount) === zone.count;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active);
    });
    const previousTarget = $('transfer-target').value;
    $('transfer-target').innerHTML = player.zones
      .filter((z) => z.id !== zone.id)
      .map(
        (z) =>
          `<option value="${esc(z.id)}">${esc(z.name)} · ${T.countLabel(z.count)}</option>`,
      )
      .join('');
    if (player.zones.some((z) => z.id !== zone.id && z.id === previousTarget))
      setValue('transfer-target', previousTarget);
    $('transfer-cards').disabled = !zone.count || player.zones.length < 2;
  }
  function showControl(tab) {
    controlTab = tab;
    $$('[data-control-tab]').forEach((button) => {
      const active = button.dataset.controlTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active);
    });
    ['stage', 'players', 'zones', 'extras'].forEach((name) => {
      $(`controls-${name}`).hidden = name !== tab;
    });
  }
  function showPage(page) {
    if (!['stage', 'cards', 'api'].includes(page)) page = 'stage';
    activePage = page;
    ['stage', 'cards', 'api'].forEach((name) => {
      $(`page-${name}`).hidden = name !== page;
    });
    $$('.app-nav [data-page]').forEach((button) => {
      const active = button.dataset.page === page;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (page === 'stage') requestAnimationFrame(() => fitStage());
    if (page === 'cards') renderLibrary();
    if (page === 'api' && !editorDirty) loadConfig();
    queueURL();
  }
  function renderLibrary(hydrate = true) {
    const revision = ++libraryRevision;
    const state = engine.state,
      deck = deckOf(state),
      search = $('card-search').value.toLowerCase().trim();
    $('deck-total').textContent = state.decks.length;
    $('deck-list').innerHTML = state.decks
      .map(
        (d) =>
          `<button class="deck-button ${d.id === deck.id ? 'active' : ''}" data-deck="${esc(d.id)}" aria-pressed="${d.id === deck.id}"><span>${d.id === 'standard' ? '♠' : '◇'}</span><span><strong>${esc(d.name)}</strong><small>${d.cards.length} cards${d.id === deck.id ? ' · On stage' : ''}</small></span></button>`,
      )
      .join('');
    $('library-title').textContent = deck.name;
    $('library-meta').textContent = `${deck.cards.length} cards · Active on your stage`;
    const displayCards = deck.cards.map((card) => {
      const asset = card.scryfallId && T.scryfall.peek(card);
      return asset ? { ...card, name: asset.name } : card;
    });
    const cards = displayCards.filter((card) =>
      `${card.name} ${card.suit || ''} ${card.rank || ''}`.toLowerCase().includes(search),
    );
    const pages = Math.max(1, Math.ceil(cards.length / 60));
    cardPage = Math.min(cardPage, pages - 1);
    $('card-empty').hidden = cards.length > 0;
    $('card-grid').innerHTML =
      cards
        .slice(cardPage * 60, (cardPage + 1) * 60)
        .map(
          (card, i) =>
            `<button class="library-card" data-edit-card="${esc(card.id)}" aria-label="Edit ${esc(card.name)}"><span class="library-card-edit">Edit</span><span class="library-card-art">${T.cardSVG(card, { theme: state.stage.theme, id: `library-art-${i}` })}</span><span class="library-card-name">${esc(card.name)}</span><span class="library-card-meta">${esc(card.scryfallId ? 'MTG · SCRYFALL' : card.artUrl ? 'CUSTOM ARTWORK' : card.suit ? card.suit.toUpperCase() : 'ORIGINAL DEMO')}</span></button>`,
        )
        .join('') +
      (search
        ? ''
        : `<button class="add-card-tile" data-add-card>${icon('plus')}<span>Add a card</span></button>`);
    let pagination = $('card-pagination');
    if (!pagination) {
      pagination = document.createElement('div');
      pagination.id = 'card-pagination';
      pagination.className = 'card-pagination';
      $('card-grid').after(pagination);
    }
    pagination.hidden = pages <= 1;
    pagination.innerHTML = `<button class="button" data-card-page="${cardPage - 1}" ${cardPage === 0 ? 'disabled' : ''}>Previous</button><span>${cardPage * 60 + 1}–${Math.min((cardPage + 1) * 60, cards.length)} of ${cards.length} cards</span><button class="button" data-card-page="${cardPage + 1}" ${cardPage === pages - 1 ? 'disabled' : ''}>Next</button>`;
    const pending = cards
      .slice(cardPage * 60, (cardPage + 1) * 60)
      .filter((card) => card.scryfallId && !T.scryfall.peek(card));
    if (hydrate && pending.length)
      T.resolveScryfall(pending)
        .then(() => {
          if (revision === libraryRevision && activePage === 'cards') renderLibrary(false);
        })
        .catch((error) => {
          if (revision === libraryRevision && activePage === 'cards') {
            renderLibrary(false);
            toast(error.message, true);
          }
        });
  }
  function recordEvent(event) {
    events.unshift({ ...event });
    events = events.slice(0, 4);
    $('revision-label').textContent = `revision ${event.revision}`;
    $('event-log').innerHTML = events
      .map(
        (e) =>
          `<li><span class="status-dot"></span><code>${esc(e.type)}</code><span>rev ${e.revision}</span></li>`,
      )
      .join('');
  }
  engine.subscribe((state, event) => {
    renderStage(state);
    syncControls(state);
    saveLocal(state);
    queueURL();
    recordEvent(event);
    if (activePage === 'cards') renderLibrary();
    if (activePage === 'api' && !editorDirty) loadConfig();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button?.disabled) return;
    if (button?.dataset.page) showPage(button.dataset.page);
    if (button?.dataset.controlTab) showControl(button.dataset.controlTab);
    if (button?.dataset.openTab) {
      showPage('stage');
      showControl(button.dataset.openTab);
      if (innerWidth <= 800)
        document.querySelector('.control-panel').scrollIntoView({ block: 'start' });
    }
    if (button?.dataset.size) {
      const [width, height] = button.dataset.size.split(',').map(Number);
      dispatch('stage.update', { width, height });
    }
    if (button?.dataset.theme) dispatch('stage.update', { theme: button.dataset.theme });
    if (button?.dataset.density) dispatch('view.update', { density: button.dataset.density });
    if (button?.dataset.view) {
      dispatch('view.update', { mode: button.dataset.view });
      if (button.dataset.view === 'player') showControl('players');
    }
    if (button?.dataset.playerCount)
      dispatch('player.count', { count: Number(button.dataset.playerCount) });
    if (button?.dataset.selectPlayer)
      dispatch('view.update', {
        playerId: button.dataset.selectPlayer,
        ...(engine.state.view.mode === 'player'
          ? { viewerId: button.dataset.selectPlayer }
          : {}),
      });
    if (button?.dataset.selectZone)
      dispatch('view.update', { zoneId: button.dataset.selectZone });
    if (button?.dataset.cardCount !== undefined) {
      const { player, zone } = selected(engine.state);
      dispatch('zone.update', {
        playerId: player.id,
        zoneId: zone.id,
        count: Number(button.dataset.cardCount),
      });
    }
    if (button?.dataset.deck) {
      cardPage = 0;
      $('card-search').value = '';
      dispatch('deck.select', { id: button.dataset.deck });
    }
    if (button?.dataset.editCard) openCard(button.dataset.editCard);
    if (button?.hasAttribute('data-add-card')) openCard();
    if (button?.dataset.cardPage !== undefined) {
      cardPage = Number(button.dataset.cardPage);
      renderLibrary();
      $('page-cards').scrollTop = 0;
    }
    if (button?.dataset.closeDialog) $(button.dataset.closeDialog).close();
    if (button?.dataset.export) exportFile(button.dataset.export);
    if (!event.target.closest('.export-options'))
      document.querySelector('.export-options').open = false;
    const zone = event.target.closest('#stage-image [data-zone]');
    if (zone) {
      dispatch('view.update', {
        mode: 'focus',
        playerId: zone.dataset.player,
        zoneId: zone.dataset.zone,
      });
      showControl('zones');
    }
  });
  document.querySelector('.brand').addEventListener('click', (event) => {
    event.preventDefault();
    showPage('stage');
  });
  for (const dimension of ['width', 'height'])
    $(`stage-${dimension}`).addEventListener('change', (event) =>
      dispatch('stage.update', { [dimension]: Number(event.target.value) }),
    );
  $('swap-dimensions').onclick = () => {
    const { width, height } = engine.state.stage;
    dispatch('stage.update', { width: height, height: width });
  };
  $('stage-texture').onchange = (event) =>
    dispatch('stage.update', { texture: event.target.checked });
  $('setup-select').onchange = (event) => {
    if (dispatch('setup.load', { setup: event.target.value }))
      toast('Starting setup loaded. Undo is available.');
  };
  $('stats-select').onchange = (event) =>
    dispatch('view.update', { stats: event.target.value });
  $('zone-labels').onchange = (event) =>
    dispatch('view.update', { labels: event.target.checked });
  $('safe-area').onchange = (event) => {
    $('safe-area-guide').hidden = !event.target.checked;
  };
  $('shuffle-sample').onclick = () => dispatch('session.shuffle');
  $('undo-button').onclick = () => engine.undo();
  $('redo-button').onclick = () => engine.redo();
  $('focus-picker').onchange = (event) => {
    const [pi, zi] = event.target.value.split(':').map(Number);
    const player = engine.state.players[pi];
    dispatch('view.update', { playerId: player.id, zoneId: player.zones[zi].id });
  };
  $('viewer-picker').onchange = (event) =>
    dispatch('view.update', {
      mode: 'player',
      viewerId: event.target.value,
      playerId: event.target.value,
    });
  $('viewer-scope').onchange = (event) =>
    dispatch('view.update', { mode: 'player', playerScope: event.target.value });
  $('player-image-scope').onchange = (event) =>
    dispatch('view.update', { playerScope: event.target.value });
  $('preview-player').onclick = () =>
    dispatch('view.update', { mode: 'player', viewerId: engine.state.view.playerId });
  $('player-view-settings').onclick = () => {
    showControl('players');
    if (innerWidth <= 800)
      document.querySelector('.player-images-section').scrollIntoView({ block: 'center' });
  };
  $('scene-zoom').oninput = (event) => {
    const zoom = Number(event.target.value) / 100;
    $('zoom-reset').textContent = `${Math.round(zoom * 100)}%`;
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      const state = engine.state;
      state.view.zoom = zoom;
      renderStage(state);
    });
  };
  $('scene-zoom').onchange = (event) => {
    cancelAnimationFrame(previewFrame);
    dispatch('view.update', { zoom: Number(event.target.value) / 100 });
  };
  $('zoom-out').onclick = () =>
    dispatch('view.update', {
      zoom: Math.max(0.6, Math.round((engine.state.view.zoom - 0.1) * 100) / 100),
    });
  $('zoom-in').onclick = () =>
    dispatch('view.update', {
      zoom: Math.min(1.8, Math.round((engine.state.view.zoom + 0.1) * 100) / 100),
    });
  $('zoom-reset').onclick = () => dispatch('view.update', { zoom: 1 });
  $('player-name').onchange = (event) =>
    dispatch('player.update', {
      playerId: engine.state.view.playerId,
      name: event.target.value.trim(),
    });
  $('player-color').onchange = (event) =>
    dispatch('player.update', {
      playerId: engine.state.view.playerId,
      color: event.target.value,
    });
  $('draw-card').onclick = () => {
    const id = engine.state.view.playerId;
    if (
      dispatch('zone.transfer', {
        from: { playerId: id, zoneId: 'library' },
        to: { playerId: id, zoneId: 'hand' },
        count: 1,
      })
    )
      toast('One card moved into hand.');
  };
  $('zone-player').onchange = (event) =>
    dispatch('view.update', { playerId: event.target.value });
  $('zone-list').onchange = (event) => {
    if (event.target.dataset.zoneCount)
      dispatch('zone.update', {
        playerId: engine.state.view.playerId,
        zoneId: event.target.dataset.zoneCount,
        count: Number(event.target.value),
      });
  };
  $('zone-name').onchange = (event) =>
    dispatch('zone.update', {
      playerId: engine.state.view.playerId,
      zoneId: engine.state.view.zoneId,
      name: event.target.value.trim(),
    });
  $('zone-layout').onchange = (event) =>
    dispatch('zone.update', {
      playerId: engine.state.view.playerId,
      zoneId: engine.state.view.zoneId,
      layout: event.target.value,
    });
  $('zone-face-down').onchange = (event) =>
    dispatch('zone.update', {
      playerId: engine.state.view.playerId,
      zoneId: engine.state.view.zoneId,
      faceDown: event.target.checked,
    });
  $('zone-visibility').onchange = (event) =>
    dispatch('zone.update', {
      playerId: engine.state.view.playerId,
      zoneId: engine.state.view.zoneId,
      visibility: event.target.value,
    });
  $('focus-zone').onclick = () => dispatch('view.update', { mode: 'focus' });
  $('add-zone').onclick = () => {
    const { player } = selected(engine.state);
    let i = 1;
    while (player.zones.some((z) => z.id === `special-${i}`)) i++;
    if (
      dispatch('zone.add', {
        playerId: player.id,
        id: `special-${i}`,
        name: `Special area ${i}`,
      })
    )
      dispatch('view.update', { zoneId: `special-${i}` });
  };
  $('delete-zone').onclick = () => {
    if (
      dispatch('zone.remove', {
        playerId: engine.state.view.playerId,
        zoneId: engine.state.view.zoneId,
      })
    )
      toast('Zone removed. You can undo this.');
  };
  $('transfer-cards').onclick = () => {
    const { player, zone } = selected(engine.state),
      target = $('transfer-target').value;
    if (
      dispatch('zone.transfer', {
        from: { playerId: player.id, zoneId: zone.id },
        to: { playerId: player.id, zoneId: target },
        count: Number($('transfer-count').value),
      })
    )
      toast('Cards moved.');
  };
  $('help-button').onclick = $('deck-format-help').onclick = () =>
    $('guide-dialog').showModal();
  $('card-search').oninput = () => {
    cardPage = 0;
    renderLibrary();
  };
  $('add-card').onclick = () => openCard();
  $('import-deck-button').onclick = () => $('deck-file').click();
  $('export-deck').onclick = () => {
    const deck = deckOf(engine.state);
    T.download(
      new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' }),
      `deck-${slug(deck.name)}.json`,
    );
  };
  function slug(value) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 55) || 'custom'
    );
  }
  function uniqueId(base, items) {
    let id = base,
      i = 2;
    while (items.some((item) => item.id === id)) id = `${base}-${i++}`;
    return id;
  }
  async function readJSON(file) {
    if (!file) return null;
    if (file.size > 15000000) throw new Error('JSON files must be smaller than 15 MB.');
    try {
      return JSON.parse(await file.text());
    } catch {
      throw new Error('That file is not valid JSON.');
    }
  }
  $('deck-file').onchange = async (event) => {
    try {
      const file = event.target.files[0],
        data = await readJSON(file);
      if (!data) return;
      const name = file.name.replace(/\.json$/i, '').replace(/[-_]/g, ' ');
      let deck = Array.isArray(data)
        ? { id: uniqueId(slug(name), engine.state.decks), name, cards: data }
        : data;
      if (!deck.cards || !Array.isArray(deck.cards))
        throw new Error('Import an array of cards or a deck object with a cards array.');
      deck = {
        id: uniqueId(slug(deck.name || name), engine.state.decks),
        name,
        ...deck,
        cards: deck.cards.map((card, i) =>
          typeof card === 'string'
            ? /^[0-9a-f-]{36}$/i.test(card)
              ? { id: `card-${i + 1}`, scryfallId: card }
              : { id: `card-${i + 1}`, name: card }
            : { id: `card-${i + 1}`, ...card },
        ),
      };
      if (dispatch('deck.import', { deck })) {
        cardPage = 0;
        $('card-search').value = '';
        renderLibrary();
        toast(`${deck.cards.length} cards imported and ready on the stage.`);
      }
    } catch (error) {
      toast(error.message, true);
    } finally {
      event.target.value = '';
    }
  };

  function openCard(id) {
    editorLookup++;
    const deck = deckOf(engine.state);
    editingCard = id ? T.clone(deck.cards.find((card) => card.id === id)) : null;
    uploadedArt = editingCard?.artUrl?.startsWith('data:') ? editingCard.artUrl : null;
    $('card-dialog-title').textContent = editingCard ? 'A closer look.' : 'Make a new card';
    setValue('edit-card-source', editingCard?.scryfallId ? 'scryfall' : 'custom');
    setValue('edit-scryfall-id', editingCard?.scryfallId || '');
    setValue('edit-scryfall-face', editingCard?.face || 'front');
    $('load-scryfall-card').disabled = false;
    $('load-scryfall-card').textContent = 'Load card';
    $('save-card').disabled = false;
    setValue('edit-card-name', editingCard?.name || '');
    setValue('edit-card-rank', editingCard?.rank || '');
    setValue('edit-card-suit', editingCard?.suit || '');
    setValue('edit-card-art', uploadedArt ? '' : editingCard?.artUrl || '');
    setValue('edit-card-art-mode', editingCard?.artMode || 'illustration');
    $('edit-card-art').placeholder = uploadedArt
      ? 'Uploaded image attached'
      : 'https://…/artwork.jpg';
    $('art-upload-label').textContent = uploadedArt
      ? 'Replace uploaded image'
      : 'Or upload an image';
    $('delete-card').hidden = !editingCard;
    $('delete-card').disabled = deck.cards.length <= 1;
    $('card-error').hidden = true;
    $('art-file').value = '';
    updateCardPreview();
    $('card-dialog').showModal();
    if (editingCard?.scryfallId) loadEditorScryfall();
  }
  function editorCard() {
    const deck = deckOf(engine.state);
    const card = {
      ...(editingCard || {}),
      id: editingCard?.id || uniqueId(slug($('edit-card-name').value || 'card'), deck.cards),
      name: $('edit-card-name').value.trim() || 'Untitled card',
      rank: $('edit-card-rank').value.trim(),
      suit: $('edit-card-suit').value,
      artUrl: uploadedArt || $('edit-card-art').value.trim(),
    };
    if ($('edit-card-source').value === 'scryfall') {
      delete card.artUrl;
      delete card.artMode;
      delete card.art;
      delete card.suit;
      delete card.rank;
      card.scryfallId = $('edit-scryfall-id').value.trim();
      card.face = $('edit-scryfall-face').value;
      card.name = $('edit-card-name').value.trim() || 'Scryfall card';
    } else {
      delete card.scryfallId;
      delete card.face;
      if (card.artUrl) card.artMode = $('edit-card-art-mode').value;
      else delete card.artMode;
    }
    return card;
  }
  function updateCardPreview() {
    const isScryfall = $('edit-card-source').value === 'scryfall';
    $('scryfall-fields').hidden = !isScryfall;
    $('custom-card-fields').hidden = isScryfall;
    $('edit-card-name').required = !isScryfall;
    $('edit-card-name').readOnly = isScryfall;
    const card = editorCard();
    $('clear-card-art').hidden = !card.artUrl;
    try {
      T.validateDeck({ id: 'preview', name: 'Preview', cards: [card] });
      $('editor-card-preview').innerHTML = T.cardSVG(card, { id: 'editor-art' });
    } catch {
      $('editor-card-preview').innerHTML = T.cardSVG(
        { id: 'preview', name: card.name, art: 0 },
        { id: 'editor-art' },
      );
    }
  }
  async function loadEditorScryfall() {
    const revision = ++editorLookup;
    $('card-error').hidden = true;
    $('load-scryfall-card').disabled = true;
    $('save-card').disabled = true;
    $('load-scryfall-card').textContent = 'Loading…';
    try {
      const asset = await T.scryfall.load(editorCard());
      if (revision !== editorLookup || !$('card-dialog').open) return false;
      setValue('edit-card-name', asset.name);
      updateCardPreview();
      return true;
    } catch (error) {
      if (revision === editorLookup) {
        $('card-error').textContent = error.message;
        $('card-error').hidden = false;
      }
      return false;
    } finally {
      if (revision === editorLookup) {
        $('load-scryfall-card').disabled = false;
        $('save-card').disabled = false;
        $('load-scryfall-card').textContent = 'Load card';
      }
    }
  }
  $('load-scryfall-card').onclick = loadEditorScryfall;
  ['edit-card-source', 'edit-scryfall-id', 'edit-scryfall-face'].forEach((id) => {
    $(id).oninput = () => {
      editorLookup++;
      $('load-scryfall-card').disabled = false;
      $('save-card').disabled = false;
      $('load-scryfall-card').textContent = 'Load card';
      if ($('edit-card-source').value === 'scryfall') setValue('edit-card-name', '');
      $('card-error').hidden = true;
      updateCardPreview();
    };
  });
  $('card-dialog').addEventListener('close', () => editorLookup++);
  $('clear-scryfall-cache').onclick = async () => {
    const button = $('clear-scryfall-cache');
    button.disabled = true;
    await T.scryfall.clear();
    $('scryfall-cache-status').textContent =
      'Cache cleared. Cards refresh on the next preview or export.';
    button.disabled = false;
  };
  ['edit-card-name', 'edit-card-rank', 'edit-card-suit'].forEach((id) => {
    $(id).oninput = updateCardPreview;
  });
  $('edit-card-art').oninput = () => {
    uploadedArt = null;
    $('art-upload-label').textContent = 'Or upload an image';
    updateCardPreview();
  };
  $('edit-card-art-mode').onchange = updateCardPreview;
  $('clear-card-art').onclick = () => {
    uploadedArt = null;
    $('edit-card-art').value = '';
    $('edit-card-art').placeholder = 'https://…/artwork.jpg';
    $('art-upload-label').textContent = 'Or upload an image';
    updateCardPreview();
  };
  $('art-file').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type) || file.size > 5000000)
        throw new Error('Choose a PNG, JPEG, WebP, GIF, or AVIF image smaller than 5 MB.');
      uploadedArt = await T.blobToDataURL(file);
      const image = new Image();
      image.src = uploadedArt;
      await image.decode();
      $('edit-card-art').value = '';
      $('edit-card-art').placeholder = 'Uploaded image attached';
      $('art-upload-label').textContent = file.name;
      updateCardPreview();
    } catch (error) {
      uploadedArt = null;
      $('card-error').textContent = error.message;
      $('card-error').hidden = false;
    }
  };
  $('card-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      if ($('edit-card-source').value === 'scryfall' && !(await loadEditorScryfall())) return;
      engine.dispatch({ type: 'card.upsert', payload: { card: editorCard() } });
      $('card-dialog').close();
      toast('Card saved to your deck.');
    } catch (error) {
      $('card-error').textContent = error.message;
      $('card-error').hidden = false;
    }
  };
  $('delete-card').onclick = () => {
    if (editingCard && dispatch('card.remove', { id: editingCard.id })) {
      $('card-dialog').close();
      toast('Card removed. You can undo this.');
    }
  };

  function setExportBusy(busy) {
    exportBusy = busy;
    ['export-png', 'export-player-png', 'export-all-players', 'export-both-players'].forEach(
      (id) => {
        $(id).disabled = busy;
      },
    );
    $('export-png').querySelector('span').textContent = busy ? 'Exporting…' : 'Export image';
    $('preview-status').textContent = busy ? 'Exporting' : 'Ready';
  }
  async function exportPlayerBatch(scope) {
    if (exportBusy) return;
    document.querySelector('.export-options').open = false;
    const state = engine.state;
    setExportBusy(true);
    try {
      const blob = await T.toPlayerZIP(state, {
        scope,
        onProgress(done, total) {
          $('preview-status').textContent = `${done}/${total} ready`;
          $('player-export-help').textContent =
            `Generating player images · ${done} of ${total} ready`;
        },
      });
      T.download(
        blob,
        `tabletop-players-${scope}-${state.stage.width}x${state.stage.height}.zip`,
      );
      toast(
        `${state.players.length * (scope === 'both' ? 2 : 1)} player images exported in one ZIP.`,
      );
    } catch (error) {
      toast(error.message, true);
    } finally {
      setExportBusy(false);
      syncControls(engine.state);
    }
  }
  async function exportFile(format, playerId) {
    if (format === 'players' || format === 'players-both')
      return exportPlayerBatch(
        format === 'players-both' ? 'both' : engine.state.view.playerScope,
      );
    document.querySelector('.export-options').open = false;
    const state = playerId ? T.forPlayer(engine.state, playerId) : engine.state,
      name = `tabletop-${state.stage.theme}-${state.stage.width}x${state.stage.height}`;
    if (format === 'json') {
      T.download(
        new Blob([JSON.stringify(T.toConfig(state), null, 2)], { type: 'application/json' }),
        `${name}.json`,
      );
      toast('Scene saved as JSON.');
      return;
    }
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const blob =
        format === 'svg'
          ? new Blob([await T.toSVG(state)], { type: 'image/svg+xml' })
          : await T.toPNG(state);
      const filename = state.view.viewerId
        ? T.playerFilename(state, state.view.viewerId, state.view.playerScope, format)
        : `${name}.${format}`;
      T.download(blob, filename);
      toast(
        `${format.toUpperCase()} exported · ${state.stage.width} × ${state.stage.height} px`,
      );
    } catch (error) {
      toast(error.message, true);
    } finally {
      setExportBusy(false);
    }
  }
  $('export-png').onclick = () => exportFile('png');
  $('save-scene').onclick = () => exportFile('json');
  $('export-player-png').onclick = () => exportFile('png', engine.state.view.playerId);
  $('export-all-players').onclick = () => exportPlayerBatch(engine.state.view.playerScope);
  $('export-both-players').onclick = () => exportPlayerBatch('both');
  let linkSnapshot = null,
    linkRevision = 0;
  async function updateRenderLink() {
    const current = ++linkRevision;
    $('copy-scene-link').disabled = true;
    $('open-render-link').removeAttribute('href');
    $('render-link-value').value = '';
    $('render-link-info').textContent = 'Preparing link…';
    $('render-link-error').hidden = true;
    try {
      const url = await T.createRenderURL(linkSnapshot, {
        embed: $('render-link-mode').value === 'embed',
      });
      if (current !== linkRevision) return;
      $('render-link-value').value = url;
      $('open-render-link').href = url;
      $('copy-scene-link').disabled = false;
      $('render-link-info').textContent =
        `${url.length.toLocaleString()} characters · All rendering happens in the browser${url.length > 8000 ? '. Long links may be truncated by some messaging apps; JSON is available as a fallback.' : '.'}`;
    } catch (error) {
      if (current !== linkRevision) return;
      $('render-link-info').textContent = 'Use Save scene to keep the request as JSON.';
      $('render-link-error').textContent = error.message;
      $('render-link-error').hidden = false;
    }
  }
  function openRenderLink() {
    linkSnapshot = engine.state;
    $('render-link-dialog').showModal();
    updateRenderLink();
  }
  $('render-link').onclick = $('api-render-link').onclick = openRenderLink;
  $('render-link-mode').onchange = updateRenderLink;
  $('copy-scene-link').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('render-link-value').value);
      toast('Render link copied.');
    } catch {
      $('render-link-value').focus();
      $('render-link-value').select();
      $('render-link-info').textContent = 'Link selected. Press ⌘/Ctrl C to copy.';
    }
  };
  const example = `// Your application supplies the scene.\nconst request = {\n  stage: { width: 512, height: 512 },\n  players: 4\n};\n\n// Standalone static render page:\nconst url = await Tabletop.createRenderURL(\n  request\n);\n\n// Or choose a player and framing:\nconst playerURL = await Tabletop.createRenderURL(\n  Tabletop.forPlayer(request, "p2", { scope: "self" })\n);\n\n// Image generation stays in the browser.\nconst png = await Tabletop.toPNG(request);\nTabletop.download(png, "scene.png");`;
  $('api-example').textContent = example;
  $('copy-example').onclick = async () => {
    try {
      await navigator.clipboard.writeText(example);
      toast('API example copied.');
    } catch {
      const selection = window.getSelection(),
        range = document.createRange();
      range.selectNodeContents($('api-example'));
      selection.removeAllRanges();
      selection.addRange(range);
      toast('Example selected. Press ⌘/Ctrl C to copy.');
    }
  };
  function loadConfig() {
    $('config-editor').value = JSON.stringify(T.toConfig(engine.state), null, 2);
    editorDirty = false;
    $('config-error').hidden = true;
  }
  $('load-config').onclick = loadConfig;
  $('config-editor').oninput = () => {
    editorDirty = true;
    $('config-error').hidden = true;
  };
  function applyConfig(config) {
    const state = T.normalize(config);
    T.render(state);
    engine.dispatch({ type: 'state.replace', payload: { state } });
    editorDirty = false;
    loadConfig();
    showPage('stage');
    toast('Configuration applied. Undo is available.');
  }
  $('apply-config').onclick = () => {
    try {
      applyConfig(JSON.parse($('config-editor').value));
    } catch (error) {
      $('config-error').textContent = error.message;
      $('config-error').hidden = false;
    }
  };
  $('import-scene-button').onclick = () => $('scene-file').click();
  $('scene-file').onchange = async (event) => {
    try {
      const config = await readJSON(event.target.files[0]);
      if (config) applyConfig(config);
    } catch (error) {
      $('config-error').textContent = error.message;
      $('config-error').hidden = false;
    } finally {
      event.target.value = '';
    }
  };
  document.addEventListener('keydown', (event) => {
    if (
      event.target.closest('input,textarea,select,[contenteditable]') ||
      document.querySelector('dialog[open]')
    )
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? engine.redo() : engine.undo();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      exportFile('json');
    }
    if (
      event.target.matches('[data-control-tab]') &&
      ['ArrowLeft', 'ArrowRight'].includes(event.key)
    ) {
      event.preventDefault();
      const tabs = ['stage', 'players', 'zones', 'extras'];
      const index =
        (tabs.indexOf(controlTab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) %
        tabs.length;
      showControl(tabs[index]);
      document.querySelector(`[data-control-tab="${tabs[index]}"]`).focus();
    }
  });
  window.addEventListener('hashchange', async () => {
    clearTimeout(urlTimer);
    const current = ++urlRevision;
    try {
      const request = await T.readRenderURL();
      if (current !== urlRevision) return;
      applyingURL = true;
      if (request) {
        T.render(request);
        engine.dispatch({ type: 'state.replace', payload: { state: request } });
        editorDirty = false;
      }
      showPage(pageFromURL());
    } catch (error) {
      toast(`The URL request could not be opened: ${error.message}`, true);
    } finally {
      applyingURL = false;
    }
    if (current === urlRevision) queueURL();
  });
  window.addEventListener('pagehide', () => {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORE, JSON.stringify(T.toConfig(engine.state)));
    } catch {
      /* The save indicator already explains unavailable storage. */
    }
  });
  T.initExtrasUI({ engine, dispatch, toast, showPage, showControl });
  new ResizeObserver(() => fitStage()).observe($('canvas-wrap'));
  renderStage(engine.state);
  syncControls(engine.state);
  showPage(pageFromURL());
  if (restoreError) toast(restoreError, true);
})();
