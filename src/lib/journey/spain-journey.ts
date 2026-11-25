import {
  DailyQuestRecord,
  JourneyStatus,
  LessonRecord,
  PronunciationAttemptRecord,
  ReadingTextRecord,
  SessionRecord,
  SpainSoundGroup,
} from "@/types/database";
import { computeWeakSoundTracker } from "@/lib/pronunciation/spain-sounds";

export interface SpainCityStop {
  week: number;
  city: string;
  shortName: string;
  grammar: string;
  bossRoleplay: string;
  wordsTarget: number;
  emoji: string;
  localFact: string;
  localPhraseEs: string;
  localPhraseEn: string;
}

export const SPAIN_JOURNEY_CITIES: SpainCityStop[] = [
  {
    week: 1,
    city: "Madrid",
    shortName: "Madrid",
    grammar: "Sounds, ser/estar, articles",
    bossRoleplay: "Order a coffee and a tostada",
    wordsTarget: 70,
    emoji: "🐻",
    localFact: "Puerta del Sol marks Kilómetro 0 — the starting point of all radial roads in Spain.",
    localPhraseEs: "Ponme un café con leche y una tostada con tomate, por favor.",
    localPhraseEn: "Give me a coffee with milk and toast with tomato, please.",
  },
  {
    week: 2,
    city: "Toledo",
    shortName: "Toledo",
    grammar: "Present tense",
    bossRoleplay: "Ask for directions in the old town",
    wordsTarget: 210,
    emoji: "🏰",
    localFact: "Known as the City of Three Cultures, Toledo is just 33 minutes from Atocha by high-speed train.",
    localPhraseEs: "Perdone, ¿cómo llego a la plaza de Zocodover?",
    localPhraseEn: "Excuse me, how do I get to Zocodover Square?",
  },
  {
    week: 3,
    city: "Segovia",
    shortName: "Segovia",
    grammar: "Irregular present",
    bossRoleplay: "Buy food at a market",
    wordsTarget: 420,
    emoji: "🏛️",
    localFact: "Segovia's Roman aqueduct has stood for nearly 2,000 years without a single drop of mortar.",
    localPhraseEs: "¿Cuánto cuesta el kilo de tomates? Ponme medio kilo, vale.",
    localPhraseEn: "How much is a kilo of tomatoes? Give me half a kilo, okay.",
  },
  {
    week: 4,
    city: "Salamanca",
    shortName: "Salamanca",
    grammar: "Gustar, pronouns",
    bossRoleplay: "Meet a student, talk about likes",
    wordsTarget: 700,
    emoji: "🎓",
    localFact: "Founded in 1218, the University of Salamanca is the oldest university in the Hispanic world.",
    localPhraseEs: "A mí me encanta pasear por la Plaza Mayor al atardecer.",
    localPhraseEn: "I love strolling through the Plaza Mayor at sunset.",
  },
  {
    week: 5,
    city: "León",
    shortName: "León",
    grammar: "Ir a, reflexive verbs",
    bossRoleplay: "Check in at a hostel, describe your day",
    wordsTarget: 1050,
    emoji: "🦁",
    localFact: "In León's Barrio Húmedo, every drink you order automatically comes with a free tapa.",
    localPhraseEs: "Me levanto temprano y luego voy a visitar la catedral.",
    localPhraseEn: "I get up early and then I'm going to visit the cathedral.",
  },
  {
    week: 6,
    city: "Santiago de Compostela",
    shortName: "Santiago",
    grammar: "Preterite",
    bossRoleplay: "Tell a pilgrim what you did yesterday",
    wordsTarget: 1400,
    emoji: "🐚",
    localFact: "Pilgrims from across the world finish the Camino de Santiago in Plaza del Obradoiro.",
    localPhraseEs: "Ayer caminé veinte kilómetros y cené pulpo a la gallega.",
    localPhraseEn: "Yesterday I walked twenty kilometers and had Galician-style octopus.",
  },
  {
    week: 7,
    city: "Bilbao",
    shortName: "Bilbao",
    grammar: "Imperfect",
    bossRoleplay: "Tell a story about your childhood",
    wordsTarget: 1750,
    emoji: "🎨",
    localFact: "Bilbao's Guggenheim Museum transformed the industrial estuary into a global design icon.",
    localPhraseEs: "Cuando era pequeño, siempre jugaba en la calle con mis amigos.",
    localPhraseEn: "When I was little, I always played in the street with my friends.",
  },
  {
    week: 8,
    city: "Zaragoza",
    shortName: "Zaragoza",
    grammar: "Present perfect, por/para",
    bossRoleplay: "Open a bank account",
    wordsTarget: 2100,
    emoji: "🏦",
    localFact: "Zaragoza sits right halfway between Madrid and Barcelona on the banks of the Ebro River.",
    localPhraseEs: "Hoy he traído mi pasaporte y el NIE para abrir una cuenta.",
    localPhraseEn: "Today I have brought my passport and NIE to open an account.",
  },
  {
    week: 9,
    city: "Barcelona",
    shortName: "Barcelona",
    grammar: "Future, conditional",
    bossRoleplay: "Business meeting about plans",
    wordsTarget: 2450,
    emoji: "💼",
    localFact: "Barcelona is one of Europe's busiest tech and startup hubs alongside Madrid.",
    localPhraseEs: "El mes que viene lanzaremos el proyecto y sería genial colaborar.",
    localPhraseEn: "Next month we will launch the project and it would be great to collaborate.",
  },
  {
    week: 10,
    city: "Valencia",
    shortName: "Valencia",
    grammar: "Imperative",
    bossRoleplay: "Rent a flat from a landlord",
    wordsTarget: 2800,
    emoji: "🍊",
    localFact: "Valencia is the birthplace of authentic paella and home to the 9-km Turia riverbed park.",
    localPhraseEs: "Envíame el contrato por correo y dime cuándo podemos firmar.",
    localPhraseEn: "Send me the contract by email and tell me when we can sign.",
  },
  {
    week: 11,
    city: "Granada",
    shortName: "Granada",
    grammar: "Subjunctive",
    bossRoleplay: "Doctor's appointment",
    wordsTarget: 3150,
    emoji: "🕌",
    localFact: "From the Albaicín hilltop you can see the Alhambra palace framed by the snowy Sierra Nevada.",
    localPhraseEs: "Espero que te mejores pronto y que descanses bien esta noche.",
    localPhraseEn: "I hope you get better soon and rest well tonight.",
  },
  {
    week: 12,
    city: "Sevilla",
    shortName: "Sevilla",
    grammar: "Subjunctive review",
    bossRoleplay: "Pitch a powerbank station to a bar owner",
    wordsTarget: 3500,
    emoji: "🌞",
    localFact: "Sevilla's Plaza de España features 48 tiled alcoves representing every province of Spain.",
    localPhraseEs: "Quiero que tus clientes carguen el móvil aquí sin coste para el bar.",
    localPhraseEn: "I want your customers to charge their phones here at no cost to the bar.",
  },
];

