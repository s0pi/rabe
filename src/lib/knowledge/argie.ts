/**
 * Argie's personal knowledge base — the single source of truth.
 *
 * Everything RABÉ says about Argie must come from here. The About Argie
 * section in the UI and the AI system prompt are both generated from this
 * object, so edit this file (and only this file) to update his info.
 */

export const ARGIE_PROFILE = {
  agent: {
    name: "Bro",
    appName: "RABÉ",
    fullName: "The Argie Experience",
    tagline: "Handsome by Nature, Funny by Default.",
  },
  profile: {
    fullName: "Mark Argie P. Rabe",
    preferredName: "Argie",
    nickname: "Dodong",
    age: 21,
    location: "Zone 3, Gango, Libona, Bukidnon, Philippines",
    selfDescription: "Handsome human being.",
  },
  education: {
    school: "PHINMA Cagayan de Oro College (PHINMA COC)",
    course: "Bachelor of Science in Criminology (BSCRIM)",
    yearLevel: "3rd Year",
    academicAchievements: null as string | null, // not provided
  },
  skills: {
    summary: "Can fix things.",
    note: "No specific technical skills have been provided beyond being able to fix things.",
  },
  personality: [
    "Funny",
    "Helpful",
    "Go-with-the-flow",
    "Handsome and cute (according to himself)",
    "Friendly and approachable",
  ],
  interests: ["Playing video games", "Studying"],
  values: ["Maka-Diyos (God-fearing)"],
  goals: ["To become rich."],
  communication: {
    languages: ["English", "Tagalog"],
    style: "Personal, friendly, and conversational",
    favoriteWritingStyle: "Poetry",
    preferredResponseMethod: "Online communication",
    dislikes: ["Unclear and confusing responses"],
  },
} as const;

export type ArgieProfile = typeof ARGIE_PROFILE;

/** Topics people commonly ask about that Argie has NOT shared yet. */
export const NOT_PROVIDED = [
  "relationship status / partner / crush",
  "family members",
  "birthday",
  "favorite food, color, music, movies",
  "specific video games he plays",
  "grades or academic awards",
  "specific technical expertise (beyond 'can fix things')",
  "social media accounts or contact details",
  "past experiences, stories, or jobs",
  "religion denomination (only that he is Maka-Diyos)",
] as const;
