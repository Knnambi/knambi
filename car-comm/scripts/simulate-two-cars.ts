// Standalone "two cars, no phones" smoke test. Run this against a real
// running server (`npm run dev` in car-comm/server) to sanity-check the
// full protocol without needing physical devices:
//
//   cd car-comm/scripts && npm install && npm run simulate-two-cars
//
// Uses two socket.io-client connections to stand in for Car A and Car B.
// The "voice clip" sent below is a synthetic byte buffer, NOT a real audio
// recording — this only proves the relay plumbing, not microphone/speaker
// behavior, which can't be exercised outside a physical device.
import { io, type Socket } from "socket.io-client";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:4000";

function connect(label: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, { transports: ["websocket"] });
    const timeout = setTimeout(() => reject(new Error(`${label} failed to connect within 5s`)), 5000);
    socket.on("connect", () => {
      clearTimeout(timeout);
      console.log(`[${label}] connected`);
      resolve(socket);
    });
  });
}

async function main() {
  console.log(`Simulating two cars against ${SERVER_URL}\n`);

  const carA = await connect("Car A");
  const carB = await connect("Car B");

  const created = await new Promise<{ code: string; clientId: string }>((resolve) =>
    carA.emit("create-session", resolve)
  );
  console.log(`[Car A] started trip, code = ${created.code}`);

  const joined = await new Promise<any>((resolve) => carB.emit("join-session", { code: created.code }, resolve));
  if (!joined.ok) throw new Error(`Car B failed to join: ${joined.error}`);
  console.log(`[Car B] joined trip. Participants: ${joined.participants.length}`);

  console.log("\n--- voice message relay ---");
  const clipReceived = new Promise<any>((resolve) => carB.once("voice-clip", resolve));
  const syntheticAudio = new Uint8Array(Array.from({ length: 32 }, (_, i) => i)).buffer;
  carA.emit("voice-clip", {
    code: created.code,
    seq: 1,
    mimeType: "audio/m4a",
    durationMs: 1500,
    data: syntheticAudio,
  });
  const clip = await clipReceived;
  console.log(`[Car B] received voice clip from ${clip.senderId} (${clip.data.byteLength} bytes)`);

  console.log("\n--- trivia round ---");
  const finalScores = await new Promise<any[]>((resolve) => {
    let seen = 0;
    carA.on("game-question", (q: any) => {
      seen += 1;
      console.log(`[round] Q${q.index + 1}/${q.total}: ${q.prompt}`);
      carA.emit("game-answer", { code: created.code, questionId: q.questionId, choiceIndex: 0, answeredAtMs: Date.now() });
      carB.emit("game-answer", { code: created.code, questionId: q.questionId, choiceIndex: 0, answeredAtMs: Date.now() });
    });
    carA.on("game-result", (r: any) => {
      console.log(`  -> correct answer index ${r.correctIndex}, scores: ${JSON.stringify(r.scores)}`);
    });
    carA.on("game-over", (payload: any) => resolve(payload.finalScores));
    carA.emit("start-game", { code: created.code });
  });

  console.log(`\nGame over. Final scores: ${JSON.stringify(finalScores)}`);
  console.log("\nAll checks passed.");

  carA.close();
  carB.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
