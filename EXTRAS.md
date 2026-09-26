# Extras: emphasis, card focus, and counters

These are render inputs. The caller supplies card state and game mechanics; Cardboard API draws the request. Everything works in the static URL renderer, browser exports, and Node SVG API. Open **Extras**, **Players**, or **API → Scene library** in the playground to experiment.

## Named counters

Give a player a `counters` array. It replaces the display derived from the older `stats` object; an empty array hides that player's counters. Up to 16 counters per player, each with a name of up to 32 characters. IDs are optional and assigned by position when omitted; supply stable IDs if editing the list.

```js
player.counters = [
  { id: 'life', name: 'Life', count: 99999999 },
  { id: 'poison', name: 'Poison', count: 3 },
  { id: 'mana', name: 'Mana', count: 'infinity' },
  { id: 'damage-p2', name: 'Commander damage · p2', count: 9 },
  { id: 'chips', name: 'Chips', count: '123456789012345678901234567890', format: 'scientific' }
];
```

Counts accept safe integer numbers, signed decimal integer strings of up to 60 digits, and `"infinity"`/`"-infinity"` (`"∞"`/`"-∞"` are accepted too). Use strings beyond `Number.MAX_SAFE_INTEGER`; JavaScript numeric `Infinity` and `NaN` are rejected. Negative counts are allowed. Counts represent display values, not game-rule legality.

`view.counterFormat` sets the default, and each counter can override `format`, `cap`, or six-digit hex `color`. Default cap: 99. Formatting changes only the label, never the stored count.

| Count | Exact (default) | Compact | Capped at 99 | Scientific |
| --- | --- | --- | --- | --- |
| 99 | 99 | 99 | 99 | 99 |
| 100 | 100 | 100 | 99+ | 100 |
| 999 | 999 | 999 | 99+ | 999 |
| 9999 | 9,999 | 9.99K | 99+ | 9.99e3 |
| 99999999 | 99,999,999 | 99.99M | 99+ | 9.99e7 |
| infinity | ∞ | ∞ | ∞ | ∞ |
| -100 | −100 | −100 | < −99 | −100 |

Compact/scientific keep at most two fractional digits, truncated rather than rounded up across a threshold. Compact uses K/M/B/T, then scientific for larger magnitudes. Exact labels fit their cells; full values are also retained in SVG titles. `view.stats` controls density: `hidden`, `compact` (first counter), or `full` (an adaptive grid). Crowded panels show `+N counters`; extremely small panels keep the primary value. Use a larger image or a self player view for detail. Existing fractional values in legacy `stats` objects remain readable.

```js
Tabletop.formatCounter(99999999); // "99,999,999"
Tabletop.formatCounter(99999999, { format: 'compact' }); // "99.99M"
```

## Card targeting and glows

A position is `{playerId, zoneId, index}` with a **zero-based index in that zone**. It identifies one occurrence, so identical card definitions can have different appearances. This position remains meaningful only for that request; external game managers must update it when cards move.

```js
request.extras = {
  highlights: [
    { target: { playerId: 'p1', zoneId: 'battlefield', index: 0 }, preset: 'arcane' },
    { target: { playerId: 'p1', zoneId: 'battlefield', index: 2 }, preset: 'ember', strength: 1.5 },
    { target: { cardId: 'A-spades' }, preset: 'neon', color: '#64edff' }
  ]
};
```

Presets: `halo`, `neon`, `arcane`, `ember`, `frost`, `toxic`. These are original, static SVG effects, exported with the image. Inspect `Tabletop.listGlowEffects()` for names, descriptions, and default colors. `strength` is 0.25–2, default 1; `color` is an optional six-digit hex override. Up to 64 highlight rules. Later matching rules win.

A highlight target may also be `{playerId, zoneId}` for an entire zone, or `{cardId}` for all visible occurrences. Card-ID selectors can be narrowed by player and zone. Concealed definitions are never inspected for identity matching. Explicit position highlights are included in bounded grid/fan samples when space allows; stacks retain their top-card sample. Use card focus to inspect a distant position in a large zone.

## Featured card over a scene

`extras.focus` brings one position forward while retaining the selected base scene. Use `null` to clear it. A focused card may be outside the normal zone sample. It is displayed upright; turned state can still be noted in its information panel.

```js
request.extras.focus = {
  target: { playerId: 'p1', zoneId: 'battlefield', index: 0 },
  layout: 'showcase',
  preset: 'halo',
  title: 'Selected creature',
  caption: 'Caller-provided context',
  dim: 0.7
};
```

| Layout | Presentation |
| --- | --- |
| `spotlight` | Large centered card over a dimmed scene |
| `sidecar` | Complete scene beside the featured card; stacked on portrait stages |
| `showcase` | Card and information panel on a presentation surface |

