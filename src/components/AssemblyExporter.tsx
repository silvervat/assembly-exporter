import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, memo, type CSSProperties, type DragEvent, Suspense, lazy } from "react";
import * as XLSX from "xlsx";
import React from "react";
import { createPortal } from "react-dom";
import MarkupAdvanced from "./MarkupAdvanced"; // Auto-discover markup komponent
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
    markup: "MARKEERI",
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
    markup: "MARKUP",
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
// Värvipalett - 30 unikaalset värvi (5×6 grid)
const COLORS = [
  "#E53935", "#D81B60", "#8E24AA", "#5E35B1", "#3949AB", "#1E88E5",
  "#039BE5", "#00ACC1", "#00897B", "#43A047", "#7CB342", "#C0CA33",
  "#FDD835", "#FFB300", "#FB8C00", "#FF8C00", "#F4511E", "#6D4C41",
  "#757575", "#546E7A", "#EF5350", "#EC407A", "#AB47BC", "#7E57C2",
  "#5C6BC0", "#42A5F5", "#29B6F6", "#26C6DA", "#26A69A", "#66BB6A"
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
/* Puuduv useLogs hook põhjustab tühja lehe (ReferenceError). Lisame lihtsa implementatsiooni. */
function useLogs() {
  const [logs, setLogs] = useState<string[]>([]);
  const push = useCallback((msg: string) => {
    try {
      const line = `${new Date().toISOString()} ${String(msg)}`;
      setLogs(prev => [...prev, line].slice(-2000)); // hoia kuni 2000 rida
      // trüki ka dev console'i
      // eslint-disable-next-line no-console
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
  return String(s).replace(/\s+/g, "_").replace(/[^\w.-]/g, "").replace(/\+/g, ".").trim(); // UUS: Asenda + punktiga JSON-i jaoks
}
function groupSortKey(group: string) {
  const g = group.toLowerCase();
  if (g === "data") return 0;
  if (g === "referenceobject" || g === "reference_object") return 1;
  if (g.startsWith("tekla_assembly")) return 2;
  return 10;
}
type Grouped = Record<string, string[]>;
function groupKeys(keys: string[]): Grouped {
  const g: Grouped = {};
  for (const k of keys) {
    const dot = k.indexOf(".");
    const grp = dot > 0 ? k.slice(0, dot) : "Other";
    if (!g[grp]) g[grp] = [];
    g[grp].push(k);
  }
  for (const arr of Object.values(g)) arr.sort((a, b) => a.localeCompare(b));
  return g;
}
function normalizeGuid(s: string): string {
  return s.replace(/^urn:(uuid:)?/i, "").trim();
}
function classifyGuid(val: string): "IFC" | "MS" | "UNKNOWN" {
  const s = normalizeGuid(val.trim());
  if (/^[0-9A-Za-z_$]{22}$/.test(s)) return "IFC";
  if (/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(s) || /^[0-9A-Fa-f]{32}$/.test(s)) return "MS";
  return "UNKNOWN";
}
/** ---- Fallback apid: Presentation Layers & Reference Object ---- */
async function getPresentationLayerString(api: any, modelId: string, runtimeId: number): Promise<string> {
  try {
    const layers = (await api?.viewer?.getObjectLayers?.(modelId, [runtimeId])) ?? (await api?.viewer?.getPresentationLayers?.(modelId, [runtimeId]));
    if (Array.isArray(layers) && layers.length) {
      const first = Array.isArray(layers[0]) ? layers[0] : layers;
      return first.filter(Boolean).map(String).join(", ");
    }
  } catch {}
  return "";
}
async function getReferenceObjectInfo(
  api: any,
  modelId: string,
  runtimeId: number
): Promise<{ fileName?: string; fileFormat?: string; commonType?: string; guidIfc?: string; guidMs?: string }> {
  const out: any = {};
  try {
    const meta = (await api?.viewer?.getObjectMetadata?.(modelId, [runtimeId])) ?? (await api?.viewer?.getObjectInfo?.(modelId, runtimeId));
    const m = Array.isArray(meta) ? meta[0] : meta;
    if (m?.file?.name) out.fileName = String(m.file.name);
    if (m?.file?.format) out.fileFormat = String(m.file.format);
    if (m?.commonType) out.commonType = String(m.commonType);
    if (m?.globalId) out.guidMs = String(m.globalId);
    if (!out.guidIfc) {
      try {
        const ext = await api?.viewer?.convertToObjectIds?.(modelId, [runtimeId]);
        if (ext && ext[0]) out.guidIfc = String(ext[0]);
      } catch {}
    }
  } catch {}
  return out;
}
/** ---------------------------------------------------------------- */
async function flattenProps(
  obj: any,
  modelId: string,
  projectName: string,
  modelNameById: Map<string, string>,
  api: any,
  logMessage: (msg: string) => void // Lisatud parameeter logimiseks
): Promise<Row> {
  const out: Row = {
    GUID: "",
    GUID_IFC: "",
    GUID_MS: "",
    Project: String(projectName || ""),
    ModelId: String(modelId),
    FileName: modelNameById.get(modelId) || "",
    Name: "",
    Type: "Unknown",
  };
  const propMap = new Map<string, string>();
  const keyCounts = new Map<string, number>();
  const push = (group: string, name: string, val: unknown) => {
    const g = sanitizeKey(group);
    const n = sanitizeKey(name);
    const baseKey = g ? `${g}.${n}` : n;
    let key = baseKey;
    const count = keyCounts.get(baseKey) || 0;
    if (count > 0) key = `${baseKey}_${count}`;
    keyCounts.set(baseKey, count + 1);
    let v: unknown = val;
    if (Array.isArray(v)) v = v.map(x => (x == null ? "" : String(x))).join(" | ");
    else if (typeof v === "object" && v !== null) v = JSON.stringify(v);
    const s = v == null ? "" : String(v);
    propMap.set(key, s);
    out[key] = s;
  };
  // Property setid (sh peidetud)
  if (Array.isArray(obj?.properties)) {
    obj.properties.forEach((propSet: any) => {
      const setName = propSet?.name || "Unknown";
      const setProps = propSet?.properties || [];
      if (Array.isArray(setProps)) {
        setProps.forEach((prop: any) => {
          const value = prop?.displayValue ?? prop?.value;
          const name = prop?.name || "Unknown";
          push(setName, name, value);
        });
      }
    });
  } else if (typeof obj?.properties === "object" && obj.properties !== null) {
    Object.entries(obj.properties).forEach(([key, val]) => push("Properties", key, val));
  }
  // Standard väljad
  if (obj?.id) out.ObjectId = String(obj.id);
  if (obj?.name) out.Name = String(obj.name);
  if (obj?.type) out.Type = String(obj.type);
  if (obj?.product?.name) out.ProductName = String(obj.product.name);
  if (obj?.product?.description) out.ProductDescription = String(obj.product.description);
  if (obj?.product?.type) out.ProductType = String(obj.product.type);
  // UUS: Fallback Product väljadele property-set'idest, kui otse puudub
  if (!out.ProductName || !out.ProductDescription || !out.ProductType) {
    const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
    for (const set of props) {
      for (const p of set?.properties ?? []) {
        if (/product[_\s]?name/i.test(p?.name) && !out.ProductName) out.ProductName = String(p?.value || p?.displayValue || "");
        if (/product[_\s]?description/i.test(p?.name) && !out.ProductDescription) out.ProductDescription = String(p?.value || p?.displayValue || "");
        if (/product[_\s]?object[_\s]?type/i.test(p?.name) && !out.ProductType) out.ProductType = String(p?.value || p?.displayValue || "");
      }
    }
    logMessage(`flattenProps: Lisasin Product fallback'id: Name=${out.ProductName}, Desc=${out.ProductDescription}, Type=${out.ProductType}`);
  }
  // GUIDid propidest
  let guidIfc = "";
  let guidMs = "";
  for (const [k, v] of propMap) {
    if (!/guid|globalid|tekla_guid|id_guid/i.test(k)) continue;
    const cls = classifyGuid(v);
    if (cls === "IFC" && !guidIfc) guidIfc = v;
    if (cls === "MS" && !guidMs) guidMs = v;
  }
  // UUS: Spetsiifiline käsitlemine JSON-i "ReferenceObject+GUID (MS)" jaoks
  if (guidMs) {
    const jsonKey = "ReferenceObject.GUID_MS"; // Sanitized from "ReferenceObject+GUID (MS)"
    out[jsonKey] = guidMs;
    logMessage(`flattenProps: Leidsin ReferenceObject+GUID (MS): ${guidMs}`);
  }
  // Lisa metadata.globalId GUID_MS jaoks
  try {
    logMessage(`flattenProps: Proovin lugeda metadata modelId=${modelId}, objId=${obj?.id}`);
    const metaArr = await api?.viewer?.getObjectMetadata?.(modelId, [obj?.id]);
    const metaOne = Array.isArray(metaArr) ? metaArr[0] : metaArr;
    logMessage(`flattenProps: Metadata tulemus: ${JSON.stringify(metaOne)}`);
    if (metaOne?.globalId) {
      const g = String(metaOne.globalId);
      out.GUID_MS = out.GUID_MS || g;
      out["ReferenceObject.GlobalId"] = g;
      logMessage(`flattenProps: Leidsin GUID_MS: ${g}`);
    } else {
      logMessage("flattenProps: globalId puudub metadata's");
    }
  } catch (e) {
    logMessage("flattenProps: getObjectMetadata viga: " + e.message);
  }
  // IFC GUID fallback (runtime->external)
  if (!guidIfc && obj.id) {
    try {
      const externalIds = await api.viewer.convertToObjectIds(modelId, [obj.id]);
      const externalId = externalIds[0];
      if (externalId && classifyGuid(externalId) === "IFC") guidIfc = externalId;
      logMessage(`flattenProps: Leidsin GUID_IFC fallback'ist: ${guidIfc}`);
    } catch (e) {
      logMessage(`flattenProps: convertToObjectIds viga objId=${obj.id}: ${e.message}`);
    }
  }
  // Presentation Layers fallback
  if (![...propMap.keys()].some(k => k.toLowerCase().startsWith("presentation_layers."))) {
    const rid = Number(obj?.id);
    if (Number.isFinite(rid)) {
      const layerStr = await getPresentationLayerString(api, modelId, rid);
      if (layerStr) {
        const key = "Presentation_Layers.Layer";
        propMap.set(key, layerStr);
        out[key] = layerStr;
        logMessage(`flattenProps: Leidsin Presentation Layers: ${layerStr}`);
      }
    }
  }
  // Reference Object fallback
  const hasRefBlock = [...propMap.keys()].some(k => k.toLowerCase().startsWith("referenceobject."));
  if (!hasRefBlock) {
    const rid = Number(obj?.id);
    if (Number.isFinite(rid)) {
      const ref = await getReferenceObjectInfo(api, modelId, rid);
      if (ref.fileName) out["ReferenceObject.File_Name"] = ref.fileName;
      if (ref.fileFormat) out["ReferenceObject.File_Format"] = ref.fileFormat;
      if (ref.commonType) out["ReferenceObject.Common_Type"] = ref.commonType;
      if (!guidIfc && ref.guidIfc) guidIfc = ref.guidIfc;
      if (!guidMs && ref.guidMs) guidMs = ref.guidMs;
      logMessage(`flattenProps: Reference Object info: ${JSON.stringify(ref)}`);
    }
  }
  out.GUID_IFC = guidIfc;
  out.GUID_MS = guidMs;
  out.GUID = guidIfc || guidMs || "";
  return out;
}
async function getProjectName(api: any): Promise<string> {
  try {
    const proj = typeof api?.project?.getProject === "function" ? await api.project.getProject() : api?.project || {};
    return String(proj?.name || "");
  } catch {
    return "";
  }
}
async function getSelectedObjects(api: any): Promise<Array<{ modelId: string; objects: any[] }>> {
  const viewer: any = api?.viewer;
  const mos = await viewer?.getObjects?.({ selected: true });
  if (!Array.isArray(mos) || !mos.length) return [];
  return mos.map((mo: any) => ({ modelId: String(mo.modelId), objects: mo.objects || [] }));
}
async function buildModelNameMap(api: any, modelIds: string[]) {
  const map = new Map<string, string>();
  try {
    const list: any[] = await api?.viewer?.getModels?.();
    for (const m of list || []) {
      if (m?.id && m?.name) map.set(String(m.id), String(m.name));
    }
  } catch {}
  for (const id of new Set(modelIds)) {
    if (map.has(id)) continue;
    try {
      const f = await api?.viewer?.getLoadedModel?.(id);
      const n = f?.name || f?.file?.name;
      if (n) map.set(id, String(n));
    } catch {}
  }
  return map;
}
// UUS: Funktsioon JSON-i parsimiseks ja veergude lisamiseks
function parseJsonColumns(jsonData) {
  const columns = jsonData.columns.map(col => sanitizeKey(col.field)); // Sanitize + -> .
  return columns;
}
// ColorPicker komponent - 30 värvi 5×6 grid
// Muudetud: renderdatakse portaali (document.body) ja positsioneeritakse fixed positsioonile,
// et vältida külgriba/overflow järel tekkivat peitmist.
const ColorPicker = memo(({ value, onChange, t }: { value: string; onChange: (c: string) => void; t: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [popupStyle, setPopupStyle] = useState<CSSProperties | null>(null);
  // compute popup size roughly (grid 6 columns, each 20px + gaps)
  const POPUP_WIDTH = 6 * 20 + (6 - 1) * 4 + 12; // approx padding
  const POPUP_HEIGHT = Math.ceil(COLORS.length / 6) * 20 + (Math.ceil(COLORS.length / 6) - 1) * 4 + 12;
  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = triggerRef.current;
    if (!el) return;
    const updatePos = () => {
      const rect = el.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      // default below the trigger
      let left = Math.round(rect.left + scrollX);
      let top = Math.round(rect.top + rect.height + scrollY + 6);
      // ensure popup stays inside viewport horizontally
      const margin = 8;
      const maxRight = window.innerWidth - margin;
      if (left + POPUP_WIDTH > maxRight) left = Math.max(margin, maxRight - POPUP_WIDTH);
      // if not enough space below, try placing above
      const maxBottom = window.innerHeight - margin;
      const spaceBelow = window.innerHeight - (rect.top + rect.height);
      if (spaceBelow < POPUP_HEIGHT && rect.top > POPUP_HEIGHT + 12) {
        top = Math.round(rect.top + scrollY - POPUP_HEIGHT - 6);
      }
      setPopupStyle({
        position: "fixed",
        top: top,
        left: left,
        zIndex: 9999,
        pointerEvents: "auto",
      });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [isOpen]);
  const currentColor = value || COLORS[0];
  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(v => !v)}
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          background: currentColor,
          border: "1px solid #e6eaf0",
          cursor: "pointer",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          display: "inline-block",
        }}
        title={t.color}
      />
      {isOpen &&
        createPortal(
          <>
            {/* overlay to catch outside clicks */}
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9998,
                background: "transparent",
              }}
              onClick={() => setIsOpen(false)}
            />
            <div
              role="dialog"
              aria-label="Color picker"
              style={{
                position: "fixed",
                zIndex: 9999,
                background: "#fff",
                border: "1px solid #e6eaf0",
                borderRadius: 6,
                padding: 6,
                boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                display: "grid",
                gridTemplateColumns: "repeat(6, 20px)",
                gap: 4,
                ...((popupStyle as any) || {}),
              }}
            >
              {COLORS.map(color => (
                <div
                  key={color}
                  onClick={() => {
                    onChange(color);
                    setIsOpen(false);
                  }}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: color,
                    border: currentColor === color ? "2px solid #1E88E5" : "1px solid #e6eaf0",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "transform 0.12s ease",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "scale(1.08)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "scale(1)"; }}
                >
                  {currentColor === color && (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M13 4L6 11L3 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
});
// MiniToggle komponent - kompaktsem
const MiniToggle = memo(({ checked, onChange, color = "blue" }: { checked: boolean; onChange: (v: boolean) => void; color?: string }) => {
  const colors = {
    blue: { bg: "#1E88E5", bgOff: "#CBD5E1" },
    purple: { bg: "#9333EA", bgOff: "#CBD5E1" },
    green: { bg: "#10B981", bgOff: "#CBD5E1" },
    orange: { bg: "#F97316", bgOff: "#CBD5E1" },
  };
  const c = colors[color as keyof typeof colors] || colors.blue;
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 40,
        height: 20,
        borderRadius: 10,
        border: "none",
        background: checked ? c.bg : c.bgOff,
        cursor: "pointer",
        transition: "background 0.3s ease",
        outline: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
          transition: "left 0.3s ease",
        }}
      />
    </button>
  );
});
// LargeToggle komponent - kompaktsem
const LargeToggle = memo(({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 60,
        height: 30,
        borderRadius: 15,
        border: "none",
        background: checked ? "linear-gradient(135deg, #10B981 0%, #059669 100%)" : "linear-gradient(135deg, #94A3B8 0%, #64748B 100%)",
        cursor: "pointer",
        transition: "all 0.3s ease",
        outline: "none",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
        fontWeight: 500,
        fontSize: 10,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: checked ? "flex-start" : "flex-end",
        padding: "0 6px",
      }}
    >
      <span style={{ position: "absolute", left: checked ? 8 : "auto", right: checked ? "auto" : 8 }}>
        {checked ? "ON" : "OFF"}
      </span>
      <div
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 33 : 3,
          width: 24,
          height: 24,
          borderRadius: 12,
          background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          transition: "left 0.3s ease",
        }}
      />
    </button>
  );
});
// ResultRow komponent
const ResultRow = memo(({ result, onRemove, onZoom, onToggleMark, onColorChange, isMarked, t, rowHeight }: any) => {
  const displayValue = result.actualValue || result.originalValue;
  const isPartialMatch = result.isPartial && result.actualValue && result.actualValue !== result.originalValue;
  const rowStyle = {
    ...styles.resultRow,
    ...(isMarked ? styles.resultRowMarked : {}),
    ...(result.status === "found" ? result.isPartial ? styles.resultRowPartial : styles.resultRowFound : styles.resultRowNotFound),
    height: rowHeight === "small" ? 24 : rowHeight === "large" ? 48 : 36, // Rea kõrgus
  };
  return (
    <div style={rowStyle}>
      {result.status === "found" && (
        <input
          type="checkbox"
          checked={isMarked}
          onChange={() => onToggleMark(result.id)}
          style={{ cursor: "pointer", width: 14, height: 14 }} // Kompaktsem
        />
      )}
      {result.status === "notfound" && <div style={{ width: 14 }} />}
      <ColorPicker value={result.color || COLORS[0]} onChange={(color) => onColorChange(result.id, color)} t={t} />
      <span style={styles.resultStatus}>
        {result.status === "found" ? (result.isPartial ? "⚠️" : "✅") : "❌"}
      </span>
      <span
        style={styles.resultValue}
        title={isPartialMatch ? `Otsisin: ${result.originalValue} → Leidsin: ${displayValue}` : displayValue}
      >
        {displayValue}
        {isPartialMatch && (
          <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 3 }}>← {result.originalValue}</span> // Kompaktsem font
        )}
      </span>
      <span style={styles.resultCount}>
        {result.status === "found" ? `${result.ids?.length || 0}x` : "-"}
      </span>
      <div style={styles.resultActions}>
        {result.status === "found" && result.modelId && result.ids && (
          <button
            style={{
              ...styles.miniBtn,
              height: 24, // Kompaktsem
              minWidth: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={() => onZoom(result.modelId, result.ids)}
            title="Zoom"
          >
            {t.zoom}
          </button>
        )}
        <button
          style={{ ...styles.miniBtn, background: "#ffdddd", color: "#cc0000" }}
          onClick={onRemove}
          title="Remove"
        >
          {t.remove}
        </button>
      </div>
    </div>
  );
});
type Props = { api: any };
// JSON andmed, mille sa andsid – lisan siia koodi sisse, et oleks terviklik
const jsonData = {
  "name": "Default",
  "columns": [
    {"label": "ReferenceObject+GUID (MS)", "field": "ReferenceObject+GUID (MS)"},
    {"label": "guid", "field": "guid"},
    {"label": "Product+Product Description", "field": "Product+Product Description"},
    {"label": "Product+Product Name", "field": "Product+Product Name"},
    {"label": "Product+Product Object Type", "field": "Product+Product Object Type"}
  ]
};
export default function AssemblyExporter({ api }: Props) {
  const [settings, updateSettings] = useSettings();
  const t = translations[settings.language];
  const { logs, logMessage, clearLogs, copyLogs } = useLogs();
  const [tab, setTab] = useState<Tab>("search");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [highlightedColumn, setHighlightedColumn] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [searchFieldFilter, setSearchFieldFilter] = useState("Kooste märk (BLOCK)");
  const [isSearchFieldDropdownOpen, setIsSearchFieldDropdownOpen] = useState(false);
  const [searchScope, setSearchScope] = useState<"available" | "selected">("available");
  const [fuzzySearch, setFuzzySearch] = useState(false);
  const [greyOutAll, setGreyOutAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0, objects: 0, totalObjects: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [searchField, setSearchField] = useState("AssemblyMark");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("clipboard");
  const [lastSelection, setLastSelection] = useState<Array<{ modelId: string; ids: number[] }>>([]);
  const [searchResults, setSearchResults] = useState<Array<any>>([]);
  const [markedResults, setMarkedResults] = useState<Set<number>>(new Set());
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [showViewSave, setShowViewSave] = useState(false);
  const [viewName, setViewName] = useState("");
  const [showOrganizerSave, setShowOrganizerSave] = useState(false);
  const [organizerName, setOrganizerName] = useState("");
  const [defaultColor, setDefaultColor] = useState(rgbToHex(settings.colorizeColor.r, settings.colorizeColor.g, settings.colorizeColor.b));
  const [rowHeight, setRowHeight] = useState<RowHeight>(settings.rowHeight);
  const [markupIds, setMarkupIds] = useState<number[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const tmr = setTimeout(() => setDebouncedFilter(filter), DEBOUNCE_MS);
    return () => clearTimeout(tmr);
  }, [filter]);
  useEffect(() => {
    if (discoverMsg) {
      const t = setTimeout(() => setDiscoverMsg(""), MESSAGE_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [discoverMsg]);
  useEffect(() => {
    if (exportMsg) {
      const t = setTimeout(() => setExportMsg(""), MESSAGE_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [exportMsg]);
  useEffect(() => {
    if (settingsMsg) {
      const t = setTimeout(() => setSettingsMsg(""), MESSAGE_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [settingsMsg]);
  const allKeys = useMemo(() => Array.from(new Set(rows.flatMap(r => Object.keys(r)))).sort(), [rows]);
  const searchFieldOptions = useMemo(() => {
    const base = [
      { value: "AssemblyMark", label: "Kooste märk (BLOCK)" },
      { value: "GUID_IFC", label: "IFC GUID" },
      { value: "GUID_MS", label: "MS/Tekla GUID" },
      { value: "Name", label: "Nimi" },
    ];
    const custom = allKeys
      .filter(k => !["GUID", "GUID_IFC", "GUID_MS", "Name", "Type", "Project", "ModelId", "FileName", "ObjectId"].includes(k))
      .map(k => ({ value: k, label: k }));
    const all = [...base, ...custom];
    if (!searchFieldFilter) return all;
    const f = searchFieldFilter.toLowerCase();
    return all.filter(opt => opt.label.toLowerCase().includes(f) || opt.value.toLowerCase().includes(f));
  }, [allKeys, searchFieldFilter]);
  const groupedUnsorted = useMemo(() => groupKeys(allKeys), [allKeys]);
  const groupedSortedEntries = useMemo(
    () => (Object.entries(groupedUnsorted) as [string, string[]][])
      .sort((a, b) => groupSortKey(a[0]) - groupSortKey(b[0]) || a[0].localeCompare(b[0])),
    [groupedUnsorted]
  );
  const filteredKeysSet = useMemo(() => {
    if (!debouncedFilter) return new Set(allKeys);
    const f = debouncedFilter.toLowerCase();
    return new Set(allKeys.filter(k => k.toLowerCase().includes(f)));
  }, [allKeys, debouncedFilter]);
  const exportableColumns = useMemo(() => columnOrder.filter(k => allKeys.includes(k)), [columnOrder, allKeys]);
  const totalFoundCount = useMemo(
    () => searchResults.reduce((sum, r) => sum + (r.status === "found" ? r.ids?.length || 0 : 0), 0),
    [searchResults]
  );
  const markedCount = markedResults.size;
  useEffect(() => {
    if (!rows.length || selected.size) return;
    if (settings.defaultPreset === "tekla") presetTekla();
    else if (settings.defaultPreset === "ifc") presetIFC();
    else presetRecommended();
  }, [rows, settings.defaultPreset]);
  useEffect(() => {
    const currentSet = new Set(columnOrder);
    const missingKeys = allKeys.filter(k => !currentSet.has(k));
    if (missingKeys.length > 0) setColumnOrder(prev => [...prev, ...missingKeys]);
    else if (!columnOrder.length && allKeys.length) setColumnOrder([...LOCKED_ORDER, ...allKeys.filter(k => !LOCKED_ORDER.includes(k as any))]);
  }, [allKeys]);
  useEffect(() => {
    if (!api?.viewer) return;
    let selectionTimeout: any;
    const handleSelectionChange = () => {
      clearTimeout(selectionTimeout);
      selectionTimeout = setTimeout(() => {
        if (!busy) discover();
      }, 800);
    };
    try {
      api.viewer.on?.("selectionChanged", handleSelectionChange);
    } catch (e) {
      logMessage("Selection listener setup failed: " + e.message);
    }
    return () => {
      clearTimeout(selectionTimeout);
      try {
        api.viewer.off?.("selectionChanged", handleSelectionChange);
      } catch {}
    };
  }, [api, busy, logMessage]);
  useEffect(() => {
    if (tab === "export" && !busy) discover();
  }, [tab]);
  useEffect(() => {
    if (tab === "discover" && !busy) discover();
  }, [tab]);
  const matches = useCallback((k: string) => filteredKeysSet.has(k), [filteredKeysSet]);
  const toggle = useCallback(
    (k: string) => setSelected(s => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    }),
    []
  );
  const toggleGroup = useCallback(
    (keys: string[], on: boolean) => setSelected(s => {
      const n = new Set(s);
      for (const k of keys) (on ? n.add(k) : n.delete(k));
      return n;
    }),
    []
  );
  const selectAll = useCallback((on: boolean) => setSelected(() => (on ? new Set(allKeys) : new Set())), [allKeys]);
  function presetRecommended() {
    const wanted = new Set([...LOCKED_ORDER, "ReferenceObject.Common_Type", "ReferenceObject.File_Name"]);
    setSelected(new Set(allKeys.filter(k => wanted.has(k))));
  }
  function presetTekla() {
    setSelected(new Set(allKeys.filter(k => k.startsWith("Tekla_Assembly.") || k === "ReferenceObject.File_Name")));
  }
  function presetIFC() {
    const wanted = new Set(["GUID_IFC", "GUID_MS", "ReferenceObject.Common_Type", "ReferenceObject.File_Name"]);
    setSelected(new Set(allKeys.filter(k => wanted.has(k))));
  }
  async function discover() {
    if (!api?.viewer) {
      setDiscoverMsg(t.apiError);
      logMessage("Viewer API not available (iframe?)");
      return;
    }
    try {
      setBusy(true);
      setDiscoverMsg(t.selectObjects);
      setProgress({ current: 0, total: 0, objects: 0, totalObjects: 0 });
      const selectedWithBasic = await getSelectedObjects(api);
      if (!selectedWithBasic.length) {
        setDiscoverMsg(t.selectObjects);
        setRows([]);
        logMessage("No selected objects in 3D view");
        return;
      }
      const projectName = await getProjectName(api);
      const modelIds = selectedWithBasic.map(m => m.modelId);
      const nameMap = await buildModelNameMap(api, modelIds);
      const out: Row[] = [];
      const lastSel: Array<{ modelId: string; ids: number[] }> = [];
      const totalObjs = selectedWithBasic.reduce((sum, m) => sum + (m.objects?.length || 0), 0);
      setProgress({ current: 0, total: selectedWithBasic.length, objects: 0, totalObjects: totalObjs });
      let processedObjects = 0;
      for (let i = 0; i < selectedWithBasic.length; i++) {
        const { modelId, objects } = selectedWithBasic[i];
        setDiscoverMsg(
          t.processing.replace("{current}", String(i + 1)).replace("{total}", String(selectedWithBasic.length)) +
          ` (${processedObjects}/${totalObjs} ${settings.language === "et" ? "objekti" : "objects"})`
        );
        const objectRuntimeIds = objects.map((o: any) => Number(o?.id)).filter((n: number) => Number.isFinite(n));
        let fullObjects = objects;
        try {
          const fullProperties = await api.viewer.getObjectProperties(modelId, objectRuntimeIds, { includeHidden: true });
          fullObjects = objects.map((obj: any, idx: number) => ({
            ...obj,
            properties: fullProperties[idx]?.properties || obj.properties,
          }));
        } catch (e) {
          logMessage(`getObjectProperties failed for model ${modelId}: ${e.message}`);
        }
        const flattened = await Promise.all(fullObjects.map((o: any) => flattenProps(o, modelId, projectName, nameMap, api, logMessage)));
        out.push(...flattened);
        lastSel.push({ modelId, ids: objectRuntimeIds });
        processedObjects += objects.length;
        setProgress({ current: i + 1, total: selectedWithBasic.length, objects: processedObjects, totalObjects: totalObjs });
      }
      setRows(out);
      setLastSelection(lastSel);
      setDiscoverMsg(
        t.foundObjects
          .replace("{count}", String(out.length))
          .replace("{keys}", String(Array.from(new Set(out.flatMap(r => Object.keys(r)))).length))
      );
      logMessage(`Found ${out.length} objects with ${Array.from(new Set(out.flatMap(r => Object.keys(r)))).length} keys`);
      // UUS: Parsi JSON ja lisa veerud columnOrder-i
      const jsonColumns = parseJsonColumns(jsonData);
      setColumnOrder(prev => [...new Set([...prev, ...jsonColumns])]);
      logMessage(`Lisatud JSON veerud: ${jsonColumns.join(", ")}`);
    } catch (e: any) {
      logMessage(`Discover error: ${e.message}`);
      setDiscoverMsg(t.error.replace("{error}", e?.message || t.unknownError));
    } finally {
      setBusy(false);
    }
  }
  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setBusy(false);
      setSearchMsg(t.searchCancelled);
      abortControllerRef.current = null;
      logMessage("Search cancelled");
    }
  }, [t, logMessage]);
  async function searchAndSelect(clearPrevious: boolean = false) {
    logMessage(`Search started, clearPrevious=${clearPrevious}`);
    if (clearPrevious) {
      setSearchResults([]);
      setMarkedResults(new Set());
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    try {
      setBusy(true);
      setSearchMsg(t.searching);
      setProgress({ current: 0, total: 0, objects: 0, totalObjects: 0 });
      const searchValues = searchInput.split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean);
      const uniqueSearchValues = [...new Set(searchValues)];
      const hasDuplicates = searchValues.length > uniqueSearchValues.length;
      if (!uniqueSearchValues.length) {
        setSearchMsg(t.enterValue);
        setBusy(false);
        logMessage("No search values entered");
        return;
      }
      const viewer = api?.viewer;
      let mos = searchScope === "selected" ? await viewer?.getObjects({ selected: true }) : await viewer?.getObjects();
      if (!Array.isArray(mos)) {
        if (abortController.signal.aborted) return;
        setSearchMsg(t.cannotRead);
        setBusy(false);
        logMessage("Cannot read objects from viewer");
        return;
      }
      const totalObjs = mos.reduce((sum, mo) => sum + (mo.objects?.length || 0), 0);
      const found: Array<{ modelId: string; ids: number[] }> = [];
      const foundValues = new Map<
        string,
        { original: string; modelId: string; ids: number[]; isPartial: boolean; actualValue: string }
      >();
      setProgress({ current: 0, total: mos.length, objects: 0, totalObjects: totalObjs });
      const MAX_RESULTS = 500;
      let processedObjects = 0;
      for (let mIdx = 0; mIdx < mos.length; mIdx++) {
        if (abortController.signal.aborted) return;
        const mo = mos[mIdx];
        const modelId = String(mo.modelId);
        const objectRuntimeIds = (mo.objects || []).map((o: any) => Number(o?.id)).filter(Number.isFinite);
        if (!objectRuntimeIds.length) continue;
        let fullProperties: any[] = [];
        try {
          fullProperties = await api.viewer.getObjectProperties(modelId, objectRuntimeIds, { includeHidden: true });
          logMessage(`getObjectProperties success for model ${modelId}`);
        } catch (e) {
          if (abortController.signal.aborted) return;
          logMessage(`getObjectProperties failed for model ${modelId}: ${e.message}`);
          fullProperties = mo.objects || [];
        }
        const matchIds: number[] = [];
        for (let i = 0; i < fullProperties.length; i++) {
          if (abortController.signal.aborted) return;
          if (found.reduce((sum, f) => sum + f.ids.length, 0) >= MAX_RESULTS) {
            setSearchMsg(
              settings.language === "et" ? `⚠️ Peatatud: leidsin ${MAX_RESULTS}+ vastet. Täpsusta otsingut.` : `⚠️ Stopped: found ${MAX_RESULTS}+ matches. Refine search.`
            );
            logMessage(`Stopped: Max results ${MAX_RESULTS} reached`);
            break;
          }
          const obj = fullProperties[i];
          const objId = objectRuntimeIds[i];
          let matchValue = "";
          if (searchField === "AssemblyMark") {
            const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
            for (const set of props) {
              for (const p of set?.properties ?? []) {
                if (/assembly[\/\s]?cast[_\s]?unit[_\s]?mark|^mark$|block/i.test(String(p?.name))) {
                  matchValue = String(p?.value || p?.displayValue || "").trim();
                  break;
                }
              }
              if (matchValue) break;
            }
          } else if (searchField === "GUID_IFC" || searchField === "GUID_MS") {
            logMessage(`GUID search for modelId=${modelId}, objId=${objId}`);
            const objMeta = await (api?.viewer?.getObjectMetadata?.(modelId, [objId]).catch(() => null));
            const meta = Array.isArray(objMeta) ? objMeta[0] : objMeta;
            logMessage(`ObjMeta: ${JSON.stringify(objMeta)}`);
            // 1) MS/Tekla GUID -> metadata.globalId
            if (searchField === "GUID_MS" && meta?.globalId) {
              const val = String(meta.globalId).trim();
              if (classifyGuid(val) === "MS") matchValue = val;
            }
            // 2) Kui siiani tühi, proovi property-sette
            if (!matchValue) {
              const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
              outer: for (const set of props) {
                for (const p of set?.properties ?? []) {
                  if (/guid|globalid/i.test(String(p?.name))) {
                    const val = String(p?.value || p?.displayValue || "").trim();
                    const cls = classifyGuid(val);
                    if ((searchField === "GUID_IFC" && cls === "IFC") || (searchField === "GUID_MS" && cls === "MS")) {
                      matchValue = val;
                      break outer;
                    }
                  }
                }
              }
            }
            // 3) IFC fallback – runtime → external (IFC GlobalId)
            if (!matchValue && searchField === "GUID_IFC") {
              try {
                const extIds = await api.viewer.convertToObjectIds(modelId, [objId]);
                if (extIds?.[0]) matchValue = String(extIds[0]);
              } catch {}
            }
          } else if (searchField === "Name") {
            const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
            for (const set of props) {
              for (const p of set?.properties ?? []) {
                if (/^name$/i.test(String(p?.name))) {
                  matchValue = String(p?.value || p?.displayValue || "").trim();
                  break;
                }
              }
              if (matchValue) break;
            }
          } else {
            const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
            const searchParts = searchField.split(".");
            const groupPart = searchParts[0] || "";
            const propPart = searchParts[1] || "";
            for (const set of props) {
              const setName = String(set?.name || "");
              const setNameSanitized = sanitizeKey(setName);
              if (groupPart && !setNameSanitized.toLowerCase().includes(groupPart.toLowerCase())) continue;
              for (const p of set?.properties ?? []) {
                const propName = String(p?.name || "");
                const propNameSanitized = sanitizeKey(propName);
                const fullKeySanitized = `${setNameSanitized}.${propNameSanitized}`;
                if (
                  fullKeySanitized.toLowerCase() === searchField.toLowerCase() ||
                  propNameSanitized.toLowerCase().includes(propPart.toLowerCase())
                ) {
                  matchValue = String(p?.value || p?.displayValue || "").trim();
                  break;
                }
              }
              if (matchValue) break;
            }
          }
          const matchLower = matchValue.toLowerCase();
          if (!matchValue || !matchLower) continue;
          const originalMatch = uniqueSearchValues.find(v => {
            const vLower = v.toLowerCase();
            if (fuzzySearch) return vLower && matchLower && (matchLower.includes(vLower) || vLower.includes(matchLower));
            return vLower === matchLower;
          });
          if (originalMatch) {
            matchIds.push(objId);
            const isPartial = fuzzySearch && originalMatch.toLowerCase() !== matchLower;
            const uniqueKey = `${originalMatch.toLowerCase()}|||${matchLower}`;
            if (!foundValues.has(uniqueKey)) {
              foundValues.set(uniqueKey, {
                original: originalMatch,
                actualValue: matchValue,
                modelId,
                ids: [],
                isPartial,
              });
            }
            foundValues.get(uniqueKey)!.ids.push(objId);
          }
        }
        if (matchIds.length) found.push({ modelId, ids: matchIds });
        processedObjects += fullProperties.length;
        setProgress({ current: mIdx + 1, total: mos.length, objects: processedObjects, totalObjects: totalObjs });
        setSearchMsg(
          settings.language === "et" ? `Otsin... ${processedObjects}/${totalObjs} objekti töödeldud` : `Searching... ${processedObjects}/${totalObjs} objects processed`
        );
        if (found.reduce((sum, f) => sum + f.ids.length, 0) >= MAX_RESULTS) break;
      }
      if (searchField === "GUID_IFC" && found.length === 0) {
        const allModels = await api.viewer.getModels();
        for (const originalValue of uniqueSearchValues) {
          for (const model of allModels || []) {
            if (abortController.signal.aborted) return;
            const modelId = String(model.id);
            try {
              const runtimeIds = await api.viewer.convertToObjectRuntimeIds(modelId, [originalValue]);
              if (runtimeIds.length > 0) {
                found.push({ modelId, ids: runtimeIds.map((id: any) => Number(id)) });
                foundValues.set(originalValue.toLowerCase(), {
                  original: originalValue,
                  actualValue: originalValue,
                  modelId,
                  ids: runtimeIds.map((id: any) => Number(id)),
                  isPartial: false,
                });
              }
            } catch {}
          }
        }
      }
      const newResults: any[] = [];
      let nextId = searchResults.length > 0 ? Math.max(...searchResults.map(r => r.id)) + 1 : 0;
      if (fuzzySearch) {
        for (const [, data] of foundValues) {
          newResults.push({
            id: nextId++,
            originalValue: data.original,
            actualValue: data.actualValue,
            value: data.actualValue.toLowerCase(),
            status: "found",
            modelId: data.modelId,
            ids: data.ids,
            isPartial: data.isPartial,
            color: defaultColor,
          });
        }
      } else {
        for (const originalValue of uniqueSearchValues) {
          const lower = originalValue.toLowerCase();
          let foundEntry = false;
          for (const [, data] of foundValues) {
            if (data.original.toLowerCase() === lower) {
              newResults.push({
                id: nextId++,
                originalValue: data.original,
                actualValue: data.actualValue,
                value: lower,
                status: "found",
                modelId: data.modelId,
                ids: data.ids,
                isPartial: false,
                color: defaultColor,
              });
              foundEntry = true;
              break;
            }
          }
          if (!foundEntry) {
            newResults.push({
              id: nextId++,
              originalValue,
              value: lower,
              status: "notfound",
              color: defaultColor,
            });
          }
        }
      }
      setSearchResults(prev => clearPrevious ? newResults : [...prev, ...newResults]);
      if (found.length) {
        const selector = { modelObjectIds: found.map(f => ({ modelId: f.modelId, objectRuntimeIds: f.ids })) };
        await viewer?.setSelection?.(selector);
        setLastSelection(found);
        const notFound = newResults.filter(r => r.status === "notfound").map(r => r.originalValue);
        let msg = t.foundValues.replace("{found}", String(foundValues.size)).replace("{total}", String(uniqueSearchValues.length));
        if (notFound.length) msg += ` ${t.notFound} ${notFound.join(", ")}`;
        else msg += ` ${t.allFound}`;
        if (hasDuplicates) msg += ` ${t.duplicates}`;
        setSearchMsg(msg);
        logMessage(`Found ${foundValues.size} values, total searched ${uniqueSearchValues.length}`);
      } else {
        setSearchMsg(`${t.noneFound} ${uniqueSearchValues.join(", ")}`);
        logMessage("No values found");
      }
      // Värvi kõik halliks kui see on sisse lülitatud
      if (greyOutAll && found.length) {
        await greyOutAllModels();
      }
    } catch (e: any) {
      if (e.name === "AbortError") setSearchMsg(t.searchCancelled);
      else {
        logMessage(`Search error: ${e?.message || t.unknownError}`);
        setSearchMsg(t.error.replace("{error}", e?.message || t.unknownError));
      }
    } finally {
      setBusy(false);
      abortControllerRef.current = null;
    }
  }
  const toggleResultMark = useCallback((id: number) => {
    setMarkedResults(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const markAllResults = useCallback(() => {
    const foundIds = searchResults.filter(r => r.status === "found").map(r => r.id);
    setMarkedResults(new Set(foundIds));
  }, [searchResults]);
  const clearAllMarks = useCallback(() => {
    setMarkedResults(new Set());
  }, []);
  const selectMarkedResults = useCallback(async () => {
    try {
      const markedItems = searchResults.filter(r => markedResults.has(r.id) && r.status === "found");
      if (markedItems.length === 0) return;
      const selector = { modelObjectIds: markedItems.map(r => ({ modelId: r.modelId, objectRuntimeIds: r.ids })) };
      await api?.viewer?.setSelection?.(selector);
      setLastSelection(markedItems.map(r => ({ modelId: r.modelId, ids: r.ids })));
      setSearchMsg(t.selectAllFound);
      logMessage(`Selected ${markedItems.length} marked results`);
    } catch (e: any) {
      logMessage("Select marked error: " + e.message);
      setSearchMsg(t.selectAllError);
    }
  }, [searchResults, markedResults, api, t, logMessage]);
  const removeMarkedResults = useCallback(() => {
    setSearchResults(prev => prev.filter(r => !markedResults.has(r.id)));
    setMarkedResults(new Set());
    logMessage("Removed marked results");
  }, [markedResults, logMessage]);
  const changeResultColor = useCallback((id: number, color: string) => {
    setSearchResults(prev => prev.map(r => r.id === id ? { ...r, color } : r));
  }, []);
  const colorAllResults = useCallback(async () => {
    try {
      setBusy(true);
      setSearchMsg(t.coloring);
      for (const result of searchResults) {
        if (result.status !== "found") continue;
        const selector = { modelObjectIds: [{ modelId: result.modelId, objectRuntimeIds: result.ids }] };
        const rgb = hexToRgb(result.color || defaultColor);
        await api?.viewer?.setObjectState?.(selector, { color: { r: rgb.r, g: rgb.g, b: rgb.b, a: 255 } });
      }
      setSearchMsg("✅ " + (settings.language === "et" ? "Kõik tulemused värvitud" : "All results colored"));
      logMessage("Colored all results");
    } catch (e: any) {
      logMessage("Color all error: " + e.message);
      setSearchMsg(t.error.replace("{error}", e?.message || t.unknownError));
    } finally {
      setBusy(false);
    }
  }, [searchResults, api, defaultColor, t, settings.language, logMessage]);
  const greyOutAllModels = useCallback(async () => {
    try {
      await api?.viewer?.setObjectState?.(
        undefined,
        { color: { r: 180, g: 180, b: 180, a: 255 }, transparent: false }
      );
      logMessage("Greyed out all models");
    } catch (e) {
      logMessage("Grey out failed: " + e.message);
    }
  }, [api, logMessage]);
  const selectAndZoom = useCallback(async (modelId: string, ids: number[]) => {
    try {
      const viewer = api?.viewer;
      const selector = { modelObjectIds: [{ modelId, objectRuntimeIds: ids }] };
      await viewer?.setSelection?.(selector);
      await viewer?.setCamera?.(selector, { animationTime: 500 });
      // Värvi see tulemus kui grey out on sisse lülitatud
      if (greyOutAll) {
        const result = searchResults.find(r => r.modelId === modelId && JSON.stringify(r.ids) === JSON.stringify(ids));
        if (result) {
          const rgb = hexToRgb(result.color || defaultColor);
          await viewer?.setObjectState?.(selector, { color: { r: rgb.r, g: rgb.g, b: rgb.b, a: 255 } });
        }
      }
      logMessage(`Zoomed to modelId=${modelId}, ids=${ids.length}`);
    } catch (e: any) {
      logMessage("Zoom error: " + e.message);
    }
  }, [api, greyOutAll, searchResults, defaultColor, logMessage]);
  const initSaveView = useCallback(() => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const defaultName = `otsing ${dd}.${mm}.${yy}.${hh}.${min}`;
    setViewName(defaultName);
    setShowViewSave(true);
  }, []);
  const saveView = useCallback(async () => {
    if (!lastSelection.length || !viewName.trim()) return;
    try {
      const modelObjectIds = lastSelection.map(f => ({ modelId: f.modelId, objectRuntimeIds: f.ids }));
      await api.view.createView({ name: viewName, modelObjectIds });
      setSearchMsg(t.viewSaved.replace("{name}", viewName));
      setShowViewSave(false);
      logMessage(`View saved: ${viewName}`);
    } catch (e: any) {
      logMessage("Save view error: " + e.message);
      setSearchMsg(t.viewSaveError.replace("{error}", e?.message || t.unknownError));
    }
  }, [lastSelection, viewName, api, t, logMessage]);
  const cancelSaveView = useCallback(() => {
    setShowViewSave(false);
    setViewName("");
  }, []);
  const initSaveOrganizer = useCallback(() => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const defaultName = `otsing ${dd}.${mm}.${yy}.${hh}.${min}`;
    setOrganizerName(defaultName);
    setShowOrganizerSave(true);
  }, []);
  const saveToOrganizer = useCallback(async () => {
    if (!lastSelection.length || !organizerName.trim()) return;
    try {
      setBusy(true);
      const projectId = await api.project.getProject().then((p: any) => p.id);
      logMessage(`Saving to Organizer, projectId=${projectId}`);
      // 1. Ensure "AE RESULT" group exists
      const trees = await api.organizer.getTrees(projectId);
      let aeResultTree = trees.find((t: any) => t.name === "AE RESULT");
      if (!aeResultTree) {
        aeResultTree = await api.organizer.createTree(projectId, { name: "AE RESULT", type: "manual" });
        logMessage("Created new AE RESULT tree");
      }
      // 2. Create child node
      const childNode = await api.organizer.createNode(projectId, aeResultTree.id, { name: organizerName, parentId: aeResultTree.rootNodeId });
      logMessage(`Created child node: ${organizerName}`);
      // 3. Link objects
      let linkedCount = 0;
      for (const block of lastSelection) {
        for (const objId of block.ids) {
          await api.organizer.createLink(projectId, aeResultTree.id, childNode.id, { resourceId: objId, resourceType: "MODEL_OBJECT", modelId: block.modelId });
          linkedCount++;
        }
      }
      logMessage(`Linked ${linkedCount} objects to Organizer`);
      const path = `AE RESULT → ${organizerName}`;
      setSearchMsg(t.organizerSaved.replace("{path}", path));
      setShowOrganizerSave(false);
    } catch (e: any) {
      logMessage("Save to Organizer error: " + e.message);
      setSearchMsg(t.organizerSaveError.replace("{error}", e?.message || t.unknownError));
    } finally {
      setBusy(false);
    }
  }, [lastSelection, organizerName, api, t, logMessage]);
  const cancelSaveOrganizer = useCallback(() => {
    setShowOrganizerSave(false);
    setOrganizerName("");
  }, []);
  const removeResult = useCallback((id: number) => {
    setSearchResults(prev => prev.filter(r => r.id !== id));
    setMarkedResults(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const moveColumn = useCallback(
    (from: number, to: number) => {
      const newOrder = [...columnOrder];
      const [moved] = newOrder.splice(from, 1);
      newOrder.splice(to, 0, moved);
      setColumnOrder(newOrder);
      setHighlightedColumn(moved);
      setTimeout(() => setHighlightedColumn(null), HIGHLIGHT_DURATION_MS);
    },
    [columnOrder]
  );
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = "0.4";
  }, []);
  const handleDragEnd = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = "1";
    setDraggedIndex(null);
  }, []);
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, dropIndex: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === dropIndex) return;
      const newOrder = [...columnOrder];
      const [moved] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(dropIndex, 0, moved);
      setColumnOrder(newOrder);
      setHighlightedColumn(moved);
      setTimeout(() => setHighlightedColumn(null), HIGHLIGHT_DURATION_MS);
    },
    [draggedIndex, columnOrder]
  );
  async function exportData() {
    logMessage("Export started");
    await discover();
    if (!rows.length) {
      setExportMsg(t.noDataExport);
      logMessage("Export: No data");
      return;
    }
    const exportCols = columnOrder.filter(k => selected.has(k) && allKeys.includes(k));
    if (!exportCols.length) {
      setExportMsg(t.selectColumn);
      logMessage("Export: No columns selected");
      return;
    }
    try {
      if (exportFormat === "clipboard") {
        const body = rows.map(r => exportCols.map(k => r[k] ?? "").join("\t")).join("\n");
        const text = includeHeaders ? exportCols.join("\t") + "\n" + body : body;
        await navigator.clipboard.writeText(text);
        setExportMsg(t.copied.replace("{count}", String(rows.length)));
        logMessage(`Copied ${rows.length} rows to clipboard`);
      } else if (exportFormat === "csv") {
        const csvBody = rows.map(r => exportCols.map(k => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const csv = includeHeaders ? exportCols.join(",") + "\n" + csvBody : csvBody;
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `assembly-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        setExportMsg(t.savedCsv.replace("{count}", String(rows.length)));
        logMessage(`Saved CSV with ${rows.length} rows`);
      } else if (exportFormat === "excel") {
        const rowData = rows.map(r => exportCols.map(k => {
          const v = r[k] ?? "";
          if (FORCE_TEXT_KEYS.has(k) || /^(GUID|GUID_IFC|GUID_MS)$/i.test(k)) return `'${String(v)}`;
          return v;
        }));
        const aoa: any[][] = includeHeaders ? [exportCols, ...rowData] : rowData;
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Export");
        XLSX.writeFile(wb, `assembly-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
        setExportMsg(t.savedExcel.replace("{count}", String(rows.length)));
        logMessage(`Saved Excel with ${rows.length} rows`);
      }
    } catch (e: any) {
      setExportMsg(t.exportError.replace("{error}", e?.message || e));
      logMessage(`Export error: ${e.message}`);
    }
  }
  async function sendToGoogleSheet() {
    const { scriptUrl, secret, autoColorize } = settings;
    if (!scriptUrl || !secret) {
      setTab("settings");
      setSettingsMsg(t.fillSettings);
      logMessage("Google Sheets: Missing URL or secret");
      return;
    }
    await discover();
    if (!rows.length) {
      setExportMsg(t.noDataExport);
      logMessage("Google Sheets: No data");
      return;
    }
    const exportCols = columnOrder.filter(k => selected.has(k) && allKeys.includes(k));
    const payload = rows.map(r => {
      const obj: Row = {};
      for (const k of exportCols) obj[k] = r[k] ?? "";
      return obj;
    });
    try {
      setBusy(true);
      setExportMsg(t.sending);
      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows: payload }),
      });
      const data = await res.json();
      if (data?.ok) {
        setExportMsg(t.addedRows.replace("{count}", String(payload.length)) + (autoColorize ? ` ${t.coloring}` : ""));
        if (autoColorize) await colorLastSelection();
        logMessage(`Google Sheets: Added ${payload.length} rows`);
      } else {
        setExportMsg(t.exportError.replace("{error}", data?.error || "unknown"));
        logMessage("Google Sheets: Server error");
      }
    } catch (e: any) {
      setExportMsg(t.exportError.replace("{error}", e?.message || e));
      logMessage(`Google Sheets error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  async function colorLastSelection() {
    const viewer = api?.viewer;
    let blocks = lastSelection;
    if (!blocks?.length) {
      const mos = await getSelectedObjects(api);
      blocks = mos.map(m => ({
        modelId: String(m.modelId),
        ids: (m.objects || []).map((o: any) => Number(o?.id)).filter((n: number) => Number.isFinite(n)),
      }));
    }
    if (!blocks?.length) return;
    const safeColor = settings.colorizeColor ?? DEFAULT_COLORS.darkRed;
    const { r, g, b } = safeColor;
    for (const bl of blocks) {
      const selector = { modelObjectIds: [{ modelId: bl.modelId, objectRuntimeIds: bl.ids }] };
      await viewer?.setObjectState?.(selector, { color: { r, g, b, a: 255 } });
    }
  }
  async function resetState() {
    try {
      await api?.viewer?.setObjectState?.(undefined, { color: "reset", visible: "reset" });
      setDiscoverMsg(t.resetSuccess);
    } catch (e: any) {
      setDiscoverMsg(t.resetFailed.replace("{error}", e?.message || e));
    }
  }
  const c = styles;
  const scopeButtonStyle = (isActive: boolean): CSSProperties => ({
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid #cfd6df",
    background: isActive ? "#0a3a67" : "#f6f8fb",
    color: isActive ? "#fff" : "#757575",
    cursor: "pointer",
    flex: 1,
    fontSize: 11,
  });
  const ScanAppLazy = React.lazy(() => import("./ScanApp").catch(() => ({ default: () => <div style={c.note}>{t.inDevelopment}</div> })));
  
  const removeMarkups = useCallback(async () => {
    try {
      if (markupIds.length) {
        await api.markup.removeMarkups(markupIds);
        logMessage("Removed previous markups.");
        setMarkupIds([]);
      }
    } catch (e: any) {
      logMessage(`Error removing markups: ${e.message}`);
    }
  }, [markupIds, api, logMessage]);

  return (
    <div style={c.shell}>
      <div style={c.topbar}>
        <button style={{ ...c.tab, ...(tab === "search" ? c.tabActive : {}) }} onClick={() => setTab("search")}>
          {t.search}
        </button>
        <button style={{ ...c.tab, ...(tab === "discover" ? c.tabActive : {}) }} onClick={() => setTab("discover")}>
          {t.discover}
        </button>
        <button style={{ ...c.tab, ...(tab === "export" ? c.tabActive : {}) }} onClick={() => setTab("export")}>
          {t.export}
        </button>
        <button style={{ ...c.tab, ...(tab === "markup" ? c.tabActive : {}) }} onClick={() => setTab("markup")}>
          {t.markup}
        </button>
        <button style={{ ...c.tab, ...(tab === "scan" ? c.tabActive : {}) }} onClick={() => setTab("scan")}>
          {t.scan}
        </button>
        <button style={{ ...c.tab, ...(tab === "settings" ? c.tabActive : {}) }} onClick={() => setTab("settings")}>
          {t.settings}
        </button>
        <button style={{ ...c.tab, ...(tab === "about" ? c.tabActive : {}) }} onClick={() => setTab("about")}>
          {t.about}
        </button>
        <button style={{ ...c.tab, ...(tab === "log" ? c.tabActive : {}) }} onClick={() => setTab("log")}>
          {t.log}
        </button>
      </div>
      <div style={c.page}>
        {tab === "search" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.searchAndSelect}</h3>
            <div style={c.fieldGroup}>
              <label style={c.labelTop}>{t.searchBy}</label>
              <div
                style={{ position: "relative", width: "100%" }}
                onBlur={e => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => setIsSearchFieldDropdownOpen(false), 200);
                }}
              >
                <input
                  type="text"
                  value={searchFieldFilter}
                  onChange={e => setSearchFieldFilter(e.target.value)}
                  onFocus={() => setIsSearchFieldDropdownOpen(true)}
                  placeholder="Tippige filtriks või valige..."
                  style={{ ...c.input, width: "100%" }}
                />
                {isSearchFieldDropdownOpen && (
                  <div style={c.dropdown}>
                    {searchFieldOptions.length === 0 ? (
                      <div style={c.dropdownItem}>{t.noResults}</div>
                    ) : (
                      searchFieldOptions.map(opt => (
                        <div
                          key={opt.value}
                          style={{ ...c.dropdownItem, ...(searchField === opt.value ? c.dropdownItemSelected : {}) }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = searchField === opt.value ? "#e7f3ff" : ""; }}
                          onClick={() => {
                            setSearchField(opt.value);
                            setSearchFieldFilter(opt.label);
                            setIsSearchFieldDropdownOpen(false);
                          }}
                        >
                          {opt.label}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
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
            <div style={c.fieldGroup}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <MiniToggle checked={fuzzySearch} onChange={setFuzzySearch} color="blue" />
                <span style={{ fontSize: 11 }}>{t.fuzzySearch}</span>
              </label>
            </div>
            <div style={c.fieldGroup}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <MiniToggle checked={greyOutAll} onChange={setGreyOutAll} color="purple" />
                <span style={{ fontSize: 11 }}>{t.greyOutAll}</span>
              </label>
            </div>
            <textarea
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={t.searchPlaceholder}
              style={{ ...c.textarea, height: 160 }} // Kompaktsem
            />
            <div style={c.controls}>
              <button style={c.btn} onClick={() => searchAndSelect(true)} disabled={busy || !searchInput.trim()}>
                {busy ? t.searching : t.newSearch}
              </button>
              <button style={c.btn} onClick={() => searchAndSelect(false)} disabled={busy || !searchInput.trim()}>
                {t.addSearch}
              </button>
              {busy && (
                <button style={c.btnGhost} onClick={cancelSearch}>
                  {t.cancelSearch}
                </button>
              )}
              <button
                style={c.btnGhost}
                onClick={() => {
                  setSearchInput("");
                  setSearchResults([]);
                  setMarkedResults(new Set());
                  setSearchMsg("");
                }}
              >
                {t.clear}
              </button>
            </div>
            {!!progress.total && progress.total > 1 && (
              <div style={c.small}>
                {t.searchProgress} {progress.current}/{progress.total} {t.models}
                {progress.totalObjects > 0 ? ` • ${progress.objects}/${progress.totalObjects} objekti` : ""}
              </div>
            )}
            {searchMsg && <div style={c.note}>{searchMsg}</div>}
            {searchResults.length > 0 && (
              <div style={c.resultsBox}>
                <div style={{ marginBottom: 6, padding: 6, background: "#e7f3ff", borderRadius: 6, fontSize: 11 }}>
                  {t.searchHint}
                </div>
                <h4 style={c.resultsHeading}>
                  {t.results} ({searchResults.length}) • {t.marked} {markedCount}
                </h4>
                <div style={{ ...c.controls, marginBottom: 6 }}>
                  <button style={c.btnGhost} onClick={markAllResults}>
                    {t.markAll}
                  </button>
                  <button style={c.btnGhost} onClick={clearAllMarks} disabled={markedCount === 0}>
                    {t.clearMarks}
                  </button>
                  <button style={c.btn} onClick={selectMarkedResults} disabled={markedCount === 0}>
                    {t.selectMarked} ({markedCount})
                  </button>
                  <button
                    style={{ ...c.btnGhost, background: "#ffeeee", color: "#cc0000" }}
                    onClick={removeMarkedResults}
                    disabled={markedCount === 0}
                  >
                    {t.removeMarked}
                  </button>
                </div>
                <div style={c.resultsTable}>
                  {searchResults.map(result => (
                    <ResultRow
                      key={result.id}
                      result={result}
                      onRemove={() => removeResult(result.id)}
                      onZoom={selectAndZoom}
                      onToggleMark={toggleResultMark}
                      onColorChange={changeResultColor}
                      isMarked={markedResults.has(result.id)}
                      t={t}
                      rowHeight={rowHeight}
                    />
                  ))}
                </div>
                <div style={{ ...c.controls, marginTop: 6 }}>
                  <button style={c.btn} onClick={colorAllResults} disabled={totalFoundCount === 0}>
                    {t.colorResults}
                  </button>
                  <button style={c.btn} onClick={initSaveView} disabled={totalFoundCount === 0}>
                    {t.saveToView}
                  </button>
                  <button style={{ ...c.btn, background: "#F97316", borderColor: "#F97316" }} onClick={initSaveOrganizer} disabled={totalFoundCount === 0}>
                    {t.saveToOrganizer}
                  </button>
                </div>
                {showViewSave && (
                  <div style={{ marginTop: 8, padding: 6, border: "1px solid #cfd6df", borderRadius: 6, background: "#e7f3ff" }}>
                    <label style={c.labelTop}>{t.viewNameLabel}</label>
                    <input type="text" value={viewName} onChange={e => setViewName(e.target.value)} style={c.input} />
                    <div style={{ ...c.controls, marginTop: 6 }}>
                      <button style={c.btn} onClick={saveView} disabled={!viewName.trim()}>
                        {t.saveViewButton}
                      </button>
                      <button style={c.btnGhost} onClick={cancelSaveView}>
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                )}
                {showOrganizerSave && (
                  <div style={{ marginTop: 8, padding: 6, border: "1px solid #F97316", borderRadius: 6, background: "#fff7ed" }}>
                    <label style={c.labelTop}>{t.organizerNameLabel}</label>
                    <input type="text" value={organizerName} onChange={e => setOrganizerName(e.target.value)} style={c.input} />
                    <div style={{ ...c.controls, marginTop: 6 }}>
                      <button style={{ ...c.btn, background: "#F97316", borderColor: "#F97316" }} onClick={saveToOrganizer} disabled={!organizerName.trim()}>
                        {t.saveOrganizerButton}
                      </button>
                      <button style={c.btnGhost} onClick={cancelSaveOrganizer}>
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {tab === "discover" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.discoverFields}</h3>
            <div style={c.controls}>
              <button style={c.btn} onClick={discover} disabled={busy}>
                {busy ? "…" : t.discoverFields}
              </button>
              <button style={c.btnGhost} onClick={resetState}>
                {t.resetColors}
              </button>
            </div>
            {!!progress.total && progress.total > 1 && (
              <div style={c.small}>
                {t.progress} {progress.current}/{progress.total}
                {progress.totalObjects > 0 ? ` • ${progress.objects}/${progress.totalObjects} objekti` : ""}
              </div>
            )}
            <input placeholder={t.filterColumns} value={filter} onChange={e => setFilter(e.target.value)} style={c.inputFilter} />
            <div style={c.controls}>
              <button style={c.btnGhost} onClick={() => selectAll(true)} disabled={!rows.length}>
                {t.selectAll}
              </button>
              <button style={c.btnGhost} onClick={() => selectAll(false)} disabled={!rows.length}>
                {t.deselectAll}
              </button>
              <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>
                {t.selected} {selected.size}
              </span>
            </div>
            <div style={{ ...c.list, maxHeight: "none", overflow: "visible" }}>
              {!rows.length ? (
                <div style={c.small}>{t.noData}</div>
              ) : (
                groupedSortedEntries.map(([groupName, keys]) => {
                  const keysShown = keys.filter(matches);
                  if (!keysShown.length) return null;
                  return (
                    <div key={groupName} style={c.group}>
                      <div style={c.groupHeader}>
                        <b>{groupName}</b>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={c.mini} onClick={() => toggleGroup(keys, true)}>
                            {t.selectAll}
                          </button>
                          <button style={c.mini} onClick={() => toggleGroup(keys, false)}>
                            {t.deselectAll}
                          </button>
                        </div>
                      </div>
                      <div style={c.grid}>
                        {keysShown.map(k => (
                          <label key={k} style={c.checkRow} title={k}>
                            <input
                              type="checkbox"
                              checked={selected.has(k)}
                              onChange={() => toggle(k)}
                              style={{
                                appearance: "none",
                                width: 16,
                                height: 16,
                                borderRadius: 3,
                                border: "1px solid #cfd6df",
                                cursor: "pointer",
                                position: "relative",
                                background: selected.has(k) ? "#1E88E5" : "#fff",
                              }}
                            />
                            <span style={c.ellipsis}>{k}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div style={c.presetsRow}>
              <span style={{ alignSelf: "center", opacity: 0.7 }}>{t.presets}</span>
              <button style={c.btnGhost} onClick={presetRecommended} disabled={!rows.length}>
                {t.recommended}
              </button>
              <button style={c.btnGhost} onClick={presetTekla} disabled={!rows.length}>
                {t.tekla}
              </button>
              <button style={c.btnGhost} onClick={presetIFC} disabled={!rows.length}>
                {t.ifc}
              </button>
            </div>
            {discoverMsg && <div style={c.note}>{discoverMsg}</div>}
          </div>
        )}
        {tab === "export" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.exportData}</h3>
            <div style={c.small}>{t.exportCount.replace("{count}", String(rows.length))}</div>
            <div style={c.helpBox}>{t.exportHint}</div>
            <div style={c.controls}>
              <button style={c.btnGhost} onClick={discover} disabled={busy}>
                {busy ? t.refreshing : t.refreshData}
              </button>
              <button style={c.btnGhost} onClick={() => selectAll(true)} disabled={!rows.length}>
                {t.selectAll}
              </button>
              <button style={c.btnGhost} onClick={() => selectAll(false)} disabled={!rows.length}>
                {t.deselectAll}
              </button>
              <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>
                {t.selected} {selected.size}
              </span>
            </div>
            <div style={c.row}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <MiniToggle checked={includeHeaders} onChange={setIncludeHeaders} color="green" />
                <span style={{ fontSize: 11 }}>{t.includeHeaders}</span>
              </label>
            </div>
            <div style={c.columnListNoscroll}>
              {exportableColumns.map(col => {
                const actualIdx = columnOrder.indexOf(col);
                return (
                  <div
                    key={col}
                    draggable
                    onDragStart={e => handleDragStart(e, actualIdx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={e => handleDrop(e, actualIdx)}
                    style={{
                      ...c.columnItem,
                      ...(highlightedColumn === col ? c.columnItemHighlight : {}),
                      ...(draggedIndex === actualIdx ? c.columnItemDragging : {}),
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        flex: 1,
                        cursor: "pointer",
                        width: "calc(100% - 60px)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(col)}
                        onChange={() => toggle(col)}
                        style={{
                          appearance: "none",
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          border: "1px solid #cfd6df",
                          cursor: "pointer",
                          position: "relative",
                          background: selected.has(col) ? "#1E88E5" : "#fff",
                        }}
                      />
                      <span
                        style={{ ...c.ellipsis, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={col}
                      >
                        {col}
                      </span>
                    </label>
                    <div style={{ display: "flex", gap: 3, marginLeft: 6, minWidth: 60 }}>
                      <span style={{ ...c.dragHandle, cursor: "grab" }}>⋮⋮</span>
                      {actualIdx > 0 && (
                        <button style={c.miniBtn} onClick={() => moveColumn(actualIdx, actualIdx - 1)} title="Move up">
                          ↑
                        </button>
                      )}
                      {actualIdx < columnOrder.length - 1 && (
                        <button style={c.miniBtn} onClick={() => moveColumn(actualIdx, actualIdx + 1)} title="Move down">
                          ↓
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
            <MarkupAdvanced
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
      </div>
    </div>
  );
}
/* ------------------------------- STYLES ---------------------------------- */
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
};
