// Stage registry. Adding a stage means adding an entry here plus its level and
// boss modules; main.js reads everything stage-specific through this list.
import * as level1 from './level1.js';
import { Boss as OculusBloom } from './boss.js';

// `level` exports buildTerrain, buildSpawns, CHECKPOINTS, WARNING_CAM, BOSS_CAM and SCROLL.
export const STAGES = [
  { id: 1, name: 'THE HOLLOW STATION', level: level1, Boss: OculusBloom, bossName: 'OCULUS BLOOM' },
];
