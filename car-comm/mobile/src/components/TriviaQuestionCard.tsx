import { Pressable, StyleSheet, Text, View } from "react-native";
import type { GameResultPayload, TriviaQuestionPayload } from "../protocol/events";

interface Props {
  question: TriviaQuestionPayload;
  result: GameResultPayload | null;
  selectedIndex: number | null;
  onAnswer: (choiceIndex: number) => void;
}

export function TriviaQuestionCard({ question, result, selectedIndex, onAnswer }: Props) {
  const revealed = result?.questionId === question.questionId;

  return (
    <View style={styles.card}>
      <Text style={styles.progress}>
        Question {question.index + 1} of {question.total}
      </Text>
      <Text style={styles.prompt}>{question.prompt}</Text>

      {question.choices.map((choice, index) => {
        const isSelected = selectedIndex === index;
        const isCorrect = revealed && index === result.correctIndex;
        const isWrongSelected = revealed && isSelected && index !== result.correctIndex;

        return (
          <Pressable
            key={choice}
            disabled={selectedIndex !== null}
            onPress={() => onAnswer(index)}
            style={[
              styles.choice,
              isSelected && styles.choiceSelected,
              isCorrect && styles.choiceCorrect,
              isWrongSelected && styles.choiceWrong,
            ]}
          >
            <Text style={styles.choiceText}>{choice}</Text>
          </Pressable>
        );
      })}

      {revealed && (
        <Text style={styles.resultText}>
          {result.answers.map((a) => `${a.clientId.slice(0, 4)}: ${a.correct ? "correct" : "wrong"}`).join("  •  ")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  progress: {
    fontSize: 13,
    color: "#6b7280",
  },
  prompt: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    color: "#111827",
  },
  choice: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  choiceSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  choiceCorrect: {
    borderColor: "#16a34a",
    backgroundColor: "#dcfce7",
  },
  choiceWrong: {
    borderColor: "#dc2626",
    backgroundColor: "#fee2e2",
  },
  choiceText: {
    fontSize: 16,
    color: "#111827",
  },
  resultText: {
    marginTop: 8,
    fontSize: 13,
    color: "#374151",
  },
});
