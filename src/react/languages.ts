/**
 * Language catalogue for the elvix Profile SDK.
 *
 * Codes are lowercase BCP-47: `lang` (e.g. "de", "ja") or
 * `lang-region` / `lang-script` (e.g. "pt-br", "zh-hans", "sr-cyrl")
 * where the variant carries enough product-relevant difference to
 * matter — vocabulary, orthography, or written script.
 *
 * Variant rules of thumb:
 *   - Split when speakers self-identify by the variant
 *     (pt-br vs pt-pt, es-es vs es-419, zh-hans vs zh-hant)
 *   - Keep generic when variants don't drive product decisions
 *     (English, French, German, Arabic — generic is fine even
 *     though regional dialects exist)
 *
 * Each entry carries the English name + the endonym (native
 * spelling) so the picker shows "Português (Brasil)" — speakers
 * find their own language by the spelling they recognise first.
 *
 * Curated for global coverage (~100 entries, all languages with
 * >5M speakers + a few smaller national languages). Edit this list
 * by hand rather than auto-importing CLDR — it's a load-bearing
 * dimension for downstream product gating.
 */

export type Language = {
  /** Lowercase BCP-47 code: `lang` or `lang-region` / `lang-script`. */
  code: string;
  /** English display name. */
  name: string;
  /** Endonym (native spelling), if it differs from `name`. */
  native: string;
  /**
   * Optional grouping. Variants of the same base language share a
   * `group` key so the picker can render them together (e.g. all
   * Portuguese variants under "Portuguese").
   */
  group?: string;
};

export const LANGUAGES: readonly Language[] = [
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "am", name: "Amharic", native: "አማርኛ" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "az", name: "Azerbaijani", native: "Azərbaycanca" },
  { code: "be", name: "Belarusian", native: "Беларуская" },
  { code: "bg", name: "Bulgarian", native: "Български" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "bs", name: "Bosnian", native: "Bosanski" },
  { code: "ca", name: "Catalan", native: "Català" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "cy", name: "Welsh", native: "Cymraeg" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "en", name: "English", native: "English" },
  { code: "eo", name: "Esperanto", native: "Esperanto" },
  {
    code: "es-419",
    name: "Spanish (Latin America)",
    native: "Español (Latinoamérica)",
    group: "Spanish",
  },
  { code: "es-es", name: "Spanish (Spain)", native: "Español (España)", group: "Spanish" },
  { code: "et", name: "Estonian", native: "Eesti" },
  { code: "eu", name: "Basque", native: "Euskara" },
  { code: "fa", name: "Persian", native: "فارسی" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "fr", name: "French", native: "Français" },
  { code: "fr-ca", name: "French (Canada)", native: "Français (Canada)", group: "French" },
  { code: "ga", name: "Irish", native: "Gaeilge" },
  { code: "gd", name: "Scottish Gaelic", native: "Gàidhlig" },
  { code: "gl", name: "Galician", native: "Galego" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "he", name: "Hebrew", native: "עברית" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "hr", name: "Croatian", native: "Hrvatski" },
  { code: "ht", name: "Haitian Creole", native: "Kreyòl Ayisyen" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "hy", name: "Armenian", native: "Հայերեն" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ig", name: "Igbo", native: "Asụsụ Igbo" },
  { code: "is", name: "Icelandic", native: "Íslenska" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "jv", name: "Javanese", native: "Basa Jawa" },
  { code: "ka", name: "Georgian", native: "ქართული" },
  { code: "kk", name: "Kazakh", native: "Қазақша" },
  { code: "km", name: "Khmer", native: "ខ្មែរ" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "ku", name: "Kurdish", native: "Kurdî" },
  { code: "ky", name: "Kyrgyz", native: "Кыргызча" },
  { code: "lb", name: "Luxembourgish", native: "Lëtzebuergesch" },
  { code: "lo", name: "Lao", native: "ລາວ" },
  { code: "lt", name: "Lithuanian", native: "Lietuvių" },
  { code: "lv", name: "Latvian", native: "Latviešu" },
  { code: "mg", name: "Malagasy", native: "Malagasy" },
  { code: "mi", name: "Māori", native: "Te Reo Māori" },
  { code: "mk", name: "Macedonian", native: "Македонски" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "mn", name: "Mongolian", native: "Монгол" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "mt", name: "Maltese", native: "Malti" },
  { code: "my", name: "Burmese", native: "မြန်မာ" },
  { code: "nb", name: "Norwegian Bokmål", native: "Norsk Bokmål", group: "Norwegian" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "nn", name: "Norwegian Nynorsk", native: "Nynorsk", group: "Norwegian" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "ps", name: "Pashto", native: "پښتو" },
  { code: "pt-br", name: "Portuguese (Brazil)", native: "Português (Brasil)", group: "Portuguese" },
  {
    code: "pt-pt",
    name: "Portuguese (Portugal)",
    native: "Português (Portugal)",
    group: "Portuguese",
  },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "rw", name: "Kinyarwanda", native: "Kinyarwanda" },
  { code: "si", name: "Sinhala", native: "සිංහල" },
  { code: "sk", name: "Slovak", native: "Slovenčina" },
  { code: "sl", name: "Slovenian", native: "Slovenščina" },
  { code: "sn", name: "Shona", native: "ChiShona" },
  { code: "so", name: "Somali", native: "Soomaali" },
  { code: "sq", name: "Albanian", native: "Shqip" },
  { code: "sr-cyrl", name: "Serbian (Cyrillic)", native: "Српски (ћирилица)", group: "Serbian" },
  { code: "sr-latn", name: "Serbian (Latin)", native: "Srpski (latinica)", group: "Serbian" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "tg", name: "Tajik", native: "Тоҷикӣ" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "ti", name: "Tigrinya", native: "ትግርኛ" },
  { code: "tk", name: "Turkmen", native: "Türkmen" },
  { code: "tl", name: "Filipino", native: "Filipino" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "tt", name: "Tatar", native: "Татарча" },
  { code: "ug", name: "Uyghur", native: "ئۇيغۇرچە" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "uz", name: "Uzbek", native: "Oʻzbekcha" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "xh", name: "Xhosa", native: "isiXhosa" },
  { code: "yi", name: "Yiddish", native: "ייִדיש" },
  { code: "yo", name: "Yoruba", native: "Yorùbá" },
  { code: "yue", name: "Cantonese", native: "粵語" },
  { code: "zh-hans", name: "Chinese (Simplified)", native: "中文（简体）", group: "Chinese" },
  { code: "zh-hant", name: "Chinese (Traditional)", native: "中文（繁體）", group: "Chinese" },
  { code: "zu", name: "Zulu", native: "isiZulu" },
] as const;