export interface CityProgressView extends SpainCityStop {
  status: JourneyStatus;
  lessonsDone: number;
  wordsProgressPct: number;
  overallUnlockPct: number;
  bossScore: number | null;
}

export function computeJourneyProgress(input: {
  lessons: LessonRecord[];
  wordsLearned: number;
  bossScoresByWeek?: Record<number, number>;
}): {
  cities: CityProgressView[];
  currentWeek: number;
  postcardsEarned: number;
} {
  const lessonsByWeek = new Map<number, number>();
  const bossByWeek = new Map<number, number>();

  for (const l of input.lessons) {
    if (!l.completed_at) continue;
    if (l.day === 7) {
      bossByWeek.set(l.week, Math.max(bossByWeek.get(l.week) ?? 0, l.score ?? 80));
    } else {
      lessonsByWeek.set(l.week, (lessonsByWeek.get(l.week) ?? 0) + 1);
    }
  }

  for (const [wkStr, sc] of Object.entries(input.bossScoresByWeek ?? {})) {
    const wk = Number(wkStr);
    bossByWeek.set(wk, Math.max(bossByWeek.get(wk) ?? 0, sc));
  }

  const cities: CityProgressView[] = [];
  let foundCurrent = false;
  let currentWeek = 1;
  let postcardsEarned = 0;

  for (const stop of SPAIN_JOURNEY_CITIES) {
    const lessonsDone = Math.min(6, lessonsByWeek.get(stop.week) ?? 0);
    const bossScore = bossByWeek.get(stop.week) ?? null;
    const wordsPct = Math.min(
      100,
      Math.round((input.wordsLearned / Math.max(1, stop.wordsTarget)) * 100)
    );
    const lessonsPct = Math.round((lessonsDone / 6) * 100);
    const bossPct = bossScore !== null && bossScore >= 80 ? 100 : 0;
    const overallUnlockPct = Math.round(
      lessonsPct * 0.45 + wordsPct * 0.35 + bossPct * 0.2
    );

    const isDone =
      lessonsDone >= 6 &&
      input.wordsLearned >= stop.wordsTarget &&
      bossScore !== null &&
      bossScore >= 80;

    let status: JourneyStatus = "locked";
    if (isDone) {
      status = "done";
      postcardsEarned++;
    } else if (!foundCurrent) {
      status = "current";
      foundCurrent = true;
      currentWeek = stop.week;
    }

    cities.push({
      ...stop,
      status,
      lessonsDone,
      wordsProgressPct: wordsPct,
      overallUnlockPct,
      bossScore,
    });
  }

  return {
    cities,
    currentWeek: foundCurrent ? currentWeek : 12,
    postcardsEarned,
  };
}

