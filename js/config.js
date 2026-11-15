export const CATEGORIES = {
  substantiver: "Nouns",
  verber: "Verbs",
  adjektiver: "Adjectives",
  adverbier: "Adverbs",
  pronomener: "Pronouns",
  praepositioner: "Prepositions",
  konjunktioner: "Conjunctions",
  interjektioner: "Interjections",
  verbumsudtryk: "Verb expressions",
  andre_udtryk: "Other expressions",
  formelt_subjekt: "Formal subject",
  sporgende_hv_ord: "Question words",
  numbers: "Numbers",
  weekdays: "Days of the week",
  food: "Food",
  family: "Family",
  professions: "Professions",
  animals: "Animals",
  home: "Home and furniture",
  clothing: "Clothing",
  health: "Body and health",
  transport: "Transport",
  places: "Places and shops",
  education: "Education and language",
  nature: "Nature",
  weather: "Weather",
  time: "Time and dates",
  drinks: "Drinks",
  leisure: "Sports and leisure",
  nationalities: "Nationalities"
};

export const TOPIC_WORDS = {
  weekdays: new Set(["tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"]),
  food: new Set([
    "ananas", "appelsin", "banan", "blodpølse", "bolle", "brød", "bøf", "bønne",
    "chili", "chokolade", "chokoladekage", "croissant", "dessert", "fersken", "franskbrød",
    "frokost", "frugt", "fuldkornsbrød", "grovbolle", "grovbrød", "grøn(t)sag", "gulerod",
    "hindbær", "hvidløg", "ingrediens", "jordbær", "jordbærkage", "kage", "kalkun",
    "kartoffelsalat", "kirsebær", "kirsebærsovs", "krydderi", "kylling", "kyllingesalat",
    "lagkage", "leverpostej", "livret", "løg", "olivenolie", "ost", "pandekage", "pasta",
    "pære", "ret", "ris", "rosin", "rosinbolle", "rugbrød", "rundstykke", "rødkål",
    "salat", "salt", "sandwich", "sild", "sirup", "sovs", "tun", "vindrue",
    "wienerbrød", "yoghurt", "æble"
  ]),
  family: new Set([
    "barn", "barnebarn", "bedsteforælder", "bror", "datter", "delebarn", "enebarn",
    "far", "forælder", "fraskilt", "halvbror", "kæreste", "kone", "lillebror", "lillesøster",
    "nevø", "niece", "papfar", "parforhold", "partner", "single", "storebror", "storesøster", "svigerdatter",
    "svigerfar", "svigerinde", "svigersøn", "svoger", "søn", "søster", "tvilling"
  ]),
  professions: new Set([
    "advokat", "agent", "arkitekt", "bartender", "danser", "dj (dj)", "dyrepasser", "dyrlæge",
    "ekspedient", "elektriker", "fodboldspiller", "forfatter", "frisør", "historiker", "ingeniør",
    "instruktør", "journalist", "kok", "læge", "lærer", "oversætter", "pilot", "præst",
    "pædagog", "receptionist", "revisor", "scenograf", "skuespiller", "sygeplejerske",
    "tandlæge", "taxachauffør", "tjener", "tøjdesigner", "violinist"
  ]),
  animals: new Set([
    "elefant", "fugl", "giraf", "gravhund", "gris", "haj", "havørn", "hest",
    "hund", "høne", "kat", "kattekilling", "ko", "kronhjort", "papegøje",
    "rådyr", "skildpadde", "svin", "vovse"
  ]),
  home: new Set([
    "altan", "badekar", "baggård", "bestik", "bord", "carport", "dobbeltseng", "dør", "entré",
    "fjernsyn", "fryser", "garage", "glas", "have", "hus", "husbåd", "hylde", "kaffekop",
    "klædeskab", "kniv", "kop", "køkken", "køkkenbord", "køleskab", "loft", "parcelhus",
    "reol", "seng", "skab", "ske", "skrivebord", "sofa", "sofabord", "spisebord",
    "spisebordsstol", "stikkontakt", "stol", "tallerken", "terrasse", "tv", "udestue", "vindue", "væg"
  ]),
  clothing: new Set([
    "bluse", "par) briller", "par) bukser", "bælte", "frakke", "halstørklæde", "handske",
    "hat", "hue", "jakke", "jakkesæt", "par) jeans", "læderjakke", "lædersko", "løbesko",
    "påklædning", "regnfrakke", "skjorte", "sko", "slips", "sok", "par) solbriller",
    "støvle", "sweater", "taske", "trøje", "t-shirt"
  ]),
  health: new Set([
    "feber", "fod", "hjerte", "hovedpine", "hånd", "kind", "krop", "pille",
    "pleje", "recept", "ryg", "tand", "tandpine", "udslæt", "øje"
  ]),
  transport: new Set([
    "benzin", "bil", "billet", "bus", "cykel", "gear", "krydstogtsskib", "kørekort",
    "racercykel", "robåd", "s-tog", "sportsvogn", "taxa", "tog", "vandcykel"
  ]),
  places: new Set([
    "bank", "bar", "bibliotek", "boghandel", "butik", "by", "bygning", "café", "forretning",
    "forstad", "galleri", "genbrugsforretning", "havn", "havnebad", "hospital", "hotel",
    "kiosk", "kirke", "koncertsal", "land", "lufthavn", "natklub", "park", "rejsebureau", "restaurant", "rådhus",
    "skoforretning", "station", "storby", "tankstation", "teater", "tøjbutik", "vinbar", "værtshus"
  ]),
  education: new Set([
    "antropologi", "biologi", "blyant", "bog", "bogstav", "børnehave", "danskklasse", "elev",
    "eventyr", "fag", "fortælling", "fysik", "historie", "jura", "kapitel", "klasse", "kuglepen",
    "kursist", "kursus", "litteratur", "læreanstalt", "novelle", "ord", "ordbog", "ordsprog",
    "originalsprog", "oversættelse", "(stykke) papir", "ph.d.-studerende", "psykologi", "skole",
    "sprog", "sprogskole", "studerende", "sætning", "tavle", "tekst", "teologi", "tidsskrift",
    "uddannelse", "udtale", "undervisning", "universitet", "udvekslingsstuderende", "viskelæder",
    "vuggestue", "øvelse"
  ]),
  nature: new Set([
    "bølge", "bøgeskov", "dal", "frugttræ", "gletsjer", "græsplæne", "halvø", "hav", "jordbund", "klint",
    "klippe", "klippeø", "klit", "koral", "kyst", "kystlinje", "kyststrækning", "landskab",
    "nationalpark", "natur", "plante", "regnskov", "sandjord", "sandstrand", "skov", "slette",
    "strand", "sø", "tidevand", "træ", "vestkyst", "vulkan", "ø", "ørken"
  ]),
  weather: new Set([
    "frost", "frostvejr", "gråvejr", "hagl", "hedebølge", "nedbør", "sne", "snevejr",
    "sol", "solskin", "vejr", "vejrudsigt"
  ]),
  time: new Set([
    "aften", "arbejdsdag", "arbejdstid", "bryllupsdag", "dag", "dato", "forår", "frokostpause",
    "fødselsdag", "hverdag", "nat", "pause", "uge", "ur", "vinter", "weekend", "år"
  ]),
  drinks: new Set(["alkohol", "hvidvin", "juice", "kaffe", "kakao", "rødvin", "te", "vand", "vin", "øl"]),
  leisure: new Set([
    "band", "boksning", "cykeltur", "festival", "fodboldklub", "friluftsaktivitet", "golf",
    "guitar", "håndboldtræning", "jazzorkester", "kanotur", "kirkekor", "klaver", "koncert",
    "kor", "picnic", "rideklub", "ridning", "roklub", "roning", "rulleskøjte", "saxofon",
    "skovtur", "sport", "surfbræt", "tennis", "tennisbane", "violin"
  ]),
  nationalities: new Set([
    "australier", "brasilianer", "dansker", "grønlænder", "islænding",
    "italiener", "japaner", "kineser", "litauer", "polak", "portugiser", "russer",
    "spanier", "svensker", "tyrker"
  ])
};

