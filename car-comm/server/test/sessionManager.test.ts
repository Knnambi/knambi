import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionManager } from "../src/sessions/SessionManager.js";

describe("SessionManager", () => {
  let sessions: SessionManager;

  beforeEach(() => {
    sessions = new SessionManager();
  });

  afterEach(() => {
    sessions.stopSweeper();
  });

  it("creates a session with a short code and the creator as first participant", () => {
    const { session, clientId } = sessions.createSession("socket-a");
    expect(session.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(session.participants.size).toBe(1);
    expect(session.participants.get(clientId)?.socketId).toBe("socket-a");
  });

  it("allows a second participant to join by code", () => {
    const { session } = sessions.createSession("socket-a");
    const result = sessions.joinSession(session.code, "socket-b");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.participants.size).toBe(2);
    }
  });

  it("rejects joining a full session", () => {
    const { session } = sessions.createSession("socket-a");
    sessions.joinSession(session.code, "socket-b");
    const result = sessions.joinSession(session.code, "socket-c");
    expect(result.ok).toBe(false);
  });

  it("rejects joining an unknown code", () => {
    const result = sessions.joinSession("ZZZZZ", "socket-a");
    expect(result.ok).toBe(false);
  });

  it("rejoin restores the same clientId's slot under a new socket", () => {
    const { session, clientId } = sessions.createSession("socket-a");
    const result = sessions.rejoinSession(session.code, clientId, "socket-a2");
    expect(result.ok).toBe(true);
    expect(session.participants.get(clientId)?.socketId).toBe("socket-a2");
  });

  it("rejects rejoin with an unknown clientId", () => {
    const { session } = sessions.createSession("socket-a");
    const result = sessions.rejoinSession(session.code, "not-a-real-client-id", "socket-x");
    expect(result.ok).toBe(false);
  });

  it("leaveSession removes the participant and deletes an emptied session", () => {
    const { session, clientId } = sessions.createSession("socket-a");
    sessions.leaveSession(session.code, clientId);
    expect(sessions.getSessionByCode(session.code)).toBeUndefined();
  });

  it("handleDisconnect marks the participant offline without removing them immediately", () => {
    const { session, clientId } = sessions.createSession("socket-a");
    const entry = sessions.handleDisconnect("socket-a");
    expect(entry?.clientId).toBe(clientId);
    expect(session.participants.get(clientId)?.socketId).toBeNull();
    expect(session.participants.has(clientId)).toBe(true);
  });

  it("sweeps a participant whose disconnect grace period has elapsed", () => {
    vi.useFakeTimers();
    try {
      const { session } = sessions.createSession("socket-a");
      sessions.handleDisconnect("socket-a");
      sessions.startSweeper();
      vi.advanceTimersByTime(6 * 60 * 1000); // past the 5 minute grace period
      expect(sessions.getSessionByCode(session.code)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
