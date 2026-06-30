import Phaser from 'phaser';
import { GRID, UNIT } from '../config';

/**
 * A Villager unit — the Paddy gatherer. Rendered as a simple green square for
 * now; gameplay behaviour (gathering) comes later. Movement is handled by a
 * small state machine driven from the scene's update loop.
 */
export class Villager extends Phaser.GameObjects.Rectangle {
  /** Whether this unit is currently part of the player's selection. */
  public selected = false;

  /** World-space waypoints the unit is currently walking through. */
  private waypoints: Phaser.Math.Vector2[] = [];
  private waypointIndex = 0;

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

  /** The unit's current tile coordinates, derived from its world position. */
  get gridX(): number {
    return Math.floor(this.x / GRID.TILE_SIZE);
  }
  get gridY(): number {
    return Math.floor(this.y / GRID.TILE_SIZE);
  }

  /**
   * Begin walking along an EasyStar path (an array of grid-space {x, y}
   * nodes). Each node is converted to the world-space centre of its tile.
   * Passing an empty path stops the unit.
   */
  moveAlongPath(path: { x: number; y: number }[]): void {
    this.waypoints = path.map(
      (node) =>
        new Phaser.Math.Vector2(
          node.x * GRID.TILE_SIZE + GRID.TILE_SIZE / 2,
          node.y * GRID.TILE_SIZE + GRID.TILE_SIZE / 2,
        ),
    );
    this.waypointIndex = 0;
  }

  /** True while the unit still has waypoints to reach. */
  get isMoving(): boolean {
    return this.waypointIndex < this.waypoints.length;
  }

  /**
   * Advance the unit toward its current waypoint. Called every frame by the
   * scene with the frame delta (ms).
   */
  update(delta: number): void {
    if (!this.isMoving) return;

    const target = this.waypoints[this.waypointIndex];
    const step = (UNIT.MOVE_SPEED * delta) / 1000;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= step) {
      // Snap to the waypoint and advance to the next one.
      this.setPosition(target.x, target.y);
      this.waypointIndex++;
    } else {
      this.setPosition(this.x + (dx / distance) * step, this.y + (dy / distance) * step);
    }
  }
}
