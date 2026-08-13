/** Server-only. Never import from src/. Never mention in UI copy. */

const ALWAYS =
  /\b(?:csam|csem|pedo(?:phile|philia|philic)?s?|lolicon|shotacon|loli(?:ta)?s?|shotas?)\b/i;

const MINOR =
  /\b(?:child(?:ren)?|kids?|minors?|underage|preteens?|toddlers?|infants?)\b/i;

const SEXUAL =
  /\b(?:porn(?:ography)?|sex(?:ual(?:ly)?)?|nudes?|naked|rape[ds]?|molest(?:ed|ation|ing)?|incest)\b/i;

const PHRASE =
  /child\s*porn|kiddie\s*porn|underage\s*(?:porn|sex)|child\s*sex|sexual(?:ly)?\s*(?:exploit|abus).{0,48}(?:child|kid|minor)|(?:child|kid|minor).{0,48}sexual(?:ly)?\s*(?:exploit|abus)/i;

const YOUNG_AGE = /\b(?:[0-9]|1[0-7])\s*(?:years?|yrs?|yo)\s*old\b/i;

export function silentReject(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (ALWAYS.test(trimmed) || PHRASE.test(trimmed)) return true;
  if (MINOR.test(trimmed) && SEXUAL.test(trimmed)) return true;
  if (YOUNG_AGE.test(trimmed) && SEXUAL.test(trimmed)) return true;
  return false;
}
