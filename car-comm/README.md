# Car Comm (MVP)

Talk to the car ahead without a phone call, and pass the time on long
drives together. This is a software-only MVP: no hardware button yet, no
GPS/Bluetooth proximity matching — the two phones pair over the internet
via a short trip code.

Two pieces:

- **`server/`** — a small Node.js + Socket.IO relay. Pairs two phones into a
  "trip session" by code, relays push-to-talk voice clips between them, and
  runs a shared trivia game. No database, no accounts — everything lives in
  memory for the life of the session.
- **`mobile/`** — a React Native (Expo) app for Android and iOS: start or
  join a trip by code, a push-to-talk button, and a trivia screen.

## Running it locally

### 1. Start the server

```sh
cd server
npm install
npm run dev            # http://localhost:4000
```

### 2. Run the mobile app

```sh
cd mobile
npm install
npm start               # then press 'a' for Android, 'i' for iOS, or scan the QR code in Expo Go
```

By default the app points at `http://localhost:4000`, which only works for
an Android emulator/simulator running on the same machine as the server. To
test on a real phone, run the server somewhere reachable from that phone
(e.g. `expo start --tunnel`, or an actual deployed instance) and set:

```sh
EXPO_PUBLIC_SERVER_URL=https://your-server-host npm start
```

### 3. Try the full flow with two phones

1. Phone A: "Start a Trip" → shows a 5-character code.
2. Phone B: enter that code under "Join Trip".
3. Once both show "Other car connected", hold the talk button on either
   phone to send a voice clip, or tap "Play road-trip trivia" to run a
   synced quiz.

## Verifying without physical phones

This can't be tested end-to-end without real devices in most dev
environments (no microphone/speaker hardware, no simulator). What can be
verified headlessly:

```sh
cd server
npm run typecheck   # tsc --noEmit
npm test            # unit tests + a real two-socket.io-client e2e simulation

cd ../mobile
npm run typecheck

cd ../scripts
npm install
npm run simulate-two-cars   # requires the server running (step 1 above)
```

`simulate-two-cars.ts` connects two `socket.io-client` instances standing in
for "Car A" and "Car B" against a real running server, and drives the whole
protocol: create/join a session by code, relay a voice-clip buffer, and play
a full trivia round to completion. The "voice clip" it sends is a synthetic
byte buffer, **not** real audio — it proves the relay plumbing, not
microphone/speaker behavior.

### What's not verified by any of the above

Real microphone recording/playback, audio ducking against music or car
Bluetooth audio, real iOS/Android simulators, real cellular conditions
(drops, latency, backgrounding), on-device touch/UI behavior, and deep-link
tapping. Treat this as tested-at-the-protocol-level, not field-tested — do a
manual pass with two real phones before relying on it on an actual drive.

## Explicitly out of scope for this MVP

Hardware button/firmware, GPS/BLE proximity-based pairing, real-time duplex
audio streaming, multiple games, user accounts, persistence, production
deployment/hosting.
