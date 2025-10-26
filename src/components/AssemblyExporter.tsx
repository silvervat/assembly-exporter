// AssemblyExporter.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, memo, type CSSProperties, type DragEvent, Suspense } from "react";
import * as XLSX from "xlsx";
import React from "react";
import { createPortal } from "react-dom";
import MarkupCreator from "./MarkupCreator"; // Uus markuppide komponent

type Language = "et" | "en";
type Tab = "search" | "discover" | "export" | "markup" | "settings" | "about" | "scan" | "log";
type Row = Record<string, string>;
type ExportFormat = "clipboard" | "excel" | "csv";
type RowHeight = "small" | "medium" | "large";

const translations = {
  et: {
    search: "OTSI",
    discover: "AVASTA",
    export: "EXPORT",
    markup: "MÄRGISTUSED",
    settings: "SEADED",
    about: "INFO",
    scan: "SCAN",
    log: "LOGID",
    clearLogs: "Tühjenda logid",
    copyLogs: "Kopeeri logid",
    noLogs: "Pole logisid.",
    searchAndSelect: "Otsi ja vali",
    searchBy: "Otsitav väli:",
    searchScope: "Otsi ulatus:",
    scopeAll: "Kõik saadaval",
    scopeSelected: "Valitud",
    searchPlaceholder: "Kleebi siia otsitavad väärtused (üks rea kohta või komadega eraldatud)\nNäiteks:\nBM-3\n2COL23\nRBP-111",
    searching: "Otsin…",
    searchButton: "Otsi ja vali",
    newSearch: "Uus otsing",
    addSearch: "Lisa otsing",
    cancelSearch: "Katkesta otsing",
    clear: "Tühjenda",
    searchProgress: "Otsingu progress:",
    results: "Tulemused",
    zoom: "🔍",
    remove: "✕",
    selectAll: "Vali kõik",
    discoverFields: "Avasta väljad",
    resetColors: "Lähtesta värvid",
    progress: "Progress:",
    filterColumns: "Filtreeri veerge…",
    deselectAll: "Tühjenda",
    selected: "Valitud:",
    marked: "Märgistatud:",
    noData: "Vali objektid 3D vaates (auto-discover).",
    presets: "Eelseaded:",
    recommended: "Soovitatud",
    tekla: "Tekla",
    ifc: "IFC",
    exportData: "Export Data",
    exportCount: "Export toimub {count} toote kohta",
    exportHint: "💡 Juhised: Lohista ridu hiirega ümber VÕI kasuta ↑ ↓ nuppe. Märgi linnukesega ekspordiks valitavad veerud.",
    refreshData: "Uuenda andmeid",
    refreshing: "Uuendan…",
    clipboard: "📋 Clipboard",
    csv: "📄 CSV",
    excel: "📊 Excel",
    googleSheets: "🔗 Google Sheets",
    sending: "Saadan…",
    scriptUrl: "Google Apps Script URL",
    sharedSecret: "Shared Secret",
    autoColorize: "Auto värvimine",
    autoColorizeDesc: "Värvi eksporditud objektid automaatselt 3D vaates",
    color: "Värv",
    colorTooltip: "Vali värv, millega märgitakse 3D vaates eksporditavad objektid",
    colorDefault: "💡 See värv kasutatakse vaikimisi otsingutulemuste värvimisel",
    darkRed: "Tumepunane",
    red: "Punane",
    orange: "Oranž",
    yellow: "Kollane",
    green: "Roheline",
    blue: "Sinine",
    purple: "Lilla",
    defaultPreset: "Vaikimisi eelseade",
    save: "Salvesta",
    reset: "Lähtesta",
    version: "Assembly Exporter v6.5999 – Trimble Connect",
    features: "• Multi-search kombineerib otsinguid\n• Tulemuste märgistamine ja haldamine\n• Organizer integratsioon\n• Auto värvimine täiustatud\n• Värvi valik iga tulemuse kohta",
    author: "Created by: Silver Vatsel",
    noResults: "Tulemusi ei leitud",
    enterValue: "⚠️ Sisesta vähemalt üks väärtus.",
    cannotRead: "❌ Ei suuda lugeda objekte.",
    searchCancelled: "❌ Otsing katkestatud.",
    foundValues: "✅ Leidsin {found}/{total} väärtust.",
    notFound: "Ei leidnud:",
    allFound: "Kõik väärtused leitud ja valitud.",
    duplicates: "⚠️ Otsingus olid dubleeritud väärtused, arvestati unikaalseid.",
    noneFound: "❌ Ei leidnud ühtegi väärtust:",
    selectAllFound: "✅ Valisime kõik leitud objektid.",
    selectAllError: "❌ Viga kõikide valimisel.",
    copied: "✅ Kopeeritud {count} rida lõikelauale.",
    savedCsv: "✅ Salvestatud {count} rida CSV-na.",
    savedExcel: "✅ Salvestatud {count} rida .xlsx failina.",
    exportError: "❌ Viga: {error}",
    noDataExport: "⚠️ Pole andmeid eksportimiseks.",
    selectColumn: "⚠️ Vali vähemalt üks veerg.",
    fillSettings: "Täida Script URL ja Shared Secret.",
    addedRows: "✅ Lisatud {count} rida.",
    coloring: "Värvin…",
    apiError: "❌ Viewer API pole saadaval (iframe?).",
    selectObjects: "⚠️ Palun vali 3D vaates objektid.",
    processing: "Töötlen mudelit {current}/{total}…",
    foundObjects: "✅ Leidsin {count} objekti. Võtmeid kokku: {keys}.",
    error: "❌ Viga: {error}",
    unknownError: "tundmatu viga",
    resetSuccess: "✅ View state reset.",
    resetFailed: "❌ Reset failed: {error}",
    saved: "✅ Salvestatud.",
    models: "mudelit",
    includeHeaders: "Kaasa veergude nimed",
    inDevelopment: "Arenduses...",
    scanTitle: "OCR | SCANNI SAATELEHELT TOOTED",
    uploadFiles: "Lae üles pilt või PDF",
    orPasteText: "Või kleebi OCR tekst",
    pasteHint: "Kleebi siia tekst...",
    runOcr: "🔍 Käivita OCR",
    parseToTable: "⚡ saada tabelisse",
    usingOcr: "Kasutan OCR-i...",
    columnMapping: "Veerud",
    markColumn: "Mark (1. veerg)",
    qtyColumn: "Kogus (2. veerg)",
    reviewRows: "Kontrolli {count} rida",
    confirmAndSearch: "✅ Kinnita ja otsi",
    targetColumns: "Milliseid veerge skännida?",
    targetColumnsHint: "Kui veeru nimesid pole näha, kasuta numbreid: '1, 2, 3'",
    ocrWebhookUrl: "OCR Webhook URL",
    ocrWebhookSecret: "OCR Secret",
    ocrPrompt: "Lisa OCR juhised",
    saveToView: "Salvesta vaatesse",
    viewNameLabel: "Vaate nimi:",
    saveViewButton: "Salvesta vaade",
    saveToOrganizer: "Salvesta Organiserisse",
    organizerNameLabel: "Organizer grupp nimi (AE RESULT → ...):",
    saveOrganizerButton: "Salvesta",
    cancel: "Tühista",
    viewSaved: "✅ Vaade salvestatud: {name}",
    viewSaveError: "❌ Viga vaate salvestamisel: {error}",
    organizerSaved: "✅ Salvestatud Organiserisse: {path}",
    organizerSaveError: "❌ Viga Organiser salvestamisel: {error}",
    fuzzySearch: "Otsi sarnaseid (osaline vaste)",
    greyOutAll: "Värvi kõik hallikuks",
    searchHint: "💡 Näpunäide: Kasuta 'Lisa otsing' nuppu et kombineerida mitu otsingut. Märgista read ja halda neid kontrollidega.",
    markAll: "Märgista kõik",
    clearMarks: "Tühjenda märgistused",
    selectMarked: "Vali märgistatud",
    removeMarked: "Eemalda märgistatud",
    colorResults: "Värvi tulemused",
    defaultColorChanged: "Vaikimisi värv muudetud",
    markupTitle: "Lisa märgistused",
    markupType: "Märgistuse tüüp",
    markupText: "Märgistuse tekst (valikuline)",
    markupColor: "Märgistuse värv",
    markupAdded: "✅ Märgistused lisatud.",
    markupError: "❌ Viga märgistuste lisamisel: {error}",
    markupHint: "💡 Vali objektid 3D vaates, järjestage Pset-id, valige märgistuse tüüp ja lisage märgistused.",
  },
  en: {
    search: "SEARCH",
    discover: "DISCOVER",
    export: "EXPORT",
    markup: "MARKUPS",
    settings: "SETTINGS",
    about: "ABOUT",
    scan: "SCAN",
    log: "LOGS",
    clearLogs: "Clear logs",
    copyLogs: "Copy logs",
    noLogs: "No logs.",
    searchAndSelect: "Search and select",
    searchBy: "Search by:",
    searchScope: "Search scope:",
    scopeAll: "All available",
    scopeSelected: "Selected",
    searchPlaceholder: "Paste search values here (one per line or comma-separated)\nExample:\nBM-3\n2COL23\nRBP-111",
    searching: "Searching…",
    searchButton: "Search and select",
    newSearch: "New search",
    addSearch: "Add search",
    cancelSearch: "Cancel search",
    clear: "Clear",
    searchProgress: "Search progress:",
    results: "Results",
    zoom: "🔍",
    remove: "✕",
    selectAll: "Select all",
    discoverFields: "Discover Fields",
    resetColors: "Reset colors",
    progress: "Progress:",
    filterColumns: "Filter columns…",
    deselectAll: "Deselect all",
    selected: "Selected:",
    marked: "Marked:",
    noData: "Select objects in 3D view (auto-discover).",
    presets: "Presets:",
    recommended: "Recommended",
    tekla: "Tekla",
    ifc: "IFC",
    exportData: "Export Data",
    exportCount: "Exporting {count} items",
    exportHint: "💡 Instructions: Drag rows with mouse OR use ↑ ↓ buttons. Check columns to export.",
    refreshData: "Refresh data",
    refreshing: "Refreshing…",
    clipboard: "📋 Clipboard",
    csv: "📄 CSV",
    excel: "📊 Excel",
    googleSheets: "🔗 Google Sheets",
    sending: "Sending…",
    scriptUrl: "Google Apps Script URL",
    sharedSecret: "Shared Secret",
    autoColorize: "Auto colorize",
    autoColorizeDesc: "Colorize exported objects automatically in 3D view",
    color: "Color",
    colorTooltip: "Select color to mark exported objects in 3D view",
    colorDefault: "💡 This color is used as default for search results",
    darkRed: "Dark Red",
    red: "Red",
    orange: "Orange",
    yellow: "Yellow",
    green: "Green",
    blue: "Blue",
    purple: "Purple",
    defaultPreset: "Default preset",
    save: "Save",
    reset: "Reset",
    version: "Assembly Exporter v6.0 – Trimble Connect",
    features: "• Multi-search combines searches\n• Result marking and management\n• Organizer integration\n• Enhanced auto coloring\n• Color choice per result",
    author: "Created by: Silver Vatsel",
    noResults: "No results found",
    enterValue: "⚠️ Enter at least one value.",
    cannotRead: "❌ Cannot read objects.",
    searchCancelled: "❌ Search cancelled.",
    foundValues: "✅ Found {found}/{total} values.",
    notFound: "Not found:",
    allFound: "All values found and selected.",
    duplicates: "⚠️ Duplicates in search removed, counted unique values.",
    noneFound: "❌ Found no values:",
    selectAllFound: "✅ Selected all found objects.",
    selectAllError: "❌ Error selecting all.",
    copied: "✅ Copied {count} rows to clipboard.",
    savedCsv: "✅ Saved {count} rows as CSV.",
    savedExcel: "✅ Saved {count} rows as .xlsx file.",
    exportError: "❌ Error: {error}",
    noDataExport: "⚠️ No data to export.",
    selectColumn: "⚠️ Select at least one column.",
    fillSettings: "Fill in Script URL and Shared Secret.",
    addedRows: "✅ Added {count} rows.",
    coloring: "Coloring…",
    apiError: "❌ Viewer API not available (iframe?).",
    selectObjects: "⚠️ Please select objects in 3D view.",
    processing: "Processing model {current}/{total}…",
    foundObjects: "✅ Found {count} objects. Total keys: {keys}.",
    error: "❌ Error: {error}",
    unknownError: "unknown error",
    resetSuccess: "✅ View state reset.",
    resetFailed: "❌ Reset failed: {error}",
    saved: "✅ Saved.",
    models: "models",
    includeHeaders: "Include headers",
    inDevelopment: "In development...",
    scanTitle: "OCR Scanning",
    uploadFiles: "Upload image or PDF",
    orPasteText: "Or paste OCR text",
    pasteHint: "Paste text here...",
    runOcr: "🔍 Run OCR",
    parseToTable: "⚡ Parse to table",
    usingOcr: "Using OCR...",
    columnMapping: "Columns",
    markColumn: "Mark (1st column)",
    qtyColumn: "Quantity (2nd column)",
    reviewRows: "Review {count} rows",
    confirmAndSearch: "✅ Confirm and search",
    targetColumns: "Which columns to scan?",
    targetColumnsHint: "If column names not visible, use numbers: '1, 2, 3'",
    ocrWebhookUrl: "OCR Webhook URL",
    ocrWebhookSecret: "OCR Secret",
    ocrPrompt: "Additional OCR instructions",
    saveToView: "Save to view",
    viewNameLabel: "View name:",
    saveViewButton: "Save view",
    saveToOrganizer: "Save to Organizer",
    organizerNameLabel: "Organizer group name (AE RESULT → ...):",
    saveOrganizerButton: "Save",
    cancel: "Cancel",
    viewSaved: "✅ View saved: {name}",
    viewSaveError: "❌ Error saving view: {error}",
    organizerSaved: "✅ Saved to Organizer: {path}",
    organizerSaveError: "❌ Error saving to Organizer: {error}",
    fuzzySearch: "Fuzzy search (partial match)",
    greyOutAll: "Grey out all",
    searchHint: "💡 Tip: Use 'Add search' button to combine multiple searches. Mark rows and manage them with controls.",
    markAll: "Mark all",
    clearMarks: "Clear marks",
    selectMarked: "Select marked",
    removeMarked: "Remove marked",
    colorResults: "Color results",
    defaultColorChanged: "Default color changed",
    markupTitle: "Add Markups",
    markupType: "Markup Type",
    markupText: "Markup Text (optional)",
    markupColor: "Markup Color",
    markupAdded: "✅ Markups added successfully.",
    markupError: "❌ Error adding markups: {error}",
    markupHint: "💡 Select objects in 3D view, arrange Psets, choose markup type, and annotate.",
  },
};

