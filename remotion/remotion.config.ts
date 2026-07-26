import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Higher quality H.264 output for the demo render.
Config.setCrf(18);
