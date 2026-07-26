import React from "react";
import { Composition } from "remotion";
import { DURATION, NapoleonBlockade } from "./NapoleonBlockade";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="NapoleonBlockade"
      component={NapoleonBlockade}
      durationInFrames={DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
