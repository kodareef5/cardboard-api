(function () {
  'use strict';
  const T = globalThis.Tabletop,
    $ = (id) => document.getElementById(id);
  const embedded = new URL(location.href).searchParams.get('embed') === '1';
  document.body.classList.toggle('embedded', embedded);
  let revision = 0,
    state = null,
    exportBusy = false,
    noticeTimer;
  const buttons = ['copy-render-link', 'download-render-png', 'download-render-svg'];
  function notice(message) {
    clearTimeout(noticeTimer);
    $('render-notice').textContent = message;
    $('render-notice').hidden = false;
    noticeTimer = setTimeout(() => {
      $('render-notice').hidden = true;
    }, 8000);
  }
  function fit() {
    if (!state) return;
    const area = $('render-canvas'),
      css = getComputedStyle(area);
    const availableWidth =
      area.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const chromeHeight = embedded
      ? 0
      : document.querySelector('.render-toolbar').offsetHeight +
        document.querySelector('.render-footer').offsetHeight;
    const availableHeight = Math.max(
      80,
      innerHeight - chromeHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom),
    );
    const scale = Math.min(
      availableWidth / state.stage.width,
      availableHeight / state.stage.height,
    );
    $('render-image').style.width = `${Math.max(1, state.stage.width * scale)}px`;
    $('render-image').style.height = `${Math.max(1, state.stage.height * scale)}px`;
  }
  async function artworkReady() {
    const elements = [...$('render-image').querySelectorAll('image')];
    const urls = [...new Set(elements.map((image) => image.getAttribute('href')).filter(Boolean))];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, urls.length) }, async () => {
        while (cursor < urls.length) {
          const url = urls[cursor++];
          const matching = elements.filter((element) => element.getAttribute('href') === url);
          const image = new Image();
          image.src = url;
          let timeout;
          try {
            await Promise.race([
              image.decode(),
              new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('Artwork timed out.')), 20000);
              }),
            ]);
          } catch {
            matching
              .filter((element) => element.hasAttribute('data-avatar-image'))
              .forEach((element) => element.remove());
            if (matching.every((element) => element.hasAttribute('data-avatar-image')))
              continue;
            throw new Error(
              'A card image could not be loaded. Check its artwork URL and try again.',
            );
          } finally {
            clearTimeout(timeout);
          }
        }
      }),
    );
  }
  const viewer = (T.viewer = {
    ready: null,
    get state() {
      return state ? T.clone(state) : null;
    },
  });
  function load() {
    const current = ++revision;
    state = null;
    document.body.dataset.renderStatus = 'loading';
    $('render-canvas').setAttribute('aria-busy', 'true');
    $('render-image').hidden = true;
    $('render-image').replaceChildren();
    $('render-message').hidden = false;
    $('render-message-title').textContent = 'Rendering your scene';
    $('render-message-detail').textContent = 'Loading the request and card artwork.';
    $('render-status').textContent = 'Loading…';
    $('retry-render').hidden = true;
    buttons.forEach((id) => {
      $(id).disabled = true;
    });
    const editorURL = new URL('index.html', location.href);
    editorURL.hash = location.hash;
    $('edit-render').href = editorURL.href;
    viewer.ready = (async () => {
      try {
        // A missing request is a documented default fixture, never a saved scene.
        const request = (await T.readRenderURL()) || T.normalize();
        const result = await T.renderDetailedAsync(request);
        if (current !== revision) return null;
        $('render-image').innerHTML = result.svg;
        T.applyAvatarFallbacks($('render-image'));
        await artworkReady();
        if (current !== revision) return null;
        state = request;
        $('render-image').hidden = false;
        $('render-message').hidden = true;
        $('render-dimensions').textContent = `${state.stage.width} × ${state.stage.height} px`;
        $('render-status').textContent = 'Ready';
        document.body.dataset.renderStatus = 'ready';
        $('render-canvas').setAttribute('aria-busy', 'false');
        buttons.forEach((id) => {
          $(id).disabled = exportBusy;
        });
        fit();
        const ready = {
          width: state.stage.width,
          height: state.stage.height,
          metrics: result.metrics,
        };
        window.dispatchEvent(new CustomEvent('tabletop:ready', { detail: ready }));
        return ready;
      } catch (error) {
        if (current !== revision) return null;
        document.body.dataset.renderStatus = 'error';
        $('render-canvas').setAttribute('aria-busy', 'false');
        $('render-image').replaceChildren();
        $('render-message-title').textContent = 'Unable to render this request';
        $('render-message-detail').textContent = error.message;
        $('render-dimensions').textContent = 'Check the render request';
        $('render-status').textContent = 'Render failed';
        $('retry-render').hidden = false;
        throw error;
      }
    })();
    // Render failures remain awaitable without generating an unhandled rejection in the page.
    viewer.ready.catch(() => {});
  }
  async function download(format) {
    if (!state || exportBusy) return;
    const request = T.clone(state);
    exportBusy = true;
    buttons.forEach((id) => {
      $(id).disabled = true;
    });
    $('render-status').textContent = `Preparing ${format.toUpperCase()}…`;
    try {
      const blob =
        format === 'png'
          ? await T.toPNG(request)
          : new Blob([await T.toSVG(request)], { type: 'image/svg+xml' });
      const name = request.view.viewerId
        ? T.playerFilename(request, request.view.viewerId, request.view.playerScope, format)
        : `tabletop-${request.stage.width}x${request.stage.height}.${format}`;
      T.download(blob, name);
      notice(
        `${format.toUpperCase()} downloaded · ${request.stage.width} × ${request.stage.height} px`,
      );
    } catch (error) {
      notice(error.message);
    } finally {
      exportBusy = false;
      const ready = document.body.dataset.renderStatus === 'ready';
      buttons.forEach((id) => {
        $(id).disabled = !ready;
      });
      if (ready) $('render-status').textContent = 'Ready';
    }
  }
  $('download-render-png').onclick = () => download('png');
  $('download-render-svg').onclick = () => download('svg');
  $('copy-render-link').onclick = async () => {
    try {
      const url = await T.createRenderURL(state, { baseURL: location.href, embed: embedded });
      await navigator.clipboard.writeText(url);
      notice('Render link copied.');
    } catch {
      notice('Copy the complete URL from your browser’s address bar to share this render.');
    }
  };
  $('retry-render').onclick = load;
  window.addEventListener('hashchange', load);
  window.addEventListener('resize', fit);
  load();
})();