export interface DailyLoopBlock {
  id:
    | "warmup"
    | "new_words"
    | "grammar"
    | "pronunciation"
    | "speak"
    | "read"
    | "wrapup";
  stepNumber: number;
  title: string;
  subtitle: string;
  minutes: number;
  href: string;
  xpReward: string;
}

/**
 * Scales the 7 fixed daily blocks from docs/SPEC.md to the learner's chosen 30 / 60 / 90 min budget.
 */
export const UNLOCK_PRONUNCIATION_READING_WORDS = 150;
export const UNLOCK_SPEAK_WORDS = 350;

export function buildScaledDailyPlan(
  dailyMinutes: 30 | 60 | 90,
  options?: { wordsLearned?: number; unlockAllEarly?: boolean }
): DailyLoopBlock[] {
  const scale = dailyMinutes / 60;
  const mins = (base: number, minVal = 2) =>
    Math.max(minVal, Math.round(base * scale));

  const allBlocks: DailyLoopBlock[] = [
    {
      id: "warmup",
      stepNumber: 1,
      title: "Warm-up Review",
      subtitle: "Due FSRS cards with es-ES audio + 5th-card speak check",
      minutes: mins(12, 6),
      href: "/review",
      xpReward: "+1 XP/card",
    },
    {
      id: "new_words",
      stepNumber: 2,
      title: "Today's New Words",
      subtitle: "Frequency-order batch + words mined yesterday while reading",
      minutes: mins(10, 5),
      href: "/review",
      xpReward: "+2 XP/word",
    },
    {
      id: "grammar",
      stepNumber: 3,
      title: "Madrid Grammar Lesson",
      subtitle: "12-week Spain curriculum: short rule + 8–12 exercises",
      minutes: mins(12, 6),
      href: "/tutor",
      xpReward: "+20 XP",
    },
    {
      id: "pronunciation",
      stepNumber: 4,
      title: "Pronunciation Coach",
      subtitle: "Shadow 5 Madrid sentences + drill your 2 weakest sounds",
      minutes: mins(8, 4),
      href: "/pronunciation",
      xpReward: "+5 XP (80+)",
    },
    {
      id: "speak",
      stepNumber: 5,
      title: "Speak in Madrid",
      subtitle: "Voice roleplay in real Madrid scenarios (café, bank, landlord)",
      minutes: mins(8, 4),
      href: "/speak",
      xpReward: "+30 XP",
    },
    {
      id: "read",
      stepNumber: 6,
      title: "Read & Listen",
      subtitle: "Continue your book or AI graded story; tap new words to mine",
      minutes: mins(8, 4),
      href: "/read",
      xpReward: "+1 XP/100w",
    },
    {
      id: "wrapup",
      stepNumber: 7,
      title: "Daily Wrap-Up",
      subtitle: "Review streak, XP ring, quests & Spain journey progress",
      minutes: 2,
      href: "#wrapup",
      xpReward: "Streak ✓",
    },
  ];

  if (!options || options.unlockAllEarly || options.wordsLearned === undefined) {
    return allBlocks;
  }

  const learned = options.wordsLearned;
  const filtered = allBlocks.filter((b) => {
    if (b.id === "pronunciation" || b.id === "read") {
      return learned >= UNLOCK_PRONUNCIATION_READING_WORDS;
    }
    if (b.id === "speak") {
      return learned >= UNLOCK_SPEAK_WORDS;
    }
    return true;
  });

  return filtered.map((b, idx) => ({
    ...b,
    stepNumber: idx + 1,
  }));
}

