// Native Node entry point. The browser loads these same dependency-free rendering services.
import './js/engine.js';
import './js/extras.js';
import './js/perspective.js';
import './js/layout.js';
import './js/scryfall.js';
import './js/renderer.js';
import './js/mtg-layout.js';
import './js/mtg-renderer.js';
import './js/url.js';
import './js/library.js';
import { fileURLToPath } from 'node:url';
import { createScryfallDiskStore } from './scryfall-cache.mjs';
// Bundled artwork by absolute path: rasterizers such as resvg read it, and the SVG works wherever it is written.
globalThis.Tabletop.assetBase = fileURLToPath(new URL('./assets/', import.meta.url));
globalThis.Tabletop.scryfall = globalThis.Tabletop.createScryfallClient({
  store: createScryfallDiskStore(process.env.TABLETOP_SCRYFALL_CACHE || undefined),
});
export { createScryfallDiskStore };
export const {
  createEngine,
  normalize,
  validate,
  validateDeck,
  normalizeCard,
  normalizeDeck,
  cardAt,
  canSeeFaces,
  forPlayer,
  playerFilename,
  playerRequests,
  toConfig,
  render,
  renderDetailed,
  avatarSVG,
  renderAsync,
  encodeRequest,
  decodeRequest,
  readRenderURL,
  createRenderURL,
  urlLimits,
  formatCounter,
  normalizeCounters,
  playerCounters,
  listGlowEffects,
  listFocusLayouts,
  listExamples,
  example,
  renderDetailedAsync,
  createScryfallClient,
  resolveScryfall,
  scryfall,
  renderPlayer,
  renderPlayers,
  registerScene,
  listScenes,
  themes,
  listThemePresets,
  themePreset,
  layout,
} = globalThis.Tabletop;
export default globalThis.Tabletop;
