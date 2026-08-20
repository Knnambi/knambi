// Excludes visually ambiguous characters (0/O, 1/I) so a code can be read aloud
// or typed in reliably.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateSessionCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
