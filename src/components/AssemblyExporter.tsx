import { useEffect, useMemo, useRef, useState, useCallback, memo, type CSSProperties, type DragEvent, Suspense } from "react";
import * as XLSX from "xlsx";
import React from "react";
type Language = "et" | "en";
type Tab = "search" | "discover" | "export" | "settings" | "about" | "scan";
type Row = Record<string, string>;
type ExportFormat = "clipboard" | "excel" | "csv";
const translations = {
  et: {
    search: "OTSI",
    discover: "AVASTA",
    export: "EXPORT",
    settings: "SEADED",
    about: "INFO",
    scan: "SCAN",
    searchAndSelect: "Otsi ja vali",
    searchBy: "Otsitav väli:",
    searchScope: "Otsi ulatus:",
    scopeAll: "Kõik saadaval",
    scopeSelected: "Valitud",
    searchPlaceholder: "Kleebi siia otsitavad väärtused (üks rea kohta või komadega eraldatud)\nNäiteks:\nBM-3\n2COL23\nRBP-111",
    searching: "Otsin…",
    searchButton: "Otsi ja vali",
    cancelSearch: "Katkesta otsing",
    clear: "Tühjenda",
    searchProgress: "Otsingu progress:",
    results: "Tulemused",
    zoom: "🔍 Zoom",
    remove: "✕",
    selectAll: "Vali kõik",
    discoverFields: "Avasta väljad",
    resetColors: "Lähtesta värvid",
    progress: "Progress:",
    filterColumns: "Filtreeri veerge…",
    deselectAll: "Tühjenda",
    selected: "Valitud:",
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
    autoColorize: "Auto colorize",
    color: "Värv",
    colorTooltip: "Vali värv, millega märgitakse 3D vaates eksporditavad objektid",
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
    version: "Assembly Exporter v5.72 – Trimble Connect",
    features: "• Auto-discover on selection change\n• Product Name support\n• Bilingual EST/ENG\n• Performance optimized\n• React.memo & useMemo",
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
    pasteHint: "Kleepi siia tekst...",
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
    saveToView: "SALVESTA TULEM VAATESSE",
    viewNameLabel: "Vaate nimi:",
    saveViewButton: "Salvesta vaade",
    cancel: "Tühista",
    viewSaved: "✅ Vaade salvestatud: {name}",
    viewSaveError: "❌ Viga vaate salvestamisel: {error}",
  },
  en: {
    search: "SEARCH",
    discover: "DISCOVER",
    export: "EXPORT",
    settings: "SETTINGS",
    about: "ABOUT",
    scan: "SCAN",
    searchAndSelect: "Search and select",
    searchBy: "Search by:",
    searchScope: "Search scope:",
    scopeAll: "All available",
    scopeSelected: "Selected",
    searchPlaceholder: "Paste search values here (one per line or comma-separated)\nExample:\nBM-3\n2COL23\nRBP-111",
    searching: "Searching…",
    searchButton: "Search and select",
    cancelSearch: "Cancel search",
    clear: "Clear",
    searchProgress: "Search progress:",
    results: "Results",
    zoom: "🔍 Zoom",
    remove: "✕",
    selectAll: "Select all",
    discoverFields: "Discover Fields",
    resetColors: "Reset colors",
    progress: "Progress:",
    filterColumns: "Filter columns…",
    deselectAll: "Deselect all",
    selected: "Selected:",
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
    color: "Color",
    colorTooltip: "Select color to mark exported objects in 3D view",
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
    version: "Assembly Exporter v5.0 – Trimble Connect",
    features: "• Auto-discover on selection change\n• Product Name support\n• Bilingual EST/ENG\n• Performance optimized\n• React.memo & useMemo",
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
    saveToView: "Save result to view",
    viewNameLabel: "View name:",
    saveViewButton: "Save view",
    cancel: "Cancel",
    viewSaved: "✅ View saved: {name}",
    viewSaveError: "❌ Error saving view: {error}",
  }
};
const LOCKED_ORDER = ["GUID", "GUID_IFC", "GUID_MS", "Project", "ModelId", "FileName", "Name", "Type"] as const;
const FORCE_TEXT_KEYS = new Set(["Tekla_Assembly.AssemblyCast_unit_top_elevation", "Tekla_Assembly.AssemblyCast_unit_bottom_elevation"]);
const DEBOUNCE_MS = 300;
const HIGHLIGHT_DURATION_MS = 2000;
const MESSAGE_DURATION_MS = 3000;
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

