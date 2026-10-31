const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** ইংরেজি সংখ্যা → বাংলা সংখ্যা */
export function bn(value) {
  return String(value ?? "").replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** মানচিত্রের টাইল */
export const CATEGORY_LABEL = {
  heritage: "ঐতিহাসিক",
  architecture: "স্থাপত্য",
  museum: "জাদুঘর",
  nature: "প্রকৃতি",
  river: "নদী ও ঘাট",
  beach: "সমুদ্র ও দ্বীপ",
  culture: "সংস্কৃতি",
};

export const CATEGORY_ORDER = [
  "nature",
  "heritage",
  "beach",
  "river",
  "museum",
  "architecture",
  "culture",
];

export function categoryLabel(key) {
  return CATEGORY_LABEL[key] || key || "অন্যান্য";
}

export function bnDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return bn(d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));
}

export function bnDateTime(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const date = bn(d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));
  const time = bn(
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
  );
  return `${date} · ${time}`;
}

export function plural(count, word) {
  return `${bn(count)} ${word}`;
}
