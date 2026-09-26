(function (global) {
  'use strict';
  const T = global.Tabletop;
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.readAsDataURL(blob);
    });
  }
  async function portableSVG(config, artworkCache = new Map()) {
    const source = await T.renderAsync(config);
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (document.querySelector('parsererror'))
      throw new Error('The scene did not return valid SVG.');
    const images = [...document.querySelectorAll('image')];
    const sources = [
      ...new Set(images.map((image) => image.getAttribute('href')).filter(Boolean)),
    ];
    const embedded = new Map();
    // A small queue keeps large custom decks from opening hundreds of requests at once.
    let cursor = 0,
      failure;
    await Promise.all(
      Array.from({ length: Math.min(4, sources.length) }, async () => {
        while (cursor < sources.length && !failure) {
          const url = sources[cursor++];
          try {
            if (artworkCache.has(url)) {
              embedded.set(url, artworkCache.get(url));
              continue;
            }
            let data = url;
            if (!url.startsWith('data:')) {
              const response = await fetch(url, {
                mode: 'cors',
                credentials: 'omit',
                signal: AbortSignal.timeout(12000),
              });
              if (!response.ok) throw new Error('Image request failed.');
              const blob = await response.blob();
              if (!blob.type.startsWith('image/') || blob.size > 10000000)
                throw new Error('Artwork must be an image smaller than 10 MB.');
              data = await blobToDataURL(blob);
            }
            // An SVG can decode successfully even when one of its child images is broken.
            // Validate each image first so exports never quietly substitute the placeholder.
            const image = new Image();
            image.src = data;
            await image.decode();
            embedded.set(url, data);
            artworkCache.set(url, data);
          } catch {
            failure ||= new Error(
              url.startsWith('data:')
                ? 'A card contains an unreadable artwork image. Edit that card and upload a valid image.'
                : `Could not embed artwork from ${new URL(url).hostname}. Use a valid image from a host that allows CORS, or upload an image in the card manager.`,
            );
          }
        }
      }),
    );
    if (failure) throw failure;
    images.forEach((image) => {
      const value = embedded.get(image.getAttribute('href'));
      if (value) image.setAttribute('href', value);
    });
    return new XMLSerializer().serializeToString(document);
  }
  async function toPNG(config, artworkCache) {
    const state = T.normalize(config),
      svg = await portableSVG(state, artworkCache);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = state.stage.width;
      canvas.height = state.stage.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
      context.drawImage(image, 0, 0);
      return await new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('PNG export failed. Try a smaller stage.')),
          'image/png',
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportPlayers(config, { format = 'png', scope, onProgress } = {}) {
    if (!['png', 'svg'].includes(format))
      throw new Error('Player image format must be png or svg.');
    const requests = T.playerRequests(config, { scope });
    const files = [],
      artworkCache = new Map();
    for (const { state, ...request } of requests) {
      let blob;
      try {
        blob =
          format === 'png'
            ? await toPNG(state, artworkCache)
            : new Blob([await portableSVG(state, artworkCache)], { type: 'image/svg+xml' });
      } catch (error) {
        throw new Error(`${request.playerName} (${request.scope}): ${error.message}`);
      }
      files.push({
        ...request,
        filename: T.playerFilename(state, request.playerId, request.scope, format),
        blob,
      });
      onProgress?.(files.length, requests.length, request);
    }
    return files;
  }
  async function toPlayerZIP(config, options = {}) {
    const state = T.normalize(config),
      images = await exportPlayers(state, options);
    const manifest = {
      version: 1,
      width: state.stage.width,
      height: state.stage.height,
      images: images.map(({ blob, ...metadata }) => metadata),
    };
    return T.zipFiles([
      ...images.map((image) => ({ name: image.filename, blob: image.blob })),
      {
        name: 'manifest.json',
        blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
      },
    ]);
  }
  Object.assign(T, {
    toSVG: portableSVG,
    toPNG,
    exportPlayers,
    toPlayerZIP,
    download,
    blobToDataURL,
  });
})(globalThis);
