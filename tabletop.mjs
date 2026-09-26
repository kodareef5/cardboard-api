// Native Node entry point. The browser loads these same dependency-free rendering services.
import './js/engine.js';
import './js/perspective.js';
import './js/layout.js';
import './js/scryfall.js';
import './js/renderer.js';
import './js/url.js';
import { createScryfallDiskStore } from './scryfall-cache.mjs';
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
  renderAsync,
  encodeRequest,
  decodeRequest,
  readRenderURL,
  createRenderURL,
  urlLimits,
  renderDetailedAsync,
  createScryfallClient,
  resolveScryfall,
  scryfall,
  renderPlayer,
  renderPlayers,
  registerScene,
  listScenes,
  themes,
  layout,
} = globalThis.Tabletop;
export default globalThis.Tabletop;
