(function (global) {
  'use strict';
  const T = global.Tabletop,
    $ = (id) => document.getElementById(id),
    esc = (value) => T.escape(value);
  T.initExtrasUI = function ({ engine, dispatch, toast, showPage, showControl }) {
    const root = document.createElement('div');
    root.id = 'controls-extras';
    root.className = 'control-view';
    root.hidden = true;
    root.innerHTML = `
      <section class="control-section"><div class="section-title"><h2>Card target</h2><span class="tiny-pill">EXTRAS</span></div>
        <label class="field">Player<select id="extra-player"></select></label>
        <div class="two-fields"><label class="field">Zone<select id="extra-zone"></select></label><label class="field">Card number<input id="extra-index" type="number" min="1" value="1"></label></div>
        <p id="extra-target-help" class="field-help"></p>
      </section>
      <section class="control-section"><div class="section-title"><h2>Glow library</h2></div>
        <div id="glow-presets" class="glow-presets">${T.listGlowEffects()
          .map(
            (e) =>
              `<button type="button" data-glow-preset="${e.id}" style="--glow:${e.color}" title="${esc(e.description)}"><span class="glow-sample"></span><span>${esc(e.name)}</span></button>`,
          )
          .join('')}</div>
        <div class="two-fields"><label class="field">Color<input id="glow-color" type="color" value="#ffd279"></label><label class="field">Strength<input id="glow-strength" type="number" min="0.25" max="2" step="0.25" value="1"></label></div>
        <button id="highlight-card" class="button primary full-width">Highlight this card</button><button id="highlight-zone" class="button full-width">Highlight this zone</button>
        <div id="highlight-list" class="highlight-list"></div><button id="clear-highlights" class="text-button">Clear highlights</button>
      </section>
      <section class="control-section"><div class="section-title"><h2>Featured card</h2></div>
        <label class="field">Layout<select id="card-focus-layout">${T.listFocusLayouts()
          .map((l) => `<option value="${l.id}">${esc(l.name)}</option>`)
          .join('')}</select></label>
        <label class="field">Title <span class="label-note">optional</span><input id="card-focus-title" maxlength="100" placeholder="Use the card name"></label>
        <label class="field">Caption <span class="label-note">optional</span><input id="card-focus-caption" maxlength="180" placeholder="Use player and zone"></label>
        <label class="field">Scene dimming<input id="card-focus-dim" type="range" min="0" max="0.9" step="0.05" value="0.7"></label>
        <button id="feature-card" class="button primary full-width">Bring this card into focus</button><button id="clear-card-focus" class="text-button">Return to scene</button>
        <p class="field-help">The scene stays underneath. Concealed cards keep their backs in player images.</p>
      </section>
      <section class="control-section"><div class="section-title"><h2>Card annotations</h2></div>
        <label class="switch-row"><span>Turned / tapped</span><input id="card-tapped" type="checkbox" role="switch"><span class="switch"></span></label>
        <label class="switch-row"><span>Conceal this card</span><input id="card-concealed" type="checkbox" role="switch"><span class="switch"></span></label>
        <label class="field">Badge<input id="card-badge" maxlength="24" placeholder="5 / 5, HP 220, Token…"></label>
        <label class="field">Tags <span class="label-note">comma separated</span><input id="card-tags" placeholder="Flying, Equipped"></label>
        <label class="field">Card counters <span class="label-note">Name = count, one per line</span><textarea id="card-counters" rows="4" placeholder="Damage = 70&#10;Energy = 3"></textarea></label>
        <button id="apply-card-state" class="button full-width">Apply card annotations</button><button id="clear-card-state" class="text-button">Clear this card’s annotations</button>
      </section>`;
    $('controls-zones').after(root);
    const counterEditor = $('player-counters');
    counterEditor.innerHTML = `<div class="section-title"><h2>Named counters</h2><button id="add-counter" class="text-button">+ Add</button></div><div id="counter-list"></div><p class="field-help">Exact by default. Enter ∞ or a large integer without losing digits.</p><div id="counter-samples" class="counter-samples">${['99', '100', '999', '9999', '99999999', '∞'].map((value) => `<button type="button" data-counter-sample="${value}">${value}</button>`).join('')}</div><p class="field-help">Try a value in the first counter. Choose Full player stats to show the list.</p>`;
    const formatting = document.createElement('div');
    formatting.innerHTML = `<label class="field">Counter numbers<select id="counter-format"><option value="exact">Exact · 99,999,999</option><option value="compact">Compact · 99.99M</option><option value="capped">Capped · 99+</option><option value="scientific">Scientific · 9.99e7</option></select></label><label class="field" id="counter-cap-field">Cap<input id="counter-cap" type="number" min="1" value="99"></label>`;
    $('stats-select').closest('label').after(formatting);
    let selectedPreset = 'halo';
    const current = () => {
      const state = engine.state,
        player = state.players.find((p) => p.id === state.view.playerId),
        zone = player.zones.find((z) => z.id === state.view.zoneId);
      return { state, player, zone };
    };
    const target = () => {
      const { player, zone } = current();
      return {
        playerId: player.id,
        zoneId: zone.id,
        index: Number($('extra-index').value) - 1,
      };
    };
    const glow = () => ({
      preset: selectedPreset,
      color: $('glow-color').value,
      strength: Number($('glow-strength').value),
    });
    const same = (a, b) =>
      a.playerId === b.playerId &&
      a.zoneId === b.zoneId &&
      a.index === b.index &&
      a.cardId === b.cardId;
    function selectPreset(id) {
      selectedPreset = id;
      $('glow-color').value = T.glowEffect(id).color;
      root.querySelectorAll('[data-glow-preset]').forEach((b) => {
        b.classList.toggle('active', b.dataset.glowPreset === id);
        b.setAttribute('aria-pressed', b.dataset.glowPreset === id);
      });
    }
    function refreshCard() {
      const { state, player, zone } = current();
      const index = Math.min(
        Math.max(0, Number($('extra-index').value) - 1 || 0),
        Math.max(0, zone.count - 1),
      );
      $('extra-index').value = index + 1;
      $('extra-index').max = Math.max(1, zone.count);
      const annotation = T.annotationAt(state, player, zone, index);
      $('extra-target-help').textContent = zone.count
        ? `${zone.count.toLocaleString()} cards · API index ${index} · position, not card definition`
        : 'This zone is empty. Add cards in Zones first.';
      $('card-tapped').checked = annotation.tapped || annotation.rotation === 90;
      $('card-concealed').checked = !!annotation.faceDown;
      $('card-badge').value = annotation.badge || '';
      $('card-tags').value = (annotation.tags || []).join(', ');
      $('card-counters').value = (annotation.counters || [])
        .map((c) => `${c.name} = ${c.count}`)
        .join('\n');
      for (const id of ['highlight-card', 'highlight-zone', 'feature-card', 'apply-card-state'])
        $(id).disabled = !zone.count;
    }
    function refresh() {
      const { state, player, zone } = current();
      $('extra-player').innerHTML = state.players
        .map(
          (p) =>
            `<option value="${esc(p.id)}" ${p.id === player.id ? 'selected' : ''}>${esc(p.name)}</option>`,
        )
        .join('');
      $('extra-zone').innerHTML = player.zones
        .map(
          (z) =>
            `<option value="${esc(z.id)}" ${z.id === zone.id ? 'selected' : ''}>${esc(z.name)}</option>`,
        )
        .join('');
      $('counter-format').value = state.view.counterFormat;
      $('counter-cap').value = state.view.counterCap;
      $('counter-cap-field').hidden = state.view.counterFormat !== 'capped';
      const counters = T.playerCounters(player);
      $('add-counter').disabled = counters.length >= 16;
      $('counter-list').innerHTML = counters
        .map(
          (c, i) =>
            `<div class="counter-editor-row" data-counter-row="${i}"><label>NAME<input data-counter-field="name" value="${esc(c.name)}" maxlength="32" aria-label="Counter ${i + 1} name"></label><label>COUNT<input data-counter-field="count" value="${esc(c.count)}" aria-label="${esc(c.name)} count" spellcheck="false"></label><button data-remove-counter="${i}" class="icon-button" aria-label="Remove ${esc(c.name)}">×</button><label class="counter-format-field">NUMBER FORMAT<select data-counter-field="format" aria-label="${esc(c.name)} format"><option value="">Scene default</option>${['exact', 'compact', 'capped', 'scientific'].map((f) => `<option value="${f}" ${c.format === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label><span class="counter-format-preview" title="${esc(T.formatCounter(c.count))}">${esc(T.formatCounter(c.count, T.counterOptions(c, state.view)))}</span>${c.format === 'capped' ? `<label class="counter-format-field">CAP<input data-counter-field="cap" type="number" min="1" value="${c.cap ?? state.view.counterCap}" aria-label="${esc(c.name)} cap"></label>` : ''}</div>`,
        )
        .join('');
      $('highlight-list').innerHTML = state.extras.highlights
        .map(
          (h, i) =>
            `<div><span>${esc(h.target.cardId || `${h.target.playerId} · ${h.target.zoneId} · ${h.target.index === undefined ? 'all' : h.target.index + 1}`)}<small>${esc(T.glowEffect(h.preset).name)}</small></span><button class="icon-button" data-remove-highlight="${i}" aria-label="Remove highlight ${i + 1}">×</button></div>`,
        )
        .join('');
      $('clear-highlights').disabled = !state.extras.highlights.length;
      $('clear-card-focus').disabled = !state.extras.focus;
      if (state.extras.focus) {
        $('card-focus-layout').value = state.extras.focus.layout;
        $('card-focus-title').value = state.extras.focus.title || '';
        $('card-focus-caption').value = state.extras.focus.caption || '';
        $('card-focus-dim').value = state.extras.focus.dim ?? 0.7;
      }
      refreshCard();
    }
    $('extra-player').onchange = (e) => dispatch('view.update', { playerId: e.target.value });
    $('extra-zone').onchange = (e) => dispatch('view.update', { zoneId: e.target.value });
    $('extra-index').onchange = refreshCard;
    $('counter-format').onchange = (e) =>
      dispatch('view.update', { counterFormat: e.target.value });
    $('counter-cap').onchange = (e) =>
      dispatch('view.update', { counterCap: Number(e.target.value) });
    $('add-counter').onclick = () => {
      const { player } = current(),
        counters = T.playerCounters(player);
      let id = 'counter-' + (counters.length + 1);
      while (counters.some((c) => c.id === id)) id += '-new';
      dispatch('player.update', {
        playerId: player.id,
        counters: [...counters, { id, name: 'Counter', count: 0 }],
      });
    };
    counterEditor.addEventListener('change', (event) => {
      const field = event.target.dataset.counterField;
      if (!field) return;
      const { player } = current(),
        counters = T.playerCounters(player),
        index = Number(event.target.closest('[data-counter-row]').dataset.counterRow);
      try {
        if (field === 'count') counters[index].count = T.normalizeCount(event.target.value);
        else if (field === 'format' && !event.target.value) delete counters[index].format;
        else
          counters[index][field] =
            field === 'cap' ? Number(event.target.value) : event.target.value;
        dispatch('player.update', { playerId: player.id, counters });
      } catch (error) {
        toast(error.message, true);
        refresh();
      }
    });
    counterEditor.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const { player } = current(),
        counters = T.playerCounters(player);
      if (button.dataset.removeCounter !== undefined)
        counters.splice(Number(button.dataset.removeCounter), 1);
      else if (button.dataset.counterSample !== undefined) {
        if (!counters.length) counters.push({ id: 'life', name: 'Life', count: 0 });
        counters[0].count = T.normalizeCount(button.dataset.counterSample);
      } else return;
      dispatch('player.update', { playerId: player.id, counters });
    });
    root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.glowPreset) selectPreset(button.dataset.glowPreset);
      if (button.dataset.removeHighlight !== undefined)
        dispatch('extras.update', {
          highlights: engine.state.extras.highlights.filter(
            (_, i) => i !== Number(button.dataset.removeHighlight),
          ),
        });
    });
    function addHighlight(wholeZone = false) {
      const t = target();
      if (wholeZone) delete t.index;
      const highlights = engine.state.extras.highlights.filter((item) => !same(item.target, t));
      dispatch('extras.update', { highlights: [...highlights, { target: t, ...glow() }] });
    }
    $('highlight-card').onclick = () => addHighlight();
    $('highlight-zone').onclick = () => addHighlight(true);
    $('clear-highlights').onclick = () => dispatch('extras.update', { highlights: [] });
    $('feature-card').onclick = () =>
      dispatch('extras.update', {
        focus: {
          target: target(),
          layout: $('card-focus-layout').value,
          ...glow(),
          title: $('card-focus-title').value,
          caption: $('card-focus-caption').value,
          dim: Number($('card-focus-dim').value),
        },
      });
    $('clear-card-focus').onclick = () => dispatch('extras.update', { focus: null });
    $('card-focus-layout').onchange = (e) => {
      const focus = engine.state.extras.focus;
      if (focus) dispatch('extras.update', { focus: { ...focus, layout: e.target.value } });
    };
    $('apply-card-state').onclick = () => {
      try {
        const counters = $('card-counters')
          .value.split('\n')
          .filter((line) => line.trim())
          .map((line, i) => {
            const split = line.lastIndexOf('=');
            if (split < 1) throw new Error('Use Name = count on each counter line.');
            return {
              id: `card-counter-${i + 1}`,
              name: line.slice(0, split).trim(),
              count: T.normalizeCount(line.slice(split + 1)),
            };
          });
        const entry = {
          target: target(),
          tapped: $('card-tapped').checked,
          faceDown: $('card-concealed').checked,
          tags: $('card-tags')
            .value.split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          counters,
        };
        if ($('card-badge').value.trim()) entry.badge = $('card-badge').value.trim();
        dispatch('extras.update', {
          cards: [
            ...engine.state.extras.cards.filter((item) => !same(item.target, entry.target)),
            entry,
          ],
        });
      } catch (error) {
        toast(error.message, true);
      }
    };
    $('clear-card-state').onclick = () =>
      dispatch('extras.update', {
        cards: engine.state.extras.cards.filter((item) => !same(item.target, target())),
      });
    const library = document.createElement('section');
    library.className = 'example-library';
    library.id = 'example-library';
    library.innerHTML = `<div class="section-title"><div><span class="eyebrow">SCENE LIBRARY</span><h2>Different games. The same render API.</h2></div></div><p>Load an editable fixture. Game examples use original demo artwork and caller-supplied values.</p><div class="example-grid">${T.listExamples()
      .map(
        (item) =>
          `<button type="button" class="example-card" data-example="${item.id}"><img alt="${esc(item.name)} preview" loading="lazy" src="data:image/svg+xml,${encodeURIComponent(T.render(T.example(item.id)))}"><span class="eyebrow">${esc(item.game)}</span><strong>${esc(item.name)}</strong><span>${esc(item.description)}</span></button>`,
      )
      .join('')}</div>`;
    $('page-api').querySelector('.api-layout').before(library);
    library.onclick = (event) => {
      const button = event.target.closest('[data-example]');
      if (button && dispatch('state.replace', { state: T.example(button.dataset.example) })) {
        showPage('stage');
        showControl(button.dataset.example === 'counter-limits' ? 'players' : 'extras');
        toast('Example loaded. Every setting is editable; undo restores your scene.');
      }
    };
    const shortcut = document.createElement('button');
    shortcut.className = 'text-button';
    shortcut.textContent = 'Explore game & effect examples →';
    shortcut.onclick = () => {
      showPage('api');
      library.scrollIntoView({ block: 'start' });
    };
    root.prepend(shortcut);
    selectPreset('halo');
    refresh();
    engine.subscribe(refresh);
  };
})(globalThis);
