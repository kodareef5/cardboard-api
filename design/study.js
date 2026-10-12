(async function () {
  'use strict';
  const T = globalThis.Tabletop,
    $ = (id) => document.getElementById(id);
  const cards = await fetch('fixtures/cards.json').then((r) => r.json());
  const names = ['Rowan', 'Mira', 'Sol', 'Iris'];
  let state,
    revision = 0,
    inspection = null;
  const buttons = ['download', 'render-link', 'json'];
  function syncPlayers() {
    const count = Number($('players').value);
    for (const id of ['viewer', 'active', 'priority', 'subject']) {
      const previous = $(id).value;
      $(id).replaceChildren(
        ...names.slice(0, count).map((name, i) => new Option(name, `p${i + 1}`)),
      );
      if (id === 'viewer') $(id).add(new Option('Public overview', 'public'));
      if ([...$(id).options].some((o) => o.value === previous)) $(id).value = previous;
    }
  }
  syncPlayers();
  $('active').value = 'p2';
  async function update() {
    const current = ++revision;
    const format = document.querySelector('[name="format"]:checked').value;
    const viewerId = $('viewer').value === 'public' ? null : $('viewer').value;
    $('preview').classList.toggle('portrait', format === 'portrait');
    $('subject-label').hidden = ['table', 'self', 'stack', 'combat'].includes(
      $('focus').value,
    );
    $('card-layout-label').hidden = !inspection && $('focus').value !== 'card';
    $('error').hidden = true;
    buttons.forEach((id) => {
      $(id).disabled = true;
    });
    $('status').textContent = 'Loading card artwork…';
    document.body.dataset.renderStatus = 'loading';
    try {
      state = T.createMtgStudy(cards, {
        count: Number($('players').value),
        viewerId,
        activePlayerId: $('active').value,
        priorityPlayerId: $('priority').value,
        format,
        focus: $('focus').value,
        selectedId: $('subject').value,
        phase: $('phase').value,
        background: $('background').value,
        spells: $('spells').checked,
        crowded: $('crowded').checked,
        assetBase: new URL('../assets/', location.href).href,
      });
      if (inspection)
        state.extras.focus = {
          target: inspection,
          layout: $('card-layout').value,
          preset: 'halo',
        };
      if (state.extras.focus) state.extras.focus.layout = $('card-layout').value;
      $('dimensions').textContent = `${state.stage.width} × ${state.stage.height}`;
      $('preview-label').textContent = viewerId
        ? `${names[Number(viewerId.slice(1)) - 1]}'s perspective`
        : 'Public overview';
      $('preview').innerHTML = T.render(state);
      await T.applyAvatarFallbacks($('preview'));
      const result = await T.renderDetailedAsync(state);
      if (current !== revision) return;
      $('preview').innerHTML = result.svg;
      await T.applyAvatarFallbacks($('preview'));
      if (current !== revision) return;
      $('status').textContent =
        `${result.metrics.renderedCards} cards drawn · Ready to export`;
      document.body.dataset.renderStatus = 'ready';
      buttons.forEach((id) => {
        $(id).disabled = false;
      });
    } catch (error) {
      if (current !== revision) return;
      $('error').textContent = error.message;
      $('error').hidden = false;
      $('status').textContent = 'Unable to render';
      document.body.dataset.renderStatus = 'error';
    }
  }
  document.querySelectorAll('select,input').forEach((el) =>
    el.addEventListener('change', () => {
      if (el.id !== 'card-layout') inspection = null;
      if (el.id === 'players') syncPlayers();
      if (el.id === 'viewer')
        $('subject').value = $('viewer').value === 'public' ? 'p1' : $('viewer').value;
      update();
    }),
  );
  $('preview').addEventListener('click', (event) => {
    const stack = event.target.closest('[data-focus="stack"]');
    if (stack) {
      $('focus').value = 'stack';
      inspection = null;
      update();
      return;
    }
    const card = event.target.closest('[data-card-index]');
    if (card) {
      inspection = {
        playerId: card.dataset.player,
        zoneId: card.dataset.zone,
        index: Number(card.dataset.cardIndex),
      };
      update();
      return;
    }
    const zone = event.target.closest('[data-zone]');
    if (zone && [...$('focus').options].some((o) => o.value === zone.dataset.zone)) {
      $('focus').value = zone.dataset.zone;
      $('subject').value = zone.dataset.player;
      inspection = null;
      update();
    }
  });
  $('reset-focus').onclick = () => {
    inspection = null;
    $('focus').value = 'table';
    update();
  };
  $('download').onclick = async () => {
    $('download').disabled = true;
    try {
      T.download(
        await T.toPNG(state),
        `mtg-${state.stage.width}x${state.stage.height}-${state.view.mtg.focus}.png`,
      );
    } catch (error) {
      $('status').textContent = error.message;
    } finally {
      $('download').disabled = false;
    }
  };
  $('render-link').onclick = async () => {
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await T.createRenderURL(state);
      if (tab) tab.location.replace(url);
      else location.href = url;
    } catch (error) {
      tab?.close();
      $('status').textContent = error.message;
    }
  };
  $('json').onclick = () =>
    T.download(
      new Blob([JSON.stringify(T.toConfig(state), null, 2)], {
        type: 'application/json',
      }),
      'mtg-scene.json',
    );
  globalThis.mtgStudy = {
    get state() {
      return T.clone(state);
    },
    update,
  };
  await update();
})();
