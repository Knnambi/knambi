import Phaser from 'phaser';
import { CAMERA, GRID, WORLD } from '../config';
import { Villager } from '../entities/Villager';

/** Screen-space drag distance (px) below which a gesture counts as a click. */
const CLICK_THRESHOLD = 8;

/**
 * The primary game scene. Draws a blueprint-style grid, provides RTS-style
 * camera controls (pan + zoom), spawns villager units, and handles drag-box
 * unit selection.
 */
export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  /** All villager units currently in the world. */
  private villagers: Villager[] = [];

  /** Visual rubber-band rectangle drawn while drag-selecting. */
  private selectionBox!: Phaser.GameObjects.Rectangle;
  private isDragging = false;
  /** World-space anchor where the current drag began. */
  private dragStart = new Phaser.Math.Vector2();
  /** Screen-space anchor, used to tell a click apart from a drag. */
  private dragStartScreen = new Phaser.Math.Vector2();

  constructor() {
    super({ key: 'MainScene' });
  }

  create(): void {
    this.drawGrid();
    this.setupCamera();
    this.setupInput();
    this.spawnVillagers();
    this.setupSelection();
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

  /** Spawn a handful of villagers scattered around the centre of the grid. */
  private spawnVillagers(): void {
    const centerX = WORLD.WIDTH / 2;
    const centerY = WORLD.HEIGHT / 2;
    // Hand-placed offsets so the units start spread out, not overlapping.
    const offsets = [
      { x: 0, y: 0 },
      { x: -120, y: -80 },
      { x: 120, y: -60 },
      { x: -90, y: 100 },
      { x: 110, y: 90 },
    ];

    for (const offset of offsets) {
      const villager = new Villager(this, centerX + offset.x, centerY + offset.y);
      villager.setDepth(10);
      this.add.existing(villager);
      this.villagers.push(villager);
    }
  }

  /** Create the selection rectangle and wire up the pointer-drag handlers. */
  private setupSelection(): void {
    this.selectionBox = this.add
      .rectangle(0, 0, 0, 0, 0x4a90e2, 0.2)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a90e2, 1)
      .setDepth(20)
      .setVisible(false);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Only the left button drives selection.
    if (!pointer.leftButtonDown()) return;

    this.isDragging = true;
    this.dragStart.set(pointer.worldX, pointer.worldY);
    this.dragStartScreen.set(pointer.x, pointer.y);

    this.selectionBox
      .setPosition(pointer.worldX, pointer.worldY)
      .setSize(0, 0)
      .setVisible(true);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isDragging) return;

    // Normalise so the box grows correctly in any drag direction.
    const x = Math.min(this.dragStart.x, pointer.worldX);
    const y = Math.min(this.dragStart.y, pointer.worldY);
    const width = Math.abs(pointer.worldX - this.dragStart.x);
    const height = Math.abs(pointer.worldY - this.dragStart.y);

    this.selectionBox.setPosition(x, y).setSize(width, height);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.selectionBox.setVisible(false);

    const dragDistance = Phaser.Math.Distance.Between(
      this.dragStartScreen.x,
      this.dragStartScreen.y,
      pointer.x,
      pointer.y,
    );

    if (dragDistance < CLICK_THRESHOLD) {
      this.selectAtPoint(pointer.worldX, pointer.worldY);
    } else {
      this.selectWithinBox(pointer.worldX, pointer.worldY);
    }
  }

  /** Single-click: select the topmost villager under the pointer, if any. */
  private selectAtPoint(worldX: number, worldY: number): void {
    let hit: Villager | null = null;
    // Iterate back-to-front so the unit drawn on top wins.
    for (let i = this.villagers.length - 1; i >= 0; i--) {
      if (this.villagers[i].getBounds().contains(worldX, worldY)) {
        hit = this.villagers[i];
        break;
      }
    }
    for (const villager of this.villagers) {
      villager.setSelected(villager === hit);
    }
  }

  /** Drag-box: select every villager whose bounds intersect the box. */
  private selectWithinBox(endWorldX: number, endWorldY: number): void {
    const box = new Phaser.Geom.Rectangle(
      Math.min(this.dragStart.x, endWorldX),
      Math.min(this.dragStart.y, endWorldY),
      Math.abs(endWorldX - this.dragStart.x),
      Math.abs(endWorldY - this.dragStart.y),
    );

    for (const villager of this.villagers) {
      const intersects = Phaser.Geom.Intersects.RectangleToRectangle(
        box,
        villager.getBounds(),
      );
      villager.setSelected(intersects);
    }
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