/** Quick lookup by lowercased code. */
const LANGUAGE_BY_CODE = new Map<string, Language>(LANGUAGES.map((l) => [l.code, l]));

export function findLanguage(code: string | null | undefined): Language | null {
  if (!code) return null;
  return LANGUAGE_BY_CODE.get(code.toLowerCase()) ?? null;
}

// ─── Proficiency levels ──────────────────────────────────────────────

export const LANGUAGE_LEVELS = ["ELEMENTARY", "INTERMEDIATE", "PROFICIENT", "NATIVE"] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

/**
 * UX metadata for each level. CEFR maps are best-effort approximations
 * (most users can't self-place on CEFR, but they know "fluent" vs
 * "conversational"). Keep the copy short — these labels appear as
 * chips inside the wizard's level chooser.
 */
export const LANGUAGE_LEVEL_META: Record<
  LanguageLevel,
  { label: string; hint: string; cefr: string }
> = {
  ELEMENTARY: {
    label: "Elementary",
    hint: "Can order coffee, follow signs, basic greetings.",
    cefr: "A1-A2",
  },
  INTERMEDIATE: {
    label: "Intermediate",
    hint: "Conversational. Work calls land, articles read fine.",
    cefr: "B1-B2",
  },
  PROFICIENT: {
    label: "Proficient",
    hint: "Fluent. Nuance, idioms, occasional accent.",
    cefr: "C1",
  },
  NATIVE: {
    label: "Native",
    hint: "Mother tongue or bilingual since childhood.",
    cefr: "C2",
  },
};

/** Cap enforced by both the wizard UI and the server schema. */
export const MAX_LANGUAGES_PER_USER = 8;