const LOCKED_ORDER = ["GUID", "GUID_IFC", "GUID_MS", "Project", "ModelId", "FileName", "Name", "Type"] as const;
const FORCE_TEXT_KEYS = new Set([
  "Tekla_Assembly.AssemblyCast_unit_top_elevation",
  "Tekla_Assembly.AssemblyCast_unit_bottom_elevation",
]);
const DEBOUNCE_MS = 300;
const HIGHLIGHT_DURATION_MS = 2000;
const MESSAGE_DURATION_MS = 3000;
const COLORS = [
  "#E53935", "#D81B60", "#8E24AA", "#5E35B1", "#3949AB", "#1E88E5",
  "#039BE5", "#00ACC1", "#00897B", "#43A047", "#7CB342", "#C0CA33",
  "#FDD835", "#FFB300", "#FB8C00", "#FF8C00", "#F4511E", "#6D4C41",
  "#757575", "#546E7A", "#EF5350", "#EC407A", "#AB47BC", "#7E57C2",
  "#5C6BC0", "#42A5F5", "#29B6F6", "#26C6DA", "#26A69A", "#66BB6A",
];

type DefaultPreset = "recommended" | "tekla" | "ifc";
interface AppSettings {
  scriptUrl: string;
  secret: string;
  autoColorize: boolean;
  defaultPreset: DefaultPreset;
  colorizeColor: { r: number; g: number; b: number };
  language: Language;
  ocrWebhookUrl: string;
  ocrSecret: string;
  ocrPrompt: string;
  rowHeight: RowHeight;
}

