import type { Participant } from "../protocol/events.js";
import { TriviaGame } from "../game/TriviaGame.js";

export interface SessionParticipant extends Participant {
  socketId: string | null; // null while disconnected, within the grace period
}

export class Session {
  readonly id: string;
  readonly code: string;
  readonly createdAt: number;
  lastActivityAt: number;
  participants: Map<string, SessionParticipant> = new Map();
  game: TriviaGame | null = null;

  constructor(id: string, code: string) {
    this.id = id;
    this.code = code;
    this.createdAt = Date.now();
    this.lastActivityAt = this.createdAt;
  }

  touch(): void {
    this.lastActivityAt = Date.now();
  }

  get connectedCount(): number {
    let n = 0;
    for (const p of this.participants.values()) {
      if (p.socketId) n++;
    }
    return n;
  }

  toParticipantList(): Participant[] {
    return [...this.participants.values()].map((p) => ({
      clientId: p.clientId,
      joinedAt: p.joinedAt,
    }));
  }
}
