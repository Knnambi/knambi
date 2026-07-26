// Everything here is expressed in NATIVE MAP-PIXEL coordinates of public/map_political.png.
// MapView renders the map 1:1 inside a scaled container, so children can position with
// these raw coordinates and stay locked to the geography regardless of the camera zoom.
// Coordinates were measured directly from the image (see git history / analysis).

export const MAP_SRC = "map_political.png";
export const MAP_W = 1473;
export const MAP_H = 1198;
export const OCEAN = "#E1E8F3"; // exact sea colour of the map, used as the backdrop.

// The British Isles (Great Britain + Ireland — both were the United Kingdom in 1806).
// Ellipse hugs the combined landmass: measured bbox x[161..387] y[360..655].
export const BRITAIN = { cx: 274, cy: 507, rx: 122, ry: 157 } as const;

// Where Napoleon's portrait is planted (centre of the frame), on northern France.
export const FRANCE_STAND = { x: 382, y: 742 } as const;

// Continental / approach waters that ships set out from, aiming at Britain (all verified sea).
export const PORTS = [
  { x: 430, y: 576 }, // North Sea
  { x: 344, y: 682 }, // English Channel
  { x: 262, y: 668 }, // Celtic Sea
  { x: 212, y: 648 }, // South-West Approaches
  { x: 194, y: 704 }, // Bay of Biscay
] as const;

// Collision radius approximating the blockade ring for ship repulsion.
export const BLOCKADE_R = 145;

// Camera focal point so Britain, the ring and France all sit in frame.
export const FOCAL = { x: 345, y: 588 } as const;
