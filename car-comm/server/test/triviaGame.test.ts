import { describe, it, expect } from "vitest";
import { TriviaGame } from "../src/game/TriviaGame.js";
import type { TriviaQuestion } from "../src/game/questions.js";

const questions: TriviaQuestion[] = [
  { id: "t1", prompt: "Q1", choices: ["a", "b", "c", "d"], correctIndex: 1 },
  { id: "t2", prompt: "Q2", choices: ["a", "b", "c", "d"], correctIndex: 2 },
];

describe("TriviaGame", () => {
  it("starts on the first question", () => {
    const game = new TriviaGame(["p1", "p2"], questions);
    const payload = game.currentQuestionPayload();
    expect(payload.questionId).toBe("t1");
    expect(payload.index).toBe(0);
    expect(payload.total).toBe(2);
  });

  it("records one answer per participant and reports when all have answered", () => {
    const game = new TriviaGame(["p1", "p2"], questions);
    expect(game.recordAnswer("p1", 1)).toBe(true);
    expect(game.haveAllAnswered()).toBe(false);
    expect(game.recordAnswer("p1", 0)).toBe(false); // can't answer twice
    expect(game.recordAnswer("p2", 0)).toBe(true);
    expect(game.haveAllAnswered()).toBe(true);
  });

  it("rejects answers from a non-participant", () => {
    const game = new TriviaGame(["p1", "p2"], questions);
    expect(game.recordAnswer("intruder", 0)).toBe(false);
  });

  it("resolves a round scoring correct answers and marking missing ones (timeout case)", () => {
    const game = new TriviaGame(["p1", "p2"], questions);
    game.recordAnswer("p1", 1); // correct
    // p2 never answers -> simulates a caller-driven timeout resolution
    const result = game.resolveRound();
    expect(result.correctIndex).toBe(1);

    const p1 = result.answers.find((a) => a.clientId === "p1");
    const p2 = result.answers.find((a) => a.clientId === "p2");
    expect(p1?.correct).toBe(true);
    expect(p2?.choiceIndex).toBeNull();
    expect(p2?.correct).toBe(false);

    expect(result.scores.find((s) => s.clientId === "p1")?.score).toBe(1);
    expect(result.scores.find((s) => s.clientId === "p2")?.score).toBe(0);
  });

  it("advances through questions and signals when the round is over", () => {
    const game = new TriviaGame(["p1", "p2"], questions);
    game.resolveRound(); // resolve q1
    expect(game.hasNextQuestion()).toBe(true);
    const next = game.nextQuestion();
    expect(next?.questionId).toBe("t2");
    expect(game.hasNextQuestion()).toBe(false);
    expect(game.nextQuestion()).toBeNull();
  });

  it("clears answers between questions so the next round starts fresh", () => {
    const game = new TriviaGame(["p1", "p2"], questions);
    game.recordAnswer("p1", 1);
    game.recordAnswer("p2", 2);
    game.resolveRound();
    game.nextQuestion();
    expect(game.haveAllAnswered()).toBe(false);
    expect(game.recordAnswer("p1", 2)).toBe(true);
  });

  it("accumulates scores across multiple questions", () => {
    const game = new TriviaGame(["p1", "p2"], questions);
    game.recordAnswer("p1", 1); // correct on q1
    game.recordAnswer("p2", 0); // wrong on q1
    game.resolveRound();
    game.nextQuestion();

    game.recordAnswer("p1", 2); // correct on q2
    game.recordAnswer("p2", 2); // correct on q2
    const result = game.resolveRound();

    expect(result.scores.find((s) => s.clientId === "p1")?.score).toBe(2);
    expect(result.scores.find((s) => s.clientId === "p2")?.score).toBe(1);
  });
});
