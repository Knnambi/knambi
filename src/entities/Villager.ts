import Phaser from 'phaser';
import { UNIT } from '../config';

/**
 * A Villager unit — the Paddy gatherer. Rendered as a simple green square for
 * now; gameplay behaviour (movement, gathering) comes later.
 */
export class Villager extends Phaser.GameObjects.Rectangle {
  /** Whether this unit is currently part of the player's selection. */
  public selected = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, UNIT.SIZE, UNIT.SIZE, UNIT.COLOR);
  }

  /**
   * Toggle selection state and its visual indicator — a bright yellow border
   * when selected, no border when deselected.
   */
  setSelected(isSelected: boolean): this {
    this.selected = isSelected;
    if (isSelected) {
      this.setStrokeStyle(UNIT.SELECT_BORDER, UNIT.SELECT_COLOR, 1);
    } else {
      // Passing no arguments clears the stroke entirely.
      this.setStrokeStyle();
    }
    return this;
  }
}
