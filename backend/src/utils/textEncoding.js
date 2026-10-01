// Reliable text decoding for uploaded CSV/TSV files, plus repair of Marathi that
// was previously stored garbled ("mojibake").
//
// Why this exists: SheetJS decodes a text file with no byte-order mark as
// Windows-1252. A UTF-8 CSV from Google Sheets, a script, or "CSV UTF-8" saved
// without a BOM therefore imports Marathi as junk (कागल -> "à¤•à¤¾à¤—à¤²"), which
// is then stored and exported exactly as garbled. Here we detect the real
// encoding ourselves and hand SheetJS an already-correct string.

const DEVANAGARI = /[\u0900-\u097F]/;

// Windows-1252 bytes 0x80-0x9F as the Unicode characters they decode to.
const CP1252_HIGH = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A],
  [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
  [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B], [0x0153, 0x9C],
  [0x017E, 0x9E], [0x0178, 0x9F],
]);

// Devanagari in UTF-8 starts with bytes E0 A4/A5, which show up as "à¤"/"à¥" when misread.
const MOJIBAKE_HINT = /\u00E0[\u00A4\u00A5]/;

/**
 * Reverses "UTF-8 bytes read as Windows-1252/Latin-1". Returns the input
 * untouched unless it clearly is that, so correct text is never altered.
 */
function fixMojibake(value) {
  if (typeof value !== "string" || !MOJIBAKE_HINT.test(value)) return value;
  const bytes = [];
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code <= 0xFF) bytes.push(code);
    else if (CP1252_HIGH.has(code)) bytes.push(CP1252_HIGH.get(code));
    else return value; // contains real non-Latin text -> not mojibake
  }
  try {
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
    return DEVANAGARI.test(fixed) ? fixed : value;
  } catch {
    return value;
  }
}

const isXlsxOrXls = (buf) =>
  (buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) || // .xlsx (zip)
  (buf.length > 3 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0); // .xls (OLE)

function swapBytes(buf) {
  const out = Buffer.from(buf);
  for (let i = 0; i + 1 < out.length; i += 2) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  return out;
}

/**
 * Decodes a text file (CSV/TSV) to a string.
 * Returns { text, encoding, unsure } - `unsure` is true when the file was not
 * valid UTF-8 and had to be read as Windows-1252 (Marathi in such a file has
 * usually already been destroyed by whatever program saved it).
 */
function decodeTextFile(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.slice(3).toString("utf8"), encoding: "utf-8-bom", unsure: false };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.slice(2).toString("utf16le"), encoding: "utf-16le", unsure: false };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: swapBytes(buf.slice(2)).toString("utf16le"), encoding: "utf-16be", unsure: false };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), encoding: "utf-8", unsure: false };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(buf), encoding: "windows-1252", unsure: true };
  }
}

// Repairs every string value in a parsed sheet row.
function fixRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[fixMojibake(k)] = fixMojibake(v);
  return out;
}

// Same pattern as a plain string (real characters, no \u escapes) for MongoDB $regex queries.
const MOJIBAKE_QUERY = "\u00E0[\u00A4\u00A5]";

module.exports = { fixMojibake, decodeTextFile, isXlsxOrXls, fixRow, MOJIBAKE_HINT, MOJIBAKE_QUERY };
