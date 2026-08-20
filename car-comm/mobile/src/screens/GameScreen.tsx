import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TriviaQuestionCard } from "../components/TriviaQuestionCard";
import { useTriviaGame } from "../services/gameService";

interface Props {
  code: string;
  clientId: string;
  onExit: () => void;
}

export function GameScreen({ code, clientId, onExit }: Props) {
  const { question, result, finalScores, answeredQuestionId, startGame, answer } = useTriviaGame(code);
  const selectedIndex =
    question && answeredQuestionId === question.questionId
      ? result?.answers.find((a) => a.clientId === clientId)?.choiceIndex ?? -1
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Road-trip trivia</Text>

      {!question && !finalScores && (
        <TouchableOpacity style={styles.startButton} onPress={startGame}>
          <Text style={styles.startButtonText}>Start Game</Text>
        </TouchableOpacity>
      )}

      {question && (
        <TriviaQuestionCard question={question} result={result} selectedIndex={selectedIndex} onAnswer={answer} />
      )}

      {finalScores && (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Final scores</Text>
          {finalScores.map((s) => (
            <Text key={s.clientId} style={styles.summaryRow}>
              {s.clientId === clientId ? "You" : "Other car"}: {s.score}
            </Text>
          ))}
          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>Play Again</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.backButton} onPress={onExit}>
        <Text style={styles.backButtonText}>Back to Trip</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: "#f9fafb",
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  startButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  startButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  summary: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
    color: "#111827",
  },
  summaryRow: {
    fontSize: 16,
    color: "#374151",
  },
  backButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  backButtonText: {
    color: "#6b7280",
    fontSize: 15,
  },
});
