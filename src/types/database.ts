export type Gender = "el" | "la" | "los" | "las" | "el/la" | null;

export type AudioSource = "deck" | "es-ES TTS";

export type NoteSource = "deck" | "reading" | "tutor" | "manual";

export type CardType = "recognition" | "recall" | "listening" | "cloze" | "speak";

export const PHASE1_CARD_TYPES: CardType[] = [
  "recognition",
  "recall",
  "listening",
  "cloze",
];

export type FSRSState = 0 | 1 | 2 | 3; // 0=New, 1=Learning, 2=Review, 3=Relearning

export type FSRSRating = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy

export interface NoteRecord {
  id: string;
  anki_guid: string;
  word: string;
  lemma: string;
  meaning: string;
  example_es: string;
  cloze_es: string;
  example_tr: string;
  pos: string | null;
  gender: Gender;
  image_url: string | null;
  audio_word_url: string | null;
  audio_example_url: string | null;
  deck_audio_word_url: string | null;
  deck_audio_example_url: string | null;
  audio_source: AudioSource;
  part: 1 | 2 | 3;
  freq_rank: number;
  source: NoteSource;
  created_at: string;
}

export interface CardRecord {
  id: string;
  note_id: string;
  type: CardType;
  due: string; // ISO timestamp
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: FSRSState;
  last_review: string | null;
  suspended: boolean;
}

export interface CardWithNote extends CardRecord {
  note: NoteRecord;
}

export interface ReviewLogRecord {
  id: string;
  card_id: string;
  rating: FSRSRating;
  duration_ms: number;
  reviewed_at: string;
}

export interface SettingsRecord {
  id: 1;
  daily_minutes: 30 | 60 | 90;
  new_words_start: number;
  weekly_increase: number;
  new_words_max: number;
  voice: string;
  voice_minutes_cap: number;
  start_date: string; // YYYY-MM-DD
  field_mappings: Record<string, FieldMappingConfig>;
}

export interface SessionRecord {
  date: string; // YYYY-MM-DD
  minutes: number;
  new_count: number;
  review_count: number;
  xp: number;
  goal_met: boolean;
  streak: number;
  extra_batches: number;
}

export type MappedFieldRole =
  | "word"
  | "meaning"
  | "example_es"
  | "cloze_es"
  | "example_tr"
  | "audio_word"
  | "audio_example"
  | "pos"
  | "gender"
  | "ranking"
  | "image"
  | "ignore";

export type FieldMappingConfig = Record<string, MappedFieldRole>;

export type ExerciseType =
  | "fill_in"
  | "transform"
  | "translate"
  | "build_sentence";

export interface TutorExercise {
  id: string;
  type: ExerciseType;
  prompt: string;
  answer: string;
  options?: string[]; // Optional word bank for build_sentence
  hint?: string;
  explanation?: string;
}

export interface LessonNewWord {
  word: string;
  lemma: string;
  meaning: string;
  pos?: string;
  gender?: Gender;
  example_es: string;
  example_tr: string;
}

export interface LessonRecord {
  id: string; // e.g. "w1-d1"
  week: number; // 1..12
  day: number; // 1..7 (day 7 = weekly review boss test)
  city: string;
  topic: string;
  explanation: string;
  examples: { es: string; en: string }[];
  new_words: LessonNewWord[];
  exercises: TutorExercise[];
  completed_at: string | null;
  score: number | null;
}

export type ErrorSource = "tutor" | "writing" | "speaking" | "pronunciation";

export type ErrorCategory =
  | "gender"
  | "ser/estar"
  | "tense choice"
  | "agreement"
  | "vocabulary"
  | "spelling"
  | "pronouns"
  | "prepositions"
  | "other";

export interface ErrorRecord {
  id: string;
  source: ErrorSource;
  category: ErrorCategory | string;
  wrong: string;
  correct: string;
  explanation: string;
  card_id: string | null;
  created_at: string;
}

export interface TutorChatMessage {
  id: string;
  role: "user" | "tutor";
  content: string;
  corrections?: {
    category: string;
    wrong: string;
    correct: string;
    explanation: string;
  }[];
  createdAt: string;
}

export interface LeechMnemonicResult {
  word: string;
  mnemonic: string;
  examples: { es: string; en: string }[];
}

export type SpainSoundGroup =
  | "rr"
  | "r"
  | "theta"
  | "j_g"
  | "ll_y"
  | "vowels"
  | "b_v";

export interface PronunciationPhonemeScore {
  phoneme: string; // IPA or Spanish symbol
  accuracy: number; // 0..100
  soundGroup?: SpainSoundGroup | null;
}

export interface PronunciationWordScore {
  word: string;
  accuracy: number; // 0..100
  errorType?: "None" | "Omission" | "Insertion" | "Mispronunciation";
  phonemes: PronunciationPhonemeScore[];
}

export interface PronunciationAssessmentResult {
  engine: "azure-es-ES" | "gemini-audio-es-ES";
  referenceText: string;
  recognizedText: string;
  overall: number; // 0..100
  accuracy: number; // 0..100
  fluency: number; // 0..100
  completeness: number; // 0..100
  words: PronunciationWordScore[];
  soundScores: Partial<Record<SpainSoundGroup, number>>;
  rhythmTip: string;
}

export interface PronunciationAttemptRecord {
  id: string;
  reference_text: string;
  mode: "shadowing" | "minimal_pair" | "stress_linking" | "paragraph" | "review_speak";
  engine: "azure-es-ES" | "gemini-audio-es-ES";
  overall: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  words_phonemes: PronunciationWordScore[];
  sound_scores: Partial<Record<SpainSoundGroup, number>>;
  rhythm_tip: string;
  created_at: string;
}

export type WordKnowledgeStatus = "new" | "learning" | "known" | "ignored";

export interface WordStatusRecord {
  lemma: string; // Primary key (lowercase normalized Spanish word/lemma)
  status: WordKnowledgeStatus;
  first_seen_text_id: string | null;
  updated_at: string;
}

export type ReadingTextType = "starter" | "book" | "article" | "generated";

export interface ReadingTextRecord {
  id: string;
  title: string;
  type: ReadingTextType;
  content: string;
  source_url?: string | null;
  topic?: string | null;
  target_words?: string[];
  current_page?: number; // 0-based page index saved automatically
  progress: number; // 0..100
  comprehension_pct: number; // 0..100
  word_count: number;
  created_at: string;
  updated_at: string;
}

export type JourneyStatus = "locked" | "current" | "done";

export interface JourneyCityRecord {
  week: number; // 1..12
  city: string;
  status: JourneyStatus;
  lessons_done: number;
  words_target: number;
  boss_score: number | null;
  unlocked_at: string | null;
}

export type RewardType = "badge" | "postcard" | "streak_freeze";

export interface RewardRecord {
  id: string;
  type: RewardType;
  key: string;
  earned_at: string;
}

export interface DailyQuestRecord {
  id: string;
  date: string; // YYYY-MM-DD
  key: string;
  description: string;
  target: number;
  progress: number;
  done: boolean;
}