Title/caption are optional; defaults use the resolved card name, player, and zone. Dimming is 0–0.9 (default 0.7), used for Spotlight and Showcase. Glow is optional; a matching highlight is reused when no focus preset is specified. `Tabletop.listFocusLayouts()` lists the styles. This composition wraps the registered scene renderer, so it can also sit over future scenes.

Focus respects the recipient and per-card concealment. A hidden card displays a back and generic label; its custom title, caption, counters, and tags are omitted, and its artwork is not fetched. A self-only player image omits focus on another player's card. These are image visibility rules; the caller must still redact private data from any shared request URL.

## Card annotations

`extras.cards` holds up to 128 position-specific annotations. One entry per position:

```js
request.extras.cards = [{
  target: { playerId: 'p1', zoneId: 'battlefield', index: 0 },
  tapped: true,
  faceDown: false,
  badge: '5 / 5',
  tags: ['Token', 'Flying', 'Equipped'],
  counters: [
    { name: '+1/+1', count: 2 },
    { name: 'Shield', count: 1 },
    { name: 'Damage', count: 3 }
  ]
}];
```

`rotation` optionally supplies −180 to 180 degrees and takes precedence over `tapped` (90 degrees). Rotation fits within the card's allotted position. `faceDown: true` conceals that occurrence even in a public zone; `false` never overrides zone visibility. A badge accepts 24 characters; up to six tags of 24 characters and eight named card counters. Counter formatting uses the same options as player counters. Small scene cards show a bounded annotation summary; a Showcase provides more room. Excess counters are explicitly counted, with full values in SVG titles. Concealed cards omit all these details.

Use generic counters/tags/badges for loyalty, defense, power/toughness, damage, attached energy, equipment summaries, ATK/DEF, materials, or conditions. Attachment labels are summaries supplied by the caller; this renderer does not calculate relationships, combat, triggers, or effects.

The playground's transfer command moves position annotations, highlights, and focus with transferred cards. Removing positions repairs stale references. Selecting/importing a deck, shuffling sample cards, or removing an active card definition clears extras so effects cannot silently attach to replacement sample cards. Undo restores the prior snapshot.

## Scene library and game coverage

```js
Tabletop.listExamples(); // IDs, names, games, descriptions
const request = Tabletop.example('mtg-commander'); // independent normalized snapshot
const url = await Tabletop.createRenderURL(request);
```

The build generates [examples/index.json](examples/index.json) and each JSON request from `js/library.js`. Game fixtures use original demo illustrations; replace deck definitions with Scryfall IDs or your own artwork. They are rendering examples, not legal decks or game simulations.

For Pokémon, Yu-Gi-Oh!, or other full card scans, use `{id, name, artUrl, artMode: 'full-card'}`. The whole image fits proportionally in the card, preserving edges and text. The card manager exposes **Image treatment → Full card scan**. The default `illustration` treatment places artwork inside the existing card frame. Scryfall scans always use full-card rendering automatically.

| Example | Rendering coverage |
| --- | --- |
| [Commander table](examples/mtg-commander.json) | Life, poison, energy, experience, commander damage per opponent; library, battlefield, graveyard, hand, command, exile, stack; tokens, tap state, +1/+1 and shield counters, power/toughness, attachment summaries |
| [Spell on the stack](examples/mtg-stack.json) | Featured spell, target glow, card counters, sidecar layout |
| [Pokémon active/bench](examples/pokemon-battle.json) | Active, bench, prizes, deck, hand, discard, stadium; HP, damage, energy/tool summaries, condition tags |
| [Yu-Gi-Oh! duel](examples/yugioh-duel.json) | Life points, monster and Spell/Trap areas, extra monsters, field, Extra Deck, banished, graveyard, hand; ATK/DEF, counters, materials, defense position, concealed cards |
| [Poker showdown](examples/poker-showdown.json) | Hole/community cards, chips, pot, bet, and multi-card highlights |
| [Number extremes](examples/counter-limits.json) | Large, negative, infinite, and arbitrary-precision counters |
| [Glow library](examples/glow-library.json) | Six effects on separate card occurrences |

There are up to 16 zones per player. Additional MTG counters/conditions (for example radiation, tickets, mana colors, monarch, day/night, loyalty, defense), Pokémon variants, or other games can use the same named fields and custom zones without new renderer enums. Values and rule outcomes come from your engine. Detailed attachment trees, card rules text, and game-specific mat/slot geometry are not inferred from these summaries; those would be separate scene designs.

Reference terminology: [official Commander format](https://magic.wizards.com/en/formats/commander), [Pokémon rules resources](https://play.pokemon.com/en-gb/resources/rules/), and [Yu-Gi-Oh! rulebook](https://www.yugioh-card.com/eu/play/tcg-rulebook/).
