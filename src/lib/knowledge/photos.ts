/**
 * Argie's photo library. Files live in /public/argie (resized, metadata stripped).
 *
 * The AI can't see images, so each photo has a written description. RABÉ uses
 * these to pick photos to show in chat and to describe Argie accurately.
 * To add a photo: put a .webp in /public/argie and add an entry here.
 */

export type PhotoCategory = "solo" | "barkada" | "school" | "family";

export const PHOTO_CATEGORIES: { id: PhotoCategory; label: string }[] = [
  { id: "solo", label: "Just Rabe" },
  { id: "barkada", label: "With the barkada" },
  { id: "school", label: "School & Crim life" },
  { id: "family", label: "Family" },
];

export interface ArgiePhoto {
  id: string;
  category: PhotoCategory;
  src: string;
  /** Short caption shown under the photo. */
  caption: string;
  /** What's in the photo (for the AI). */
  description: string;
  /** When RABÉ should pick this photo. */
  useFor: string;
  width: number;
  height: number;
}

export const ARGIE_AVATAR = "/argie/argie-avatar.webp";

export const ARGIE_PHOTOS: ArgiePhoto[] = [
  {
    id: "portrait",
    category: "solo",
    src: "/argie/argie-portrait.webp",
    caption: "The official handsome portrait",
    description:
      "ID-style portrait: neat short black hair with fringe, calm serious look, black 'Classic Mojito' tee.",
    useFor: "who he is, his looks, introductions",
    width: 768,
    height: 1024,
  },
  {
    id: "smile",
    category: "solo",
    src: "/argie/argie-smile.webp",
    caption: "Smile level: maximum",
    description: "Tilted selfie, huge bright smile, light-blue shirt, earbud in.",
    useFor: "personality, cheerful topics, introductions",
    width: 675,
    height: 1200,
  },
  {
    id: "food-trip",
    category: "solo",
    src: "/argie/argie-food-trip.webp",
    caption: "Rice mountain vs. Rabe",
    description:
      "Grinning, eating with his hands: a mountain of rice with grilled chicken.",
    useFor: "fun moments, food talk, funny stories",
    width: 900,
    height: 1198,
  },
  {
    id: "canal-trip",
    category: "solo",
    src: "/argie/argie-canal-trip.webp",
    caption: "Living the soft life (for a day)",
    description:
      "Leaning out a balcony at a Venice-themed canal mall, small confident smile.",
    useFor: "his goal of getting rich, travel, dreams",
    width: 900,
    height: 1200,
  },
  {
    id: "goofy-cap",
    category: "solo",
    src: "/argie/argie-goofy-cap.webp",
    caption: "Funny by default, proven",
    description:
      "Tongue out, fists up, backwards denim cap, white tee.",
    useFor: "his humor, jokes",
    width: 900,
    height: 1200,
  },
  {
    id: "firearm-diagram",
    category: "solo",
    src: "/argie/argie-firearm-diagram.webp",
    caption: "Criminology student at work",
    description:
      "Proudly showing his hand-drawn, labeled revolver and pistol diagrams for criminology class.",
    useFor: "his studies, criminology, school",
    width: 900,
    height: 1200,
  },
  {
    id: "closeup",
    category: "solo",
    src: "/argie/argie-closeup.webp",
    caption: "Messy hair, don't care",
    description: "Low-angle close-up, fluffy messy hair, sleepy look.",
    useFor: "chill vibe, poems",
    width: 900,
    height: 1200,
  },
  {
    id: "mirror-selfie",
    category: "solo",
    src: "/argie/argie-mirror-selfie.webp",
    caption: "Mirror check: still handsome",
    description: "Mirror selfie, phone over his face, black shirt, green wall.",
    useFor: "his handsomeness claims, confidence",
    width: 900,
    height: 1200,
  },
  {
    id: "mirror-bw",
    category: "solo",
    src: "/argie/argie-mirror-bw.webp",
    caption: "Black & white mystery mode",
    description: "Moody black-and-white mirror selfie, face hidden by phone.",
    useFor: "mystery / unshared details, poems",
    width: 720,
    height: 876,
  },
  {
    id: "emo-filter",
    category: "solo",
    src: "/argie/argie-emo-filter.webp",
    caption: "Emo era (filter edition)",
    description: "TikTok emo filter: long side bangs, eyeliner, nose ring, grin.",
    useFor: "jokes, playful teasing",
    width: 675,
    height: 1200,
  },
  {
    id: "face-filter",
    category: "solo",
    src: "/argie/argie-face-filter.webp",
    caption: "Face filter gone wrong (on purpose)",
    description: "Face-warp filter: huge pouty lips, squinting eyes.",
    useFor: "jokes, not taking himself too seriously",
    width: 675,
    height: 1200,
  },
  {
    id: "puyat-mode",
    category: "solo",
    src: "/argie/rabe-puyat-mode.webp",
    caption: "Puyat mode: activated",
    description: "Close-up lying on a green pillow with tired, red, sleepy eyes.",
    useFor: "being tired, late nights, rest reminders (gently, never mocking)",
    width: 720,
    height: 960,
  },
  {
    id: "cinema-barkada",
    category: "barkada",
    src: "/argie/rabe-cinema-barkada.webp",
    caption: "Cinema barkada",
    description: "Selfie with three friends in red cinema seats, rock-on hand signs and silly faces.",
    useFor: "friends, barkada, movies, hangouts",
    width: 900,
    height: 1200,
  },
  {
    id: "beach-trip",
    category: "barkada",
    src: "/argie/rabe-beach-trip.webp",
    caption: "Beach trip squad",
    description: "Big group selfie (about eight people) on a sunny shore by the sea, thumbs-up and hand signs.",
    useFor: "beach, trips, group fun, good memories",
    width: 675,
    height: 1200,
  },
  {
    id: "night-market",
    category: "barkada",
    src: "/argie/rabe-night-market.webp",
    caption: "Night market hangout",
    description: "Night group selfie with friends at a snack table, lit-up shoe stalls behind; Rabe at the back in his black Classic Mojito tee.",
    useFor: "friends, night out, food trips, hangouts",
    width: 900,
    height: 675,
  },
  {
    id: "mall-mirror",
    category: "barkada",
    src: "/argie/rabe-mall-mirror.webp",
    caption: "Mall mirror, three-man band",
    description: "Mall mirror pic with two friends all in black; Rabe on the right pulling a funny face.",
    useFor: "friends, jokes, mall trips",
    width: 900,
    height: 1200,
  },
  {
    id: "school-squad",
    category: "school",
    src: "/argie/rabe-school-squad.webp",
    caption: "Uniform squad",
    description: "Selfie with four classmates in light-green PHINMA uniforms and yellow lanyards, playful poses.",
    useFor: "classmates, school life, PHINMA",
    width: 900,
    height: 1200,
  },
  {
    id: "school-squad-2",
    category: "school",
    src: "/argie/rabe-school-squad-2.webp",
    caption: "Same squad, round two",
    description: "Another classroom selfie with the same uniformed classmates, big grins and a peace sign.",
    useFor: "classmates, school life",
    width: 900,
    height: 1200,
  },
  {
    id: "school-chaos",
    category: "school",
    src: "/argie/rabe-school-chaos.webp",
    caption: "Classroom chaos (blurry, worth it)",
    description: "Blurry, chaotic classroom selfie with classmates making wild faces.",
    useFor: "funny school moments, classmates, jokes",
    width: 900,
    height: 1200,
  },
  {
    id: "campus-crew",
    category: "school",
    src: "/argie/rabe-campus-crew.webp",
    caption: "Campus crew",
    description: "Big group selfie with schoolmates in uniforms outside campus at dusk, peace signs and smiles.",
    useFor: "schoolmates, campus life, friends",
    width: 900,
    height: 1200,
  },
  {
    id: "crim-lab",
    category: "school",
    src: "/argie/rabe-crim-lab.webp",
    caption: "Crim lab crew",
    description: "Group mirror photo in a school lab with classmates in white polos and uniforms, lab policy posters behind.",
    useFor: "criminology classes, lab work, classmates",
    width: 900,
    height: 1200,
  },
  {
    id: "crim-roleplay",
    category: "school",
    src: "/argie/rabe-crim-roleplay.webp",
    caption: "Crim class role-play (props only!)",
    description: "Classmates staging a mock drug-bust crime scene for criminology class, with a toy gun and fake props.",
    useFor: "criminology activities, role-play, school projects",
    width: 900,
    height: 1200,
  },
  {
    id: "classroom-crew",
    category: "school",
    src: "/argie/rabe-classroom-crew.webp",
    caption: "Classroom crew",
    description: "Classroom group selfie (some in nursing whites) in front of a TV showing class slides and a whiteboard.",
    useFor: "classmates, school life",
    width: 900,
    height: 1200,
  },
  {
    id: "with-little-one",
    category: "family",
    src: "/argie/rabe-with-little-one.webp",
    caption: "With the little one",
    description: "Silly selfie with a baby (possibly his niece, not confirmed): Rabe makes a goofy tongue-out face while the little one looks unimpressed.",
    useFor: "family, kids, funny moments (say 'maybe your niece', never state it as fact)",
    width: 900,
    height: 1200,
  },
];

export const PHOTO_SRCS = new Set(ARGIE_PHOTOS.map((p) => p.src));

/** Looks like Argie across his photos (only what the photos show). */
export const APPEARANCE =
  "black hair (neat short cut with a fringe, or fluffy and messy), dark brown eyes, big warm smile, a few small beauty marks, often a black 'The Classic Mojito' tee; loves goofy faces and silly filters in photos.";
