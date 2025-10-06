import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import * as XLSX from "xlsx";
type Tab = "search" | "discover" | "export" | "settings" | "about" | "pset";
type Row = Record<string, string>;
type ExportFormat = "clipboard" | "excel" | "csv";
const LOCKED_ORDER = [
  "GUID",
  "GUID_IFC",
  "GUID_MS",
  "Project",
  "ModelId",
  "FileName",
  "Name",
  "Type",
] as const;
type LockedKey = (typeof LOCKED_ORDER)[number];
const FORCE_TEXT_KEYS = new Set<string>([
  "Tekla_Assembly.AssemblyCast_unit_top_elevation",
  "Tekla_Assembly.AssemblyCast_unit_bottom_elevation",
]);
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
  trimbleClientId: string;
  trimbleClientSecret: string;
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
    scriptUrl: localStorage.getItem("sheet_webapp") || "",
    secret: localStorage.getItem("sheet_secret") || "",
    autoColorize: true,
    defaultPreset: "recommended",
    colorizeColor: DEFAULT_COLORS.darkRed,
    trimbleClientId: "",
    trimbleClientSecret: "",
  };
  const [settings, setSettings] = useState<AppSettings>(() => {
    const raw = localStorage.getItem("assemblyExporterSettings");
    if (!raw) return DEFAULTS;
    try {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        ...DEFAULTS,
        ...parsed,
        colorizeColor: parsed?.colorizeColor ?? DEFAULT_COLORS.darkRed,
        trimbleClientId: parsed?.trimbleClientId ?? "",
        trimbleClientSecret: parsed?.trimbleClientSecret ?? "",
      };
    } catch {
      return DEFAULTS;
    }
  });
  const update = (patch: Partial<AppSettings>) => {
    const next: AppSettings = {
      ...settings,
      ...patch,
      colorizeColor: patch.colorizeColor ?? settings.colorizeColor ?? DEFAULT_COLORS.darkRed,
    };
    setSettings(next);
    localStorage.setItem("assemblyExporterSettings", JSON.stringify(next));
    localStorage.setItem("sheet_webapp", next.scriptUrl || "");
    localStorage.setItem("sheet_secret", next.secret || "");
  };
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
  if (
    /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(s) ||
    /^[0-9A-Fa-f]{32}$/.test(s)
  ) return "MS";
  return "UNKNOWN";
}
async function flattenProps(
  obj: any,
  modelId: string,
  projectName: string,
  modelNameById: Map<string, string>,
  api: any
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
    Object.entries(obj.properties).forEach(([key, val]) => {
      push("Properties", key, val);
    });
  }
  if (obj?.id) out.ObjectId = String(obj.id);
  if (obj?.name) out.Name = String(obj.name);
  if (obj?.type) out.Type = String(obj.type);
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
      console.warn(`convertToObjectIds failed for ${obj.id}:`, e);
    }
  }
  out.GUID_IFC = guidIfc;
  out.GUID_MS = guidMs;
  out.GUID = guidIfc || guidMs || "";
  return out;
}
async function getProjectName(api: any): Promise<string> {
  try {
    const proj = typeof api?.project?.getProject === "function"
      ? await api.project.getProject()
      : api?.project || {};
    return String(proj?.name || "");
  } catch {
    return "";
  }
}
async function getSelectedObjects(api: any): Promise<Array<{ modelId: string; objects: any[] }>> {
  const viewer: any = api?.viewer;
  const mos = await viewer?.getObjects?.({ selected: true });
  if (!Array.isArray(mos) || !mos.length) return [];
  return mos.map((mo: any) => ({
    modelId: String(mo.modelId),
    objects: mo.objects || []
  }));
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
async function getAccessToken(clientId: string, clientSecret: string) {
  try {
    const response = await fetch('https://id.trimble.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}&scope=openid profile email`
    });
    if (!response.ok) throw new Error('Autentimise viga: ' + response.status);
    const data = await response.json();
    return data.access_token;
  } catch (e) {
    console.error('Tokeni viga:', e);
    return null;
  }
}
async function getLibraries(token: string, projectId: string = '') {
  try {
    const url = `https://pset-api.connect.trimble.com/v1/libraries${projectId ? `?projectId=${projectId}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Libraries viga: ' + response.status);
    return await response.json();
  } catch (e) {
    console.error('Libraries päringu viga:', e);
    return null;
  }
}
async function getLibraryDetails(token: string, libraryId: string) {
  try {
    const response = await fetch(`https://pset-api.connect.trimble.com/v1/libraries/${libraryId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Library detailide viga: ' + response.status);
    return await response.json();
  } catch (e) {
    console.error('Library detailide viga:', e);
    return null;
  }
}
type Props = { api: any };
export default function AssemblyExporter({ api }: Props) {
  const [settings, updateSettings] = useSettings();
  const [tab, setTab] = useState<Tab>("search");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    new Set<string>(JSON.parse(localStorage.getItem("fieldSel") || "[]"))
  );
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [highlightedColumn, setHighlightedColumn] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [searchFieldFilter, setSearchFieldFilter] = useState("Assembly Mark (BLOCK)");
  const [isSearchFieldDropdownOpen, setIsSearchFieldDropdownOpen] = useState(false);
  const [searchScope, setSearchScope] = useState<"available" | "visible" | "selected">("available");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filter]);
  const [busy, setBusy] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [psetMsg, setPsetMsg] = useState("");
  const [psetLibraries, setPsetLibraries] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [libraryId, setLibraryId] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [searchField, setSearchField] = useState<string>("AssemblyMark");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("excel");
  const [lastSelection, setLastSelection] = useState<Array<{ modelId: string; ids: number[] }>>([]);
  const [searchResults, setSearchResults] = useState<Array<{
    originalValue: string;
    value: string;
    status: 'found' | 'notfound';
    modelId?: string;
    ids?: number[];
  }>>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const allKeys: string[] = useMemo(
    () => Array.from(new Set(rows.flatMap(r => Object.keys(r)))).sort(),
    [rows]
  );
  const searchFieldOptions = useMemo(() => {
    const baseOptions = [
      { value: "AssemblyMark", label: "Assembly Mark (BLOCK)" },
      { value: "GUID_IFC", label: "IFC GUID" },
      { value: "GUID_MS", label: "MS/Tekla GUID" },
      { value: "Name", label: "Nimi" },
    ];
  
    const customOptions = allKeys
      .filter(k => !['GUID', 'GUID_IFC', 'GUID_MS', 'Name', 'Type', 'Project', 'ModelId', 'FileName', 'ObjectId'].includes(k))
      .map(k => ({ value: k, label: k }));
  
    const allOptions = [...baseOptions, ...customOptions];
  
    if (!searchFieldFilter) return allOptions;
  
    const filterLower = searchFieldFilter.toLowerCase();
    return allOptions.filter(opt =>
      opt.label.toLowerCase().includes(filterLower) ||
      opt.value.toLowerCase().includes(filterLower)
    );
  }, [allKeys, searchFieldFilter]);
  const groupedUnsorted: Grouped = useMemo(() => groupKeys(allKeys), [allKeys]);
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
  useEffect(() => {
    localStorage.setItem("fieldSel", JSON.stringify(Array.from(selected)));
  }, [selected]);
  useEffect(() => {
    if (!rows.length || selected.size) return;
    if (settings.defaultPreset === "tekla") presetTekla();
    else if (settings.defaultPreset === "ifc") presetIFC();
    else presetRecommended();
  }, [rows]);
  useEffect(() => {
    // Uuenda columnOrder'i, kui allKeys muutub - lisa puuduvad võtmed lõppu
    const currentSet = new Set(columnOrder);
    const missingKeys = allKeys.filter(k => !currentSet.has(k));
    if (missingKeys.length > 0) {
      setColumnOrder(prev => [...prev, ...missingKeys]);
    } else if (!columnOrder.length && allKeys.length) {
      setColumnOrder([...LOCKED_ORDER, ...allKeys.filter(k => !LOCKED_ORDER.includes(k as any))]);
    }
  }, [allKeys]);
  useEffect(() => {
    if (discoverMsg) {
      const timer = setTimeout(() => setDiscoverMsg(""), MESSAGE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [discoverMsg]);
  useEffect(() => {
    if (exportMsg) {
      const timer = setTimeout(() => setExportMsg(""), MESSAGE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [exportMsg]);
  useEffect(() => {
    if (searchMsg && !busy) {
      const timer = setTimeout(() => setSearchMsg(""), MESSAGE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [searchMsg, busy]);
  useEffect(() => {
    if (!api?.viewer) return;
  
    let selectionTimeout: NodeJS.Timeout;
  
    const handleSelectionChange = () => {
      clearTimeout(selectionTimeout);
      selectionTimeout = setTimeout(() => {
        if (!busy) {
          discover();
        }
      }, 800);
    };
  
    try {
      api.viewer.on?.('selectionChanged', handleSelectionChange);
    } catch (e) {
      console.warn("Selection listener setup failed:", e);
    }
  
    return () => {
      clearTimeout(selectionTimeout);
      try {
        api.viewer.off?.('selectionChanged', handleSelectionChange);
      } catch {}
    };
  }, [api, busy]);
  useEffect(() => {
    if (tab === "export" && !busy) {
      discover();
    }
  }, [tab]);
  const matches = (k: string) => filteredKeysSet.has(k);
  function toggle(k: string) {
    setSelected(s => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }
  function toggleGroup(keys: string[], on: boolean) {
    setSelected(s => {
      const n = new Set(s);
      for (const k of keys) on ? n.add(k) : n.delete(k);
      return n;
    });
  }
  function selectAll(on: boolean) {
    setSelected(() => (on ? new Set(allKeys) : new Set()));
  }
  function presetRecommended() {
    const wanted = new Set<string>([
      ...LOCKED_ORDER,
      "ReferenceObject.Common_Type",
      "ReferenceObject.File_Name",
    ]);
    setSelected(new Set(allKeys.filter(k => wanted.has(k))));
  }
  function presetTekla() {
    setSelected(new Set(allKeys.filter(k =>
      k.startsWith("Tekla_Assembly.") || k === "ReferenceObject.File_Name"
    )));
  }
  function presetIFC() {
    const wanted = new Set<string>([
      "GUID_IFC",
      "GUID_MS",
      "ReferenceObject.Common_Type",
      "ReferenceObject.File_Name",
    ]);
    setSelected(new Set(allKeys.filter(k => wanted.has(k))));
  }
  async function discover() {
    if (!api?.viewer) {
      setDiscoverMsg("❌ Viewer API pole saadaval (iframe?).");
      return;
    }
    try {
      setBusy(true);
      setDiscoverMsg("Loen valitud objekte…");
      setProgress({ current: 0, total: 0 });
    
      const selectedWithBasic = await getSelectedObjects(api);
      if (!selectedWithBasic.length) {
        setDiscoverMsg("⚠️ Palun vali 3D vaates objektid.");
        setRows([]);
        return;
      }
    
      const projectName = await getProjectName(api);
      const modelIds = selectedWithBasic.map(m => m.modelId);
      const nameMap = await buildModelNameMap(api, modelIds);
      const out: Row[] = [];
      const lastSel: Array<{ modelId: string; ids: number[] }> = [];
    
      setProgress({ current: 0, total: selectedWithBasic.length });
    
      for (let i = 0; i < selectedWithBasic.length; i++) {
        const { modelId, objects } = selectedWithBasic[i];
        setDiscoverMsg(`Töötlen mudelit ${i + 1}/${selectedWithBasic.length}…`);
      
        const objectRuntimeIds = objects.map((o: any) => Number(o?.id)).filter(n => Number.isFinite(n));
      
        let fullObjects = objects;
        try {
          const fullProperties = await api.viewer.getObjectProperties(modelId, objectRuntimeIds);
        
          fullObjects = objects.map((obj: any, idx: number) => ({
            ...obj,
            properties: fullProperties[idx]?.properties || obj.properties
          }));
        } catch (e) {
          console.warn(`getObjectProperties failed for model ${modelId}:`, e);
        }
      
        const flattened = await Promise.all(
          fullObjects.map(o => flattenProps(o, modelId, projectName, nameMap, api))
        );
        out.push(...flattened);
      
        lastSel.push({
          modelId,
          ids: objectRuntimeIds,
        });
      
        setProgress({ current: i + 1, total: selectedWithBasic.length });
      }
    
      setRows(out);
      setLastSelection(lastSel);
      setDiscoverMsg(
        `✅ Leidsin ${out.length} objekti. Võtmeid kokku: ${Array.from(new Set(out.flatMap(r => Object.keys(r)))).length}.`
      );
    } catch (e: any) {
      console.error(e);
      setDiscoverMsg(`❌ Viga: ${e?.message || "tundmatu viga"}`);
    } finally {
      setBusy(false);
    }
  }
  function cancelSearch() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setBusy(false);
      setSearchMsg("❌ Otsing katkestatud.");
      abortControllerRef.current = null;
    }
  }
  async function searchAndSelect() {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
  
    try {
      setBusy(true);
      setSearchMsg("Palun oota, teostame otsingut...");
      setSearchResults([]);
      setProgress({ current: 0, total: 0 });
    
      const searchValues = searchInput.split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean);
      const uniqueSearchValues = [...new Set(searchValues)];
      const hasDuplicates = searchValues.length > uniqueSearchValues.length;
      const searchLower = new Set(uniqueSearchValues.map(v => v.toLowerCase()));
    
      if (!uniqueSearchValues.length) {
        setSearchMsg("⚠️ Sisesta vähemalt üks väärtus.");
        setBusy(false);
        return;
      }
    
      const viewer = api?.viewer;
      let mos;
      if (searchScope === "selected") {
        mos = await viewer?.getObjects({ selected: true });
      } else if (searchScope === "visible") {
        const allMos = await viewer?.getObjects();
        const visibleMos = [];
        for (const mo of allMos || []) {
          const objectRuntimeIds = (mo.objects || []).map((o: any) => Number(o?.id)).filter(n => Number.isFinite(n));
          const states = await viewer.getObjectState(mo.modelId, objectRuntimeIds);
          const visibleObjects = mo.objects.filter((_, idx) => states[idx]?.visible !== false);
          if (visibleObjects.length) visibleMos.push({ ...mo, objects: visibleObjects });
        }
        mos = visibleMos;
      } else {
        mos = await viewer?.getObjects();
      }
    
      if (!Array.isArray(mos)) {
        if (abortController.signal.aborted) return;
        setSearchMsg("❌ Ei suuda lugeda objekte.");
        setBusy(false);
        return;
      }
    
      const found: Array<{ modelId: string; ids: number[] }> = [];
      const foundValues = new Map<string, { original: string; modelId: string; ids: number[] }>();
      setProgress({ current: 0, total: mos.length });
    
      for (let mIdx = 0; mIdx < mos.length; mIdx++) {
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
          console.warn(`getObjectProperties failed for model ${modelId}:`, e);
          fullProperties = mo.objects || [];
        }
      
        const matchIds: number[] = [];
      
        for (let i = 0; i < fullProperties.length; i++) {
          if (abortController.signal.aborted) return;
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
                  if ((searchField === "GUID_IFC" && cls === "IFC") ||
                      (searchField === "GUID_MS" && cls === "MS")) {
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
            
              if (groupPart && !setNameSanitized.toLowerCase().includes(groupPart.toLowerCase())) {
                continue;
              }
            
              for (const p of set?.properties ?? []) {
                const propName = String(p?.name || "");
                const propNameSanitized = sanitizeKey(propName);
                const fullKeySanitized = `${setNameSanitized}.${propNameSanitized}`;
              
                if (fullKeySanitized.toLowerCase() === searchField.toLowerCase() ||
                    propNameSanitized.toLowerCase().includes(propPart.toLowerCase())) {
                  matchValue = String(p?.value || p?.displayValue || "").trim();
                  break;
                }
              }
              if (matchValue) break;
            }
          }
        
          const matchLower = matchValue.toLowerCase();
          const originalMatch = uniqueSearchValues.find(v => v.toLowerCase() === matchLower);
          if (originalMatch && searchLower.has(matchLower)) {
            matchIds.push(objId);
          
            if (!foundValues.has(matchLower)) {
              foundValues.set(matchLower, { original: originalMatch, modelId, ids: [] });
            }
            foundValues.get(matchLower)!.ids.push(objId);
          }
        }
      
        if (matchIds.length) found.push({ modelId, ids: matchIds });
        setProgress({ current: mIdx + 1, total: mos.length });
      }
    
      if (searchField === "GUID_IFC" && found.length === 0) {
        const allModels = await api.viewer.getModels();
        for (const originalValue of uniqueSearchValues) {
          const value = originalValue.toLowerCase();
          for (const model of allModels || []) {
            if (abortController.signal.aborted) return;
            const modelId = String(model.id);
            try {
              const runtimeIds = await api.viewer.convertToObjectRuntimeIds(modelId, [originalValue]);
              if (runtimeIds.length > 0) {
                found.push({
                  modelId,
                  ids: runtimeIds.map((id: any) => Number(id))
                });
                foundValues.set(value, { original: originalValue, modelId, ids: runtimeIds.map((id: any) => Number(id)) });
              }
            } catch {}
          }
        }
      }
    
      const results: Array<{
        originalValue: string;
        value: string;
        status: 'found' | 'notfound';
        modelId?: string;
        ids?: number[];
      }> = [];
    
      for (const originalValue of uniqueSearchValues) {
        const lower = originalValue.toLowerCase();
        if (foundValues.has(lower)) {
          const data = foundValues.get(lower)!;
          results.push({
            originalValue: data.original,
            value: lower,
            status: 'found',
            modelId: data.modelId,
            ids: data.ids
          });
        } else {
          results.push({
            originalValue,
            value: lower,
            status: 'notfound'
          });
        }
      }
    
      setSearchResults(results);
    
      if (found.length) {
        const selector = {
          modelObjectIds: found.map(f => ({
            modelId: f.modelId,
            objectRuntimeIds: f.ids
          }))
        };
        await viewer?.setSelection?.(selector);
        setLastSelection(found);
      
        const notFound = results.filter(r => r.status === 'notfound').map(r => r.originalValue);
        let msg = `✅ Leidsin ${foundValues.size}/${uniqueSearchValues.length} väärtust.`;
        if (notFound.length) {
          msg += ` Ei leidnud: ${notFound.join(", ")}`;
        } else {
          msg += ` Kõik väärtused leitud ja valitud.`;
        }
        if (hasDuplicates) {
          msg += ` ⚠️ Otsingus olid dubleeritud väärtused, arvestati unikaalseid.`;
        }
        setSearchMsg(msg);
      } else {
        setSearchMsg(`❌ Ei leidnud ühtegi väärtust: ${uniqueSearchValues.join(", ")}`);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setSearchMsg("❌ Otsing katkestatud.");
      } else {
        console.error(e);
        setSearchMsg(`❌ Viga: ${e?.message || "tundmatu viga"}`);
      }
    } finally {
      setBusy(false);
      abortControllerRef.current = null;
    }
  }
  async function selectAllFound() {
    try {
      const allFound = searchResults
        .filter(r => r.status === 'found' && r.modelId && r.ids)
        .map(r => ({
          modelId: r.modelId!,
          ids: r.ids!
        }));
     
      if (allFound.length) {
        const selector = {
          modelObjectIds: allFound.map(f => ({
            modelId: f.modelId,
            objectRuntimeIds: f.ids
          }))
        };
        await api?.viewer?.setSelection?.(selector);
        setLastSelection(allFound);
        setSearchMsg("✅ Valisime kõik leitud objektid.");
      }
    } catch (e: any) {
      console.error("Select all error:", e);
      setSearchMsg("❌ Viga kõikide valimisel.");
    }
  }
  async function closeAndZoom(modelId: string, ids: number[]) {
    try {
      await selectAndZoom(modelId, ids);
      if (api?.extension?.close) {
        await api.extension.close();
      } else if (api?.extension) {
        await api.extension.broadcast({ action: "closePanel" });
      } else {
        window.parent.postMessage({ type: "closeExtension" }, "*");
      }
    } catch (e: any) {
      console.error("Close & zoom error:", e);
    }
  }
  async function selectAndZoom(modelId: string, ids: number[]) {
    try {
      const viewer = api?.viewer;
      const selector = {
        modelObjectIds: [{
          modelId,
          objectRuntimeIds: ids
        }]
      };
      await viewer?.setSelection?.(selector);
      await viewer?.setCamera?.(selector, { animationTime: 500 });
    } catch (e: any) {
      console.error("Zoom error:", e);
    }
  }
  function moveColumn(from: number, to: number) {
    const newOrder = [...columnOrder];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, moved);
    setColumnOrder(newOrder);
  
    setHighlightedColumn(moved);
    setTimeout(() => setHighlightedColumn(null), HIGHLIGHT_DURATION_MS);
  }
  function handleDragStart(e: DragEvent<HTMLDivElement>, index: number) {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.4";
    }
  }
  function handleDragEnd(e: DragEvent<HTMLDivElement>) {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDraggedIndex(null);
  }
  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function handleDrop(e: DragEvent<HTMLDivElement>, dropIndex: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
  
    const newOrder = [...columnOrder];
    const [moved] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, moved);
    setColumnOrder(newOrder);
  
    setHighlightedColumn(moved);
    setTimeout(() => setHighlightedColumn(null), HIGHLIGHT_DURATION_MS);
  }
  async function exportData() {
    if (!rows.length) {
      setExportMsg("⚠️ Pole andmeid eksportimiseks.");
      return;
    }
  
    const exportCols = columnOrder.filter(k => selected.has(k) && allKeys.includes(k));
    if (!exportCols.length) {
      setExportMsg("⚠️ Vali vähemalt üks veerg.");
      return;
    }
  
    try {
      if (exportFormat === "clipboard") {
        const header = exportCols.join("\t");
        const body = rows
          .map(r => exportCols.map(k => (r[k] ?? "")).join("\t"))
          .join("\n");
        const content = header + "\n" + body;
      
        await navigator.clipboard.writeText(content);
        setExportMsg(`✅ Kopeeritud ${rows.length} rida lõikelauale.`);
      
      } else if (exportFormat === "excel") {
        const aoa: any[][] = [];
        aoa.push(exportCols);
      
        for (const r of rows) {
          aoa.push(
            exportCols.map((k) => {
              const v = r[k] ?? "";
              if (FORCE_TEXT_KEYS.has(k) || /^(GUID|GUID_IFC|GUID_MS)$/i.test(k)) {
                return `'${String(v)}`;
              }
              return v;
            })
          );
        }
      
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Export");
        const filename = `assembly-export-${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, filename);
        setExportMsg(`✅ Salvestatud ${rows.length} rida .xlsx failina.`);
      
      } else if (exportFormat === "csv") {
        const csvHead = exportCols.join(",");
        const csvBody = rows
          .map(r => exportCols.map(k => `"${((r[k] ?? "") as string).replace(/"/g, '""')}"`).join(","))
          .join("\n");
        const blob = new Blob([csvHead + "\n" + csvBody], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `assembly-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        setExportMsg(`✅ Salvestatud ${rows.length} rida CSV-na.`);
      }
    } catch (e: any) {
      setExportMsg(`❌ Viga: ${e?.message || e}`);
    }
  }
  async function sendToGoogleSheet() {
    const { scriptUrl, secret, autoColorize } = settings;
  
    if (!scriptUrl || !secret) {
      setTab("settings");
      setSettingsMsg("Täida Script URL ja Shared Secret.");
      return;
    }
  
    if (!rows.length) {
      setExportMsg('Pole andmeid eksportimiseks.');
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
      setExportMsg("Saadan Google Sheeti…");
    
      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows: payload }),
      });
    
      const data = await res.json();
    
      if (data?.ok) {
        setExportMsg(`✅ Lisatud ${payload.length} rida.` + (autoColorize ? " Värvin…" : ""));
        if (autoColorize) await colorLastSelection();
      } else {
        setExportMsg(`❌ Viga: ${data?.error || "unknown"}`);
      }
    } catch (e: any) {
      setExportMsg(`❌ Viga: ${e?.message || e}`);
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
        ids: (m.objects || [])
          .map((o: any) => Number(o?.id))
          .filter((n) => Number.isFinite(n)),
      }));
    }
  
    if (!blocks?.length) return;
  
    const safeColor = settings.colorizeColor ?? DEFAULT_COLORS.darkRed;
    const { r, g, b } = safeColor;
  
    for (const bl of blocks) {
      const selector = {
        modelObjectIds: [{ modelId: bl.modelId, objectRuntimeIds: bl.ids }]
      };
      await viewer?.setObjectState?.(selector, { color: { r, g, b, a: 255 } });
    }
  }
  async function resetState() {
    try {
      await api?.viewer?.setObjectState?.(undefined, { color: "reset", visible: "reset" });
      setDiscoverMsg("✅ View state reset.");
    } catch (e: any) {
      setDiscoverMsg(`❌ Reset failed: ${e?.message || e}`);
    }
  }
  async function fetchPsetLibraries() {
    const { trimbleClientId, trimbleClientSecret } = settings;
  
    if (!trimbleClientId || !trimbleClientSecret) {
      setPsetMsg("⚠️ Sisesta Trimble Client ID ja Secret settingsis.");
      return;
    }
  
    if (!projectId) {
      setPsetMsg("⚠️ Sisesta Project ID.");
      return;
    }
  
    setBusy(true);
    setPsetMsg("Hankin libraries't...");
  
    const token = await getAccessToken(trimbleClientId, trimbleClientSecret);
    if (!token) {
      setPsetMsg("❌ Autentimise viga.");
      setBusy(false);
      return;
    }
  
    const libs = await getLibraries(token, projectId);
    if (libs) {
      setPsetLibraries(libs);
      setPsetMsg(`✅ Leidsin ${libs.length} library't.`);
    } else {
      setPsetMsg("❌ Viga libraries'te hankimisel.");
    }
  
    setBusy(false);
  }
  async function fetchLibraryDetails() {
    const { trimbleClientId, trimbleClientSecret } = settings;
  
    if (!libraryId) {
      setPsetMsg("⚠️ Sisesta Library ID.");
      return;
    }
  
    setBusy(true);
    setPsetMsg("Hankin library detailid...");
  
    const token = await getAccessToken(trimbleClientId, trimbleClientSecret);
    if (!token) {
      setPsetMsg("❌ Autentimise viga.");
      setBusy(false);
      return;
    }
  
    const details = await getLibraryDetails(token, libraryId);
    if (details) {
      console.log(details);
      setPsetMsg(`✅ Library detailid: ${JSON.stringify(details, null, 2)}`);
    } else {
      setPsetMsg("❌ Viga detailide hankimisel.");
    }
  
    setBusy(false);
  }
  const c = styles;
  const exportableColumns = columnOrder.filter(k => allKeys.includes(k));
  const totalFoundCount = searchResults.reduce((sum, r) => sum + (r.status === 'found' ? r.ids?.length || 0 : 0), 0);
  return (
    <div style={c.shell}>
      <div style={c.topbar}>
        <button style={{ ...c.tab, ...(tab === "search" ? c.tabActive : {}) }} onClick={() => setTab("search")}>SEARCH</button>
        <button style={{ ...c.tab, ...(tab === "discover" ? c.tabActive : {}) }} onClick={() => setTab("discover")}>DISCOVER</button>
        <button style={{ ...c.tab, ...(tab === "export" ? c.tabActive : {}) }} onClick={() => setTab("export")}>EXPORT</button>
        <button style={{ ...c.tab, ...(tab === "pset" ? c.tabActive : {}) }} onClick={() => setTab("pset")}>PSET</button>
        <button style={{ ...c.tab, ...(tab === "settings" ? c.tabActive : {}) }} onClick={() => setTab("settings")}>SETTINGS</button>
        <button style={{ ...c.tab, ...(tab === "about" ? c.tabActive : {}) }} onClick={() => setTab("about")}>ABOUT</button>
      </div>
    
      <div style={c.page}>
        {tab === "search" && (
          <div style={c.section}>
            <h3 style={c.heading}>Otsi ja vali</h3>
          
            <div style={c.row}>
              <label style={c.label}>Otsi mille järgi:</label>
              <div style={{ flex: 1, position: "relative" }} onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setTimeout(() => setIsSearchFieldDropdownOpen(false), 200);
                }
              }}>
                <input
                  type="text"
                  value={searchFieldFilter}
                  onChange={(e) => setSearchFieldFilter(e.target.value)}
                  onFocus={() => setIsSearchFieldDropdownOpen(true)}
                  placeholder="Tippige filtriks või valige..."
                  style={{ ...c.input, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}
                />
                {isSearchFieldDropdownOpen && (
                  <div style={c.dropdown}>
                    {searchFieldOptions.length === 0 ? (
                      <div style={c.dropdownItem}>Tulemusi ei leitud</div>
                    ) : (
                      searchFieldOptions.map(opt => (
                        <div
                          key={opt.value}
                          style={{
                            ...c.dropdownItem,
                            ...(searchField === opt.value ? c.dropdownItemSelected : {}),
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#f5f5f5";
                          }}
                          onMouseLeave={(e) => {
                            if (searchField !== opt.value) {
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
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
          
            <div style={c.row}>
              <label style={c.label}>Otsi ulatus:</label>
              <select
                value={searchScope}
                onChange={(e) => setSearchScope(e.target.value as "available" | "visible" | "selected")}
                style={c.input}
              >
                <option value="available">Kõik saadaval</option>
                <option value="visible">Nähtaval</option>
                <option value="selected">Valitud</option>
              </select>
            </div>
          
            <textarea
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Kleebi siia otsitavad väärtused (üks rea kohta või komadega eraldatud)&#10;Näiteks:&#10;BM-3&#10;2COL23&#10;RBP-111"
              style={{ ...c.textarea, height: 200 }}
            />
            <div style={c.controls}>
              <button style={c.btn} onClick={searchAndSelect} disabled={busy || !searchInput.trim()}>
                {busy ? "Otsin…" : "Otsi ja vali"}
              </button>
              {busy && (
                <button style={c.btnGhost} onClick={cancelSearch}>
                  Katkesta otsing
                </button>
              )}
              <button style={c.btnGhost} onClick={() => { setSearchInput(""); setSearchResults([]); }}>Tühjenda</button>
            </div>
            {!!progress.total && progress.total > 1 && (
              <div style={c.small}>Otsingu progress: {progress.current}/{progress.total} mudelit</div>
            )}
            {searchMsg && <div style={c.note}>{searchMsg}</div>}
          
            {searchResults.length > 0 && (
              <div style={c.resultsBox}>
                <h4 style={c.resultsHeading}>Tulemused ({searchResults.length})</h4>
                <div style={c.resultsTable}>
                  {searchResults.map((result, idx) => (
                    <div key={idx} style={{
                      ...c.resultRow,
                      ...(result.status === 'found' ? c.resultRowFound : c.resultRowNotFound)
                    }}>
                      <span style={c.resultStatus}>
                        {result.status === 'found' ? '✅' : '❌'}
                      </span>
                      <span style={c.resultValue} title={result.originalValue}>
                        {result.originalValue}
                      </span>
                      <span style={c.resultCount}>
                        {result.status === 'found' ? `${result.ids?.length || 0}x` : '-'}
                      </span>
                      <div style={c.resultActions}>
                        {result.status === 'found' && result.modelId && result.ids && (
                          <>
                            <button
                              style={c.miniBtn}
                              onClick={() => selectAndZoom(result.modelId!, result.ids!)}
                              title="Zoomi juurde"
                            >
                              🔍 Zoom
                            </button>
                            <button
                              style={c.miniBtn}
                              onClick={() => closeAndZoom(result.modelId!, result.ids!)}
                              title="Sulge paneel ja zoomi"
                            >
                              🔍 Sulge & zoom
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ ...c.controls, marginTop: 8, justifyContent: "flex-end" }}>
                  <button
                    style={c.btn}
                    onClick={selectAllFound}
                    disabled={totalFoundCount === 0}
                  >
                    Vali kõik ({totalFoundCount}x)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      
        {tab === "discover" && (
          <div style={c.section}>
            <h3 style={c.heading}>Discover Fields</h3>
            <div style={c.controls}>
              <button style={c.btn} onClick={discover} disabled={busy}>
                {busy ? "…" : "Discover fields"}
              </button>
              <button style={c.btnGhost} onClick={resetState}>Reset colors</button>
            </div>
            {!!progress.total && progress.total > 1 && (
              <div style={c.small}>Progress: {progress.current}/{progress.total}</div>
            )}
            <input
              placeholder="Filter veerge…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={c.inputFilter}
            />
            <div style={c.controls}>
              <button style={c.btnGhost} onClick={() => selectAll(true)} disabled={!rows.length}>Vali kõik</button>
              <button style={c.btnGhost} onClick={() => selectAll(false)} disabled={!rows.length}>Tühjenda</button>
              <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>Valitud: {selected.size}</span>
            </div>
            <div style={{...c.list, maxHeight: "none", overflow: "visible"}}>
              {!rows.length ? (
                <div style={c.small}>Vali objektid 3D vaates (auto-discover).</div>
              ) : (
                groupedSortedEntries.map(([groupName, keys]) => {
                  const keysShown = keys.filter(matches);
                  if (!keysShown.length) return null;
                  return (
                    <div key={groupName} style={c.group}>
                      <div style={c.groupHeader}>
                        <b>{groupName}</b>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={c.mini} onClick={() => toggleGroup(keys, true)}>vali</button>
                          <button style={c.mini} onClick={() => toggleGroup(keys, false)}>tühjenda</button>
                        </div>
                      </div>
                      <div style={c.grid}>
                        {keysShown.map((k) => (
                          <label key={k} style={c.checkRow} title={k}>
                            <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} />
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
              <span style={{ alignSelf: "center", opacity: 0.7 }}>Presets:</span>
              <button style={c.btnGhost} onClick={presetRecommended} disabled={!rows.length}>Recommended</button>
              <button style={c.btnGhost} onClick={presetTekla} disabled={!rows.length}>Tekla</button>
              <button style={c.btnGhost} onClick={presetIFC} disabled={!rows.length}>IFC</button>
            </div>
            {discoverMsg && <div style={c.note}>{discoverMsg}</div>}
          </div>
        )}
      
        {tab === "export" && (
          <div style={c.section}>
            <h3 style={c.heading}>Export Data</h3>
          
            <div style={c.small}>Export toimub {rows.length} toote kohta</div>
          
            <div style={c.helpBox}>
              <strong>💡 Juhised:</strong> Lohista ridu hiirega ümber VÕI kasuta ↑ ↓ nuppe. Märgi linnukesega ekspordiks valitavad veerud.
            </div>
          
            <div style={c.controls}>
              <button style={c.btnGhost} onClick={discover} disabled={busy}>
                {busy ? "Uuendan…" : "Uuenda andmeid"}
              </button>
            </div>
          
            <div style={c.columnListNoscroll}>
              {exportableColumns.map((col) => {
                const actualIdx = columnOrder.indexOf(col);
                return (
                  <div
                    key={col}
                    draggable
                    onDragStart={(e) => handleDragStart(e, actualIdx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, actualIdx)}
                    style={{
                      ...c.columnItem,
                      ...(highlightedColumn === col ? c.columnItemHighlight : {}),
                      ...(draggedIndex === actualIdx ? c.columnItemDragging : {}),
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(col)}
                        onChange={() => toggle(col)}
                        style={{ cursor: "pointer" }}
                      />
                      <span style={c.ellipsis} title={col}>{col}</span>
                    </label>
                    <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                      <span style={{ ...c.dragHandle, cursor: "grab" }}>⋮⋮</span>
                      {actualIdx > 0 && (
                        <button style={c.miniBtn} onClick={() => moveColumn(actualIdx, actualIdx - 1)} title="Liiguta üles">↑</button>
                      )}
                      {actualIdx < columnOrder.length - 1 && (
                        <button style={c.miniBtn} onClick={() => moveColumn(actualIdx, actualIdx + 1)} title="Liiguta alla">↓</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          
            <div style={c.controls}>
              <button style={c.btn} onClick={() => { setExportFormat("clipboard"); exportData(); }} disabled={!rows.length || !selected.size}>
                📋 Clipboard
              </button>
              <button style={c.btn} onClick={() => { setExportFormat("excel"); exportData(); }} disabled={!rows.length || !selected.size}>
                📊 Excel
              </button>
              <button style={c.btn} onClick={() => { setExportFormat("csv"); exportData(); }} disabled={!rows.length || !selected.size}>
                📄 CSV
              </button>
              <button style={c.btnPrimary} onClick={sendToGoogleSheet} disabled={busy || !rows.length || !selected.size}>
                {busy ? "Saadan…" : "🔗 Google Sheets"}
              </button>
            </div>
          
            {exportMsg && <div style={c.note}>{exportMsg}</div>}
          </div>
        )}
      
        {tab === "pset" && (
          <div style={c.section}>
            <h3 style={c.heading}>Property Set Libraries</h3>
            <div style={c.small}>⚠️ Experimental</div>
            <div style={c.row}>
              <label style={c.label}>Project ID:</label>
              <input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="Sisesta projectId"
                style={c.input}
              />
            </div>
            <div style={c.controls}>
              <button style={c.btn} onClick={fetchPsetLibraries} disabled={busy}>
                {busy ? "Hankin…" : "Hangi Libraries"}
              </button>
            </div>
            {psetLibraries.length > 0 && (
              <div style={c.list}>
                <h4>Leitud Libraries:</h4>
                {psetLibraries.map((lib: any) => (
                  <div key={lib.id}>{lib.name} (ID: {lib.id})</div>
                ))}
              </div>
            )}
            <div style={c.row}>
              <label style={c.label}>Library ID:</label>
              <input
                value={libraryId}
                onChange={(e) => setLibraryId(e.target.value)}
                placeholder="Sisesta libraryId"
                style={c.input}
              />
            </div>
            <div style={c.controls}>
              <button style={c.btn} onClick={fetchLibraryDetails} disabled={busy}>
                {busy ? "Hankin…" : "Hangi Detailid"}
              </button>
            </div>
            {psetMsg && <div style={c.note}>{psetMsg}</div>}
          </div>
        )}
      
        {tab === "settings" && (
          <div style={c.section}>
            <div style={c.row}>
              <label style={c.label}>Google Apps Script URL</label>
              <input
                value={settings.scriptUrl}
                onChange={(e) => updateSettings({ scriptUrl: e.target.value })}
                placeholder="https://…/exec"
                style={c.input}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Shared Secret</label>
              <input
                type="password"
                value={settings.secret}
                onChange={(e) => updateSettings({ secret: e.target.value })}
                style={c.input}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Trimble Client ID</label>
              <input
                value={settings.trimbleClientId}
                onChange={(e) => updateSettings({ trimbleClientId: e.target.value })}
                placeholder="Client ID"
                style={c.input}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Trimble Client Secret</label>
              <input
                type="password"
                value={settings.trimbleClientSecret}
                onChange={(e) => updateSettings({ trimbleClientSecret: e.target.value })}
                placeholder="Client Secret"
                style={c.input}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Auto colorize</label>
              <input
                type="checkbox"
                checked={settings.autoColorize}
                onChange={(e) => updateSettings({ autoColorize: e.target.checked })}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Värv</label>
              <select
                value={
                  Object.keys(DEFAULT_COLORS).find(k => {
                    const current = settings.colorizeColor ?? DEFAULT_COLORS.darkRed;
                    const col = DEFAULT_COLORS[k as keyof typeof DEFAULT_COLORS];
                    return col.r === current.r && col.g === current.g && col.b === current.b;
                  }) || "darkRed"
                }
                onChange={(e) => {
                  const colorKey = e.target.value as keyof typeof DEFAULT_COLORS;
                  updateSettings({ colorizeColor: DEFAULT_COLORS[colorKey] });
                }}
                style={c.input}
              >
                <option value="darkRed">Tumepunane</option>
                <option value="red">Punane</option>
                <option value="orange">Oranž</option>
                <option value="yellow">Kollane</option>
                <option value="green">Roheline</option>
                <option value="blue">Sinine</option>
                <option value="purple">Lilla</option>
              </select>
            </div>
            <div style={c.row}>
              <label style={c.label}>Default preset</label>
              <select
                value={settings.defaultPreset}
                onChange={(e) => updateSettings({ defaultPreset: e.target.value as DefaultPreset })}
                style={c.input}
              >
                <option value="recommended">Recommended</option>
                <option value="tekla">Tekla</option>
                <option value="ifc">IFC</option>
              </select>
            </div>
            <div style={{ ...c.row, justifyContent: "flex-end" }}>
              <button style={c.btn} onClick={() => setSettingsMsg("✅ Salvestatud.")}>Salvesta</button>
              <button
                style={c.btnGhost}
                onClick={() => {
                  localStorage.removeItem("assemblyExporterSettings");
                  window.location.reload();
                }}
              >
                Reset
              </button>
            </div>
            {settingsMsg && <div style={c.note}>{settingsMsg}</div>}
          </div>
        )}
      
        {tab === "about" && (
          <div style={c.section}>
            <div style={c.small}>
              <b>Assembly Exporter v4.11</b> – Trimble Connect<br />
              • Auto-discover on selection change<br />
              • Searchable dropdown<br />
              • Search results table with zoom<br />
              • Drag & drop reordering<br />
              • Multiple export formats<br />
              <br />
              Loodud: <b>Silver Vatsel</b> | Consiva OÜ
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
const styles: Record<string, CSSProperties> = {
  shell: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    color: "#111",
    fontFamily: "Inter, system-ui, Arial, sans-serif",
    fontSize: 13,
    lineHeight: 1.25,
  },
  topbar: {
    display: "flex",
    gap: 2,
    background: "#0a3a67",
    padding: "8px 10px",
    position: "sticky",
    top: 0,
    zIndex: 100,
    flexWrap: "wrap" as any,
  },
  tab: {
    all: "unset" as any,
    color: "rgba(255,255,255,.85)",
    padding: "6px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },
  tabActive: {
    background: "rgba(255,255,255,.14)",
    color: "#fff",
    fontWeight: 600,
  },
  page: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: 10,
    gap: 10,
    minHeight: 0,
    overflow: "auto"
  },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  heading: { margin: "0 0 8px 0", fontSize: 16, fontWeight: 600 },
  row: { display: "flex", alignItems: "center", gap: 8 },
  label: { width: 160, opacity: 0.8 },
  input: {
    flex: 1,
    padding: "6px 8px",
    border: "1px solid #cfd6df",
    borderRadius: 8,
    outline: "none"
  },
  inputFilter: {
    width: "100%",
    maxHeight: "150px",
    padding: "6px 8px",
    border: "1px solid #cfd6df",
    borderRadius: 8,
    outline: "none",
    resize: "vertical" as any,
  },
  textarea: {
    width: "100%",
    padding: "8px",
    border: "1px solid #cfd6df",
    borderRadius: 8,
    outline: "none",
    fontFamily: "monospace",
    fontSize: 12
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    position: "relative",
    zIndex: 10,
  },
  presetsRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    position: "relative",
    zIndex: 50,
    marginTop: 4,
  },
  btn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #cfd6df",
    background: "#f6f8fb",
    cursor: "pointer",
    position: "relative",
    zIndex: 10,
  },
  btnGhost: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #d7dde6",
    background: "#fff",
    cursor: "pointer",
    position: "relative",
    zIndex: 10,
  },
  btnPrimary: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #0a3a67",
    background: "#0a3a67",
    color: "#fff",
    cursor: "pointer",
    position: "relative",
    zIndex: 10,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    border: "1px solid #edf0f4",
    borderRadius: 8,
    padding: 8,
    background: "#fafbfc"
  },
  group: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "1px dashed #e5e9f0"
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6
  },
  mini: {
    padding: "2px 6px",
    borderRadius: 6,
    border: "1px solid #d7dde6",
    background: "#fff",
    fontSize: 12,
    cursor: "pointer"
  },
  miniBtn: {
    padding: "2px 8px",
    borderRadius: 4,
    border: "1px solid #d7dde6",
    background: "#fff",
    fontSize: 11,
    cursor: "pointer"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 6
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 6
  },
  ellipsis: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  small: { fontSize: 12, opacity: 0.8 },
  note: {
    fontSize: 12,
    opacity: 0.9,
    padding: "6px 8px",
    background: "#f0f4f8",
    borderRadius: 6,
    position: "relative",
    zIndex: 1,
  },
  helpBox: {
    fontSize: 12,
    padding: "8px 10px",
    background: "#e7f3ff",
    border: "1px solid #90caf9",
    borderRadius: 6,
    color: "#0d47a1",
  },
  columnListNoscroll: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    border: "1px solid #edf0f4",
    borderRadius: 8,
    padding: 8,
    background: "#fafbfc",
  },
  columnItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 8px",
    background: "#fff",
    border: "1px solid #e5e9f0",
    borderRadius: 6,
    fontSize: 12,
    transition: "all 0.3s ease-out",
    cursor: "move",
  },
  columnItemHighlight: {
    background: "#fff3cd",
    border: "2px solid #ffc107",
    boxShadow: "0 0 12px rgba(255, 193, 7, 0.4)",
    transform: "scale(1.02)",
  },
  columnItemDragging: {
    opacity: 0.4,
    cursor: "grabbing",
  },
  dragHandle: {
    fontSize: 16,
    color: "#999",
    userSelect: "none" as any,
    lineHeight: 1,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    background: "#fff",
    border: "1px solid #cfd6df",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    maxHeight: 300,
    overflowY: "auto",
    zIndex: 1000,
  },
  dropdownItem: {
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 13,
    transition: "background 0.15s",
  },
  dropdownItemSelected: {
    background: "#e7f3ff",
    color: "#0a3a67",
    fontWeight: 600,
  },
  resultsBox: {
    marginTop: 12,
    border: "1px solid #e5e9f0",
    borderRadius: 8,
    padding: 12,
    background: "#fafbfc",
  },
  resultsHeading: {
    margin: "0 0 8px 0",
    fontSize: 14,
    fontWeight: 600,
    color: "#0a3a67",
  },
  resultsTable: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  resultRow: {
    display: "grid",
    gridTemplateColumns: "30px 1fr 50px auto",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    borderRadius: 6,
    fontSize: 12,
  },
  resultRowFound: {
    background: "#e8f5e9",
    border: "1px solid #a5d6a7",
  },
  resultRowNotFound: {
    background: "#ffebee",
    border: "1px solid #ef9a9a",
  },
  resultStatus: {
    fontSize: 16,
    textAlign: "center" as any,
  },
  resultValue: {
    fontFamily: "monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultCount: {
    fontSize: 11,
    opacity: 0.7,
    textAlign: "right" as any,
  },
  resultActions: {
    display: "flex",
    gap: 4,
  },
};
