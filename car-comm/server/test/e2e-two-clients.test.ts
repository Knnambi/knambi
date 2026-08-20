import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { AddressInfo } from "node:net";

// Speed up the trivia round for the test: short answer window, short pause
// between questions, and only 3 questions instead of a full 8-question round.
// Must be set before src/index.ts (and its config.ts import) is evaluated.
process.env.ANSWER_WINDOW_MS = "2000";
process.env.GAME_RESULT_PAUSE_MS = "50";
process.env.QUESTIONS_PER_ROUND = "3";

const { createApp } = await import("../src/index.js");

/**
 * Simulates "two cars, no phones": a real server plus two real
 * socket.io-client connections standing in for Car A and Car B. This is the
 * verification ceiling achievable in a container with no physical devices —
 * it proves the session/voice-relay/game protocol end-to-end, but the
 * "voice-clip" payload below is a synthetic byte buffer, NOT a real audio
 * recording, and nothing here exercises microphone/speaker hardware.
 */
describe("two cars end-to-end", () => {
  let serverUrl: string;
  let cleanup: () => void;

  beforeAll(async () => {
    const { httpServer, sessions } = createApp();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    serverUrl = `http://localhost:${port}`;
    cleanup = () => {
      sessions.stopSweeper();
      httpServer.close();
    };
  });

  afterAll(() => {
    cleanup();
  });

  function connect(): Promise<ClientSocket> {
    return new Promise((resolve) => {
      const socket = ioClient(serverUrl, { transports: ["websocket"], forceNew: true });
      socket.on("connect", () => resolve(socket));
    });
  }

  it("pairs two cars by code, relays a voice clip, and plays a full trivia round", async () => {
    const carA = await connect();
    const carB = await connect();

    const created = await new Promise<{ code: string; sessionId: string; clientId: string }>((resolve) =>
      carA.emit("create-session", resolve)
    );
    expect(created.code).toMatch(/^[A-Z2-9]{5}$/);

    const joined = await new Promise<any>((resolve) =>
      carB.emit("join-session", { code: created.code }, resolve)
    );
    expect(joined.ok).toBe(true);
    expect(joined.participants).toHaveLength(2);

    // --- voice-clip relay: Car A "talks", Car B should receive the same bytes ---
    const clipReceived = new Promise<any>((resolve) => carB.once("voice-clip", resolve));
    const syntheticAudio = new Uint8Array([1, 2, 3, 4, 5]).buffer; // stand-in bytes, not real audio
    carA.emit("voice-clip", {
      code: created.code,
      seq: 1,
      mimeType: "audio/m4a",
      durationMs: 1200,
      data: syntheticAudio,
    });
    const clip = await clipReceived;
    expect(clip.senderId).toBe(created.clientId);
    expect(new Uint8Array(clip.data)).toEqual(new Uint8Array(syntheticAudio));

    // --- trivia round: both cars auto-answer choice 0 to whatever question arrives ---
    const questionIds = new Set<string>();
    const finalScores = await new Promise<any[]>((resolve) => {
      carA.on("game-question", (q: any) => {
        questionIds.add(q.questionId);
        carA.emit("game-answer", { code: created.code, questionId: q.questionId, choiceIndex: 0, answeredAtMs: Date.now() });
        carB.emit("game-answer", { code: created.code, questionId: q.questionId, choiceIndex: 0, answeredAtMs: Date.now() });
      });
      carA.on("game-over", (payload: any) => resolve(payload.finalScores));
      carA.emit("start-game", { code: created.code });
    });

    expect(questionIds.size).toBe(3);
    expect(finalScores).toHaveLength(2);
    for (const s of finalScores) {
      expect(typeof s.score).toBe("number");
    }

    carA.close();
    carB.close();
  }, 15000);
});
