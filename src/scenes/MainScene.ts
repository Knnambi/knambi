import Phaser from 'phaser';
import { CAMERA, GRID, WORLD } from '../config';

/**
 * The primary game scene. For now it only draws a blueprint-style grid and
 * provides RTS-style camera controls (pan + zoom). No gameplay yet.
 */
export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super({ key: 'MainScene' });
  }

  create(): void {
    this.drawGrid();
    this.setupCamera();
    this.setupInput();
  }

  /**
   * Procedurally draw a COLS x ROWS grid using a Graphics object instead of an
   * external tilemap asset. Thin, low-opacity lines give it a blueprint feel.
   */
  private drawGrid(): void {
    const graphics = this.add.graphics();

    // Faint fill so the world reads as a "map" surface behind the lines.
    graphics.fillStyle(0x0d1f3c, 0.35);
    graphics.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    // Thin, low-opacity blueprint lines.
    graphics.lineStyle(1, 0x4a90e2, 0.25);

    // Vertical lines.
    for (let col = 0; col <= GRID.COLS; col++) {
      const x = col * GRID.TILE_SIZE;
      graphics.lineBetween(x, 0, x, WORLD.HEIGHT);
    }

    // Horizontal lines.
    for (let row = 0; row <= GRID.ROWS; row++) {
      const y = row * GRID.TILE_SIZE;
      graphics.lineBetween(0, y, WORLD.WIDTH, y);
    }

    // Brighter border around the whole world to frame the blueprint.
    graphics.lineStyle(2, 0x4a90e2, 0.6);
    graphics.strokeRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
  }

  /** Constrain the camera to the world so it can never pan past the grid. */
  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    cam.setZoom(1);
    // Start centered on the world.
    cam.centerOn(WORLD.WIDTH / 2, WORLD.HEIGHT / 2);
  }

  /** Register keyboard panning and mouse-wheel zoom handlers. */
  private setupInput(): void {
    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Mouse-wheel zoom, clamped so the player can't zoom out infinitely.
    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _over: Phaser.GameObjects.GameObject[],
        _dx: number,
        dy: number,
      ) => {
        const cam = this.cameras.main;
        // Wheel down (dy > 0) zooms out, wheel up zooms in.
        const direction = dy > 0 ? -1 : 1;
        const newZoom = cam.zoom + direction * CAMERA.ZOOM_STEP;
        cam.setZoom(
          Phaser.Math.Clamp(newZoom, CAMERA.MIN_ZOOM, CAMERA.MAX_ZOOM),
        );
      },
    );
  }

  update(_time: number, delta: number): void {
    const cam = this.cameras.main;

    // Frame-rate independent pan distance. Divide by zoom so panning feels
    // consistent in screen-space regardless of how far we're zoomed in.
    const distance = (CAMERA.PAN_SPEED * (delta / 1000)) / cam.zoom;

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    if (left) cam.scrollX -= distance;
    if (right) cam.scrollX += distance;
    if (up) cam.scrollY -= distance;
    if (down) cam.scrollY += distance;

    // setBounds already clamps scroll, so no extra clamping is needed here.
  }
}
