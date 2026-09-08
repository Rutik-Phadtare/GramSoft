import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet } from "lucide-react";
import { importApi } from "../../api/importApi";
import { apiErrorMessage } from "../../api/client";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import Badge from "../../components/Badge";

const REQUIRED_COLUMNS = [
  "grampanchayat_name OR grampanchayat_name_marathi",
  "taluka OR taluka_marathi",
  "district OR district_marathi",
  "person_name OR person_name_marathi",
  "designation OR designation_marathi",
  "phone",
];
const OPTIONAL_COLUMNS = [
  "population", "number_of_households", "is_using_software", "previous_software",
  "software_start_date", "email",
];

function resultTone(value) {
  if (value === "created") return "brand";
  if (value === "matched" || value === "already_current") return "outline";
  return "neutral";
}

export default function AdminImport() {
  const { t } = useLanguage();
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleUpload() {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const data = await importApi.upload(file);
      setResult(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("bulkImport")}
        title={t("importTitle")}
        description={t("importDesc")}
      />

      <div className="card p-6 max-w-2xl mb-6">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
          }}
          className="border-2 border-dashed border-line rounded-xl py-10 flex flex-col items-center gap-2 cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors"
        >
          <UploadCloud className="h-8 w-8 text-ink-muted" strokeWidth={1.5} />
          {file ? (
            <p className="text-sm font-medium text-ink flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> {file.name}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">{t("chooseFileOrDrag")}</p>
              <p className="text-xs text-ink-muted">.xlsx, .xls, or .csv</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        {error && <div className="mt-4 rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}

        <button onClick={handleUpload} disabled={!file || uploading} className="btn btn-primary w-full mt-4">
          {uploading ? t("importing") : t("import")}
        </button>

        <details className="mt-4 text-xs text-ink-muted">
          <summary className="cursor-pointer font-medium">{t("expectedColumns")}</summary>
          <p className="mt-2 font-semibold text-ink">Required on every row</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {REQUIRED_COLUMNS.map((c) => (
              <code key={c} className="font-mono bg-signal-50 text-signal-700 rounded px-1.5 py-0.5">{c}</code>
            ))}
          </div>
          <p className="mt-3">
            English and Marathi columns can be provided together, or Marathi-only. For bilingual fields, at least one
            of the two language columns must contain a value. When only Marathi is supplied, the importer keeps the
            Marathi value in the existing canonical field as well, so the rest of the application continues to work.
          </p>
          <p className="mt-3 font-semibold text-ink">Optional</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {OPTIONAL_COLUMNS.map((c) => (
              <code key={c} className="font-mono bg-ink/5 rounded px-1.5 py-0.5">{c}</code>
            ))}
          </div>
          <p className="mt-2">
            Column names are matched case-insensitively. A row missing any required column is skipped (with
            an error shown below) rather than failing the whole import. The same <code className="font-mono">person_name</code>/
            <code className="font-mono">person_name_marathi</code>/<code className="font-mono">phone</code> can appear on multiple rows against different Grampanchayats -
            that's expected when one person is posted to more than one place, and won't create a duplicate contact.
          </p>
        </details>
      </div>

      {result && (
        <div className="card p-5">
          <h2 className="font-display text-sm font-semibold text-ink mb-3">{t("importSummary")}</h2>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            <SummaryStat label="Rows" value={result.totalRows} />
            <SummaryStat label="GPs created" value={result.summary.gramPanchayatsCreated} />
            <SummaryStat label="GPs matched" value={result.summary.gramPanchayatsMatched} />
            <SummaryStat label="Contacts created" value={result.summary.personsCreated} />
            <SummaryStat label="Postings created" value={result.summary.assignmentsCreated} />
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-muted border-b border-line">
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">{t("grampanchayat")}</th>
                  <th className="px-3 py-2">{t("contact")}</th>
                  <th className="px-3 py-2">Posting</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.row} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-ink-muted">{row.row}</td>
                    <td className="px-3 py-2"><Badge tone={resultTone(row.gramPanchayat)}>{row.gramPanchayat}</Badge></td>
                    <td className="px-3 py-2"><Badge tone={resultTone(row.person)}>{row.person}</Badge></td>
                    <td className="px-3 py-2"><Badge tone={resultTone(row.assignment)}>{row.assignment}</Badge></td>
                    <td className="px-3 py-2 text-signal-600">{row.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className="rounded-lg bg-canvas px-3 py-2.5 text-center">
      <p className="font-display text-lg font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-ink-muted">{label}</p>
    </div>
  );
}
