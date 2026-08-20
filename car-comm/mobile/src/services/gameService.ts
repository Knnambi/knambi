import { useCallback, useEffect, useState } from "react";
import { getSocket } from "./socket";
import type { GameResultPayload, TriviaQuestionPayload, TriviaScore } from "../protocol/events";

/** Drives the shared trivia round for a trip session: one server-authoritative question at a time. */
export function useTriviaGame(code: string | null) {
  const [question, setQuestion] = useState<TriviaQuestionPayload | null>(null);
  const [result, setResult] = useState<GameResultPayload | null>(null);
  const [finalScores, setFinalScores] = useState<TriviaScore[] | null>(null);
  const [answeredQuestionId, setAnsweredQuestionId] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const socket = getSocket();

    const onQuestion = (q: TriviaQuestionPayload) => {
      setQuestion(q);
      setResult(null);
      setAnsweredQuestionId(null);
    };
    const onResult = (r: GameResultPayload) => setResult(r);
    const onOver = (payload: { finalScores: TriviaScore[] }) => {
      setFinalScores(payload.finalScores);
      setQuestion(null);
    };

    socket.on("game-question", onQuestion);
    socket.on("game-result", onResult);
    socket.on("game-over", onOver);
    return () => {
      socket.off("game-question", onQuestion);
      socket.off("game-result", onResult);
      socket.off("game-over", onOver);
    };
  }, [code]);

  const startGame = useCallback(() => {
    if (!code) return;
    setFinalScores(null);
    setResult(null);
    getSocket().emit("start-game", { code });
  }, [code]);

  const answer = useCallback(
    (choiceIndex: number) => {
      if (!code || !question || answeredQuestionId === question.questionId) return;
      setAnsweredQuestionId(question.questionId);
      getSocket().emit("game-answer", {
        code,
        questionId: question.questionId,
        choiceIndex,
        answeredAtMs: Date.now(),
      });
    },
    [code, question, answeredQuestionId]
  );

  return { question, result, finalScores, answeredQuestionId, startGame, answer };
}
