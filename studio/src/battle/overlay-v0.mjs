/**
 * wavewarz-battle-overlay-v0
 *
 * Scaffold for a later visual interaction between two material-v1 forms
 * during a battle (push-back, shared field). This version describes the
 * observation only. It does not read pools, volumes, or factors into
 * anatomy, seeds, or props.
 *
 * Not in this version:
 * - push-back between forms
 * - hashed battle-timeline replay
 * - livestream audio sync
 */
export const BATTLE_OVERLAY_ID = 'wavewarz-battle-overlay-v0';

export function describeBattleOverlay(observation = null) {
  return {
    id: BATTLE_OVERLAY_ID,
    version: 0,
    altersMaterialV1: false,
    interaction: 'none',
    observationSchema: observation?.schema ?? null,
    status: observation?.status ?? 'pending',
  };
}
