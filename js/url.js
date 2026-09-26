(function (global) {
  'use strict';
  const T = global.Tabletop;
  const MAX_JSON_BYTES = 1000000;
  const MAX_URL_CHARACTERS = 64000;
  const scriptURL = global.document?.currentScript?.src;
  const defaultBase = scriptURL ? new URL('../render.html', scriptURL).href : null;
  const encoder = new TextEncoder();

  function requestJSON(config) {
    // Capture a complete request now. Asynchronous compression cannot observe later edits.
    const json = JSON.stringify(T.toConfig(T.normalize(config)));
    if (encoder.encode(json).length > MAX_JSON_BYTES)
      throw new Error(
        'This scene is too large for a render link. Use artwork URLs or Scryfall IDs instead of uploaded images, or save a JSON file.',
      );
    return json;
  }
  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64(text) {
    if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1)
      throw new Error('The render link contains invalid encoded data.');
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  function checkLength(value) {
    if (value.length > MAX_URL_CHARACTERS)
      throw new Error(
        'This render link is too long. Use a smaller request, artwork URLs, or a JSON file.',
      );
    return value;
  }
  async function encodeRequest(config, { compress = true } = {}) {
    const bytes = encoder.encode(requestJSON(config));
    let token = `v1.json.${toBase64(bytes)}`;
    if (compress && typeof CompressionStream !== 'undefined') {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
      const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
      const candidate = `v1.gz.${toBase64(compressed)}`;
      if (candidate.length < token.length) token = candidate;
    }
    return checkLength(token);
  }
  async function expand(bytes) {
    if (typeof DecompressionStream === 'undefined')
      throw new Error(
        'This browser cannot open compressed links. Use a current browser or an uncompressed JSON link.',
      );
    const reader = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
      .getReader();
    let size = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_JSON_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error('The expanded render request is too large.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
  function parseJSON(json) {
    if (encoder.encode(json).length > MAX_JSON_BYTES)
      throw new Error('The render request is too large.');
    let config;
    try {
      config = JSON.parse(json);
    } catch {
      throw new Error('The render request is not valid JSON.');
    }
    return T.normalize(config);
  }
  async function decodeRequest(token) {
    if (typeof token !== 'string') throw new Error('A render request token is required.');
    checkLength(token);
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1' || !['gz', 'json'].includes(parts[1]))
      throw new Error('Unsupported render link. Expected a v1 render request.');
    let bytes;
    try {
      bytes = fromBase64(parts[2]);
      if (parts[1] === 'gz') bytes = await expand(bytes);
    } catch (error) {
      if (/too large|cannot open/.test(error.message)) throw error;
      throw new Error(
        'The render link is damaged or incomplete. Copy the entire link and try again.',
      );
    }
    let json;
    try {
      json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('The render request contains invalid text.');
    }
    return parseJSON(json);
  }
  function requestParameters(input = global.location?.href) {
    const url = new URL(input);
    checkLength(url.href);
    const parameters = new URLSearchParams(url.hash.slice(1));
    if (parameters.getAll('scene').length + parameters.getAll('config').length > 1)
      throw new Error('Provide one scene or config parameter in the URL fragment.');
    return parameters;
  }
  async function readRenderURL(input = global.location?.href) {
    const parameters = requestParameters(input);
    if (parameters.has('scene')) return decodeRequest(parameters.get('scene'));
    if (parameters.has('config')) return parseJSON(parameters.get('config'));
    return null;
  }
  async function createRenderURL(
    config,
    { baseURL = defaultBase, embed = false, compress = true } = {},
  ) {
    if (!baseURL) throw new Error('Provide the absolute URL of render.html as baseURL.');
    const url = new URL(baseURL);
    if (!['https:', 'http:', 'file:'].includes(url.protocol))
      throw new Error('Render links must use an HTTP(S) or file URL.');
    url.search = embed ? '?embed=1' : '';
    url.hash = new URLSearchParams({
      scene: await encodeRequest(config, { compress }),
    }).toString();
    return checkLength(url.href);
  }
  Object.assign(T, {
    encodeRequest,
    decodeRequest,
    readRenderURL,
    createRenderURL,
    urlLimits: Object.freeze({
      maxJSONBytes: MAX_JSON_BYTES,
      maxURLCharacters: MAX_URL_CHARACTERS,
    }),
  });
})(globalThis);