export function buildDailyQuestsForDate(
  dateStr: string,
  metrics: {
    reviewsDoneToday: number;
    pron80PlusToday: number;
    wordsMinedToday: number;
    lessonsDoneToday: number;
  }
): DailyQuestRecord[] {
  const daySeed =
    dateStr.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 2;

  const q1: DailyQuestRecord = {
    id: `${dateStr}-q-reviews`,
    date: dateStr,
    key: "reviews_20",
    description:
      daySeed === 0
        ? "Review 20 FSRS cards with es-ES audio"
        : "Complete 15 spaced-repetition reviews",
    target: daySeed === 0 ? 20 : 15,
    progress: metrics.reviewsDoneToday,
    done: metrics.reviewsDoneToday >= (daySeed === 0 ? 20 : 15),
  };

  const q2: DailyQuestRecord = {
    id: `${dateStr}-q-pron`,
    date: dateStr,
    key: "pron_80",
    description: "Score 80+ on 3 Madrid pronunciation sentences",
    target: 3,
    progress: metrics.pron80PlusToday,
    done: metrics.pron80PlusToday >= 3,
  };

  const q3: DailyQuestRecord = {
    id: `${dateStr}-q-mine`,
    date: dateStr,
    key: "mine_or_lesson",
    description:
      daySeed === 0
        ? "Mark 3 words in Reading or finish 1 lesson"
        : "Finish today's grammar lesson or mine 3 reading words",
    target: 1,
    progress: Math.min(
      1,
      metrics.lessonsDoneToday + (metrics.wordsMinedToday >= 3 ? 1 : 0)
    ),
    done: metrics.lessonsDoneToday >= 1 || metrics.wordsMinedToday >= 3,
  };

  return [q1, q2, q3];
}

export type AchievementCategory =
  | "vocab"
  | "reviews"
  | "streaks"
  | "grammar"
  | "xp"
  | "skills";

export interface BadgeItem {
  key: string;
  label: string;
  emoji: string;
  description: string;
  category: AchievementCategory;
  progress: number;
  target: number;
  earned: boolean;
}

