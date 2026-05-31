// Mutable state written by Phaser every frame and read by React for UI updates.
export const gameState = {
  playerGrounded: false,
  actionCooldown: 0,  // ms remaining on the shared slide/combo cooldown
};
