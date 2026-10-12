# MTG 26

`theme: "mtg26"` is a named presentation preset: a shortcut for the MTG renderer, video-sized canvas, emerald-and-gold styling, Guardian background, and player perspective. It is separate from the existing `stage.theme` color palette. Explicit request fields override preset defaults.

Open **[the layout explorer](design/index.html)** after `npm start` to try 2–4 players, every viewing seat, phase, focus, background, and both video formats. PNG exports are 1920 × 1080 or 1080 × 1920; the preview is scaled to fit the browser. The regular playground and standalone render URL support the same requests.

```js
const request = {
  theme: 'mtg26',
  // Omit dimensions for 1920 × 1080. Use these for Shorts:
  stage: { width: 1080, height: 1920 },
  players: myPlayers,
  decks: myDecks,
  activeDeckId: 'my-deck',
  view: {
    viewerId: 'p1', // The recipient. This does not follow the active player.
    playerId: 'p2', // Subject of a zone-focused image.
    zoneId: 'battlefield',
    mtg: {
      focus: 'table',
      background: 'sunrise',
      turn: 6,
      activePlayerId: 'p2',
      priorityPlayerId: 'p1',
      phase: 'combat',
      step: 'Declare blockers',
      lands: { p1: [3, 4, 5], p2: [2, 3, 4] },
      stack: [],
      combat: []
    }
  }
};
const url = await Tabletop.createRenderURL(request);
const png = await Tabletop.toPNG(request);
```

`Tabletop.listThemePresets()` lists preset IDs and descriptions; `Tabletop.themePreset('mtg26')` returns fresh configuration defaults. Both helpers are named exports from `tabletop.mjs`. Without player objects, the preset provides an empty two-player table with 60-card libraries; supply actual state and card definitions for a game.

## Composition

Landscape places opponents along the far edge, the recipient's battlefield in the centre, a portrait and life medallion at the lower left, lands above the curved hand, and piles at the lower right. Portrait rearranges these areas vertically. Three- and four-player scenes use angled opponent seats. Lands are positions within the battlefield, not another game zone. Tapped lands retain their physical card size.

Backgrounds are `assets/backgrounds/guardian-{sunrise,eclipse,rose}.png`; `background: 'none'` uses plain green. Portraits live in `assets/avatars/`; pass their served HTTP(S) URL as `player.avatarUrl`, or omit it for initials. Original references are in `design/references/`.

## Caller-controlled views

| Field | Meaning |
| --- | --- |
| `view.viewerId` | Recipient whose owner-visible cards may be drawn. Set `null` with `mode: 'overview'` for a public view. |
| `view.playerId` / `zoneId` | Selected player and zone, independent of the recipient. |
| `view.mtg.focus` | `table`, `self`, `hand`, `battlefield`, `graveyard`, `exile`, `library`, `command`, `zone`, `stack`, or `combat`. |
| `view.mode: 'focus'` | Existing zone-focus API, honoured by this preset. |
| `extras.focus.target` | Existing individual-card reference; the theme uses its own large-card composition. |
| `view.mtg.phase` | `beginning`, `precombat-main`, `combat`, `postcombat-main`, or `ending`. |
| `view.mtg.step` | Optional caller-supplied label, up to 50 characters. |
| `view.mtg.lands` | Player IDs mapped to zero-based battlefield positions that belong on the land rail. |

Phase and active player change status, not focus or viewing seat. `forPlayer()` changes the recipient while preserving explicit zone focus. Public MTG overview conceals owner-only cards, including enlarged cards. Existing `public`, `owner`, and `hidden` zone visibility and per-card `faceDown` annotations remain authoritative.

## Stack and combat

Each player's stack objects are stored in a zone with ID `stack`. Supply a **complete ordered list**, top first, in `view.mtg.stack`; resolution order is never guessed from player order. Spells and abilities can use normal card definitions, including caller-provided artwork.

```js
view.mtg.stack = [
  { playerId: 'p1', zoneId: 'stack', index: 0 },
  { playerId: 'p2', zoneId: 'stack', index: 0 }
];
view.mtg.combat = [{
  attacker: { playerId: 'p2', zoneId: 'battlefield', index: 0 },
  defenderId: 'p1',
  // Optional display label for an attacked planeswalker or battle:
  target: 'Jace',
  blockers: [{ playerId: 'p1', zoneId: 'battlefield', index: 1 }]
}];
```

Send these references with each complete snapshot. They are presentation metadata, not a rules engine: Cardboard does not determine legal attacks, priority, land types, targets, or spell resolution. If card positions change, the caller must update these references. Existing engine card-transfer commands do not move the MTG presentation references automatically.

Dense views use bounded card samples with `+N` indicators. Individual-card focus supports `showcase` (large card and information panel), `sidecar` (complete scene beside the card, stacked in portrait), and `spotlight` (card over the dimmed scene). Enlarged cards stay upright for reading. Changing this layout never changes visibility permissions.

Zone/phase vocabulary follows the [official Magic Comprehensive Rules](https://magic.wizards.com/en/rules). Demo fixtures illustrate layouts, not a tournament-legal deck or game simulation.