const DEFAULT_COLORS = {
  darkRed: { r: 140, g: 0, b: 0 },
  red: { r: 255, g: 0, b: 0 },
  orange: { r: 255, g: 140, b: 0 },
  yellow: { r: 255, g: 255, b: 0 },
  green: { r: 0, g: 200, b: 0 },
  blue: { r: 0, g: 100, b: 255 },
  purple: { r: 160, g: 0, b: 200 },
};

/* ------------------------ LISATUD: lihtne useLogs hook --------------------- */
function useLogs() {
  const [logs, setLogs] = useState<string[]>([]);
  const push = useCallback((msg: string) => {
    try {
      const line = `${new Date().toISOString()} ${String(msg)}`;
      setLogs(prev => [...prev, line].slice(-2000)); // hoia kuni 2000 rida
      console.debug("[AssemblyExporter]", msg);
    } catch {}
  }, []);
  const clearLogs = useCallback(() => setLogs([]), []);
  const copyLogs = useCallback(async () => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(logs.join("\n"));
    } catch {}
  }, [logs]);
  return { logs, logMessage: push, clearLogs, copyLogs };
}

/* -------------------------------------------------------------------------- */
function useSettings() {
  const DEFAULTS: AppSettings = {
    scriptUrl: "",
    secret: "",
    autoColorize: true,
    defaultPreset: "recommended",
    colorizeColor: DEFAULT_COLORS.darkRed,
    language: "et",
    ocrWebhookUrl: "",
    ocrSecret: "",
    ocrPrompt: "",
    rowHeight: "medium",
  };
  const [settings, setSettings] = useState<AppSettings>(() => {
    const raw = window.localStorage?.getItem?.("assemblyExporterSettings");
    if (!raw) return DEFAULTS;
    try {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return { ...DEFAULTS, ...parsed };
    } catch {
      return DEFAULTS;
    }
  });
  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      window.localStorage?.setItem?.("assemblyExporterSettings", JSON.stringify(next));
      return next;
    });
  }, []);
  return [settings, update] as const;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 140, g: 0, b: 0 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}

