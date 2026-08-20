// Points the app at the relay server. Override at build time via
// EXPO_PUBLIC_SERVER_URL for a real deployment; defaults to a typical
// "expo start --tunnel"-free LAN setup for local development.
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:4000";
