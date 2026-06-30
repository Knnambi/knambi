import Phaser from 'phaser';
import { gameConfig } from './config';

/** Boot the game. */
const game = new Phaser.Game(gameConfig);

// Expose the game on `window` during development for debugging/inspection.
// Stripped from production builds by the bundler's dead-code elimination.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