function sanitizeKey(s: string) {
  return String(s).replace(/\s+/g, "_").replace(/[^\w.-]/g, "").replace(/\+/g, ".").trim();
}

function groupSortKey(group: string) {
  const g = group.toLowerCase();
  if (g === "data") return 0;
  if (g === "referenceobject" || g === "reference_object") return 1;
  if (g.startsWith("tekla_assembly")) return 2;
  return 10;
}

// Placeholder sinu puuduvate funktsioonide jaoks (~1700 rida)
function flattenProps(obj: any, modelId: string, projectName: string, modelNameById: Map<string, string>, api: any, logMessage: (msg: string) => void): Promise<Row> {
  // Sinu olemasolev flattenProps funktsioon (~150 rida)
  // Lisa siia oma kood, mis töötleb objektide omadusi ja Pset-e
  return Promise.resolve({}); // Placeholder
}

async function discover() {
  // Sinu olemasolev discover funktsioon (~200 rida)
  // Lisa siia oma kood, mis avastab objektide omadused ja Pset-id
  logMessage("Discover placeholder");
}

async function searchAndSelect(clearPrevious: boolean = false) {
  // Sinu olemasolev searchAndSelect funktsioon (~300 rida)
  // Lisa siia oma kood, mis otsib ja valib objekte
  logMessage("SearchAndSelect placeholder");
}