const TOPIC_BY_WORD = new Map(
  Object.entries(TOPIC_WORDS).flatMap(([topic, words]) => [...words].map((word) => [word, topic]))
);

export function sectionForWord(word) {
  if (word.category === "substantiver") {
    const danish = word.danish.trim().normalize("NFC").toLocaleLowerCase("da-DK");
    return TOPIC_BY_WORD.get(danish) || word.category;
  }
  return word.category;
}

export function wordInSection(word, section) {
  return sectionForWord(word) === section;
}

export const CATEGORY_ICONS = {
  substantiver: "📦",
  verber: "🏃",
  adjektiver: "🎨",
  adverbier: "⚡",
  pronomener: "👥",
  praepositioner: "📍",
  konjunktioner: "🔗",
  interjektioner: "💬",
  verbumsudtryk: "🗣️",
  andre_udtryk: "💡",
  formelt_subjekt: "🧍",
  sporgende_hv_ord: "❓",
  numbers: "🔢",
  weekdays: "📅",
  food: "🍎",
  family: "👪",
  professions: "💼",
  animals: "🐾",
  home: "🏡",
  clothing: "👕",
  health: "🩺",
  transport: "🚆",
  places: "🏙️",
  education: "📚",
  nature: "🌳",
  weather: "🌦️",
  time: "🕒",
  drinks: "🥤",
  leisure: "⚽",
  nationalities: "🌍"
};

export const MODES = {
  multipleChoice: "Multiple choice",
  translation: "Danish to English",
  typing: "Typing",
  spelling: "Spelling",
  flashcards: "Flashcards",
  listening: "Listening",
  mixed: "Mixed practice",
  speed: "60-second challenge"
};

export const SETTINGS_DEFAULTS = {
  theme: "light",
  dailyGoal: 20,
  speechRate: 1,
  speechEngine: "piper",
  uiLanguage: "en"
};

export const XP_BY_DIFFICULTY = {
  1: 1,
  2: 1,
  3: 3,
  4: 5,
  5: 5
};

export const REVIEW_DAYS = [1, 3, 7, 14, 30];
export const MASTERED_AT = 80;
