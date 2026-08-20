import { Pressable, StyleSheet, Text } from "react-native";

interface Props {
  isRecording: boolean;
  disabled?: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}

export function PushToTalkButton({ isRecording, disabled, onPressIn, onPressOut }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isRecording ? "Recording, release to send" : "Hold to talk"}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.button, isRecording && styles.recording, disabled && styles.disabled]}
    >
      <Text style={styles.label}>{isRecording ? "Recording… release to send" : "Hold to talk"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 999,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  recording: {
    backgroundColor: "#dc2626",
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
