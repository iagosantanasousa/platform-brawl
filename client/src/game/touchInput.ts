// Shared mutable object read by Phaser scenes every frame.
// React touch buttons write directly to these flags.
export const touchInput = {
  left: false,
  right: false,
  // One-shot flags: set true on press, cleared by BaseScene after being read.
  jumpPressed: false,
  attackPressed: false,
  // Combo joystick: held while dragging, released to dash.
  comboHeld: false,
  comboAimX: 0,  // -1..1 normalised from combo button drag
  comboAimY: 0,  // -1..1 normalised from combo button drag
  // One-shot: set when main joystick is pushed to the edge while moving (ground slide).
  slidePressed: false,
};
