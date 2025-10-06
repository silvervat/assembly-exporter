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
version: "Assembly Exporter v5.5 – Trimble Connect",
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
saveToView: "Salvesta tulem vaatesse",
viewPrompt: "Mis nimega salvestada vaade?",
defaultViewName: "otsing {date}",
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
viewPrompt: "What name to save the view as?",
defaultViewName: "search {date}",
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
return String(s).replace(/\s+/g, "").replace(/[^\w.-]/g, "").trim();
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
if (/^[0-9A-Za-z$]{22}$/.test(s)) return "IFC";
if (/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(s) || /^[0-9A-Fa-f]{32}$/.test(s)) return "MS";
return "UNKNOWN";
}
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
const baseKey = g ? ${g}.${n} : n;
let key = baseKey;
const count = keyCounts.get(baseKey) || 0;
if (count > 0) key = ${baseKey}_${count};
keyCounts.set(baseKey, count + 1);
let v: unknown = val;
if (Array.isArray(v)) v = v.map(x => (x == null ? "" : String(x))).join(" | ");
else if (typeof v === "object" && v !== null) v = JSON.stringify(v);
const s = v == null ? "" : String(v);
propMap.set(key, s);
out[key] = s;
};
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
if (obj?.id) out.ObjectId = String(obj.id);
if (obj?.name) out.Name = String(obj.name);
if (obj?.type) out.Type = String(obj.type);
if (obj?.product?.name) out.ProductName = String(obj.product.name);
if (obj?.product?.description) out.ProductDescription = String(obj.product.description);
if (obj?.product?.type) out.ProductType = String(obj.product.type);
let guidIfc = "";
let guidMs = "";
for (const [k, v] of propMap) {
if (!/guid|globalid|tekla_guid|id_guid/i.test(k)) continue;
const cls = classifyGuid(v);
if (cls === "IFC" && !guidIfc) guidIfc = v;
if (cls === "MS" && !guidMs) guidMs = v;
}
if (!guidIfc && obj.id) {
try {
const externalIds = await api.viewer.convertToObjectIds(modelId, [obj.id]);
const externalId = externalIds[0];
if (externalId && classifyGuid(externalId) === "IFC") guidIfc = externalId;
} catch (e) {
console.warn(convertToObjectIds failed for ${obj.id}:, e);
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
const ResultRow = memo(({ result, onRemove, onZoom, t }: any) => {
const displayValue = result.actualValue || result.originalValue;
const isPartialMatch = result.isPartial && result.actualValue && result.actualValue !== result.originalValue;
return (
    
      {result.status === 'found' ? (result.isPartial ? '⚠️' : '✅') : '❌'}
      
        {displayValue}
        {isPartialMatch && ← {result.originalValue}}
      
      {result.status === 'found' ? `${result.ids?.length || 0}x` : '-'}
      
        {result.status === 'found' && result.modelId && result.ids && (
          <button style="{styles.miniBtn}" onclick="{()" &#x3D;=""> onZoom(result.modelId, result.ids)} title="Zoom">{t.zoom}</button>
        )}
        <button style="{{" ...styles.minibtn,="" background:="" &#x22;#ffdddd&#x22;,="" color:="" &#x22;#cc0000&#x22;="" }}="" onclick="{onRemove}" title="Remove">{t.remove}</button>
      
    
  );
});
type Props = { api: any };
export default function AssemblyExporter({ api }: Props) {
  const [settings, updateSettings] = useSettings();
  const t = translations[settings.language];
  const [tab, setTab] = useState<tab>("search");
  const [rows, setRows] = useState<row[]>([]);
  const [selected, setSelected] = useState<set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [highlightedColumn, setHighlightedColumn] = useState<string |="" null="">(null);
  const [draggedIndex, setDraggedIndex] = useState<number |="" null="">(null);
  const [searchFieldFilter, setSearchFieldFilter] = useState("Kooste märk (BLOCK)");
  const [isSearchFieldDropdownOpen, setIsSearchFieldDropdownOpen] = useState(false);
  const [searchScope, setSearchScope] = useState&#x3C;"available" | "selected">("available");
  const [fuzzySearch, setFuzzySearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0, objects: 0, totalObjects: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [searchField, setSearchField] = useState("AssemblyMark");
  const [exportFormat, setExportFormat] = useState<exportformat>("clipboard");
  const [lastSelection, setLastSelection] = useState<array<{ modelid:="" string;="" ids:="" number[]="" }="">>([]);
  const [searchResults, setSearchResults] = useState<array<any>>([]);
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const abortControllerRef = useRef<abortcontroller |="" null="">(null);
  useEffect(() => {
    const tmr = setTimeout(() => setDebouncedFilter(filter), DEBOUNCE_MS);
    return () => clearTimeout(tmr);
  }, [filter]);
  useEffect(() => { if (discoverMsg) { const t = setTimeout(() => setDiscoverMsg(""), MESSAGE_DURATION_MS); return () => clearTimeout(t); } }, [discoverMsg]);
  useEffect(() => { if (exportMsg) { const t = setTimeout(() => setExportMsg(""), MESSAGE_DURATION_MS); return () => clearTimeout(t); } }, [exportMsg]);
  useEffect(() => { if (settingsMsg) { const t = setTimeout(() => setSettingsMsg(""), MESSAGE_DURATION_MS); return () => clearTimeout(t); } }, [settingsMsg]);
  const allKeys = useMemo(() => Array.from(new Set(rows.flatMap(r => Object.keys(r)))).sort(), [rows]);
<p>const searchFieldOptions = useMemo(() => {
const base = [
{ value: "AssemblyMark", label: "Kooste märk (BLOCK)" },
{ value: "GUID_IFC", label: "IFC GUID" },
{ value: "GUID_MS", label: "MS/Tekla GUID" },
{ value: "Name", label: "Nimi" },
];
const custom = allKeys.filter(k => !['GUID', 'GUID_IFC', 'GUID_MS', 'Name', 'Type', 'Project', 'ModelId', 'FileName', 'ObjectId'].includes(k)).map(k => ({ value: k, label: k }));
const all = [...base, ...custom];
if (!searchFieldFilter) return all;
const f = searchFieldFilter.toLowerCase();
return all.filter(opt => opt.label.toLowerCase().includes(f) || opt.value.toLowerCase().includes(f));
}, [allKeys, searchFieldFilter]);
const groupedUnsorted = useMemo(() => groupKeys(allKeys), [allKeys]);
const groupedSortedEntries = useMemo(() => (Object.entries(groupedUnsorted) as [string, string[]][]).sort((a, b) => groupSortKey(a[0]) - groupSortKey(b[0]) || a[0].localeCompare(b[0])), [groupedUnsorted]);</p>
<p>const filteredKeysSet = useMemo(() => {
if (!debouncedFilter) return new Set(allKeys);
const f = debouncedFilter.toLowerCase();
return new Set(allKeys.filter(k => k.toLowerCase().includes(f)));
}, [allKeys, debouncedFilter]);
const exportableColumns = useMemo(() => columnOrder.filter(k => allKeys.includes(k)), [columnOrder, allKeys]);
const totalFoundCount = useMemo(() => searchResults.reduce((sum, r) => sum + (r.status === 'found' ? r.ids?.length || 0 : 0), 0), [searchResults]);
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
else if (!columnOrder.length &#x26;&#x26; allKeys.length) setColumnOrder([...LOCKED_ORDER, ...allKeys.filter(k => !LOCKED_ORDER.includes(k as any))]);
}, [allKeys]);
useEffect(() => {
if (!api?.viewer) return;
let selectionTimeout: NodeJS.Timeout;
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
useEffect(() => { if (tab === "export" &#x26;&#x26; !busy) discover(); }, [tab]);
useEffect(() => { if (tab === "discover" &#x26;&#x26; !busy) discover(); }, [tab]);
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
setProgress({ current: 0, total: 0 });
const selectedWithBasic = await getSelectedObjects(api);
if (!selectedWithBasic.length) { setDiscoverMsg(t.selectObjects); setRows([]); return; }
const projectName = await getProjectName(api);
const modelIds = selectedWithBasic.map(m => m.modelId);
const nameMap = await buildModelNameMap(api, modelIds);
const out: Row[] = [];
const lastSel: Array&#x3C;{ modelId: string; ids: number[] }> = [];
const totalObjs = selectedWithBasic.reduce((sum, m) => sum + (m.objects?.length || 0), 0);
setProgress({ current: 0, total: selectedWithBasic.length, objects: 0, totalObjects: totalObjs });
let processedObjects = 0;</p>
<p>for (let i = 0; i &#x3C; selectedWithBasic.length; i++) {
const { modelId, objects } = selectedWithBasic[i];
setDiscoverMsg(t.processing.replace('{current}', String(i + 1)).replace('{total}', String(selectedWithBasic.length)) +
<code> (${processedObjects}/${totalObjs} ${settings.language === "et" ? "objekti" : "objects"})</code>);
const objectRuntimeIds = objects.map((o: any) => Number(o?.id)).filter(n => Number.isFinite(n));
let fullObjects = objects;
try {
const fullProperties = await api.viewer.getObjectProperties(modelId, objectRuntimeIds);
fullObjects = objects.map((obj: any, idx: number) => ({ ...obj, properties: fullProperties[idx]?.properties || obj.properties }));
} catch (e) { console.warn(<code>getObjectProperties failed for model ${modelId}:</code>, e); }
const flattened = await Promise.all(fullObjects.map(o => flattenProps(o, modelId, projectName, nameMap, api)));
out.push(...flattened);
lastSel.push({ modelId, ids: objectRuntimeIds });
processedObjects += objects.length;
setProgress({ current: i + 1, total: selectedWithBasic.length, objects: processedObjects, totalObjects: totalObjs });
}
setRows(out);
setLastSelection(lastSel);
setDiscoverMsg(t.foundObjects.replace('{count}', String(out.length)).replace('{keys}', String(Array.from(new Set(out.flatMap(r => Object.keys(r)))).length)));
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
const searchLower = new Set(uniqueSearchValues.map(v => v.toLowerCase()));
if (!uniqueSearchValues.length) { setSearchMsg(t.enterValue); setBusy(false); return; }
const viewer = api?.viewer;
let mos = searchScope === "selected" ? await viewer?.getObjects({ selected: true }) : await viewer?.getObjects();
if (!Array.isArray(mos)) { if (abortController.signal.aborted) return; setSearchMsg(t.cannotRead); setBusy(false); return; }</p>
<p>// Loe ette kokku, mitu objekti on
const totalObjs = mos.reduce((sum, mo) => sum + (mo.objects?.length || 0), 0);</p>
<p>const found: Array&#x3C;{ modelId: string; ids: number[] }> = [];
const foundValues = new Map&#x3C;string, { original: string; modelId: string; ids: number[]; isPartial: boolean, actualValue?: string }>();
setProgress({ current: 0, total: mos.length, objects: 0, totalObjects: totalObjs });</p>
<p>const MAX_RESULTS = 500; // Peata kui leidsin 500 vastet
let processedObjects = 0;</p>
<p>for (let mIdx = 0; mIdx &#x3C; mos.length; mIdx++) {
if (abortController.signal.aborted) return;
const mo = mos[mIdx];
const modelId = String(mo.modelId);
const objectRuntimeIds = (mo.objects || []).map((o: any) => Number(o?.id)).filter(n => Number.isFinite(n));
if (!objectRuntimeIds.length) continue;
let fullProperties: any[] = [];
try {
fullProperties = await api.viewer.getObjectProperties(modelId, objectRuntimeIds);
} catch (e) {
if (abortController.signal.aborted) return;
console.warn(<code>getObjectProperties failed for model ${modelId}:</code>, e);
fullProperties = mo.objects || [];
}
const matchIds: number[] = [];
for (let i = 0; i &#x3C; fullProperties.length; i++) {
if (abortController.signal.aborted) return;</p>
<p>// Early exit kui leidsin juba piisavalt
if (found.reduce((sum, f) => sum + f.ids.length, 0) >= MAX_RESULTS) {
setSearchMsg(settings.language === "et" ?
<code>⚠️ Peatatud: leidsin ${MAX_RESULTS}+ vastet. Täpsusta otsingut.</code> :
<code>⚠️ Stopped: found ${MAX_RESULTS}+ matches. Refine search.</code>);
break;
}</p>
<p>const obj = fullProperties[i];
const objId = objectRuntimeIds[i];
let matchValue = "";
if (searchField === "AssemblyMark") {
const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
for (const set of props) {
for (const p of set?.properties ?? []) {
if (/assembly[/\s]?cast[<em>\s]?unit[</em>\s]?mark|^mark$|block/i.test(String(p?.name))) {
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
if ((searchField === "GUID_IFC" &#x26;&#x26; cls === "IFC") || (searchField === "GUID_MS" &#x26;&#x26; cls === "MS")) {
matchValue = val;
break;
}
}
}
if (matchValue) break;
}
if (!matchValue &#x26;&#x26; searchField === "GUID_IFC") {
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
if (groupPart &#x26;&#x26; !setNameSanitized.toLowerCase().includes(groupPart.toLowerCase())) continue;
for (const p of set?.properties ?? []) {
const propName = String(p?.name || "");
const propNameSanitized = sanitizeKey(propName);
const fullKeySanitized = <code>${setNameSanitized}.${propNameSanitized}</code>;
if (fullKeySanitized.toLowerCase() === searchField.toLowerCase() || propNameSanitized.toLowerCase().includes(propPart.toLowerCase())) {
matchValue = String(p?.value || p?.displayValue || "").trim();
break;
}
}
if (matchValue) break;
}
}
const matchLower = matchValue.toLowerCase();</p>
<p>// Ignoreeri tühje väärtusi
if (!matchValue || !matchLower) continue;</p>
<p>const originalMatch = uniqueSearchValues.find(v => {
const vLower = v.toLowerCase();
if (fuzzySearch) {
// Osaline vaste - aga mitte tühja stringiga
return vLower &#x26;&#x26; matchLower &#x26;&#x26; (matchLower.includes(vLower) || vLower.includes(matchLower));
} else {
return vLower === matchLower;
}
});
if (originalMatch) {
matchIds.push(objId);
const isPartial = fuzzySearch &#x26;&#x26; originalMatch.toLowerCase() !== matchLower;</p>
<p>// Grupeeri iga unikaalse leitud väärtuse järgi eraldi
const uniqueKey = <code>${originalMatch.toLowerCase()}|||${matchLower}</code>;
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
if (matchIds.length) found.push({ modelId, ids: matchIds });</p>
<p>processedObjects += fullProperties.length;
setProgress({ current: mIdx + 1, total: mos.length, objects: processedObjects, totalObjects: totalObjs });
setSearchMsg(settings.language === "et" ?
<code>Otsin... ${processedObjects}/${totalObjs} objekti töödeldud</code> :
<code>Searching... ${processedObjects}/${totalObjs} objects processed</code>);</p>
<p>// Early exit kui leidsin piisavalt
if (found.reduce((sum, f) => sum + f.ids.length, 0) >= MAX_RESULTS) {
break;
}
}
if (searchField === "GUID_IFC" &#x26;&#x26; found.length === 0) {
const allModels = await api.viewer.getModels();
for (const originalValue of uniqueSearchValues) {
const value = originalValue.toLowerCase();
for (const model of allModels || []) {
if (abortController.signal.aborted) return;
const modelId = String(model.id);
try {
const runtimeIds = await api.viewer.convertToObjectRuntimeIds(modelId, [originalValue]);
if (runtimeIds.length > 0) {
found.push({ modelId, ids: runtimeIds.map((id: any) => Number(id)) });
foundValues.set(value, { original: originalValue, actualValue: originalValue, modelId, ids: runtimeIds.map((id: any) => Number(id)), isPartial: false });
}
} catch {}
}
}
}
const results = [];</p>
<p>// Kui fuzzy search, loo rida iga unikaalse leitud väärtuse kohta
if (fuzzySearch) {
for (const [key, data] of foundValues) {
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
// Täpne otsing - grupeeri otsinguterminiga
for (const originalValue of uniqueSearchValues) {
const lower = originalValue.toLowerCase();
let found = false;
for (const [key, data] of foundValues) {
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
found = true;
break;
}
}
if (!found) {
results.push({ originalValue, value: lower, status: 'notfound' });
}
}
}
setSearchResults(results);
if (found.length) {
const selector = { modelObjectIds: found.map(f => ({ modelId: f.modelId, objectRuntimeIds: f.ids })) };
await viewer?.setSelection?.(selector);
setLastSelection(found);
const notFound = results.filter(r => r.status === 'notfound').map(r => r.originalValue);
let msg = t.foundValues.replace('{found}', String(foundValues.size)).replace('{total}', String(uniqueSearchValues.length));
if (notFound.length) msg += <code> ${t.notFound} ${notFound.join(", ")}</code>;
else msg += <code> ${t.allFound}</code>;
if (hasDuplicates) msg += <code> ${t.duplicates}</code>;
setSearchMsg(msg);
} else {
setSearchMsg(<code>${t.noneFound} ${uniqueSearchValues.join(", ")}</code>);
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
const allFound = searchResults.filter(r => r.status === 'found' &#x26;&#x26; r.modelId &#x26;&#x26; r.ids).map(r => ({ modelId: r.modelId, ids: r.ids }));
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
const saveToView = useCallback(async () => {
if (!lastSelection.length) return;
const now = new Date();
const dd = String(now.getDate()).padStart(2, '0');
const mm = String(now.getMonth() + 1).padStart(2, '0');
const yy = String(now.getFullYear() % 100).padStart(2, '0');
const hh = String(now.getHours()).padStart(2, '0');
const min = String(now.getMinutes()).padStart(2, '0');
const defaultName = t.defaultViewName.replace('{date}', <code>${dd}.${mm}.${yy}.${hh}.${min}</code>);
const name = window.prompt(t.viewPrompt, defaultName);
if (!name) return;
try {
const modelObjectIds = lastSelection.map(f => ({ modelId: f.modelId, objectRuntimeIds: f.ids }));
await api.view.createView({ name, modelObjectIds });
setSearchMsg(t.viewSaved.replace('{name}', name));
} catch (e: any) {
console.error("Save view error:", e);
setSearchMsg(t.viewSaveError.replace('{error}', e?.message || t.unknownError));
}
}, [lastSelection, api, t]);
const moveColumn = useCallback((from: number, to: number) => {
const newOrder = [...columnOrder];
const [moved] = newOrder.splice(from, 1);
newOrder.splice(to, 0, moved);
setColumnOrder(newOrder);
setHighlightedColumn(moved);
setTimeout(() => setHighlightedColumn(null), HIGHLIGHT_DURATION_MS);
}, [columnOrder]);
const handleDragStart = useCallback((e: DragEvent&#x3C;HTMLDivElement>, index: number) => {
setDraggedIndex(index);
e.dataTransfer.effectAllowed = "move";
e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = "0.4";
}, []);
const handleDragEnd = useCallback((e: DragEvent&#x3C;HTMLDivElement>) => {
if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = "1";
setDraggedIndex(null);
}, []);
const handleDragOver = useCallback((e: DragEvent&#x3C;HTMLDivElement>) => {
e.preventDefault();
e.dataTransfer.dropEffect = "move";
}, []);
const handleDrop = useCallback((e: DragEvent&#x3C;HTMLDivElement>, dropIndex: number) => {
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
const exportCols = columnOrder.filter(k => selected.has(k) &#x26;&#x26; allKeys.includes(k));
if (!exportCols.length) { setExportMsg(t.selectColumn); return; }
try {
if (exportFormat === "clipboard") {
const body = rows.map(r => exportCols.map(k => (r[k] ?? "")).join("\t")).join("\n");
const text = includeHeaders ? exportCols.join("\t") + "\n" + body : body;
await navigator.clipboard.writeText(text);
setExportMsg(t.copied.replace('{count}', String(rows.length)));
} else if (exportFormat === "csv") {
const csvBody = rows.map(r => exportCols.map(k => <code>"${((r[k] ?? "") as string).replace(/"/g, '""')}"</code>).join(",")).join("\n");
const csv = includeHeaders ? exportCols.join(",") + "\n" + csvBody : csvBody;
const blob = new Blob([csv], { type: "text/csv" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = <code>assembly-export-${new Date().toISOString().slice(0, 10)}.csv</code>;
a.click();
setTimeout(() => URL.revokeObjectURL(url), 100);
setExportMsg(t.savedCsv.replace('{count}', String(rows.length)));
} else if (exportFormat === "excel") {
const rowData = rows.map(r => exportCols.map((k) => {
const v = r[k] ?? "";
if (FORCE_TEXT_KEYS.has(k) || /^(GUID|GUID_IFC|GUID_MS)$/i.test(k)) return <code>'${String(v)}</code>;
return v;
}));
const aoa: any[][] = includeHeaders ? [exportCols, ...rowData] : rowData;
const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Export");
XLSX.writeFile(wb, <code>assembly-export-${new Date().toISOString().slice(0, 10)}.xlsx</code>);
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
const exportCols = columnOrder.filter(k => selected.has(k) &#x26;&#x26; allKeys.includes(k));
const payload = rows.map(r => { const obj: Row = {}; for (const k of exportCols) obj[k] = r[k] ?? ""; return obj; });
try {
setBusy(true);
setExportMsg(t.sending);
const res = await fetch(scriptUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, rows: payload }) });
const data = await res.json();
if (data?.ok) {
setExportMsg(t.addedRows.replace('{count}', String(payload.length)) + (autoColorize ? <code> ${t.coloring}</code> : ""));
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
const ScanAppLazy = React.lazy(() => import('./ScanApp').catch(() => ({ default: () => </p><div style="{c.note}">{t.inDevelopment}</div> })));
return (<p></p>
    <div style="{c.shell}">
      <div style="{c.topbar}">
        <button style="{{" ...c.tab,="" ...(tab="==" &#x22;search&#x22;="" ?="" c.tabactive="" :="" {})="" }}="" onclick="{()" &#x3D;=""> setTab("search")}>{t.search}</button>
        <button style="{{" ...c.tab,="" ...(tab="==" &#x22;discover&#x22;="" ?="" c.tabactive="" :="" {})="" }}="" onclick="{()" &#x3D;=""> setTab("discover")}>{t.discover}</button>
        <button style="{{" ...c.tab,="" ...(tab="==" &#x22;export&#x22;="" ?="" c.tabactive="" :="" {})="" }}="" onclick="{()" &#x3D;=""> setTab("export")}>{t.export}</button>
        <button style="{{" ...c.tab,="" ...(tab="==" &#x22;scan&#x22;="" ?="" c.tabactive="" :="" {})="" }}="" onclick="{()" &#x3D;=""> setTab("scan")}>{t.scan}</button>
        <button style="{{" ...c.tab,="" ...(tab="==" &#x22;settings&#x22;="" ?="" c.tabactive="" :="" {})="" }}="" onclick="{()" &#x3D;=""> setTab("settings")}>{t.settings}</button>
        <button style="{{" ...c.tab,="" ...(tab="==" &#x22;about&#x22;="" ?="" c.tabactive="" :="" {})="" }}="" onclick="{()" &#x3D;=""> setTab("about")}>{t.about}</button>
      </div>
      <div style="{c.page}">
        {tab === "search" &#x26;&#x26; (
          <div style="{c.section}">
            <h3 style="{c.heading}">{t.searchAndSelect}</h3>
            <div style="{c.fieldGroup}">
              <label style="{c.labelTop}">{t.searchBy}</label>
              <div style="{{" position:="" &#x22;relative&#x22;,="" width:="" &#x22;100%&#x22;="" }}="" onblur="{(e)" &#x3D;=""> { if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => setIsSearchFieldDropdownOpen(false), 200); }}>
                <input type="text" value="{searchFieldFilter}" onchange="{(e)" &#x3D;=""> setSearchFieldFilter(e.target.value)} onFocus={() => setIsSearchFieldDropdownOpen(true)} placeholder="Tippige filtriks või valige..." style={{...c.input, width: "100%"}} />
                {isSearchFieldDropdownOpen &#x26;&#x26; (
                  <div style="{c.dropdown}">
                    {searchFieldOptions.length === 0 ? <div style="{c.dropdownItem}">{t.noResults}</div> : searchFieldOptions.map(opt => (
                      <div key="{opt.value}" style="{{" ...c.dropdownitem,="" ...(searchfield="==" opt.value="" ?="" c.dropdownitemselected="" :="" {})="" }}="" onmouseenter="{(e)" &#x3D;=""> { e.currentTarget.style.background = "#f5f5f5"; }} onMouseLeave={(e) => { e.currentTarget.style.background = searchField === opt.value ? "#e7f3ff" : ""; }} onClick={() => { setSearchField(opt.value); setSearchFieldFilter(opt.label); setIsSearchFieldDropdownOpen(false); }}>{opt.label}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style="{c.fieldGroup}">
              <label style="{c.labelTop}">{t.searchScope}</label>
              <div 6="" style="{{" display:="" &#x22;flex&#x22;,="" gap:="" }}="">
                <button style="{scopeButtonStyle(searchScope" &#x3D;="=" &#x22;available&#x22;)}="" onclick="{()"> setSearchScope("available")}>{t.scopeAll}</button>
                <button style="{scopeButtonStyle(searchScope" &#x3D;="=" &#x22;selected&#x22;)}="" onclick="{()"> setSearchScope("selected")}>{t.scopeSelected}</button>
              </div>
            </div>
            <div style="{c.fieldGroup}">
              <label style="{{" display:="" &#x22;flex&#x22;,="" alignitems:="" &#x22;center&#x22;,="" gap:="" 6,="" cursor:="" &#x22;pointer&#x22;="" }}="">
                <input type="checkbox" checked="{fuzzySearch}" onchange="{(e)" &#x3D;=""> setFuzzySearch(e.target.checked)} />
                <span>{settings.language === "et" ? "Otsi sarnaseid (osaline vaste)" : "Fuzzy search (partial match)"}</span>
              </label>
            </div>
            &#x3C;textarea value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t.searchPlaceholder} style={{ ...c.textarea, height: 200 }} />
            <div style="{c.controls}">
              <button style="{c.btn}" onclick="{searchAndSelect}" disabled="{busy" ||="" !searchinput.trim()}="">{busy ? t.searching : t.searchButton}</button>
              {busy &#x26;&#x26; <button style="{c.btnGhost}" onclick="{cancelSearch}">{t.cancelSearch}</button>}
              <button style="{c.btnGhost}" onclick="{()" &#x3D;=""> { setSearchInput(""); setSearchResults([]); setSearchMsg(""); }}>{t.clear}</button>
            </div>
            {!!progress.total &#x26;&#x26; progress.total > 1 &#x26;&#x26; <div style="{c.small}">{t.searchProgress} {progress.current}/{progress.total} {t.models}{progress.totalObjects > 0 ? ` • ${progress.objects}/${progress.totalObjects} objekti` : ""}</div>}
            {searchMsg &#x26;&#x26; <div style="{searchNoteStyle}">{searchMsg}</div>}
            {searchResults.length > 0 &#x26;&#x26; (
              <div style="{c.resultsBox}">
                <h4 style="{c.resultsHeading}">{t.results} ({searchResults.length})</h4>
                <div style="{c.resultsTable}">
                  {searchResults.map((result, idx) => <resultrow key="{idx}" result="{result}" onremove="{()" &#x3D;=""> removeResult(idx)} onZoom={selectAndZoom} t={t} />)}
                </resultrow></div>
                <div style="{{" ...c.controls,="" margintop:="" 8,="" justifycontent:="" &#x22;flex-end&#x22;="" }}="">
                  <button style="{c.btn}" onclick="{selectAllFound}" disabled="{totalFoundCount" &#x3D;="=" 0}="">{t.selectAll} ({totalFoundCount}x)</button>
                  <button style="{c.btn}" onclick="{saveToView}" disabled="{totalFoundCount" &#x3D;="=" 0}="">{t.saveToView}</button>
                </div>
              </div>
            )}
          </div>
        )}
        {tab === "discover" &#x26;&#x26; (
          <div style="{c.section}">
            <h3 style="{c.heading}">{t.discoverFields}</h3>
            <div style="{c.controls}">
              <button style="{c.btn}" onclick="{discover}" disabled="{busy}">{busy ? "…" : t.discoverFields}</button>
              <button style="{c.btnGhost}" onclick="{resetState}">{t.resetColors}</button>
            </div>
            {!!progress.total &#x26;&#x26; progress.total > 1 &#x26;&#x26; <div style="{c.small}">{t.progress} {progress.current}/{progress.total}{progress.totalObjects > 0 ? ` • ${progress.objects}/${progress.totalObjects} objekti` : ""}</div>}
            <input placeholder="{t.filterColumns}" value="{filter}" onchange="{(e)" &#x3D;=""> setFilter(e.target.value)} style={c.inputFilter} />
            <div style="{c.controls}">
              <button style="{c.btnGhost}" onclick="{()" &#x3D;=""> selectAll(true)} disabled={!rows.length}>{t.selectAll}</button>
              <button style="{c.btnGhost}" onclick="{()" &#x3D;=""> selectAll(false)} disabled={!rows.length}>{t.deselectAll}</button>
              <span style="{{" marginleft:="" &#x22;auto&#x22;,="" fontsize:="" 12,="" opacity:="" 0.7="" }}="">{t.selected} {selected.size}</span>
            </div>
            <div style="{{" ...c.list,="" maxheight:="" &#x22;none&#x22;,="" overflow:="" &#x22;visible&#x22;="" }}="">
              {!rows.length ? <div style="{c.small}">{t.noData}</div> : groupedSortedEntries.map(([groupName, keys]) => {
                const keysShown = keys.filter(matches);
                if (!keysShown.length) return null;
                return (
                  <div key="{groupName}" style="{c.group}">
                    <div style="{c.groupHeader}">
                      <b>{groupName}</b>
                      <div 6="" style="{{" display:="" &#x22;flex&#x22;,="" gap:="" }}="">
                        <button style="{c.mini}" onclick="{()" &#x3D;=""> toggleGroup(keys, true)}>{t.selectAll}</button>
                        <button style="{c.mini}" onclick="{()" &#x3D;=""> toggleGroup(keys, false)}>{t.deselectAll}</button>
                      </div>
                    </div>
                    <div style="{c.grid}">{keysShown.map((k) => <label key="{k}" style="{c.checkRow}" title="{k}"><input type="checkbox" checked="{selected.has(k)}" onchange="{()" &#x3D;=""> toggle(k)} /><span style="{c.ellipsis}">{k}</span></label>)}</div>
                  </div>
                );
              })}
            </div>
            <div style="{c.presetsRow}">
              <span style="{{" alignself:="" &#x22;center&#x22;,="" opacity:="" 0.7="" }}="">{t.presets}</span>
              <button style="{c.btnGhost}" onclick="{presetRecommended}" disabled="{!rows.length}">{t.recommended}</button>
              <button style="{c.btnGhost}" onclick="{presetTekla}" disabled="{!rows.length}">{t.tekla}</button>
              <button style="{c.btnGhost}" onclick="{presetIFC}" disabled="{!rows.length}">{t.ifc}</button>
            </div>
            {discoverMsg &#x26;&#x26; <div style="{c.note}">{discoverMsg}</div>}
          </div>
        )}
        {tab === "export" &#x26;&#x26; (
          <div style="{c.section}">
            <h3 style="{c.heading}">{t.exportData}</h3>
            <div style="{c.small}">{t.exportCount.replace('{count}', String(rows.length))}</div>
            <div style="{c.helpBox}">{t.exportHint}</div>
            <div style="{c.controls}">
              <button style="{c.btnGhost}" onclick="{discover}" disabled="{busy}">{busy ? t.refreshing : t.refreshData}</button>
              <button style="{c.btnGhost}" onclick="{()" &#x3D;=""> selectAll(true)} disabled={!rows.length}>{t.selectAll}</button>
              <button style="{c.btnGhost}" onclick="{()" &#x3D;=""> selectAll(false)} disabled={!rows.length}>{t.deselectAll}</button>
            </div>
            <div style="{c.row}">
              <label style="{c.label}">{t.includeHeaders}</label>
              <input type="checkbox" checked="{includeHeaders}" onchange="{(e)" &#x3D;=""> setIncludeHeaders(e.target.checked)} />
            </div>
            <div style="{c.columnListNoscroll}">
              {exportableColumns.map((col) => {
                const actualIdx = columnOrder.indexOf(col);
                return (
                  <div key="{col}" draggable="" ondragstart="{(e)" &#x3D;=""> handleDragStart(e, actualIdx)} onDragEnd={handleDragEnd} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, actualIdx)} style={{ ...c.columnItem, ...(highlightedColumn === col ? c.columnItemHighlight : {}), ...(draggedIndex === actualIdx ? c.columnItemDragging : {}) }}>
                    <label style="{{" display:="" &#x22;flex&#x22;,="" alignitems:="" &#x22;center&#x22;,="" gap:="" 6,="" flex:="" 1,="" cursor:="" &#x22;pointer&#x22;,="" width:="" &#x22;calc(100%="" -="" 80px)&#x22;="" }}="">
                      <input type="checkbox" checked="{selected.has(col)}" onchange="{()" &#x3D;=""> toggle(col)} style={{ cursor: "pointer" }} />
                      <span style="{{" ...c.ellipsis,="" maxwidth:="" &#x22;100%&#x22;,="" overflow:="" &#x22;hidden&#x22;,="" textoverflow:="" &#x22;ellipsis&#x22;,="" whitespace:="" &#x22;nowrap&#x22;="" }}="" title="{col}">{col}</span>
                    </label>
                    <div 80="" style="{{" display:="" &#x22;flex&#x22;,="" gap:="" 4,="" marginleft:="" 8,="" minwidth:="" }}="">
                      <span style="{{" ...c.draghandle,="" cursor:="" &#x22;grab&#x22;="" }}="">⋮⋮</span>
                      {actualIdx > 0 &#x26;&#x26; <button style="{c.miniBtn}" onclick="{()" &#x3D;=""> moveColumn(actualIdx, actualIdx - 1)} title="Move up">↑</button>}
                      {actualIdx &#x3C; columnOrder.length - 1 &#x26;&#x26; <button style="{c.miniBtn}" onclick="{()" &#x3D;=""> moveColumn(actualIdx, actualIdx + 1)} title="Move down">↓</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style="{c.controls}">
              <button style="{c.btn}" onclick="{()" &#x3D;=""> { setExportFormat("clipboard"); exportData(); }} disabled={!rows.length || !selected.size}>{t.clipboard}</button>
              <button style="{c.btn}" onclick="{()" &#x3D;=""> { setExportFormat("csv"); exportData(); }} disabled={!rows.length || !selected.size}>{t.csv}</button>
              <button style="{c.btn}" onclick="{()" &#x3D;=""> { setExportFormat("excel"); exportData(); }} disabled={!rows.length || !selected.size}>{t.excel}</button>
              <button style="{c.btn}" onclick="{sendToGoogleSheet}" disabled="{busy" ||="" !rows.length="" !selected.size="" !settings.scripturl="" !settings.secret}="">{busy ? t.sending : t.googleSheets}</button>
            </div>
            {exportMsg &#x26;&#x26; <div style="{c.note}">{exportMsg}</div>}
          </div>
        )}
        {tab === "scan" &#x26;&#x26; (
          <div style="{c.section}">
            <h3 style="{c.heading}">{t.scanTitle}</h3>
            <suspense fallback="{<div">Loading...</suspense></div>}>
              <scanapplazy api="{api}" settings="{{" ocrwebhookurl:="" settings.ocrwebhookurl,="" ocrsecret:="" settings.ocrsecret,="" ocrprompt:="" settings.ocrprompt,="" language:="" settings.language="" }}="" translations="{t}" styles="{c}" onconfirm="{(marks," rows,="" markkey,="" qtykey)=""> {
                  setTab("search");
                  setSearchField("AssemblyMark");
                  setSearchFieldFilter("Kooste märk (BLOCK)");
                  setSearchScope("available");
                  setSearchInput(marks.join("\n"));
                  setTimeout(() => { searchAndSelect(); }, 100);
                }}
              />
            
          </scanapplazy></div>
        )}
        {tab === "settings" &#x26;&#x26; (
          <div style="{c.section}">
            <div style="{c.row}">
              <label style="{c.label}">Keel / Language</label>
              <div 1="" style="{{" display:="" &#x22;flex&#x22;,="" gap:="" 6,="" flex:="" }}="">
                <button style="{scopeButtonStyle(settings.language" &#x3D;="=" &#x22;et&#x22;)}="" onclick="{()"> updateSettings({ language: "et" })}>ET</button>
                <button style="{scopeButtonStyle(settings.language" &#x3D;="=" &#x22;en&#x22;)}="" onclick="{()"> updateSettings({ language: "en" })}>EN</button>
              </div>
            </div>
            <div style="{c.row}">
              <label style="{c.label}">{t.scriptUrl}</label>
              <input value="{settings.scriptUrl}" onchange="{(e)" &#x3D;=""> updateSettings({ scriptUrl: e.target.value })} placeholder="https://…/exec" style={{...c.input, flex:1}} />
            </div>
            <div style="{c.row}">
              <label style="{c.label}">{t.sharedSecret}</label>
              <input type="password" value="{settings.secret}" onchange="{(e)" &#x3D;=""> updateSettings({ secret: e.target.value })} style={{...c.input, flex:1}} />
            </div>
            <div style="{c.row}">
              <label style="{c.label}">{t.ocrWebhookUrl}</label>
              <input value="{settings.ocrWebhookUrl}" onchange="{(e)" &#x3D;=""> updateSettings({ ocrWebhookUrl: e.target.value })} placeholder="https://script.google.com/..." style={{...c.input, flex:1}} />
            </div>
            <div style="{c.row}">
              <label style="{c.label}">{t.ocrWebhookSecret}</label>
              <input type="password" value="{settings.ocrSecret}" onchange="{(e)" &#x3D;=""> updateSettings({ ocrSecret: e.target.value })} style={{...c.input, flex:1}} />
            </div>
            <div style="{c.row}">
              <label style="{c.label}">{t.ocrPrompt}</label>
              &#x3C;textarea value={settings.ocrPrompt} onChange={(e) => updateSettings({ ocrPrompt: e.target.value })} placeholder={t.pasteHint} style={{...c.textarea, height: 80, flex:1}} />
            </div>
            <div style="{c.row}">
              <label style="{c.label}">{t.autoColorize}</label>
              <input type="checkbox" checked="{settings.autoColorize}" onchange="{(e)" &#x3D;=""> updateSettings({ autoColorize: e.target.checked })} />
            </div>
            <div style="{c.row}">
              <label style="{c.label}" title="{t.colorTooltip}">{t.color}</label>
              <div style="{{" display:="" &#x22;flex&#x22;,="" flexdirection:="" &#x22;column&#x22;,="" gap:="" 4,="" flex:1="" }}="">
                <select value="{Object.keys(DEFAULT_COLORS).find(k" &#x3D;=""> { const current = settings.colorizeColor ?? DEFAULT_COLORS.darkRed; const col = DEFAULT_COLORS[k as keyof typeof DEFAULT_COLORS]; return current.r === col.r &#x26;&#x26; current.g === col.g &#x26;&#x26; current.b === col.b; }) || "darkRed"} onChange={(e) => updateSettings({ colorizeColor: DEFAULT_COLORS[e.target.value as keyof typeof DEFAULT_COLORS] })} style={c.input}>
                  <option value="darkRed">{t.darkRed}</option>
                  <option value="red">{t.red}</option>
                  <option value="orange">{t.orange}</option>
                  <option value="yellow">{t.yellow}</option>
                  <option value="green">{t.green}</option>
                  <option value="blue">{t.blue}</option>
                  <option value="purple">{t.purple}</option>
                </select>
                <span style="{{" fontsize:="" 11,="" opacity:="" 0.7="" }}="">{t.colorTooltip}</span>
              </div>
            </div>
            <div style="{c.row}">
              <label style="{c.label}">{t.defaultPreset}</label>
              <select value="{settings.defaultPreset}" onchange="{(e)" &#x3D;=""> updateSettings({ defaultPreset: e.target.value as DefaultPreset })} style={{...c.input, flex:1}}>
                <option value="recommended">{t.recommended}</option>
                <option value="tekla">{t.tekla}</option>
                <option value="ifc">{t.ifc}</option>
              </select>
            </div>
            <div style="{{" ...c.row,="" justifycontent:="" &#x22;flex-end&#x22;="" }}="">
              <button style="{c.btn}" onclick="{()" &#x3D;=""> setSettingsMsg(t.saved)}>{t.save}</button>
              <button style="{c.btnGhost}" onclick="{()" &#x3D;=""> { window.localStorage?.removeItem?.("assemblyExporterSettings"); window.location.reload(); }}>{t.reset}</button>
            </div>
            {settingsMsg &#x26;&#x26; <div style="{c.note}">{settingsMsg}</div>}
          </div>
        )}
        {tab === "about" &#x26;&#x26; (
          <div style="{c.section}">
            <div style="{c.small}">
              <b>{t.version}</b><br>
              {t.features.split('\n').map((line, i) => <div key="{i}">{line}</div>)}
              <br>
              {t.author}
            </div>
          </div>
        )}
        <div style="{{" padding:="" 10,="" textalign:="" &#x22;center&#x22;,="" fontsize:="" 11,="" opacity:="" 0.5="" }}="">{t.author}</div>
      </div>
    
  );
}
const styles: Record<string, cssproperties=""> = {
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
  inputFilter: { width: "100%", maxHeight: "150px", padding: "6px 8px", border: "1px solid #cfd6df", borderRadius: 8, outline: "none", resize: "vertical" as any },
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
}