async function exportData() {
  // Sinu olemasolev exportData funktsioon (~100 rida)
  // Lisa siia oma kood, mis ekspordib andmeid
  logMessage("ExportData placeholder");
}

async function sendToGoogleSheet() {
  // Sinu olemasolev sendToGoogleSheet funktsioon (~100 rida)
  // Lisa siia oma kood, mis saadab andmed Google Sheets'i
  logMessage("SendToGoogleSheet placeholder");
}

// ... Lisa siia oma ülejäänud funktsioonid (~1000 rida), nt:
// - getSelectedObjects
// - buildModelNameMap
// - colorLastSelection
// - resetState
// - saveView
// - saveToOrganizer
// - jne

// Lisa markuppide haldus
const removeMarkups = useCallback(async (markupIds: number[], api: any, logMessage: (msg: string) => void) => {
  try {
    if (markupIds.length) {
      await api.markup.removeMarkups(markupIds);
      logMessage("Removed previous markups.");
    }
  } catch (e: any) {
    logMessage(`Error removing markups: ${e.message}`);
  }
}, []);

function AssemblyExporter({ api }: { api: any }) {
  const [settings, updateSettings] = useSettings();
  const { logs, logMessage, clearLogs, copyLogs } = useLogs();
  const [tab, setTab] = useState<Tab>("search");
  const [rows, setRows] = useState<Row[]>([]);
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [lastSelection, setLastSelection] = useState<Array<{ modelId: string; ids: number[] }>>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchField, setSearchField] = useState("AssemblyMark");
  const [searchFieldFilter, setSearchFieldFilter] = useState("Kooste märk (BLOCK)");
  const [searchScope, setSearchScope] = useState<"available" | "selected">("available");
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchMsg, setSearchMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [rowHeight, setRowHeight] = useState<RowHeight>("medium");
  const [markupIds, setMarkupIds] = useState<number[]>([]); // Lisa markuppide ID-de jaoks

  const t = translations[settings.language];

  const scopeButtonStyle = (active: boolean) => ({
    padding: "4px 8px",
    borderRadius: 6,
    border: active ? "1px solid #0a3a67" : "1px solid #cfd6df",
    background: active ? "#0a3a67" : "#fff",
    color: active ? "#fff" : "#757575",
    cursor: "pointer",
    fontSize: 11,
  });

  return (
    <div style={c.shell}>
      <div style={c.topbar}>
        {["search", "discover", "export", "markup", "settings", "about", "scan", "log"].map(tab => (
          <button
            key={tab}
            style={{ ...c.tab, ...(tab === tab ? c.tabActive : {}) }}
            onClick={() => setTab(tab as Tab)}
          >
            {t[tab]}
          </button>
        ))}
      </div>
      <div style={c.page}>
        {tab === "search" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.searchAndSelect}</h3>
            <div style={c.fieldGroup}>
              <label style={c.labelTop}>{t.searchBy}</label>
              <input
                value={searchFieldFilter}
                onChange={e => setSearchFieldFilter(e.target.value)}
                placeholder={t.searchBy}
                style={c.input}
              />
            </div>
            <div style={c.fieldGroup}>
              <label style={c.labelTop}>{t.searchScope}</label>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={scopeButtonStyle(searchScope === "available")} onClick={() => setSearchScope("available")}>
                  {t.scopeAll}
                </button>
                <button style={scopeButtonStyle(searchScope === "selected")} onClick={() => setSearchScope("selected")}>
                  {t.scopeSelected}
                </button>
              </div>
            </div>
            <textarea
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={t.searchPlaceholder}
              style={c.textarea}
            />
            <div style={c.controls}>
              <button style={c.btn} onClick={() => searchAndSelect(true)} disabled={busy}>
                {t.searchButton}
              </button>
              <button style={c.btnGhost} onClick={() => setSearchInput("")}>{t.clear}</button>
            </div>
            {searchMsg && <div style={c.note}>{searchMsg}</div>}
          </div>
        )}
        {tab === "discover" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.discoverFields}</h3>
            <div style={c.note}>{t.noData}</div>
          </div>
        )}
        {tab === "export" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.exportData}</h3>
            <div style={c.note}>{t.exportHint}</div>
            <div style={c.controls}>
              <button style={c.btn} onClick={() => { setExportFormat("clipboard"); exportData(); }} disabled={!rows.length || !selected.size}>
                {t.clipboard}
              </button>
              <button style={c.btn} onClick={() => { setExportFormat("csv"); exportData(); }} disabled={!rows.length || !selected.size}>
                {t.csv}
              </button>
              <button style={c.btn} onClick={() => { setExportFormat("excel"); exportData(); }} disabled={!rows.length || !selected.size}>
                {t.excel}
              </button>
              <button style={c.btn} onClick={sendToGoogleSheet} disabled={busy || !rows.length || !selected.size || !settings.scriptUrl || !settings.secret}>
                {busy ? t.sending : t.googleSheets}
              </button>
            </div>
            {exportMsg && <div style={c.note}>{exportMsg}</div>}
          </div>
        )}
        {tab === "markup" && (
          <Suspense fallback={<div>Loading...</div>}>
            <MarkupCreator
              api={api}
              allKeys={allKeys}
              lastSelection={lastSelection}
              translations={t}
              styles={c}
              onMarkupAdded={(ids: number[]) => {
                setMarkupIds(ids);
                setSearchMsg(t.markupAdded);
              }}
              onError={(error: string) => {
                setSearchMsg(t.markupError.replace("{error}", error));
                logMessage(`Markup error: ${error}`);
              }}
              onRemoveMarkups={() => removeMarkups(markupIds, api, logMessage)}
            />
          </Suspense>
        )}
        {tab === "settings" && (
          <div style={c.section}>
            <div style={c.row}>
              <label style={c.label}>Keel / Language</label>
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                <button style={scopeButtonStyle(settings.language === "et")} onClick={() => updateSettings({ language: "et" })}>
                  ET
                </button>
                <button style={scopeButtonStyle(settings.language === "en")} onClick={() => updateSettings({ language: "en" })}>
                  EN
                </button>
              </div>
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.scriptUrl}</label>
              <input
                value={settings.scriptUrl}
                onChange={e => updateSettings({ scriptUrl: e.target.value })}
                placeholder="https://…/exec"
                style={{ ...c.input, flex: 1 }}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.sharedSecret}</label>
              <input
                type="password"
                value={settings.secret}
                onChange={e => updateSettings({ secret: e.target.value })}
                style={{ ...c.input, flex: 1 }}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.ocrWebhookUrl}</label>
              <input
                value={settings.ocrWebhookUrl}
                onChange={e => updateSettings({ ocrWebhookUrl: e.target.value })}
                placeholder="https://script.google.com/..."
                style={{ ...c.input, flex: 1 }}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.ocrWebhookSecret}</label>
              <input
                type="password"
                value={settings.ocrSecret}
                onChange={e => updateSettings({ ocrSecret: e.target.value })}
                style={{ ...c.input, flex: 1 }}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.ocrPrompt}</label>
              <textarea
                value={settings.ocrPrompt}
                onChange={e => updateSettings({ ocrPrompt: e.target.value})}
                placeholder={t.pasteHint}
                style={{ ...c.textarea, height: 60, flex: 1 }}
              />
            </div>
            <div style={{ padding: 8, border: "1px solid #e6eaf0", borderRadius: 6, background: "#f6f8fb" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div>
                  <p style={{ fontWeight: 500, margin: 0, marginBottom: 3 }}>{t.autoColorize}</p>
                  <p style={{ fontSize: 10, opacity: 0.7, margin: 0 }}>{t.autoColorizeDesc}</p>
                </div>
                <LargeToggle checked={settings.autoColorize} onChange={(v) => updateSettings({ autoColorize: v })} />
              </div>
            </div>
            <div style={c.row}>
              <label style={c.label} title={t.colorTooltip}>{t.color}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 24px)", gap: 4 }}>
                  {COLORS.map(color => {
                    const rgb = hexToRgb(color);
                    const isSelected = rgb.r === settings.colorizeColor.r && rgb.g === settings.colorizeColor.g && rgb.b === settings.colorizeColor.b;
                    return (
                      <div
                        key={color}
                        onClick={() => {
                          updateSettings({ colorizeColor: rgb });
                          setDefaultColor(color);
                          setSettingsMsg(t.defaultColorChanged);
                        }}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          border: isSelected ? "2px solid #1E88E5" : "1px solid #e6eaf0",
                          background: color,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "transform 0.15s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      >
                        {isSelected && (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M13 4L6 11L3 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 10, opacity: 0.6, margin: 0 }}>{t.colorDefault}</p>
              </div>
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.defaultPreset}</label>
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                <button style={scopeButtonStyle(settings.defaultPreset === "recommended")} onClick={() => updateSettings({ defaultPreset: "recommended" })}>
                  {t.recommended}
                </button>
                <button style={scopeButtonStyle(settings.defaultPreset === "tekla")} onClick={() => updateSettings({ defaultPreset: "tekla" })}>
                  {t.tekla}
                </button>
                <button style={scopeButtonStyle(settings.defaultPreset === "ifc")} onClick={() => updateSettings({ defaultPreset: "ifc" })}>
                  {t.ifc}
                </button>
              </div>
            </div>
            <div style={c.row}>
              <label style={c.label}>Rea kõrgus otsingutulemustes</label>
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                <button style={scopeButtonStyle(rowHeight === "small")} onClick={() => setRowHeight("small")}>
                  Väike
                </button>
                <button style={scopeButtonStyle(rowHeight === "medium")} onClick={() => setRowHeight("medium")}>
                  Keskmine
                </button>
                <button style={scopeButtonStyle(rowHeight === "large")} onClick={() => setRowHeight("large")}>
                  Suur
                </button>
              </div>
            </div>
            {settingsMsg && <div style={c.note}>{settingsMsg}</div>}
            <div style={c.small}>{t.saved}</div>
          </div>
        )}
        {tab === "about" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.version}</h3>
            <pre style={c.helpBox}>{t.features}</pre>
            <div style={c.small}>{t.author}</div>
          </div>
        )}
        {tab === "log" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.log}</h3>
            <div style={c.controls}>
              <button style={c.btnGhost} onClick={clearLogs}>
                {t.clearLogs}
              </button>
              <button style={c.btnGhost} onClick={copyLogs}>
                {t.copyLogs}
              </button>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #e6eaf0", padding: 8, background: "#f6f8fb", fontFamily: "monospace", fontSize: 11 }}>
              {logs.length === 0 ? (
                <div>{t.noLogs}</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ marginBottom: 4, whiteSpace: "pre-wrap" }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {tab === "scan" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.scanTitle}</h3>
            <Suspense fallback={<div>Loading...</div>}>
              <ScanAppLazy
                api={api}
                settings={{
                  ocrWebhookUrl: settings.ocrWebhookUrl,
                  ocrSecret: settings.ocrSecret,
                  ocrPrompt: settings.ocrPrompt,
                  language: settings.language,
                }}
                translations={t}
                styles={c}
                onConfirm={(marks: string[]) => {
                  setTab("search");
                  setSearchField("AssemblyMark");
                  setSearchFieldFilter("Kooste märk (BLOCK)");
                  setSearchScope("available");
                  setSearchInput(marks.join("\n"));
                  setTimeout(() => {
                    searchAndSelect(true);
                  }, 100);
                }}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    color: "#757575",
    background: "#fff",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  topbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    padding: 4,
    borderBottom: "1px solid #e6eaf0",
    background: "#fff",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  tab: {
    padding: "4px 6px",
    borderRadius: 6,
    border: "1px solid #cfd6df",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 11,
  },
  tabActive: {
    background: "#0a3a67",
    color: "#fff",
    borderColor: "#0a3a67",
  },
  page: {
    padding: 8,
    overflow: "auto",
    flex: 1,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxWidth: 920,
  },
  heading: {
    margin: 0,
    fontSize: 16,
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  labelTop: {
    fontSize: 11,
    opacity: 0.75,
  },
  input: {
    padding: "4px 6px",
    border: "1px solid #cfd6df",
    borderRadius: 6,
    outline: "none",
  },
  inputFilter: {
    width: "100%",
    maxHeight: "120px",
    padding: "4px 6px",
    border: "1px solid #cfd6df",
    borderRadius: 6,
    outline: "none",
    resize: "vertical",
  },
  textarea: {
    width: "100%",
    padding: "6px",
    border: "1px solid #cfd6df",
    borderRadius: 6,
    outline: "none",
    fontFamily: "monospace",
    fontSize: 11,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
    position: "relative",
    zIndex: 10,
  },
  btn: {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #0a3a67",
    background: "#0a3a67",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 11,
  },
  btnGhost: {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #cfd6df",
    background: "#fff",
    color: "#757575",
    cursor: "pointer",
    fontSize: 11,
  },
  miniBtn: {
    padding: "3px 6px",
    borderRadius: 6,
    border: "1px solid #cfd6df",
    background: "#fff",
    cursor: "pointer",
    fontSize: 10,
  },
  note: {
    padding: 8,
    border: "1px solid #cfd6df",
    borderRadius: 6,
    background: "#f6f8fb",
  },
  small: {
    fontSize: 11,
    opacity: 0.75,
  },
  resultsBox: {
    border: "1px solid #e6eaf0",
    borderRadius: 6,
    padding: 8,
    background: "#fff",
  },
  resultsHeading: {
    margin: 0,
    marginBottom: 4,
    fontSize: 14,
  },
  resultsTable: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  resultRow: {
    display: "grid",
    gridTemplateColumns: "16px 22px 18px 1fr minmax(42px,48px) 110px",
    columnGap: 6,
    rowGap: 2,
    alignItems: "center",
    padding: 4,
    borderRadius: 6,
    border: "1px solid #e6eaf0",
    minWidth: 0,
  },
  resultRowMarked: {
    background: "#e7f3ff",
    border: "1px solid #1E88E5",
  },
  resultRowFound: {
    background: "#f7fff7",
  },
  resultRowPartial: {
    background: "#fffdf3",
  },
  resultRowNotFound: {
    background: "#fff6f6",
  },
  resultStatus: {
    textAlign: "center",
    fontSize: 11,
  },
  resultValue: {
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontFamily: "monospace",
    fontSize: 11,
  },
  resultCount: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontSize: 11,
  },
  resultActions: {
    display: "flex",
    gap: 4,
    justifyContent: "flex-end",
    whiteSpace: "nowrap",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 360,
    overflow: "auto",
    border: "1px solid #e6eaf0",
    borderRadius: 6,
    padding: 8,
    background: "#fff",
  },
  group: {
    border: "1px solid #f0f2f6",
    borderRadius: 6,
    padding: 6,
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: 4,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: 4,
    border: "1px solid #eef1f6",
    cursor: "pointer",
  },
  ellipsis: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  presetsRow: {
    display: "flex",
    gap: 4,
  },
  columnListNoscroll: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    border: "1px solid #e6eaf0",
    borderRadius: 6,
    padding: 8,
    background: "#fff",
    maxHeight: 480,
    overflow: "auto",
  },
  columnItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: 6,
    borderRadius: 6,
    border: "1px solid #eef1f6",
    background: "#fff",
  },
  columnItemHighlight: {
    boxShadow: "0 0 0 2px rgba(22,119,255,0.2)",
  },
  columnItemDragging: {
    opacity: 0.5,
  },
  dragHandle: {
    userSelect: "none",
    fontWeight: 600,
  },
  row: {
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  label: {
    width: 180,
    fontSize: 11,
    opacity: 0.75,
  },
  helpBox: {
    whiteSpace: "pre-wrap",
    padding: 8,
    border: "1px solid #cfd6df",
    borderRadius: 6,
    background: "#f6f8fb",
  },
  dropdown: {
    position: "absolute",
    top: 32,
    left: 0,
    right: 0,
    border: "1px solid #cfd6df",
    borderRadius: 6,
    background: "#fff",
    boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
    maxHeight: 220,
    overflow: "auto",
    zIndex: 50,
  },
  dropdownItem: {
    padding: 6,
    cursor: "pointer",
    fontSize: 11,
  },
  dropdownItemSelected: {
    background: "#e7f3ff",
  },
  mini: {
    padding: "3px 6px",
    borderRadius: 6,
    border: "1px solid #cfd6df",
    background: "#fff",
    cursor: "pointer",
    fontSize: 10,
  },
  colorPicker: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 24px)",
    gap: 4,
    marginTop: 8,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 4,
    cursor: "pointer",
    transition: "transform 0.15s ease",
  },
  colorSwatchSelected: {
    border: "2px solid #1E88E5",
    transform: "scale(1.1)",
  },
};

export default memo(AssemblyExporter);
