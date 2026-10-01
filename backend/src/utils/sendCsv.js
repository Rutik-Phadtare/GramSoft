// Sends a CSV that opens correctly in Excel.
//
// Excel decides a .csv's encoding from a leading byte-order mark. Without it, it
// assumes Windows-1252, so English survives but Marathi (Devanagari) turns into
// junk like "à¤•à¥‹à¤²à¥à¤¹...". The UTF-8 BOM (\uFEFF) makes Excel read it as UTF-8.
// Google Sheets, LibreOffice and Numbers ignore the BOM, so it is safe everywhere.
function sendCsv(res, filename, csv) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(Buffer.from("\uFEFF" + csv, "utf8"));
}

module.exports = { sendCsv };
