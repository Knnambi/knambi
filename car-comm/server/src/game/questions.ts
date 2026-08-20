export interface TriviaQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
}

// A curated general-knowledge / road-trip trivia bank. Lives server-side only —
// the client never sees the answer key until a round resolves.
export const QUESTION_BANK: TriviaQuestion[] = [
  { id: "q001", prompt: "What is the capital of Australia?", choices: ["Sydney", "Melbourne", "Canberra", "Perth"], correctIndex: 2 },
  { id: "q002", prompt: "How many wheels does a standard car have?", choices: ["2", "3", "4", "6"], correctIndex: 2 },
  { id: "q003", prompt: "Which planet is known as the Red Planet?", choices: ["Venus", "Mars", "Jupiter", "Saturn"], correctIndex: 1 },
  { id: "q004", prompt: "What color do you get by mixing blue and yellow?", choices: ["Purple", "Orange", "Green", "Brown"], correctIndex: 2 },
  { id: "q005", prompt: "What does GPS stand for?", choices: ["Global Positioning System", "General Public Service", "Ground Path Sensor", "Geo Planning Software"], correctIndex: 0 },
  { id: "q006", prompt: "Which ocean is the largest?", choices: ["Atlantic", "Indian", "Arctic", "Pacific"], correctIndex: 3 },
  { id: "q007", prompt: "How many minutes are in a full day?", choices: ["1440", "1000", "1200", "1600"], correctIndex: 0 },
  { id: "q008", prompt: "What is the fastest land animal?", choices: ["Lion", "Cheetah", "Horse", "Greyhound"], correctIndex: 1 },
  { id: "q009", prompt: "Which country invented pizza as we know it today?", choices: ["France", "Greece", "Italy", "Spain"], correctIndex: 2 },
  { id: "q010", prompt: "What gas do plants absorb from the air?", choices: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correctIndex: 2 },
  { id: "q011", prompt: "How many strings does a standard guitar have?", choices: ["4", "5", "6", "7"], correctIndex: 2 },
  { id: "q012", prompt: "What is the largest desert in the world?", choices: ["Sahara", "Gobi", "Antarctic", "Kalahari"], correctIndex: 2 },
  { id: "q013", prompt: "Which shape has three sides?", choices: ["Square", "Triangle", "Pentagon", "Hexagon"], correctIndex: 1 },
  { id: "q014", prompt: "What is the boiling point of water at sea level (Celsius)?", choices: ["90", "100", "110", "120"], correctIndex: 1 },
  { id: "q015", prompt: "Which country gifted the Statue of Liberty to the USA?", choices: ["UK", "France", "Spain", "Italy"], correctIndex: 1 },
  { id: "q016", prompt: "What is the tallest mountain in the world?", choices: ["K2", "Kilimanjaro", "Everest", "Denali"], correctIndex: 2 },
  { id: "q017", prompt: "How many continents are there?", choices: ["5", "6", "7", "8"], correctIndex: 2 },
  { id: "q018", prompt: "What do bees collect from flowers?", choices: ["Pollen only", "Nectar only", "Both nectar and pollen", "Neither"], correctIndex: 2 },
  { id: "q019", prompt: "Which instrument has 88 keys?", choices: ["Organ", "Piano", "Accordion", "Xylophone"], correctIndex: 1 },
  { id: "q020", prompt: "What is the currency of Japan?", choices: ["Yuan", "Won", "Yen", "Ringgit"], correctIndex: 2 },
  { id: "q021", prompt: "How many legs does a spider have?", choices: ["6", "8", "10", "12"], correctIndex: 1 },
  { id: "q022", prompt: "What is the closest star to Earth?", choices: ["Proxima Centauri", "Sirius", "The Sun", "Alpha Centauri"], correctIndex: 2 },
  { id: "q023", prompt: "Which country has the most population?", choices: ["USA", "India", "China", "Indonesia"], correctIndex: 1 },
  { id: "q024", prompt: "What is the main ingredient in guacamole?", choices: ["Tomato", "Avocado", "Onion", "Lime"], correctIndex: 1 },
  { id: "q025", prompt: "How many colors are in a rainbow?", choices: ["5", "6", "7", "8"], correctIndex: 2 },
  { id: "q026", prompt: "What is the freezing point of water in Fahrenheit?", choices: ["0", "32", "100", "212"], correctIndex: 1 },
  { id: "q027", prompt: "Which animal is known as the 'King of the Jungle'?", choices: ["Tiger", "Elephant", "Lion", "Gorilla"], correctIndex: 2 },
  { id: "q028", prompt: "What is the smallest prime number?", choices: ["0", "1", "2", "3"], correctIndex: 2 },
  { id: "q029", prompt: "Which US state is known as the Sunshine State?", choices: ["California", "Florida", "Texas", "Arizona"], correctIndex: 1 },
  { id: "q030", prompt: "What do you call a baby dog?", choices: ["Kitten", "Cub", "Puppy", "Calf"], correctIndex: 2 },
  { id: "q031", prompt: "Which planet has the most moons (as commonly cited)?", choices: ["Mars", "Earth", "Jupiter", "Saturn"], correctIndex: 3 },
  { id: "q032", prompt: "What is the hardest natural substance on Earth?", choices: ["Gold", "Iron", "Diamond", "Quartz"], correctIndex: 2 },
  { id: "q033", prompt: "How many sides does a stop sign have?", choices: ["6", "7", "8", "9"], correctIndex: 2 },
  { id: "q034", prompt: "What is the longest river in the world?", choices: ["Amazon", "Nile", "Yangtze", "Mississippi"], correctIndex: 1 },
  { id: "q035", prompt: "Which sport is known as 'the beautiful game'?", choices: ["Basketball", "Football (soccer)", "Tennis", "Cricket"], correctIndex: 1 },
  { id: "q036", prompt: "What is the chemical symbol for water?", choices: ["H2O", "O2", "CO2", "HO"], correctIndex: 0 },
  { id: "q037", prompt: "How many bones are in the adult human body?", choices: ["186", "206", "226", "246"], correctIndex: 1 },
  { id: "q038", prompt: "Which fruit is known for keeping the doctor away?", choices: ["Banana", "Orange", "Apple", "Grape"], correctIndex: 2 },
  { id: "q039", prompt: "What is the capital of Canada?", choices: ["Toronto", "Vancouver", "Ottawa", "Montreal"], correctIndex: 2 },
  { id: "q040", prompt: "How many players are on a standard soccer team on the field?", choices: ["9", "10", "11", "12"], correctIndex: 2 },
];

export function pickRandomQuestions(count: number): TriviaQuestion[] {
  const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