function sanitizeKey(s: string) {
  return String(s).replace(/\s+/g, "_").replace(/[^\w.-]/g, "").trim();
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
function classifyGuid(val: string): "IFC" | "MS" | "UNKNOWN" {
  const s = val.trim();
  if (/^[0-9A-Za-z_$]{22}$/.test(s)) return "IFC";
  if (/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(s) || /^[0-9A-Fa-f]{32}$/.test(s)) return "MS";
  return "UNKNOWN";
}

/** ---------- UUS HELPER: loe omadused olenemata viewer-versioonist ---------- */
async function fetchFullProperties(api: any, modelId: string, runtimeIds: number[]) {
  // Klassikaline
  try {
    const res = await api?.viewer?.getObjectProperties?.(modelId, runtimeIds);
    if (Array.isArray(res) && res.length && res.some((r: any) => Array.isArray(r?.properties) && r.properties.length)) {
      return res;
    }
  } catch {}

  // 3. argumendiga variant
  try {
    const res = await api?.viewer?.getObjectProperties?.(modelId, runtimeIds, { includeAllCategories: true });
    if (Array.isArray(res) && res.length && res.some((r: any) => Array.isArray(r?.properties) && r.properties.length)) {
      return res;
    }
  } catch {}

  // Uuem alternatiivne signatuur
  try {
    const res = await api?.viewer?.getProperties?.({ modelId, objectRuntimeIds: runtimeIds });
    if (Array.isArray(res) && res.length && res.some((r: any) => Array.isArray(r?.properties) && r.properties.length)) {
      return res;
    }
  } catch {}

  // Tagasta tühi struktuur sama pikkusega
  return runtimeIds.map(id => ({ id, properties: [] }));
}

/** ---------- MUUDETUD: tolerantne propide lamedaks ajamine ---------- */
async function flattenProps(obj: any, modelId: string, projectName: string, modelNameById: Map<string, string>, api: any): Promise<Row> {
  const out: Row = {
    GUID: "", GUID_IFC: "", GUID_MS: "", Project: String(projectName || ""),
    ModelId: String(modelId),
    FileName: modelNameById.get(modelId) || "", Name: "", Type: "Unknown",
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

  // Standard: propertySets massiiv
  if (Array.isArray(obj?.properties)) {
    for (const set of obj.properties) {
      const setName = set?.name || "Unknown";
      for (const p of (set?.properties || [])) {
        const value = p?.displayValue ?? p?.value;
        push(setName, p?.name || "Unknown", value);
      }
    }
  } else if (obj && typeof obj === "object") {
    // Mõned buildid: propertySets-nimeline võti
    if (Array.isArray((obj as any)?.propertySets)) {
      for (const ps of (obj as any).propertySets) {
        const setName = ps?.name || "Unknown";
        for (const p of (ps?.properties || [])) {
          const value = p?.displayValue ?? p?.value;
          push(setName, p?.name || "Unknown", value);
        }
      }
    }
    // Mõnikord lame key/value “properties”
    if ((obj as any)?.properties && typeof (obj as any).properties === "object" && !Array.isArray((obj as any).properties)) {
      for (const [k, v] of Object.entries((obj as any).properties)) push("Properties", k, v);
    }
  }

  // Meta
  if (obj?.id != null) out.ObjectId = String(obj.id);
  if (obj?.name) out.Name = String(obj.name);
  if (obj?.type) out.Type = String(obj.type);

  // Product blokk – tõsta eraldi Product.*
  if (obj?.product && typeof obj.product === "object") {
    for (const [k, v] of Object.entries(obj.product)) {
      if (v == null) continue;
      push("Product", k, v as any);
    }
  }

  // GUID tuvastus
  let guidIfc = "";
  let guidMs = "";
  for (const [k, v] of propMap) {
    if (!/guid|globalid|tekla_guid|id_guid/i.test(k)) continue;
    const cls = classifyGuid(v);
    if (cls === "IFC" && !guidIfc) guidIfc = v;
    if (cls === "MS" && !guidMs) guidMs = v;
  }
  if (!guidIfc && obj?.id != null) {
    try {
      const externalIds = await api.viewer.convertToObjectIds(modelId, [obj.id]);
      const externalId = externalIds?.[0];
      if (externalId && classifyGuid(externalId) === "IFC") guidIfc = externalId;
    } catch {}
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

const ResultRow = memo(({ result, onRemove, onZoom, t }: any) => {
  const displayValue = result.actualValue || result.originalValue;
  const isPartialMatch = result.isPartial && result.actualValue && result.actualValue !== result.originalValue;

  return (
    <div style={{
      ...styles.resultRow,
      ...(result.status === 'found' ? (result.isPartial ? styles.resultRowPartial : styles.resultRowFound) : styles.resultRowNotFound)
    }}>
      <span style={styles.resultStatus}>{result.status === 'found' ? (result.isPartial ? '⚠️' : '✅') : '❌'}</span>
      <span style={styles.resultValue} title={isPartialMatch ? `Otsisin: ${result.originalValue} → Leidsin: ${displayValue}` : displayValue}>
        {displayValue}
        {isPartialMatch && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>← {result.originalValue}</span>}
      </span>
      <span style={styles.resultCount}>{result.status === 'found' ? `${result.ids?.length || 0}x` : '-'}</span>
      <div style={styles.resultActions}>
        {result.status === 'found' && result.modelId && result.ids && (
          <button style={styles.miniBtn} onClick={() => onZoom(result.modelId, result.ids)} title="Zoom">{t.zoom}</button>
        )}
        <button style={{ ...styles.miniBtn, background: "#ffdddd", color: "#cc0000" }} onClick={onRemove} title="Remove">{t.remove}</button>
      </div>
    </div>
  );
});

type Props = { api: any };
export default function AssemblyExporter({ api }: Props) {
  const [settings, updateSettings] = useSettings();
  const t = translations[settings.language];
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
  const [busy, setBusy] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0, objects: 0, totalObjects: 0 } as any);
  const [searchInput, setSearchInput] = useState("");
  const [searchField, setSearchField] = useState("AssemblyMark");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("clipboard");
  const [lastSelection, setLastSelection] = useState<Array<{ modelId: string; ids: number[] }>>([]);
  const [searchResults, setSearchResults] = useState<Array<any>>([]);
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [showViewSave, setShowViewSave] = useState(false);
  const [viewName, setViewName] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const tmr = setTimeout(() => setDebouncedFilter(filter), DEBOUNCE_MS);
    return () => clearTimeout(tmr);
  }, [filter]);
  useEffect(() => { if (discoverMsg) { const tmr = setTimeout(() => setDiscoverMsg(""), MESSAGE_DURATION_MS); return () => clearTimeout(tmr); } }, [discoverMsg]);
  useEffect(() => { if (exportMsg) { const tmr = setTimeout(() => setExportMsg(""), MESSAGE_DURATION_MS); return () => clearTimeout(tmr); } }, [exportMsg]);
  useEffect(() => { if (settingsMsg) { const tmr = setTimeout(() => setSettingsMsg(""), MESSAGE_DURATION_MS); return () => clearTimeout(tmr); } }, [settingsMsg]);

  const allKeys = useMemo(() => Array.from(new Set(rows.flatMap(r => Object.keys(r)))).sort(), [rows]);

  const searchFieldOptions = useMemo(() => {
    const base = [
      { value: "AssemblyMark", label: "Kooste märk (BLOCK)" },
      { value: "GUID_IFC", label: "IFC GUID" },
      { value: "GUID_MS", label: "MS/Tekla GUID" },
      { value: "Name", label: "Nimi" },
    ];
    const custom = allKeys
      .filter(k => !['GUID', 'GUID_IFC', 'GUID_MS', 'Name', 'Type', 'Project', 'ModelId', 'FileName', 'ObjectId'].includes(k))
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
    () => searchResults.reduce((sum, r) => sum + (r.status === 'found' ? r.ids?.length || 0 : 0), 0),
    [searchResults]
  );

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
      selectionTimeout = setTimeout(() => { if (!busy) discover(); }, 800);
    };
    try { api.viewer.on?.('selectionChanged', handleSelectionChange); } catch (e) { console.warn("Selection listener setup failed:", e); }
    return () => {
      clearTimeout(selectionTimeout);
      try { api.viewer.off?.('selectionChanged', handleSelectionChange); } catch {}
    };
  }, [api, busy]);

  useEffect(() => { if (tab === "export" && !busy) discover(); }, [tab]);
  useEffect(() => { if (tab === "discover" && !busy) discover(); }, [tab]);

  const matches = useCallback((k: string) => filteredKeysSet.has(k), [filteredKeysSet]);
  const toggle = useCallback((k: string) => setSelected(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }), []);
  const toggleGroup = useCallback((keys: string[], on: boolean) => setSelected(s => { const n = new Set(s); for (const k of keys) on ? n.add(k) : n.delete(k); return n; }), []);
  const selectAll = useCallback((on: boolean) => setSelected(() => (on ? new Set(allKeys) : new Set())), [allKeys]);

  function presetRecommended() {
    const wanted = new Set([...LOCKED_ORDER, "ReferenceObject.Common_Type", "ReferenceObject.File_Name"]);
    setSelected(new Set(allKeys.filter(k => wanted.has(k))));
  }
  function presetTekla() { setSelected(new Set(allKeys.filter(k => k.startsWith("Tekla_Assembly.") || k === "ReferenceObject.File_Name"))); }
  function presetIFC() {
    const wanted = new Set(["GUID_IFC", "GUID_MS", "ReferenceObject.Common_Type", "ReferenceObject.File_Name"]);
    setSelected(new Set(allKeys.filter(k => wanted.has(k))));
  }

  async function discover() {
    if (!api?.viewer) { setDiscoverMsg(t.apiError); return; }
    try {
      setBusy(true);
      setDiscoverMsg(t.selectObjects);
      setProgress({ current: 0, total: 0, objects: 0, totalObjects: 0 });
      const selectedWithBasic = await getSelectedObjects(api);
      if (!selectedWithBasic.length) { setDiscoverMsg(t.selectObjects); setRows([]); return; }
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
          t.processing.replace('{current}', String(i + 1)).replace('{total}', String(selectedWithBasic.length)) +
          ` (${processedObjects}/${totalObjs} ${settings.language === "et" ? "objekti" : "objects"})`
        );
        const objectRuntimeIds = objects.map((o: any) => Number(o?.id)).filter(n => Number.isFinite(n));

        let fullObjects = objects;
        try {
          const fullProperties = await fetchFullProperties(api, modelId, objectRuntimeIds);
          fullObjects = objects.map((obj: any, idx: number) => ({ ...obj, properties: fullProperties[idx]?.properties || obj.properties }));
        } catch (e) {
          console.warn(`fetchFullProperties failed for model ${modelId}:`, e);
        }

        const flattened = await Promise.all(fullObjects.map(o => flattenProps(o, modelId, projectName, nameMap, api)));
        out.push(...flattened);
        lastSel.push({ modelId, ids: objectRuntimeIds });

        processedObjects += objects.length;
        setProgress({ current: i + 1, total: selectedWithBasic.length, objects: processedObjects, totalObjects: totalObjs });
      }

      setRows(out);
      setLastSelection(lastSel);
      setDiscoverMsg(t.foundObjects
        .replace('{count}', String(out.length))
        .replace('{keys}', String(Array.from(new Set(out.flatMap(r => Object.keys(r)))).length)));
    } catch (e: any) {
      console.error(e);
      setDiscoverMsg(t.error.replace('{error}', e?.message || t.unknownError));
    } finally { setBusy(false); }
  }

  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setBusy(false);
      setSearchMsg(t.searchCancelled);
      abortControllerRef.current = null;
    }
  }, [t]);

  async function searchAndSelect() {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    try {
      setBusy(true);
      setSearchMsg(t.searching);
      setSearchResults([]);
      setProgress({ current: 0, total: 0, objects: 0, totalObjects: 0 });

      const searchValues = searchInput.split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean);
      const uniqueSearchValues = [...new Set(searchValues)];
      const hasDuplicates = searchValues.length > uniqueSearchValues.length;
      if (!uniqueSearchValues.length) { setSearchMsg(t.enterValue); setBusy(false); return; }

      const viewer = api?.viewer;
      let mos = searchScope === "selected" ? await viewer?.getObjects({ selected: true }) : await viewer?.getObjects();
      if (!Array.isArray(mos)) { if (abortController.signal.aborted) return; setSearchMsg(t.cannotRead); setBusy(false); return; }

      const totalObjs = mos.reduce((sum, mo) => sum + (mo.objects?.length || 0), 0);
      const found: Array<{ modelId: string; ids: number[] }> = [];
      const foundValues = new Map<string, { original: string; modelId: string; ids: number[]; isPartial: boolean; actualValue: string }>();
      setProgress({ current: 0, total: mos.length, objects: 0, totalObjects: totalObjs });

      const MAX_RESULTS = 500;
      let processedObjects = 0;

      for (let mIdx = 0; mIdx < mos.length; mIdx++) {
        if (abortController.signal.aborted) return;
        const mo = mos[mIdx];
        const modelId = String(mo.modelId);
        const objectRuntimeIds = (mo.objects || []).map((o: any) => Number(o?.id)).filter(n => Number.isFinite(n));
        if (!objectRuntimeIds.length) continue;

        let fullProperties: any[] = [];
        try {
          fullProperties = await fetchFullProperties(api, modelId, objectRuntimeIds);
        } catch (e) {
          if (abortController.signal.aborted) return;
          console.warn(`fetchFullProperties failed for model ${modelId}:`, e);
          fullProperties = mo.objects || [];
        }

        const matchIds: number[] = [];
        for (let i = 0; i < fullProperties.length; i++) {
          if (abortController.signal.aborted) return;

          if (found.reduce((sum, f) => sum + f.ids.length, 0) >= MAX_RESULTS) {
            setSearchMsg(settings.language === "et"
              ? `⚠️ Peatatud: leidsin ${MAX_RESULTS}+ vastet. Täpsusta otsingut.`
              : `⚠️ Stopped: found ${MAX_RESULTS}+ matches. Refine search.`);
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
            const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
            for (const set of props) {
              for (const p of set?.properties ?? []) {
                if (/guid|globalid/i.test(String(p?.name))) {
                  const val = String(p?.value || p?.displayValue || "").trim();
                  const cls = classifyGuid(val);
                  if ((searchField === "GUID_IFC" && cls === "IFC") || (searchField === "GUID_MS" && cls === "MS")) {
                    matchValue = val;
                    break;
                  }
                }
              }
              if (matchValue) break;
            }
            if (!matchValue && searchField === "GUID_IFC") {
              try {
                const extIds = await api.viewer.convertToObjectIds(modelId, [objId]);
                matchValue = (extIds[0] || "");
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
            const searchParts = searchField.split('.');
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
                if (fullKeySanitized.toLowerCase() === searchField.toLowerCase() || propNameSanitized.toLowerCase().includes(propPart.toLowerCase())) {
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
            return fuzzySearch
              ? (vLower && matchLower && (matchLower.includes(vLower) || vLower.includes(matchLower)))
              : (vLower === matchLower);
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
                isPartial
              });
            }
            foundValues.get(uniqueKey)!.ids.push(objId);
          }
        }
        if (matchIds.length) found.push({ modelId, ids: matchIds });

        processedObjects += fullProperties.length;
        setProgress({ current: mIdx + 1, total: mos.length, objects: processedObjects, totalObjects: totalObjs });
        setSearchMsg(settings.language === "et"
          ? `Otsin... ${processedObjects}/${totalObjs} objekti töödeldud`
          : `Searching... ${processedObjects}/${totalObjs} objects processed`);

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
                  isPartial: false
                });
              }
            } catch {}
          }
        }
      }

      const results: any[] = [];
      if (fuzzySearch) {
        for (const [, data] of foundValues) {
          results.push({
            originalValue: data.original,
            actualValue: data.actualValue,
            value: data.actualValue.toLowerCase(),
            status: 'found',
            modelId: data.modelId,
            ids: data.ids,
            isPartial: data.isPartial
          });
        }
      } else {
        for (const originalValue of uniqueSearchValues) {
          const lower = originalValue.toLowerCase();
          let foundEntry = false;
          for (const [, data] of foundValues) {
            if (data.original.toLowerCase() === lower) {
              results.push({
                originalValue: data.original,
                actualValue: data.actualValue,
                value: lower,
                status: 'found',
                modelId: data.modelId,
                ids: data.ids,
                isPartial: false
              });
              foundEntry = true;
              break;
            }
          }
          if (!foundEntry) {
            results.push({ originalValue, value: lower, status: 'notfound' });
          }
        }
      }
      setSearchResults(results);

      if (found.length) {
        const selector = { modelObjectIds: found.map(f => ({ modelId: f.modelId, objectRuntimeIds: f.ids })) };
        await api?.viewer?.setSelection?.(selector);
        setLastSelection(found);
        const notFound = results.filter(r => r.status === 'notfound').map(r => r.originalValue);
        let msg = t.foundValues.replace('{found}', String(new Set(results.filter(r => r.status === 'found').map((r: any) => r.originalValue.toLowerCase())).size))
                               .replace('{total}', String(uniqueSearchValues.length));
        if (notFound.length) msg += ` ${t.notFound} ${notFound.join(", ")}`;
        else msg += ` ${t.allFound}`;
        if (hasDuplicates) msg += ` ${t.duplicates}`;
        setSearchMsg(msg);
      } else {
        setSearchMsg(`${t.noneFound} ${uniqueSearchValues.join(", ")}`);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') setSearchMsg(t.searchCancelled);
      else { console.error(e); setSearchMsg(t.error.replace('{error}', e?.message || t.unknownError)); }
    } finally {
      setBusy(false);
      abortControllerRef.current = null;
    }
  }

  const selectAllFound = useCallback(async () => {
    try {
      const allFound = searchResults
        .filter(r => r.status === 'found' && r.modelId && r.ids)
        .map(r => ({ modelId: r.modelId, ids: r.ids }));
      if (allFound.length) {
        const selector = { modelObjectIds: allFound.map(f => ({ modelId: f.modelId, objectRuntimeIds: f.ids })) };
        await api?.viewer?.setSelection?.(selector);
        setLastSelection(allFound);
        setSearchMsg(t.selectAllFound);
      }
    } catch (e: any) {
      console.error("Select all error:", e);
      setSearchMsg(t.selectAllError);
    }
  }, [searchResults, api, t]);

  const selectAndZoom = useCallback(async (modelId: string, ids: number[]) => {
    try {
      const viewer = api?.viewer;
      const selector = { modelObjectIds: [{ modelId, objectRuntimeIds: ids }] };
      await viewer?.setSelection?.(selector);
      await viewer?.setCamera?.(selector, { animationTime: 500 });
    } catch (e: any) {
      console.error("Zoom error:", e);
    }
  }, [api]);

  const initSaveView = useCallback(() => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear() % 100).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const defaultName = `otsing ${dd}.${mm}.${yy}.${hh}.${min}`;
    setViewName(defaultName);
    setShowViewSave(true);
  }, []);

  const saveView = useCallback(async () => {
    if (!lastSelection.length || !viewName.trim()) return;
    try {
      const modelObjectIds = lastSelection.map(f => ({ modelId: f.modelId, objectRuntimeIds: f.ids }));
      await api.view.createView({ name: viewName, modelObjectIds });
      setSearchMsg(t.viewSaved.replace('{name}', viewName));
      setShowViewSave(false);
    } catch (e: any) {
      console.error("Save view error:", e);
      setSearchMsg(t.viewSaveError.replace('{error}', e?.message || t.unknownError));
    }
  }, [lastSelection, viewName, api, t]);

  const cancelSaveView = useCallback(() => {
    setShowViewSave(false);
    setViewName("");
  }, []);

  const moveColumn = useCallback((from: number, to: number) => {
    const newOrder = [...columnOrder];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, moved);
    setColumnOrder(newOrder);
    setHighlightedColumn(moved);
    setTimeout(() => setHighlightedColumn(null), HIGHLIGHT_DURATION_MS);
  }, [columnOrder]);

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
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const newOrder = [...columnOrder];
    const [moved] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, moved);
    setColumnOrder(newOrder);
    setHighlightedColumn(moved);
    setTimeout(() => setHighlightedColumn(null), HIGHLIGHT_DURATION_MS);
  }, [draggedIndex, columnOrder]);

  async function exportData() {
    await discover();
    if (!rows.length) { setExportMsg(t.noDataExport); return; }
    const exportCols = columnOrder.filter(k => selected.has(k) && allKeys.includes(k));
    if (!exportCols.length) { setExportMsg(t.selectColumn); return; }
    try {
      if (exportFormat === "clipboard") {
        const body = rows.map(r => exportCols.map(k => (r[k] ?? "")).join("\t")).join("\n");
        const text = includeHeaders ? exportCols.join("\t") + "\n" + body : body;
        await navigator.clipboard.writeText(text);
        setExportMsg(t.copied.replace('{count}', String(rows.length)));
      } else if (exportFormat === "csv") {
        const csvBody = rows.map(r => exportCols.map(k => `"${((r[k] ?? "") as string).replace(/"/g, '""')}"`).join(",")).join("\n");
        const csv = includeHeaders ? exportCols.join(",") + "\n" + csvBody : csvBody;
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `assembly-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        setExportMsg(t.savedCsv.replace('{count}', String(rows.length)));
      } else if (exportFormat === "excel") {
        const rowData = rows.map(r => exportCols.map((k) => {
          const v = r[k] ?? "";
          if (FORCE_TEXT_KEYS.has(k) || /^(GUID|GUID_IFC|GUID_MS)$/i.test(k)) return `'${String(v)}`;
          return v;
        }));
        const aoa: any[][] = includeHeaders ? [exportCols, ...rowData] : rowData;
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Export");
        XLSX.writeFile(wb, `assembly-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
        setExportMsg(t.savedExcel.replace('{count}', String(rows.length)));
      }
    } catch (e: any) {
      setExportMsg(t.exportError.replace('{error}', e?.message || e));
    }
  }

  async function sendToGoogleSheet() {
    const { scriptUrl, secret, autoColorize } = settings;
    if (!scriptUrl || !secret) { setTab("settings"); setSettingsMsg(t.fillSettings); return; }
    await discover();
    if (!rows.length) { setExportMsg(t.noDataExport); return; }
    const exportCols = columnOrder.filter(k => selected.has(k) && allKeys.includes(k));
    const payload = rows.map(r => { const obj: Row = {}; for (const k of exportCols) obj[k] = r[k] ?? ""; return obj; });
    try {
      setBusy(true);
      setExportMsg(t.sending);
      const res = await fetch(scriptUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, rows: payload }) });
      const data = await res.json();
      if (data?.ok) {
        setExportMsg(t.addedRows.replace('{count}', String(payload.length)) + (autoColorize ? ` ${t.coloring}` : ""));
        if (autoColorize) await colorLastSelection();
      } else {
        setExportMsg(t.exportError.replace('{error}', data?.error || "unknown"));
      }
    } catch (e: any) {
      setExportMsg(t.exportError.replace('{error}', e?.message || e));
    } finally { setBusy(false); }
  }

  async function colorLastSelection() {
    const viewer = api?.viewer;
    let blocks = lastSelection;
    if (!blocks?.length) {
      const mos = await getSelectedObjects(api);
      blocks = mos.map(m => ({ modelId: String(m.modelId), ids: (m.objects || []).map((o: any) => Number(o?.id)).filter((n) => Number.isFinite(n)) }));
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
      setDiscoverMsg(t.resetFailed.replace('{error}', e?.message || e));
    }
  }

  const removeResult = useCallback((index: number) => setSearchResults(prev => prev.filter((_, i) => i !== index)), []);
  const c = styles;
  const scopeButtonStyle = (isActive: boolean): CSSProperties => ({
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #cfd6df",
    background: isActive ? "#0a3a67" : "#f6f8fb",
    color: isActive ? "#fff" : "#000",
    cursor: "pointer",
    flex: 1,
  });
  const searchNoteStyle = { ...c.note, fontSize: 11 };
  const ScanAppLazy = React.lazy(() => import('./ScanApp').catch(() => ({ default: () => <div style={c.note}>{t.inDevelopment}</div> })));

  return (
    <div style={c.shell}>
      <div style={c.topbar}>
        <button style={{ ...c.tab, ...(tab === "search" ? c.tabActive : {}) }} onClick={() => setTab("search")}>{t.search}</button>
        <button style={{ ...c.tab, ...(tab === "discover" ? c.tabActive : {}) }} onClick={() => setTab("discover")}>{t.discover}</button>
        <button style={{ ...c.tab, ...(tab === "export" ? c.tabActive : {}) }} onClick={() => setTab("export")}>{t.export}</button>
        <button style={{ ...c.tab, ...(tab === "scan" ? c.tabActive : {}) }} onClick={() => setTab("scan")}>{t.scan}</button>
        <button style={{ ...c.tab, ...(tab === "settings" ? c.tabActive : {}) }} onClick={() => setTab("settings")}>{t.settings}</button>
        <button style={{ ...c.tab, ...(tab === "about" ? c.tabActive : {}) }} onClick={() => setTab("about")}>{t.about}</button>
      </div>

      <div style={c.page}>
        {tab === "search" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.searchAndSelect}</h3>
            <div style={c.fieldGroup}>
              <label style={c.labelTop}>{t.searchBy}</label>
              <div style={{ position: "relative", width: "100%" }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => setIsSearchFieldDropdownOpen(false), 200); }}>
                <input type="text" value={searchFieldFilter} onChange={(e) => setSearchFieldFilter(e.target.value)} onFocus={() => setIsSearchFieldDropdownOpen(true)} placeholder="Tippige filtriks või valige..." style={{...c.input, width: "100%"}} />
                {isSearchFieldDropdownOpen && (
                  <div style={c.dropdown}>
                    {searchFieldOptions.length === 0 ? <div style={c.dropdownItem}>{t.noResults}</div> : searchFieldOptions.map(opt => (
                      <div key={opt.value}
                           style={{ ...c.dropdownItem, ...(searchField === opt.value ? c.dropdownItemSelected : {}) }}
                           onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f5f5"; }}
                           onMouseLeave={(e) => { e.currentTarget.style.background = searchField === opt.value ? "#e7f3ff" : ""; }}
                           onClick={() => { setSearchField(opt.value); setSearchFieldFilter(opt.label); setIsSearchFieldDropdownOpen(false); }}>
                        {opt.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={c.fieldGroup}>
              <label style={c.labelTop}>{t.searchScope}</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={scopeButtonStyle(searchScope === "available")} onClick={() => setSearchScope("available")}>{t.scopeAll}</button>
                <button style={scopeButtonStyle(searchScope === "selected")} onClick={() => setSearchScope("selected")}>{t.scopeSelected}</button>
              </div>
            </div>
            <div style={c.fieldGroup}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={fuzzySearch} onChange={(e) => setFuzzySearch(e.target.checked)} />
                <span>{settings.language === "et" ? "Otsi sarnaseid (osaline vaste)" : "Fuzzy search (partial match)"}</span>
              </label>
            </div>
            <textarea value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t.searchPlaceholder} style={{ ...c.textarea, height: 200 }} />
            <div style={c.controls}>
              <button style={c.btn} onClick={searchAndSelect} disabled={busy || !searchInput.trim()}>{busy ? t.searching : t.searchButton}</button>
              {busy && <button style={c.btnGhost} onClick={cancelSearch}>{t.cancelSearch}</button>}
              <button style={c.btnGhost} onClick={() => { setSearchInput(""); setSearchResults([]); setSearchMsg(""); }}>{t.clear}</button>
            </div>
            {!!progress.total && progress.total > 1 &&
              <div style={c.small}>
                {t.searchProgress} {progress.current}/{progress.total} {t.models}
                {progress.totalObjects > 0 ? ` • ${progress.objects}/${progress.totalObjects} objekti` : ""}
              </div>}
            {searchMsg && <div style={searchNoteStyle}>{searchMsg}</div>}
            {searchResults.length > 0 && (
              <div style={c.resultsBox}>
                <h4 style={c.resultsHeading}>{t.results} ({searchResults.length})</h4>
                <div style={c.resultsTable}>
                  {searchResults.map((result, idx) =>
                    <ResultRow key={idx} result={result} onRemove={() => removeResult(idx)} onZoom={selectAndZoom} t={t} />
                  )}
                </div>
                <div style={{ ...c.controls, marginTop: 8, justifyContent: "flex-end" }}>
                  <button style={c.btn} onClick={selectAllFound} disabled={totalFoundCount === 0}>{t.selectAll} ({totalFoundCount}x)</button>
                  <button style={c.btn} onClick={initSaveView} disabled={totalFoundCount === 0}>{t.saveToView}</button>
                </div>
                {showViewSave && (
                  <div style={{ marginTop: 12, padding: 8, border: "1px solid #cfd6df", borderRadius: 8, background: "#f6f8fb" }}>
                    <label style={c.labelTop}>{t.viewNameLabel}</label>
                    <input type="text" value={viewName} onChange={(e) => setViewName(e.target.value)} style={c.input} />
                    <div style={{ ...c.controls, marginTop: 8 }}>
                      <button style={c.btn} onClick={saveView} disabled={!viewName.trim()}>{t.saveViewButton}</button>
                      <button style={c.btnGhost} onClick={cancelSaveView}>{t.cancel}</button>
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
              <button style={c.btn} onClick={discover} disabled={busy}>{busy ? "…" : t.discoverFields}</button>
              <button style={c.btnGhost} onClick={resetState}>{t.resetColors}</button>
            </div>
            {!!progress.total && progress.total > 1 &&
              <div style={c.small}>
                {t.progress} {progress.current}/{progress.total}
                {progress.totalObjects > 0 ? ` • ${progress.objects}/${progress.totalObjects} objekti` : ""}
              </div>}
            <input placeholder={t.filterColumns} value={filter} onChange={(e) => setFilter(e.target.value)} style={c.inputFilter} />
            <div style={c.controls}>
              <button style={c.btnGhost} onClick={() => selectAll(true)} disabled={!rows.length}>{t.selectAll}</button>
              <button style={c.btnGhost} onClick={() => selectAll(false)} disabled={!rows.length}>{t.deselectAll}</button>
              <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>{t.selected} {selected.size}</span>
            </div>
            <div style={{ ...c.list, maxHeight: "none", overflow: "visible" }}>
              {!rows.length ? <div style={c.small}>{t.noData}</div> : groupedSortedEntries.map(([groupName, keys]) => {
                const keysShown = keys.filter(matches);
                if (!keysShown.length) return null;
                return (
                  <div key={groupName} style={c.group}>
                    <div style={c.groupHeader}>
                      <b>{groupName}</b>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={c.mini} onClick={() => toggleGroup(keys, true)}>{t.selectAll}</button>
                        <button style={c.mini} onClick={() => toggleGroup(keys, false)}>{t.deselectAll}</button>
                      </div>
                    </div>
                    <div style={c.grid}>
                      {keysShown.map((k) =>
                        <label key={k} style={c.checkRow} title={k}>
                          <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} />
                          <span style={c.ellipsis}>{k}</span>
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={c.presetsRow}>
              <span style={{ alignSelf: "center", opacity: 0.7 }}>{t.presets}</span>
              <button style={c.btnGhost} onClick={presetRecommended} disabled={!rows.length}>{t.recommended}</button>
              <button style={c.btnGhost} onClick={presetTekla} disabled={!rows.length}>{t.tekla}</button>
              <button style={c.btnGhost} onClick={presetIFC} disabled={!rows.length}>{t.ifc}</button>
            </div>
            {discoverMsg && <div style={c.note}>{discoverMsg}</div>}
          </div>
        )}

        {tab === "export" && (
          <div style={c.section}>
            <h3 style={c.heading}>{t.exportData}</h3>
            <div style={c.small}>{t.exportCount.replace('{count}', String(rows.length))}</div>
            <div style={c.helpBox}>{t.exportHint}</div>
            <div style={c.controls}>
              <button style={c.btnGhost} onClick={discover} disabled={busy}>{busy ? t.refreshing : t.refreshData}</button>
              <button style={c.btnGhost} onClick={() => selectAll(true)} disabled={!rows.length}>{t.selectAll}</button>
              <button style={c.btnGhost} onClick={() => selectAll(false)} disabled={!rows.length}>{t.deselectAll}</button>
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.includeHeaders}</label>
              <input type="checkbox" checked={includeHeaders} onChange={(e) => setIncludeHeaders(e.target.checked)} />
            </div>
            <div style={c.columnListNoscroll}>
              {exportableColumns.map((col) => {
                const actualIdx = columnOrder.indexOf(col);
                return (
                  <div key={col}
                       draggable
                       onDragStart={(e) => handleDragStart(e, actualIdx)}
                       onDragEnd={handleDragEnd}
                       onDragOver={handleDragOver}
                       onDrop={(e) => handleDrop(e, actualIdx)}
                       style={{ ...c.columnItem, ...(highlightedColumn === col ? c.columnItemHighlight : {}), ...(draggedIndex === actualIdx ? c.columnItemDragging : {}) }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer", width: "calc(100% - 80px)" }}>
                      <input type="checkbox" checked={selected.has(col)} onChange={() => toggle(col)} style={{ cursor: "pointer" }} />
                      <span style={{ ...c.ellipsis, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={col}>{col}</span>
                    </label>
                    <div style={{ display: "flex", gap: 4, marginLeft: 8, minWidth: 80 }}>
                      <span style={{ ...c.dragHandle, cursor: "grab" }}>⋮⋮</span>
                      {actualIdx > 0 && <button style={c.miniBtn} onClick={() => moveColumn(actualIdx, actualIdx - 1)} title="Move up">↑</button>}
                      {actualIdx < columnOrder.length - 1 && <button style={c.miniBtn} onClick={() => moveColumn(actualIdx, actualIdx + 1)} title="Move down">↓</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={c.controls}>
              <button style={c.btn} onClick={() => { setExportFormat("clipboard"); exportData(); }} disabled={!rows.length || !selected.size}>{t.clipboard}</button>
              <button style={c.btn} onClick={() => { setExportFormat("csv"); exportData(); }} disabled={!rows.length || !selected.size}>{t.csv}</button>
              <button style={c.btn} onClick={() => { setExportFormat("excel"); exportData(); }} disabled={!rows.length || !selected.size}>{t.excel}</button>
              <button style={c.btn} onClick={sendToGoogleSheet} disabled={busy || !rows.length || !selected.size || !settings.scriptUrl || !settings.secret}>{busy ? t.sending : t.googleSheets}</button>
            </div>
            {exportMsg && <div style={c.note}>{exportMsg}</div>}
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
                  language: settings.language
                }}
                translations={t}
                styles={c}
                onConfirm={(marks) => {
                  setTab("search");
                  setSearchField("AssemblyMark");
                  setSearchFieldFilter("Kooste märk (BLOCK)");
                  setSearchScope("available");
                  setSearchInput(marks.join("\n"));
                  setTimeout(() => { searchAndSelect(); }, 100);
                }}
              />
            </Suspense>
          </div>
        )}

        {tab === "settings" && (
          <div style={c.section}>
            <div style={c.row}>
              <label style={c.label}>Keel / Language</label>
              <div style={{ display: "flex", gap: 6, flex: 1 }}>
                <button style={scopeButtonStyle(settings.language === "et")} onClick={() => updateSettings({ language: "et" })}>ET</button>
                <button style={scopeButtonStyle(settings.language === "en")} onClick={() => updateSettings({ language: "en" })}>EN</button>
              </div>
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.scriptUrl}</label>
              <input value={settings.scriptUrl} onChange={(e) => updateSettings({ scriptUrl: e.target.value })} placeholder="https://…/exec" style={{...c.input, flex:1}} />
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.sharedSecret}</label>
              <input type="password" value={settings.secret} onChange={(e) => updateSettings({ secret: e.target.value })} style={{...c.input, flex:1}} />
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.ocrWebhookUrl}</label>
              <input value={settings.ocrWebhookUrl} onChange={(e) => updateSettings({ ocrWebhookUrl: e.target.value })} placeholder="https://script.google.com/..." style={{...c.input, flex:1}} />
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.ocrWebhookSecret}</label>
              <input type="password" value={settings.ocrSecret} onChange={(e) => updateSettings({ ocrSecret: e.target.value })} style={{...c.input, flex:1}} />
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.ocrPrompt}</label>
              <textarea value={settings.ocrPrompt} onChange={(e) => updateSettings({ ocrPrompt: e.target.value })} placeholder={t.pasteHint} style={{...c.textarea, height: 80, flex:1}} />
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.autoColorize}</label>
              <input type="checkbox" checked={settings.autoColorize} onChange={(e) => updateSettings({ autoColorize: e.target.checked })} />
            </div>
            <div style={c.row}>
              <label style={c.label} title={t.colorTooltip}>{t.color}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex:1 }}>
                <select
                  value={
                    Object.keys(DEFAULT_COLORS).find(k => {
                      const current = settings.colorizeColor ?? DEFAULT_COLORS.darkRed;
                      const col = DEFAULT_COLORS[k as keyof typeof DEFAULT_COLORS];
                      return current.r === col.r && current.g === col.g && current.b === col.b;
                    }) || "darkRed"
                  }
                  onChange={(e) => updateSettings({ colorizeColor: DEFAULT_COLORS[e.target.value as keyof typeof DEFAULT_COLORS] })}
                  style={c.input}
                >
                  <option value="darkRed">{t.darkRed}</option>
                  <option value="red">{t.red}</option>
                  <option value="orange">{t.orange}</option>
                  <option value="yellow">{t.yellow}</option>
                  <option value="green">{t.green}</option>
                  <option value="blue">{t.blue}</option>
                  <option value="purple">{t.purple}</option>
                </select>
                <span style={{ fontSize: 11, opacity: 0.7 }}>{t.colorTooltip}</span>
              </div>
            </div>
            <div style={c.row}>
              <label style={c.label}>{t.defaultPreset}</label>
              <select value={settings.defaultPreset} onChange={(e) => updateSettings({ defaultPreset: e.target.value as DefaultPreset })} style={{...c.input, flex:1}}>
                <option value="recommended">{t.recommended}</option>
                <option value="tekla">{t.tekla}</option>
                <option value="ifc">{t.ifc}</option>
              </select>
            </div>
            <div style={{ ...c.row, justifyContent: "flex-end" }}>
              <button style={c.btn} onClick={() => setSettingsMsg(t.saved)}>{t.save}</button>
              <button style={c.btnGhost} onClick={() => { window.localStorage?.removeItem?.("assemblyExporterSettings"); window.location.reload(); }}>{t.reset}</button>
            </div>
            {settingsMsg && <div style={c.note}>{settingsMsg}</div>}
          </div>
        )}

        {tab === "about" && (
          <div style={c.section}>
            <div style={c.small}>
              <b>{t.version}</b><br />
              {t.features.split('\n').map((line, i) => <div key={i}>{line}</div>)}
              <br />
              {t.author}
            </div>
          </div>
        )}

        <div style={{ padding: 10, textAlign: "center", fontSize: 11, opacity: 0.5 }}>{t.author}</div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: { height: "100vh", display: "flex", flexDirection: "column", background: "#fff", color: "#111", fontFamily: "Inter, system-ui, Arial, sans-serif", fontSize: 13, lineHeight: 1.25 },
  topbar: { display: "flex", gap: 2, background: "#0a3a67", padding: "8px 10px", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap" as any },
  tab: { all: "unset" as any, color: "rgba(255,255,255,.85)", padding: "6px 10px", borderRadius: 6, cursor: "pointer" },
  tabActive: { background: "rgba(255,255,255,.14)", color: "#fff", fontWeight: 600 },
  page: { flex: 1, display: "flex", flexDirection: "column", padding: 10, gap: 10, minHeight: 0, overflow: "auto" },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  heading: { margin: "0 0 8px 0", fontSize: 16, fontWeight: 600 },
  row: { display: "flex", alignItems: "center", gap: 8 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 4 },
  labelTop: { fontSize: 12, opacity: 0.8 },
  label: { width: 160, opacity: 0.8 },
  input: { padding: "6px 8px", border: "1px solid #cfd6df", borderRadius: 8, outline: "none", flex:1 },
  inputFilter: { width: "100%", maxHeight: "150px", padding: "6px 8px", border: "1px solid "#cfd6df", borderRadius: 8, outline: "none", resize: "vertical" as any },
  textarea: { width: "100%", padding: "8px", border: "1px solid #cfd6df", borderRadius: 8, outline: "none", fontFamily: "monospace", fontSize: 12 },
  controls: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", position: "relative", zIndex: 10 },
  presetsRow: { display: "flex", gap: 6, flexWrap: "wrap", position: "relative", zIndex: 50, marginTop: 4 },
  btn: { padding: "6px 10px", borderRadius: 8, border: "1px solid #cfd6df", background: "#f6f8fb", cursor: "pointer", position: "relative", zIndex: 10 },
  btnGhost: { padding: "6px 10px", borderRadius: 8, border: "1px solid #d7dde6", background: "#fff", cursor: "pointer", position: "relative", zIndex: 10 },
  btnPrimary: { padding: "6px 12px", borderRadius: 8, border: "1px solid #0a3a67", background: "#0a3a67", color: "#fff", cursor: "pointer", position: "relative", zIndex: 10 },
  list: { flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #edf0f4", borderRadius: 8, padding: 8, background: "#fafbfc" },
  group: { marginBottom: 8, paddingBottom: 6, borderBottom: "1px dashed #e5e9f0" },
  groupHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  mini: { padding: "2px 6px", borderRadius: 6, border: "1px solid #d7dde6", background: "#fff", fontSize: 12, cursor: "pointer" },
  miniBtn: { padding: "2px 8px", borderRadius: 4, border: "1px solid #d7dde6", background: "#fff", fontSize: 11, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 },
  checkRow: { display: "flex", alignItems: "center", gap: 6 },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  small: { fontSize: 12, opacity: 0.8 },
  note: { fontSize: 12, opacity: 0.9, padding: "6px 8px", background: "#f0f4f8", borderRadius: 6, position: "relative", zIndex: 1 },
  helpBox: { fontSize: 12, padding: "8px 10px", background: "#e7f3ff", border: "1px solid #90caf9", borderRadius: 6, color: "#0d47a1" },
  columnListNoscroll: { display: "flex", flexDirection: "column", gap: 4, border: "1px solid #edf0f4", borderRadius: 8, padding: 8, background: "#fafbfc" },
  columnItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "#fff", border: "1px solid #e5e9f0", borderRadius: 6, fontSize: 12, transition: "all 0.2s" },
  columnItemHighlight: { background: "#fff3cd", border: "2px solid #ffc107", boxShadow: "0 0 12px rgba(255, 193, 7, 0.4)", transform: "scale(1.02)" },
  columnItemDragging: { opacity: 0.4, cursor: "grabbing" },
  dragHandle: { fontSize: 16, color: "#999", userSelect: "none" as any, lineHeight: 1 },
  dropdown: { position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#fff", border: "1px solid #cfd6df", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", maxHeight: 300, overflow: "auto", zIndex: 1000 },
  dropdownItem: { padding: "8px 12px", cursor: "pointer", fontSize: 13, transition: "background 0.15s" },
  dropdownItemSelected: { background: "#e7f3ff", color: "#0a3a67", fontWeight: 600 },
  resultsBox: { marginTop: 12, border: "1px solid #e5e9f0", borderRadius: 8, padding: 12, background: "#fafbfc" },
  resultsHeading: { margin: "0 0 8px 0", fontSize: 14, fontWeight: 600, color: "#0a3a67" },
  resultsTable: { display: "flex", flexDirection: "column", gap: 4 },
  resultRow: { display: "grid", gridTemplateColumns: "24px 1fr 40px auto", alignItems: "center", gap: 4, padding: "6px 8px", borderRadius: 6, fontSize: 12 },
  resultRowFound: { background: "#e8f5e9", border: "1px solid #a5d6a7" },
  resultRowPartial: { background: "#fff9c4", border: "1px solid #ffd54f" },
  resultRowNotFound: { background: "#ffebee", border: "1px solid #ef9a9a" },
  resultStatus: { fontSize: 16, textAlign: "center" as any },
  resultValue: { fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  resultCount: { fontSize: 11, opacity: 0.7, textAlign: "right" as any },
  resultActions: { display: "flex", gap: 4 },
};
