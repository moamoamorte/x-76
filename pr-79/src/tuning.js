// Player handling constants, shared by the game and the preview's "Fly it"
// sandbox so the two can't drift apart. Pure data: importing this pulls in
// nothing else. Units are game pixels and frames at 60 Hz.

// --- ship -------------------------------------------------------------------
export const SHIP_SPEED_BASE = 1.3;
export const SHIP_SPEED_STEP = 0.35;   // added per speed power-up
export const shipSpeed = (speedLv) => SHIP_SPEED_BASE + speedLv * SHIP_SPEED_STEP;

// Easing of the banking (tilt, from vertical input) and nose-dip (turn, from
// horizontal input) signals toward the raw input each frame.
export const TILT_EASE = 0.25;
export const TURN_EASE = 0.2;

// --- charge beam ------------------------------------------------------------
export const CHARGE_DELAY = 10;         // frames fire must be held before charging starts
export const CHARGE_RATE = 1 / 80;      // charge gained per frame, 0..1
export const BEAM_MIN_CHARGE = 0.2;     // releasing below this fires no beam
export const beamLevel = (charge) => Math.min(5, Math.max(1, Math.ceil(charge * 5)));

// Per beam level 1-5 (index 0 unused).
export const BEAM = {
  hw: [0, 10, 16, 24, 32, 42],
  hh: [0, 3, 4, 6, 8, 10],
  power: [0, 4, 8, 14, 22, 34],
};

// --- pod --------------------------------------------------------------------
// Docked pod centre relative to the ship (screen y down).
// Set so the pod swallows the 3D model's nose tip, or caps its tail.
export const DOCK = {
  front: { x: 14, y: 2.5 },
  back: { x: -14, y: 0 },
};
export const POD_LAUNCH_FRONT = 6.5;    // launch speed off the nose
export const POD_LAUNCH_BACK = 5.5;     // launch speed off the tail
export const POD_LAUNCH_DRAG = 0.94;    // velocity kept per frame while launched
export const POD_LAUNCH_STOP = 0.7;     // below this speed a launched pod goes free
export const POD_FOLLOW = 0.035;        // vertical easing toward the ship while free
export const POD_RECALL_SPEED = 5.5;
export const POD_GRAB_DIST = 18;        // centre distance at which the ship grabs the pod

// --- 3D model scale ---------------------------------------------------------
// Model units per game pixel. The preview works in model units, so it divides
// game distances by SHIP_SCALE.
export const SHIP_SCALE = 0.78;
export const POD_SCALE = 0.72;

// --- shield -----------------------------------------------------------------
// Percent of a full shield each kind of hit costs. A hit landing on an empty
// shield destroys the ship. Placeholder numbers until stage 1 is tuned (#12).
export const SHIELD_MAX = 100;
export const SHIELD_DAMAGE = { bullet: 20, bigBullet: 30, enemy: 30, boss: 40, terrain: 35 };
export const SHIELD_PICKUP = 50;
export const SHIELD_INV = 45;           // invulnerable frames after a shield hit
// Bubble half-extents around the ship, in game pixels; centred SHIELD_OFFSET ahead of it.
export const SHIELD_RADIUS = { x: 25, y: 14 };
export const SHIELD_OFFSET = 2;
