const ZODIAC_ICON_NAMES = Object.freeze({
  koç: "zodiac-aries",
  koc: "zodiac-aries",
  boğa: "zodiac-taurus",
  boga: "zodiac-taurus",
  ikizler: "zodiac-gemini",
  yengeç: "zodiac-cancer",
  yengec: "zodiac-cancer",
  aslan: "zodiac-leo",
  başak: "zodiac-virgo",
  basak: "zodiac-virgo",
  terazi: "zodiac-libra",
  akrep: "zodiac-scorpio",
  yay: "zodiac-sagittarius",
  oğlak: "zodiac-capricorn",
  oglak: "zodiac-capricorn",
  kova: "zodiac-aquarius",
  balık: "zodiac-pisces",
  balik: "zodiac-pisces",
  aries: "zodiac-aries",
  taurus: "zodiac-taurus",
  gemini: "zodiac-gemini",
  cancer: "zodiac-cancer",
  leo: "zodiac-leo",
  virgo: "zodiac-virgo",
  libra: "zodiac-libra",
  scorpio: "zodiac-scorpio",
  sagittarius: "zodiac-sagittarius",
  capricorn: "zodiac-capricorn",
  aquarius: "zodiac-aquarius",
  pisces: "zodiac-pisces",
});

export function getZodiacIconName(value) {
  const key = String(value ?? "").trim().toLocaleLowerCase("tr-TR");
  return ZODIAC_ICON_NAMES[key] || "star";
}
