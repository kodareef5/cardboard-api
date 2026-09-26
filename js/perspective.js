(function (global) {
  'use strict';
  const T = global.Tabletop;

  // Selection and audience are separate: focusing an opponent's zone must not reveal it.
  function canSeeFaces(state, player, zone) {
    if (state.view.viewerId === null) return !zone.faceDown;
    return (
      zone.visibility === 'public' ||
      (zone.visibility === 'owner' && player.id === state.view.viewerId)
    );
  }

  function forPlayer(config, playerId, { scope } = {}) {
    const state = T.normalize(config);
    const player = state.players.find((p) => p.id === playerId);
    if (!player) throw new Error('The viewing player must exist.');
    state.view = {
      ...state.view,
      mode: 'player',
      viewerId: playerId,
      playerId,
      zoneId: player.zones.find((z) => z.id === 'hand')?.id || player.zones[0].id,
      playerScope: scope ?? state.view.playerScope,
    };
    return T.validate(state);
  }

  function playerFilename(state, playerId, scope, extension) {
    const index = state.players.findIndex((p) => p.id === playerId);
    if (index < 0) throw new Error('The viewing player must exist.');
    const slug =
      state.players[index].name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 45) || 'player';
    return `${String(index + 1).padStart(2, '0')}-${slug}-${scope}.${extension}`;
  }

  function playerRequests(config, { scope } = {}) {
    const state = T.normalize(config);
    scope ??= state.view.playerScope;
    if (!['table', 'self', 'both'].includes(scope))
      throw new Error('Batch scope must be table, self, or both.');
    const scopes = scope === 'both' ? ['table', 'self'] : [scope];
    return state.players.flatMap((player) =>
      scopes.map((scope) => ({
        playerId: player.id,
        playerName: player.name,
        scope,
        state: forPlayer(state, player.id, { scope }),
      })),
    );
  }

  // Raw configurations remain operator state. Share the rendered image, not this full snapshot.
  Object.assign(T, { canSeeFaces, forPlayer, playerFilename, playerRequests });
})(globalThis);