export function computeEarnedBadges(input: {
  wordsKnown: number;
  attempts: PronunciationAttemptRecord[];
  texts: ReadingTextRecord[];
  sessions: SessionRecord[];
  lessons?: LessonRecord[];
}): { badges: BadgeItem[]; streakFreezes: number } {
  const { stats } = computeWeakSoundTracker(input.attempts);
  const soundScore = (group: SpainSoundGroup) => {
    const found = stats.find((s) => s.group === group);
    return found && found.attemptsCount >= 3 && (found.averageScore ?? 0) >= 85;
  };
  const soundAvg = (group: SpainSoundGroup) => {
    const found = stats.find((s) => s.group === group);
    return found?.averageScore ?? 0;
  };

  const maxStreak = input.sessions.reduce(
    (max, s) => Math.max(max, s.streak ?? 0),
    0
  );
  const totalReviews = input.sessions.reduce(
    (sum, s) => sum + (s.review_count ?? 0),
    0
  );
  const totalXp = input.sessions.reduce((sum, s) => sum + (s.xp ?? 0), 0);
  const completedLessons = (input.lessons ?? []).filter((l) =>
    Boolean(l.completed_at)
  );
  const lessonsDoneCount = completedLessons.length;
  const bestLessonScore = completedLessons.reduce(
    (max, l) => Math.max(max, l.score ?? 0),
    0
  );
  const finishedTextsCount = input.texts.filter((t) => t.progress >= 100).length;
  const bestPronScore = input.attempts.reduce(
    (max, a) => Math.max(max, a.overall ?? 0),
    0
  );

  // Spec: hitting the goal 5 days in a week earns 1 streak freeze (max 2 saved)
  const goalDays = input.sessions.filter((s) => s.goal_met || s.xp >= 25).length;
  const streakFreezes = Math.min(2, Math.floor(goalDays / 5));

  const mk = (
    key: string,
    label: string,
    emoji: string,
    description: string,
    category: AchievementCategory,
    progress: number,
    target: number,
    earnedOverride?: boolean
  ): BadgeItem => ({
    key,
    label,
    emoji,
    description,
    category,
    progress: Math.min(target, Math.max(0, Math.round(progress))),
    target,
    earned: earnedOverride ?? progress >= target,
  });

  const badges: BadgeItem[] = [
    // 1. Vocabulary (10)
    mk("words_1", "First Word", "✨", "Learn your first Spanish word", "vocab", input.wordsKnown, 1),
    mk("words_10", "Starter 10", "🌿", "Learn 10 Spanish words", "vocab", input.wordsKnown, 10),
    mk("words_25", "Café Ready", "☕", "Learn 25 Spanish words", "vocab", input.wordsKnown, 25),
    mk("words_50", "Tapas Talker", "🥘", "Learn 50 Spanish words", "vocab", input.wordsKnown, 50),
    mk("words_100", "100 Words", "🌱", "Learn 100 Spanish words", "vocab", input.wordsKnown, 100),
    mk("words_250", "Street Smart", "🚶", "Learn 250 Spanish words", "vocab", input.wordsKnown, 250),
    mk("words_500", "500 Words", "🔥", "Learn 500 Spanish words", "vocab", input.wordsKnown, 500),
    mk("words_1000", "1,000 Words", "⚡", "Learn 1,000 Spanish words", "vocab", input.wordsKnown, 1000),
    mk("words_2000", "2,000 Words", "🚀", "Learn 2,000 Spanish words", "vocab", input.wordsKnown, 2000),
    mk("words_3500", "3,500 B1", "🏆", "Reach the 3,500-word B1 target", "vocab", input.wordsKnown, 3500),

    // 2. Reviews & Memory (7)
    mk("rev_1", "First Review", "🃏", "Complete your first FSRS review", "reviews", totalReviews, 1),
    mk("rev_25", "Warm-Up 25", "🎯", "Complete 25 FSRS reviews", "reviews", totalReviews, 25),
    mk("rev_100", "Card Grinder", "💪", "Complete 100 FSRS reviews", "reviews", totalReviews, 100),
    mk("rev_250", "Memory Builder", "🧠", "Complete 250 FSRS reviews", "reviews", totalReviews, 250),
    mk("rev_500", "FSRS Machine", "⚙️", "Complete 500 FSRS reviews", "reviews", totalReviews, 500),
    mk("rev_1000", "1,000 Reviews", "🏅", "Complete 1,000 FSRS reviews", "reviews", totalReviews, 1000),
    mk("rev_2500", "Iron Memory", "🛡️", "Complete 2,500 FSRS reviews", "reviews", totalReviews, 2500),

    // 3. Streaks & Consistency (7)
    mk("streak_1", "Day One", "🌅", "Start your Madrid study streak", "streaks", maxStreak, 1),
    mk("streak_3", "Hat Trick", "🎩", "Study 3 days in a row", "streaks", maxStreak, 3),
    mk("streak_7", "Full Week", "📅", "Study 7 days in a row", "streaks", maxStreak, 7),
    mk("streak_14", "Two Weeks", "🔥", "Study 14 days in a row", "streaks", maxStreak, 14),
    mk("streak_30", "30d Streak", "💎", "Reach a 30-day study streak", "streaks", maxStreak, 30),
    mk("streak_60", "60d Legend", "👑", "Reach a 60-day study streak", "streaks", maxStreak, 60),
    mk("streak_84", "12-Week Hero", "🌟", "Complete an 84-day B1 streak", "streaks", maxStreak, 84),

    // 4. Grammar & Lessons (6)
    mk("gram_1", "First Rule", "📘", "Finish your first grammar lesson", "grammar", lessonsDoneCount, 1),
    mk("gram_3", "Grammar Trio", "📗", "Finish 3 Madrid grammar lessons", "grammar", lessonsDoneCount, 3),
    mk("gram_7", "Week 1 Scholar", "🎓", "Finish 7 grammar lessons", "grammar", lessonsDoneCount, 7),
    mk("gram_14", "Grammar Pro", "📚", "Finish 14 grammar lessons", "grammar", lessonsDoneCount, 14),
    mk("gram_42", "Halfway Hero", "🧭", "Finish 42 grammar lessons", "grammar", lessonsDoneCount, 42),
    mk("gram_perfect", "Ace Student", "💯", "Score 95%+ on a grammar lesson", "grammar", bestLessonScore, 95),

    // 5. XP Milestones (5)
    mk("xp_50", "First Spark", "⚡", "Earn 50 total XP", "xp", totalXp, 50),
    mk("xp_250", "Rising Star", "⭐", "Earn 250 total XP", "xp", totalXp, 250),
    mk("xp_1000", "XP Hunter", "🌟", "Earn 1,000 total XP", "xp", totalXp, 1000),
    mk("xp_2500", "Madrid Grinder", "💫", "Earn 2,500 total XP", "xp", totalXp, 2500),
    mk("xp_10000", "Spanish Legend", "👑", "Earn 10,000 total XP", "xp", totalXp, 10000),

    // 6. Skills — Pronunciation & Reading (7)
    mk("pron_first", "First Mic", "🎙️", "Record your first Spanish sentence", "skills", input.attempts.length, 1),
    mk("pron_80", "Crisp Accent", "🔊", "Score 80%+ on Madrid pronunciation", "skills", bestPronScore, 80),
    mk("sound_theta", "Madrid θ", "🇪🇸", "85+ average on Castilian z/ce/ci", "skills", soundAvg("theta"), 85, Boolean(soundScore("theta"))),
    mk("sound_rr", "Trill RR", "👅", "85+ average on rolled rr", "skills", soundAvg("rr"), 85, Boolean(soundScore("rr"))),
    mk("sound_jota", "Madrid Jota", "🗣️", "85+ average on Spain j/ge/gi", "skills", soundAvg("j_g"), 85, Boolean(soundScore("j_g"))),
    mk("first_book", "First Read", "📖", "Finish your first Spanish text", "skills", finishedTextsCount, 1),
    mk("bookworm_3", "Bookworm", "📚", "Finish 3 Spanish texts or books", "skills", finishedTextsCount, 3),
  ];

  return { badges, streakFreezes };
}
