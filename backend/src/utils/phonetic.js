// Script-agnostic "phonetic skeleton" keys.
//
// The same Maharashtra place is typed "Kolhapur" in one row and "कोल्हापूर" in
// another; a plain string comparison treats them as unrelated. Here both are
// reduced to the same consonant skeleton ("klhpr") so they can be grouped,
// de-duplicated and searched together without machine translation.
// Deliberately lossy: used ONLY for matching/grouping, never for display.

const DEVANAGARI = /[\u0900-\u097F]/;
const LATIN = /[A-Za-z]/;
const WORD_SPLIT = /[^\p{L}\p{M}\p{N}]+/u;

const hasDevanagari = (s) => DEVANAGARI.test(String(s || ""));
const hasLatin = (s) => LATIN.test(String(s || ""));

const DEV_CONSONANT = {
  "क": "k", "ख": "k", "ग": "g", "घ": "g", "ङ": "n",
  "च": "c", "छ": "c", "ज": "j", "झ": "j", "ञ": "n",
  "ट": "t", "ठ": "t", "ड": "d", "ढ": "d", "ण": "n",
  "त": "t", "थ": "t", "द": "d", "ध": "d", "न": "n",
  "प": "p", "फ": "p", "ब": "b", "भ": "b", "म": "m",
  "य": "", "र": "r", "ल": "l", "ळ": "l", "व": "v",
  "श": "s", "ष": "s", "स": "s", "ह": "h",
  "क़": "k", "ख़": "k", "ग़": "g", "ज़": "j", "ड़": "d", "ढ़": "d", "फ़": "p", "ऱ": "r",
};
const DEV_DIGITS = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };
const ANUSVARA = new Set(["ं", "ँ"]);
const LABIAL = new Set(["p", "b", "m"]);

function devanagariWordToKey(word) {
  // ज्ञ is pronounced "dny" in Marathi (Dnyaneshwar); -गांव/-गाव are the same suffix.
  const w = word.replace(/ज्ञ/g, "ड्न").replace(/गांव/g, "गाव").normalize("NFC");
  const chars = Array.from(w);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (DEV_DIGITS[ch]) {
      out += DEV_DIGITS[ch];
    } else if (ANUSVARA.has(ch)) {
      // Nasal sign: 'm' before lips (संभाजी -> Sambhaji), else 'n' (सांगली -> Sangli).
      let next = "";
      for (let j = i + 1; j < chars.length && !next; j++) {
        if (DEV_CONSONANT[chars[j]] !== undefined) next = DEV_CONSONANT[chars[j]];
      }
      out += LABIAL.has(next) ? "m" : "n";
    } else if (DEV_CONSONANT[ch] !== undefined) {
      out += DEV_CONSONANT[ch];
    } else if (/[0-9]/.test(ch)) {
      out += ch;
    }
    // vowels, matras, virama, nukta, visarga... are dropped
  }
  return out;
}

function latinWordToKey(word) {
  let w = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  w = w
    .replace(/gaon|gaav|gav/g, "GV") // "-gaon" == "-गाव"
    .replace(/chh|ch/g, "C")
    .replace(/sh/g, "s")
    .replace(/th/g, "t").replace(/dh/g, "d").replace(/bh/g, "b")
    .replace(/kh/g, "k").replace(/gh/g, "g").replace(/ph/g, "p").replace(/jh/g, "j")
    .replace(/ck/g, "k")
    .replace(/x/g, "ks")
    .replace(/[aeiouy]/g, "")
    .replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k").replace(/f/g, "p").replace(/c/g, "k")
    .replace(/C/g, "c").replace(/GV/g, "gv");
  return w.replace(/[^a-z0-9]/g, "");
}

const collapse = (s) => s.replace(/(.)\1+/g, "$1");

function phoneticWord(word) {
  if (!word) return "";
  return collapse(hasDevanagari(word) ? devanagariWordToKey(word) : latinWordToKey(word));
}

const words = (value) => String(value || "").split(WORD_SPLIT).filter(Boolean);

// "shivane bk" -> "svn bk"; "शिवणे बु" -> "svn b"
function phoneticKey(value) {
  return words(value).map(phoneticWord).filter(Boolean).join(" ");
}

module.exports = { hasDevanagari, hasLatin, phoneticWord, phoneticKey, words, WORD_SPLIT };
