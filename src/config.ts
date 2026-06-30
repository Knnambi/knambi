import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';

/**
 * Shared game constants. Keeping these in one place makes it easy to tweak the
 * world dimensions and camera feel without hunting through the scene code.
 */
export const GRID = {
  /** Number of tiles along each axis. */
  COLS: 50,
  ROWS: 50,
  /** Size of a single tile in world pixels. */
  TILE_SIZE: 64,
} as const;

/** Total size of the playable world in pixels. */
export const WORLD = {
  WIDTH: GRID.COLS * GRID.TILE_SIZE,
  HEIGHT: GRID.ROWS * GRID.TILE_SIZE,
} as const;

export const CAMERA = {
  /** Pan speed in pixels per second (scaled by delta in the update loop). */
  PAN_SPEED: 600,
  /** Zoom limits so the player can't zoom in/out infinitely. */
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 2.0,
  /** How much a single wheel notch changes the zoom. */
  ZOOM_STEP: 0.1,
} as const;

/**
 * Phaser game configuration. The Scale Manager is set to RESIZE so the canvas
 * always fills the entire browser window and tracks window resize events.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d1117',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  scene: [MainScene],
};
