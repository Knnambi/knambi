import type { TriviaAnswerRecord, TriviaQuestionPayload, TriviaScore } from "../protocol/events.js";
import { pickRandomQuestions, type TriviaQuestion } from "./questions.js";
import { config } from "../config.js";

/**
 * Pure, timer-free trivia round state machine, shared 1:1 by the two
 * participants in a trip session. The caller (registerGameHandlers) owns
 * timing — when to force-resolve a round on timeout and when to advance —
 * so this class stays trivially unit-testable.
 */
export class TriviaGame {
  private readonly questions: TriviaQuestion[];
  private readonly participantIds: string[];
  private index = 0;
  private answers = new Map<string, number>();
  private scores = new Map<string, number>();

  constructor(participantIds: string[], questions: TriviaQuestion[] = pickRandomQuestions(config.questionsPerRound)) {
    this.participantIds = participantIds;
    this.questions = questions;
    for (const id of participantIds) this.scores.set(id, 0);
  }

  get total(): number {
    return this.questions.length;
  }

  get currentIndex(): number {
    return this.index;
  }

  currentQuestionPayload(): TriviaQuestionPayload {
    const q = this.questions[this.index];
    return {
      questionId: q.id,
      index: this.index,
      total: this.questions.length,
      prompt: q.prompt,
      choices: q.choices,
      answerWindowMs: config.answerWindowMs,
    };
  }

  /** Returns false if the client already answered this question or isn't a participant. */
  recordAnswer(clientId: string, choiceIndex: number): boolean {
    if (!this.participantIds.includes(clientId)) return false;
    if (this.answers.has(clientId)) return false;
    this.answers.set(clientId, choiceIndex);
    return true;
  }

  haveAllAnswered(): boolean {
    return this.answers.size >= this.participantIds.length;
  }

  /**
   * Scores whoever has answered so far (a caller-driven timeout may resolve
   * with some participants missing), clears answers for the next question,
   * and returns the result payload.
   */
  resolveRound(): { questionId: string; correctIndex: number; answers: TriviaAnswerRecord[]; scores: TriviaScore[] } {
    const q = this.questions[this.index];
    const answers: TriviaAnswerRecord[] = this.participantIds.map((clientId) => {
      const choiceIndex = this.answers.has(clientId) ? this.answers.get(clientId)! : null;
      const correct = choiceIndex === q.correctIndex;
      if (correct) this.scores.set(clientId, (this.scores.get(clientId) ?? 0) + 1);
      return { clientId, choiceIndex, correct };
    });

    this.answers.clear();

    return {
      questionId: q.id,
      correctIndex: q.correctIndex,
      answers,
      scores: this.getScores(),
    };
  }

  hasNextQuestion(): boolean {
    return this.index + 1 < this.questions.length;
  }

  /** Advances to the next question. Returns null if the round is already over. */
  nextQuestion(): TriviaQuestionPayload | null {
    if (!this.hasNextQuestion()) return null;
    this.index += 1;
    return this.currentQuestionPayload();
  }

  getScores(): TriviaScore[] {
    return this.participantIds.map((clientId) => ({ clientId, score: this.scores.get(clientId) ?? 0 }));
  }
}
