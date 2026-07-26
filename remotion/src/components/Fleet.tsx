import React from "react";
import { interpolate } from "remotion";
import { BLOCKADE_R, BRITAIN, PORTS } from "../mapConfig";
import { Ship } from "./Ship";

// Each ship sails from a continental port toward Britain, is turned back at the
// blockade line, and retreats — looping on its own staggered cadence.
export const Fleet: React.FC<{ localFrame: number; fps: number }> = ({
  localFrame,
}) => {
  return (
    <>
      {PORTS.map((port, i) => {
        const period = 150; // frames per attempt
        const delay = i * 26;
        const t = ((localFrame - delay) % period) / period; // 0..1
        if (localFrame < delay) return null;

        // Direction from port toward Britain's centre.
        const dx = BRITAIN.cx - port.x;
        const dy = BRITAIN.cy - port.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;

        // Stop just outside the blockade ring.
        const reach = Math.max(0, dist - (BLOCKADE_R + 26));

        // Approach (0→0.5) then get repelled back (0.5→1), easing at the wall.
        const push =
          t < 0.5
            ? interpolate(t, [0, 0.5], [0, 1])
            : interpolate(t, [0.5, 1], [1, 0]);
        const travel = reach * Math.sin((push * Math.PI) / 2);

        const x = port.x + ux * travel;
        const y = port.y + uy * travel;

        // Bob on the waves; fade in/out at the ends of each run.
        const bob = Math.sin((localFrame + i * 9) / 6) * 2;
        const fade = interpolate(t, [0, 0.06, 0.9, 1], [0, 1, 1, 0]);
        const facingLeft = ux < 0;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y + bob,
              transform: "translate(-50%, -50%)",
            }}
          >
            <Ship size={40} flip={facingLeft} opacity={fade} />
          </div>
        );
      })}
    </>
  );
};
