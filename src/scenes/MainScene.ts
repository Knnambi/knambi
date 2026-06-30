import Phaser from 'phaser';
import { js as EasyStar } from 'easystarjs';
import { CAMERA, GRID, WORLD } from '../config';
import { Villager } from '../entities/Villager';

/** Tile value representing walkable ground (grass/dirt). */
const WALKABLE = 0;

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

  /** A* pathfinder operating over the tile grid. */
  private easystar = new EasyStar();

  constructor() {
    super({ key: 'MainScene' });
  }

  create(): void {
    this.drawGrid();
    this.setupCamera();
    this.setupInput();
    this.setupPathfinding();
    this.spawnVillagers();
    this.setupSelection();
  }

  /**
   * Build a COLS x ROWS collision grid (all walkable for now) and hand it to
   * EasyStar. The grid is indexed [row][col] to match EasyStar's [y][x].
   */
  private setupPathfinding(): void {
    const grid: number[][] = [];
    for (let row = 0; row < GRID.ROWS; row++) {
      grid.push(new Array(GRID.COLS).fill(WALKABLE));
    }
    this.easystar.setGrid(grid);
    this.easystar.setAcceptableTiles([WALKABLE]);
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
    // Right-click is a move command, so suppress the browser context menu.
    this.input.mouse?.disableContextMenu();

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
    // Right-click issues a move order for the current selection.
    if (pointer.rightButtonDown()) {
      this.issueMoveCommand(pointer.worldX, pointer.worldY);
      return;
    }

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

  /**
   * Issue a move order to all selected villagers: drop a fading destination
   * marker and ask EasyStar for a path from each unit to the target tile.
   */
  private issueMoveCommand(worldX: number, worldY: number): void {
    // Clamp the destination to valid tile coordinates.
    const targetX = Phaser.Math.Clamp(
      Math.floor(worldX / GRID.TILE_SIZE),
      0,
      GRID.COLS - 1,
    );
    const targetY = Phaser.Math.Clamp(
      Math.floor(worldY / GRID.TILE_SIZE),
      0,
      GRID.ROWS - 1,
    );

    this.spawnDestinationMarker(
      targetX * GRID.TILE_SIZE + GRID.TILE_SIZE / 2,
      targetY * GRID.TILE_SIZE + GRID.TILE_SIZE / 2,
    );

    for (const villager of this.villagers) {
      if (!villager.selected) continue;
      this.easystar.findPath(
        villager.gridX,
        villager.gridY,
        targetX,
        targetY,
        (path) => {
          // path is null when no route exists; ignore those.
          if (path && path.length > 0) {
            villager.moveAlongPath(path);
          }
        },
      );
    }
    // Kick off path calculation; results arrive over the next update frames.
    this.easystar.calculate();
  }

  /** Drop a small red circle at the target that fades out over 500ms. */
  private spawnDestinationMarker(x: number, y: number): void {
    const marker = this.add.circle(x, y, 8, 0xff3b30, 0.9).setDepth(15);
    this.tweens.add({
      targets: marker,
      alpha: 0,
      scale: 1.6,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => marker.destroy(),
    });
  }

  update(_time: number, delta: number): void {
    const cam = this.cameras.main;

    // Pump EasyStar so queued path requests resolve, then advance any units
    // that have a path to follow.
    this.easystar.calculate();
    for (const villager of this.villagers) {
      villager.update(delta);
    }

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
