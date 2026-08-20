import { randomUUID } from "node:crypto";
import { generateSessionCode } from "../utils/codeGenerator.js";
import { Session, type SessionParticipant } from "./Session.js";
import { config } from "../config.js";

export type JoinResult =
  | { ok: true; session: Session; clientId: string }
  | { ok: false; error: string };

interface DisconnectedParticipant extends SessionParticipant {
  disconnectedAt: number;
}

/**
 * In-memory registry of active trip sessions. One process, no persistence —
 * restarting the server drops all sessions, which is an accepted MVP tradeoff.
 */
export class SessionManager {
  private sessionsByCode = new Map<string, Session>();
  private socketIndex = new Map<string, { code: string; clientId: string }>();
  private sweepTimer: NodeJS.Timeout | null = null;

  startSweeper(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), config.sweepIntervalMs);
    this.sweepTimer.unref?.();
  }

  stopSweeper(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  createSession(socketId: string): { session: Session; clientId: string } {
    let code = generateSessionCode(config.sessionCodeLength);
    while (this.sessionsByCode.has(code)) {
      code = generateSessionCode(config.sessionCodeLength);
    }

    const session = new Session(randomUUID(), code);
    const clientId = randomUUID();
    session.participants.set(clientId, {
      clientId,
      joinedAt: Date.now(),
      socketId,
    });

    this.sessionsByCode.set(code, session);
    this.socketIndex.set(socketId, { code, clientId });
    return { session, clientId };
  }

  joinSession(code: string, socketId: string): JoinResult {
    const session = this.sessionsByCode.get(code.toUpperCase());
    if (!session) return { ok: false, error: "Session not found" };
    if (session.connectedCount >= config.maxParticipants) {
      return { ok: false, error: "Session is full" };
    }

    const clientId = randomUUID();
    session.participants.set(clientId, {
      clientId,
      joinedAt: Date.now(),
      socketId,
    });
    session.touch();
    this.socketIndex.set(socketId, { code: session.code, clientId });
    return { ok: true, session, clientId };
  }

  rejoinSession(code: string, clientId: string, socketId: string): JoinResult {
    const session = this.sessionsByCode.get(code.toUpperCase());
    if (!session) return { ok: false, error: "Session not found" };

    const participant = session.participants.get(clientId);
    if (!participant) return { ok: false, error: "Unknown client for this session" };

    participant.socketId = socketId;
    session.touch();
    this.socketIndex.set(socketId, { code: session.code, clientId });
    return { ok: true, session, clientId };
  }

  getSessionByCode(code: string): Session | undefined {
    return this.sessionsByCode.get(code.toUpperCase());
  }

  getBySocketId(socketId: string): { session: Session; clientId: string } | undefined {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return undefined;
    const session = this.sessionsByCode.get(entry.code);
    if (!session) return undefined;
    return { session, clientId: entry.clientId };
  }

  leaveSession(code: string, clientId: string): void {
    const session = this.sessionsByCode.get(code.toUpperCase());
    if (!session) return;
    const participant = session.participants.get(clientId);
    if (participant?.socketId) this.socketIndex.delete(participant.socketId);
    session.participants.delete(clientId);
    if (session.participants.size === 0) {
      this.sessionsByCode.delete(session.code);
    }
  }

  /** Marks the participant as disconnected but keeps their slot for the grace period. */
  handleDisconnect(socketId: string): { session: Session; clientId: string } | undefined {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return undefined;
    this.socketIndex.delete(socketId);

    const session = this.sessionsByCode.get(entry.code);
    if (!session) return undefined;
    const participant = session.participants.get(entry.clientId) as
      | DisconnectedParticipant
      | undefined;
    if (!participant) return undefined;

    participant.socketId = null;
    participant.disconnectedAt = Date.now();
    return { session, clientId: entry.clientId };
  }

  private sweep(): void {
    const now = Date.now();
    for (const session of [...this.sessionsByCode.values()]) {
      for (const [clientId, participant] of [...session.participants.entries()]) {
        const dp = participant as DisconnectedParticipant;
        if (!dp.socketId && dp.disconnectedAt && now - dp.disconnectedAt > config.disconnectGraceMs) {
          session.participants.delete(clientId);
        }
      }

      const expiredByInactivity = now - session.lastActivityAt > config.sessionInactivityMs;
      if (session.participants.size === 0 || expiredByInactivity) {
        this.sessionsByCode.delete(session.code);
      }
    }
  }
}
