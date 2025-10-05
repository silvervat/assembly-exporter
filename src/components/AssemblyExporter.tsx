import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

/* =========================================================
   TYPES / CONSTANTS
   ========================================================= */
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
  "BLOCK",
] as const;
type LockedKey = (typeof LOCKED_ORDER)[number];

const FORCE_TEXT_KEYS = new Set<string>([
  "Tekla_Assembly.AssemblyCast_unit_top_elevation",
  "Tekla_Assembly.AssemblyCast_unit_bottom_elevation",
]);

const DEBOUNCE_MS = 300;

/* =========================================================
   SETTINGS
   ========================================================= */
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
    secret: localStorage.getItem("sheet_secret") || "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU",
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

/* =========================================================
   UTILS
   ========================================================= */
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

/* =========================================================
   PROPERTY FLATTENING (WITH DUPLICATE HANDLING)
   ========================================================= */
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
    BLOCK: "",
  };

  const propMap = new Map<string, string>();
  const keyCounts = new Map<string, number>();

  const push = (group: string, name: string, val: unknown) => {
    const baseKey = `${sanitizeKey(group)}.${sanitizeKey(name)}`;
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

  const sets: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
  for (const set of sets) {
    const groupName = set?.set ?? set?.setName ?? set?.name ?? set?.displayName ?? "Group";
    for (const p of set?.properties ?? []) {
      const propName = p?.name ?? p?.displayName ?? "Prop";
      push(groupName, propName, p?.value);
      if (!out.Name && /^(name|object[_\s]?name)$/i.test(String(propName)))
        out.Name = String(p?.value ?? "");
      if (out.Type === "Unknown" && /\btype\b/i.test(String(propName)))
        out.Type = String(p?.value ?? "Unknown");
    }
  }

  for (const k of [
    "DATA.BLOCK",
    "BLOCK.BLOCK",
    "BLOCK.BLOCK_2",
    "Tekla_Assembly.AssemblyCast_unit_Mark",
  ]) {
    if (propMap.has(k)) { out.BLOCK = propMap.get(k)!; break; }
  }

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

/* =========================================================
   API HELPERS
   ========================================================= */
async function getProjectName(api: any): Promise<string> {
  try {
    const proj = await api?.project?.getProject?.();
    return String(proj?.name || "");
  } catch { return ""; }
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
    for (const m of list || []) if (m?.id && m?.name) map.set(String(m.id), String(m.name));
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

/* =========================================================
   PSET API HELPERS
   ========================================================= */
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

/* =========================================================
   COMPONENT
   ========================================================= */
type Props = { api: any };

export default function AssemblyExporter({ api }: Props) {
  const [settings, updateSettings] = useSettings();

  const [tab, setTab] = useState<Tab>("search");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    new Set<string>(JSON.parse(localStorage.getItem("fieldSel") || "[]"))
  );

  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null); // DnD

  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
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

  const allKeys: string[] = useMemo(
    () => Array.from(new Set(rows.flatMap(r => Object.keys(r)))).sort(),
    [rows]
  );

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
    if (!columnOrder.length && allKeys.length) {
      setColumnOrder([...LOCKED_ORDER, ...allKeys.filter(k => !LOCKED_ORDER.includes(k as any))]);
    }
  }, [allKeys, columnOrder.length]);

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
      k.startsWith("Tekla_Assembly.") || k === "BLOCK" || k === "ReferenceObject.File_Name"
    )));
  }
  function presetIFC() {
    const wanted = new Set<string>([
      "GUID_IFC", "GUID_MS",
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

      const selectedWithProps = await getSelectedObjects(api);
      if (!selectedWithProps.length) {
        setDiscoverMsg("⚠️ Palun vali 3D vaates objektid.");
        setRows([]);
        return;
      }

      const projectName = await getProjectName(api);
      const modelIds = selectedWithProps.map(m => m.modelId);
      const nameMap = await buildModelNameMap(api, modelIds);

      const out: Row[] = [];
      const lastSel: Array<{ modelId: string; ids: number[] }> = [];

      setProgress({ current: 0, total: selectedWithProps.length });
      for (let i = 0; i < selectedWithProps.length; i++) {
        const { modelId, objects } = selectedWithProps[i];
        setDiscoverMsg(`Töötlen mudelit ${i + 1}/${selectedWithProps.length}…`);
        const flattened = await Promise.all(
          objects.map(o => flattenProps(o, modelId, projectName, nameMap, api))
        );
        out.push(...flattened);
        lastSel.push({
          modelId,
          ids: objects.map((o: any) => Number(o?.id)).filter(n => Number.isFinite(n)),
        });
        setProgress({ current: i + 1, total: selectedWithProps.length });
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

  async function searchAndSelect() {
    try {
      setBusy(true);
      setSearchMsg("Otsin…");
      const searchValues = new Set(
        searchInput.split(/[\n,;\t]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
      );
      if (!searchValues.size) {
        setSearchMsg("⚠️ Sisesta vähemalt üks väärtus.");
        return;
      }

      const viewer = api?.viewer;
      const mos = await viewer?.getObjects?.();
      if (!Array.isArray(mos)) {
        setSearchMsg("❌ Ei suuda lugeda objekte.");
        return;
      }

      const found: Array<{ modelId: string; ids: number[] }> = [];
      const foundValues = new Set<string>();

      for (const mo of mos) {
        const modelId = String(mo.modelId);
        const matchIds: number[] = [];

        for (const obj of mo.objects || []) {
          let matchValue = "";

          if (searchField === "AssemblyMark") {
            const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
            for (const set of props) {
              for (const p of set?.properties ?? []) {
                if (/assembly[\/\s]?cast[_\s]?unit[_\s]?mark|^mark$|block/i.test(String(p?.name))) {
                  matchValue = String(p?.value || "").trim().toLowerCase();
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
                  const val = String(p?.value || "").trim();
                  const cls = classifyGuid(val);
                  if ((searchField === "GUID_IFC" && cls === "IFC") ||
                      (searchField === "GUID_MS" && cls === "MS")) {
                    matchValue = val.toLowerCase();
                    break;
                  }
                }
              }
              if (matchValue) break;
            }
            if (!matchValue && searchField === "GUID_IFC") {
              try {
                const extIds = await api.viewer.convertToObjectIds(modelId, [obj.id]);
                matchValue = (extIds[0] || "").toLowerCase();
              } catch {}
            }
          } else if (searchField === "Name") {
            const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
            for (const set of props) {
              for (const p of set?.properties ?? []) {
                if (/^name$/i.test(String(p?.name))) {
                  matchValue = String(p?.value || "").trim().toLowerCase();
                  break;
                }
              }
              if (matchValue) break;
            }
          }

          if (matchValue && searchValues.has(matchValue)) {
            matchIds.push(Number(obj?.id));
            foundValues.add(matchValue);
          }
        }

        if (matchIds.length) found.push({ modelId, ids: matchIds });
      }

      if (found.length) {
        const selector = {
          modelObjectIds: found.map(f => ({
            modelId: f.modelId,
            objectRuntimeIds: f.ids
          }))
        };
        await viewer?.setSelection?.(selector);

        const notFound = Array.from(searchValues).filter(v => !foundValues.has(v));
        if (notFound.length) {
          setSearchMsg(`✅ Leidsin ${foundValues.size}/${searchValues.size} väärtust. Ei leidnud: ${notFound.join(", ")}`);
        } else {
          setSearchMsg(`✅ Leidsin kõik ${searchValues.size} väärtust ja valisin need.`);
        }
      } else {
        setSearchMsg(`❌ Ei leidnud ühtegi väärtust: ${Array.from(searchValues).join(", ")}`);
      }
    } catch (e: any) {
      console.error(e);
      setSearchMsg(`❌ Viga: ${e?.message || "tundmatu viga"}`);
    } finally {
      setBusy(false);
    }
  }

  function moveColumn(from: number, to: number) {
    const newOrder = [...columnOrder];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, moved);
    setColumnOrder(newOrder);
  }

  // Drag-and-drop handlers
  function onDragStartCol(idx: number) {
    setDragIndex(idx);
  }
  function onDragOverCol(e: React.DragEvent) {
    e.preventDefault();
  }
  function onDropCol(idx: number) {
    if (dragIndex === null || dragIndex === idx) return;
    moveColumn(dragIndex, idx);
    setDragIndex(null);
  }

  async function exportData() {
    if (!rows.length) {
      setExportMsg("⚠️ Pole andmeid eksportimiseks. Mine 'Discover' lehele.");
      return;
    }
    const exportCols = columnOrder.filter(k => selected.has(k) && allKeys.includes(k));
    if (!exportCols.length) {
      setExportMsg("⚠️ Vali vähemalt üks veerg.");
      return;
    }
    const header = exportCols.join("\t");
    const body = rows
      .map(r => exportCols.map(k => (r[k] ?? "")).join("\t"))
      .join("\n");
    const content = header + "\n" + body;

    try {
      if (exportFormat === "clipboard") {
        await navigator.clipboard.writeText(content);
        setExportMsg(`✅ Kopeeritud ${rows.length} rida (${exportCols.length} veergu) lõikelauale.`);
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
        URL.revokeObjectURL(url);
        setExportMsg(`✅ Salvestatud ${rows.length} rida CSV-na.`);
      } else if (exportFormat === "excel") {
        const aoa: any[][] = [];
        aoa.push(exportCols);
        for (const r of rows) {
          aoa.push(
            exportCols.map((k) => {
              const v = r[k] ?? "";
              if (FORCE_TEXT_KEYS.has(k) || /^(GUID|GUID_IFC|GUID_MS)$/i.test(k)) return `'${String(v)}`;
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
      setExportMsg('Klõpsa kõigepealt "Discover fields".');
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
        modelId: m.modelId,
        ids: (m.objects || []).map((o: any) => o?.id).filter(Boolean)
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
              <select value={searchField} onChange={(e) => setSearchField(e.target.value)} style={c.input}>
                <option value="AssemblyMark">Assembly Mark (BLOCK)</option>
                <option value="GUID_IFC">IFC GUID</option>
                <option value="GUID_MS">MS/Tekla GUID</option>
                <option value="Name">Nimi</option>
              </select>
            </div>
            <textarea
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={"Kleebi siia otsitavad väärtused (üks rea kohta või komadega eraldatud)\nNäiteks:\n2COL25\n2COL26\n2COL27"}
              style={{ ...c.textarea, height: 200 }}
            />
            <div style={c.controls}>
              <button style={c.btn} onClick={searchAndSelect} disabled={busy || !searchInput.trim()}>
                {busy ? "Otsin…" : "Otsi ja vali"}
              </button>
              <button style={c.btnGhost} onClick={() => setSearchInput("")}>Tühjenda</button>
            </div>
            {searchMsg && <div style={c.note}>{searchMsg}</div>}
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
              style={c.input}
            />
            <div style={c.controls}>
              <button style={c.btnGhost} onClick={() => selectAll(true)} disabled={!rows.length}>Vali kõik</button>
              <button style={c.btnGhost} onClick={() => selectAll(false)} disabled={!rows.length}>Tühjenda</button>
              <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>Valitud: {selected.size}</span>
            </div>

            <div style={c.list}>
              {!rows.length ? (
                <div style={c.small}>Klõpsa "Discover fields".</div>
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

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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

            <div style={c.row}>
              <label style={c.label}>Formaat:</label>
              <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as ExportFormat)} style={c.input}>
                <option value="clipboard">Clipboard (TSV)</option>
                <option value="excel">Excel (.xlsx)</option>
                <option value="csv">CSV (download)</option>
              </select>
            </div>

            <div style={c.small}>Veergude järjestus (lohista ümber):</div>
            <div style={c.columnList}>
              {columnOrder
                .filter(k => selected.has(k) && allKeys.includes(k))
                .map((col, idx, arr) => (
                  <div
                    key={col}
                    style={{
                      ...c.columnItem,
                      opacity: dragIndex === idx ? 0.6 : 1,
                      cursor: "grab"
                    }}
                    draggable
                    onDragStart={() => onDragStartCol(idx)}
                    onDragOver={onDragOverCol}
                    onDrop={() => onDropCol(idx)}
                    title="Lohista ümber"
                  >
                    <span style={c.ellipsis}>{col}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {idx > 0 && (
                        <button style={c.miniBtn} onClick={() => moveColumn(idx, idx - 1)}>↑</button>
                      )}
                      {idx < arr.length - 1 && (
                        <button style={c.miniBtn} onClick={() => moveColumn(idx, idx + 1)}>↓</button>
                      )}
                    </div>
                  </div>
              ))}
            </div>

            <div style={c.controls}>
              <button style={c.btnPrimary} onClick={exportData} disabled={!rows.length || !selected.size}>
                {exportFormat === "clipboard" ? "Kopeeri lõikelauale" : exportFormat === "excel" ? "Lae alla .xlsx" : "Lae alla CSV"}
              </button>
              <button style={c.btn} onClick={sendToGoogleSheet} disabled={busy || !rows.length}>
                {busy ? "Saadan…" : "Saada Google Sheeti"}
              </button>
            </div>
            {exportMsg && <div style={c.note}>{exportMsg}</div>}
          </div>
        )}

        {tab === "pset" && (
          <div style={c.section}>
            <h3 style={c.heading}>Property Set Libraries</h3>
            <div style={c.small}>⚠️ Experimental: Client Secret lekib localStorages – soovitus: backend proxy!</div>

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
                placeholder="Sisesta libraryId detailide jaoks"
                style={c.input}
              />
            </div>
            <div style={c.controls}>
              <button style={c.btn} onClick={fetchLibraryDetails} disabled={busy}>
                {busy ? "Hankin…" : "Hangi Library Detailid"}
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
                placeholder="Sisesta Client ID"
                style={c.input}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Trimble Client Secret</label>
              <input
                type="password"
                value={settings.trimbleClientSecret}
                onChange={(e) => updateSettings({ trimbleClientSecret: e.target.value })}
                placeholder="Sisesta Client Secret"
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
                Reset settings
              </button>
            </div>
            {settingsMsg && <div style={c.note}>{settingsMsg}</div>}
          </div>
        )}

        {tab === "about" && (
          <div style={c.section}>
            <div style={c.small}>
              <b>Assembly Exporter v4.1</b> – Trimble Connect → Google Sheet + Excel<br />
              • GUID otsing ja värvimine (IFC + MS/Tekla)<br />
              • Assembly mark otsing<br />
              • Kohandatav export (Clipboard/Excel/CSV)<br />
              • Värvi valik settings<br />
              • convertToObjectIds fallback GUID-idele<br />
              • Duplikaatsete property nimede tugi (_1, _2 jne)<br />
              • Property Set Libraries hankimine<br />
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
    zIndex: 2,
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
  page: { flex: 1, display: "flex", flexDirection: "column", padding: 10, gap: 10, minHeight: 0, overflow: "auto" },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  heading: { margin: "0 0 8px 0", fontSize: 16, fontWeight: 600 },
  row: { display: "flex", alignItems: "center", gap: 8 },
  label: { width: 160, opacity: 0.8 },
  input: { flex: 1, padding: "6px 8px", border: "1px solid #cfd6df", borderRadius: 8, outline: "none" },
  textarea: { width: "100%", padding: "8px", border: "1px solid #cfd6df", borderRadius: 8, outline: "none", fontFamily: "monospace", fontSize: 12 },
  controls: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  btn: { padding: "6px 10px", borderRadius: 8, border: "1px solid #cfd6df", background: "#f6f8fb", cursor: "pointer" },
  btnGhost: { padding: "6px 10px", borderRadius: 8, border: "1px solid #d7dde6", background: "#fff", cursor: "pointer" },
  btnPrimary: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #0a3a67",
    background: "#0a3a67",
    color: "#fff",
    cursor: "pointer",
  },

  // Kerimisriba eemaldus: maxHeight/overflow maha – kogu leht kerib
  list: {
    flex: 1,
    minHeight: 0,
    border: "1px solid #edf0f4",
    borderRadius: 8,
    padding: 8,
    background: "#fafbfc"
  },

  group: { marginBottom: 8, paddingBottom: 6, borderBottom: "1px dashed #e5e9f0" },
  groupHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  mini: { padding: "2px 6px", borderRadius: 6, border: "1px solid #d7dde6", background: "#fff", fontSize: 12, cursor: "pointer" },
  miniBtn: { padding: "2px 8px", borderRadius: 4, border: "1px solid #d7dde6", background: "#fff", fontSize: 11, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 },
  checkRow: { display: "flex", alignItems: "center", gap: 6 },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  small: { fontSize: 12, opacity: 0.8 },
  note: { fontSize: 12, opacity: 0.9, padding: "6px 8px", background: "#f0f4f8", borderRadius: 6 },

  columnList: {
    maxHeight: 300,
    overflow: "auto",
    border: "1px solid #edf0f4",
    borderRadius: 8,
    padding: 8,
    background: "#fafbfc",
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  columnItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 8px",
    background: "#fff",
    border: "1px solid #e5e9f0",
    borderRadius: 6,
    fontSize: 12
  }
};




Vaata see  vaata see kood suutsi tegelikult osaliselt korrektselt andmeid lugeda Asmmebly mark jne aga GUID ei faile name ei toiminud seal ehk saad siit mõttteid ja t eed mulle super koodi import { useEffect, useMemo, useState } from "react";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";

/* ----------------- constants ----------------- */

const LOCKED_ORDER = [
  "GUID",
  "GUID_IFC",
  "GUID_MS",
  "Project",
  "ModelId",
  "FileName",
  "Name",
  "Type",
  "BLOCK",
] as const;

type LockedKey = typeof LOCKED_ORDER[number];
type Row = Record<string, string>;
type Props = { api: WorkspaceAPI };
type Tab = "export" | "settings" | "about";
type Grouped = Record<string, string[]>;

/** columns we must force as TEXT in Google Sheet, to keep + / − */
const FORCE_TEXT_KEYS = new Set<string>([
  "Tekla_Assembly.AssemblyCast_unit_top_elevation",
  "Tekla_Assembly.AssemblyCast_unit_bottom_elevation",
]);

/* ----------------- utils ----------------- */

function sanitizeKey(s: string) {
  return String(s).replace(/\s+/g, "_").replace(/[^\w.-]/g, "").trim();
}
function groupSortKey(group: string) {
  const g = group.toLowerCase();
  if (g === "data") return 0;
  if (g === "reference_object") return 1;
  if (g.startsWith("tekla_assembly")) return 2;
  return 10;
}
function groupKeys(keys: string[]): Grouped {
  const g: Grouped = {};
  for (const k of keys) {
    const dot = k.indexOf(".");
    const grp = dot > 0 ? k.slice(0, dot) : "Other";
    (g[grp] ||= []).push(k);
  }
  for (const [grp, arr] of Object.entries(g)) {
    arr.sort((a, b) => a.localeCompare(b));
    g[grp] = arr;
  }
  return g;
}

/* ---- PropertySet helpers ---- */

type TCProperty = { name: string; value: unknown };
type TCPropertySet = { name: string; properties: TCProperty[] };

function collectAllPropertySets(obj: any): TCPropertySet[] {
  const official: TCPropertySet[] = [
    ...(Array.isArray(obj?.propertySets) ? obj.propertySets : []),
    ...(Array.isArray(obj?.propertySetLibraries) ? obj.propertySetLibraries : []),
  ];
  const fallbacks: TCPropertySet[] = [
    ...(Array.isArray(obj?.properties) ? obj.properties : []),
    ...(Array.isArray(obj?.psets) ? obj.psets : []),
    ...(Array.isArray(obj?.libraries) ? obj.libraries : []),
    ...(Array.isArray(obj?.customProperties) ? obj.customProperties : []),
  ];
  return [...official, ...fallbacks].filter(
    (s): s is TCPropertySet => !!s && Array.isArray((s as any).properties)
  );
}

/* ---- number normaliser ---- */

function isNumericString(s: string) {
  // only pure numbers; '77/J-K' etc are not numeric
  return /^[-+]?(\d+|\d*\.\d+)(e[-+]?\d+)?$/i.test(s.trim());
}
function normaliseNumberString(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  const roundedInt = Math.round(n);
  if (Math.abs(n - roundedInt) < 1e-9) return String(roundedInt);
  return String(parseFloat(n.toFixed(4)));
}

/* ---- deep scan for GUID/meta ---- */

function deepScanForGuidAndMeta(
  node: any,
  path: string[] = [],
  acc: { ifc?: string; ms?: string; any?: string; file?: string; commonType?: string } = {}
) {
  if (!node || typeof node !== "object") return acc;
  for (const [rawK, v] of Object.entries(node)) {
    const k = String(rawK);

    if (/guid/i.test(k)) {
      const val = v == null ? "" : String(v);
      if (/\bifc\b/i.test(k) && !acc.ifc) acc.ifc = val;
      else if (/\bms\b/i.test(k) && !acc.ms) acc.ms = val;
      else if (!acc.any) acc.any = val;
    }
    if (!acc.file && /(file\s*name|filename)/i.test(k)) acc.file = v == null ? "" : String(v);
    if (!acc.commonType && /(common.*type)/i.test(k)) acc.commonType = v == null ? "" : String(v);

    if (v && typeof v === "object") deepScanForGuidAndMeta(v, [...path, k], acc);
  }
  return acc;
}

/** classify GUID value */
function classifyGuid(val: string): "IFC" | "MS" | "UNKNOWN" {
  const s = val.trim();
  if (/^[0-9A-Za-z_$]{22}$/.test(s)) return "IFC"; // IFC compressed
  if (/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(s)) return "MS";
  if (/^[0-9A-Fa-f]{32}$/.test(s)) return "MS";
  return "UNKNOWN";
}

/* ---- flatten properties to a row ---- */

function flattenProps(obj: any, modelId: string, projectName: string): Row {
  const out: Row = {
    GUID: "",
    GUID_IFC: "",
    GUID_MS: "",
    Project: String(projectName),
    ModelId: String(modelId),
    FileName: "",
    Name: "",
    Type: "Unknown",
    BLOCK: "",
  };

  const propMap = new Map<string, string>();
  const rawNames: Array<{ group: string; name: string; value: unknown }> = [];

  const push = (group: string, name: string, val: unknown) => {
    const key = `${sanitizeKey(group)}.${sanitizeKey(name)}`;
    let v: unknown = val;
    if (Array.isArray(v)) v = (v as unknown[]).map((x) => (x == null ? "" : String(x))).join(" | ");
    else if (typeof v === "object" && v !== null) v = JSON.stringify(v);
    const s = v == null ? "" : String(v);
    propMap.set(key, s);
    (out as any)[key] = s;
  };

  const sets = collectAllPropertySets(obj);
  for (const set of sets) {
    const g = set?.name || "Group";
    for (const p of set?.properties ?? []) {
      const nm = (p as any)?.name ?? "Prop";
      const vv = (p as any)?.value;
      rawNames.push({ group: g, name: nm, value: vv });
      push(g, nm, vv);

      if (!out.Name && /^(name|object[_\s]?name)$/i.test(String(nm))) out.Name = String(vv ?? "");
      if (out.Type === "Unknown" && /\btype\b/i.test(String(nm))) out.Type = String(vv ?? "Unknown");
    }
  }

  // FileName quick candidates
  const fileKeyCandidates = [
    "Reference_Object.File_Name",
    "Reference_Object.FileName",
    "IFC.File_Name",
  ];
  for (const k of fileKeyCandidates) {
    if (propMap.has(k)) { out.FileName = propMap.get(k)!; break; }
  }
  if (!out.FileName) {
    for (const r of rawNames) {
      if (/^file\s*name$/i.test(String(r.name || "")) && /reference/i.test(String(r.group || ""))) {
        out.FileName = r.value == null ? "" : String(r.value);
        break;
      }
    }
  }

  // BLOCK
  const blockCandidates = [
    "DATA.BLOCK",
    "BLOCK.BLOCK",
    "BLOCK.BLOCK_2",
    "Tekla_Assembly.AssemblyCast_unit_Mark",
  ];
  for (const k of blockCandidates) { if (propMap.has(k)) { out.BLOCK = propMap.get(k)!; break; } }

  // Try structured GUID keys first
  let guidIfc = "";
  let guidMs  = "";
  for (const [k, v] of propMap) {
    if (!/guid/i.test(k)) continue;
    const cls = classifyGuid(v);
    if (cls === "IFC" && !guidIfc) guidIfc = v;
    if (cls === "MS"  && !guidMs)  guidMs  = v;
  }
  // If still missing, scan by raw property names
  if (!guidIfc || !guidMs) {
    for (const r of rawNames) {
      if (!/guid/i.test(String(r.name || ""))) continue;
      const val = r.value == null ? "" : String(r.value);
      const cls = classifyGuid(val);
      if (cls === "IFC" && !guidIfc) guidIfc = val;
      if (cls === "MS"  && !guidMs)  guidMs  = val;
    }
  }
  out.GUID_IFC = guidIfc;
  out.GUID_MS  = guidMs;
  out.GUID     = guidIfc || guidMs || "";

  // Final fallback: deep scan whole object
  if (!out.GUID || !out.GUID_IFC || !out.GUID_MS || !out.FileName) {
    const found = deepScanForGuidAndMeta(obj);
    if (!out.GUID_IFC && found.ifc) out.GUID_IFC = found.ifc;
    if (!out.GUID_MS  && found.ms)  out.GUID_MS  = found.ms;
    if (!out.GUID) out.GUID = found.ifc || found.ms || found.any || out.GUID;
    if (!out.FileName && found.file) out.FileName = found.file;
  }

  return out;
}

/** Project name via ProjectAPI.getProject() */
async function getProjectName(api: any): Promise<string> {
  if (typeof api?.project?.getProject === "function") {
    const proj = await api.project.getProject();
    if (proj?.name) return String(proj.name);
  }
  return "";
}

/* ----------------- component ----------------- */

export default function AssemblyExporter({ api }: Props) {
  const [tab, setTab] = useState<Tab>("export");

  // settings
  const [scriptUrl, setScriptUrl] = useState<string>(localStorage.getItem("sheet_webapp") || "");
  const [secret, setSecret] = useState<string>(localStorage.getItem("sheet_secret") || "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU");

  // export data
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set<string>(JSON.parse(localStorage.getItem("fieldSel") || "[]")));
  const [filter, setFilter] = useState<string>("");

  // messages
  const [exportMsg, setExportMsg] = useState<string>("");
  const [settingsMsg, setSettingsMsg] = useState<string>("");

  const [busy, setBusy] = useState<boolean>(false);
  const [lastSelection, setLastSelection] = useState<{ modelId: string; ids: number[] }[]>([]);

  const allKeys: string[] = useMemo(
    () => Array.from(new Set(rows.flatMap((r: Row) => Object.keys(r)))).sort(),
    [rows]
  );
  const groupedUnsorted: Grouped = useMemo(() => groupKeys(allKeys), [allKeys]);
  const groupedSortedEntries = useMemo(
    () =>
      (Object.entries(groupedUnsorted) as [string, string[]][])
        .sort((a, b) => groupSortKey(a[0]) - groupSortKey(b[0]) || a[0].localeCompare(b[0])),
    [groupedUnsorted]
  );

  useEffect(() => {
    localStorage.setItem("fieldSel", JSON.stringify(Array.from(selected)));
  }, [selected]);

  const matches = (k: string) => !filter || k.toLowerCase().includes(filter.toLowerCase());
  function toggle(k: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }
  function toggleGroup(keys: string[], on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      for (const k of keys) on ? n.add(k) : n.delete(k);
      return n;
    });
  }
  function selectAll(on: boolean) {
    setSelected(() => (on ? new Set(allKeys) : new Set()));
  }

  // presets (placed under list)
  function presetRecommended() {
    const wanted = new Set<string>([
      ...LOCKED_ORDER,
      "Reference_Object.Common_Type",
      "Reference_Object.File_Name",
    ]);
    setSelected(new Set(allKeys.filter((k) => wanted.has(k))));
  }
  function presetTeklaAssembly() {
    setSelected(new Set(allKeys.filter((k) => k.startsWith("Tekla_Assembly.") || k === "BLOCK" || k === "Reference_Object.File_Name")));
  }
  function presetIFCReference() {
    const wanted = new Set<string>([
      "GUID_IFC",
      "GUID_MS",
      "Reference_Object.Common_Type",
      "Reference_Object.File_Name",
    ]);
    setSelected(new Set(allKeys.filter((k) => wanted.has(k))));
  }

  async function discover() {
    try {
      setBusy(true);
      setExportMsg("Reading current selection…");
      const selection: any[] = await (api as any).viewer.getSelection();
      if (!selection?.length) { setExportMsg("Select objects in the models first."); setRows([]); return; }

      const projectName = await getProjectName(api);
      const collectedRows: Row[] = [];
      const selForColor: { modelId: string; ids: number[] }[] = [];

      for (const m of selection) {
        const modelId: string = String(m.modelId);
        const ids: number[] = (m.objectRuntimeIds ?? []).slice();
        if (!ids.length) continue;

        const props: any[] = await (api as any).viewer.getObjectProperties(modelId, ids);
        const flat: Row[] = props.map((o: any) => flattenProps(o, modelId, projectName));
        collectedRows.push(...flat);
        selForColor.push({ modelId, ids });
      }

      setRows(collectedRows);
      setLastSelection(selForColor);
      setExportMsg(`Found ${collectedRows.length} objects. Total keys: ${Array.from(new Set(collectedRows.flatMap((r) => Object.keys(r)))).length}.`);
    } catch (e: any) {
      setExportMsg(`Error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  function orderRowByLockedAndAlpha(r: Row, chosen: Set<string>): Row {
    const o: Row = {};
    for (const k of LOCKED_ORDER) if (k in r) (o as any)[k] = r[k];
    const rest = Array.from(chosen).filter((k) => !(LOCKED_ORDER as readonly string[]).includes(k as LockedKey));
    rest.sort((a, b) => a.localeCompare(b));
    for (const k of rest) if (k in r) (o as any)[k] = r[k];
    return o;
  }

  async function send() {
    if (!scriptUrl || !secret) { setTab("settings"); setSettingsMsg("Please fill Script URL and Shared Secret."); return; }
    if (!rows.length)           { setTab("export");   setExportMsg("Click “Discover fields” first."); return; }

    // warnings
    const rowsWithWarn = rows.map((r) => {
      const warn: string[] = [];
      if (!r.GUID) warn.push("Missing GUID");
      const copy: Row = { ...r };
      if (warn.length) copy["__warnings"] = warn.join("; ");
      return copy;
    });

    // numeric normalisation & force-text for specific keys
    const numericSkip = new Set<string>(["GUID", "GUID_IFC", "GUID_MS", "Project", "Name", "Type", "FileName"]);
    const cleaned = rowsWithWarn.map((r) => {
      const c: Row = {};
      for (const [k, v] of Object.entries(r) as [string, string][]) {
        if (FORCE_TEXT_KEYS.has(k) && typeof v === "string" && !v.startsWith("'")) {
          c[k] = `'${v}`; // force text in Google Sheets (keeps + / -)
        } else if (typeof v === "string" && !numericSkip.has(k) && isNumericString(v)) {
          c[k] = normaliseNumberString(v);
        } else {
          c[k] = v;
        }
      }
      return c;
    });

    // build payload
    const chosen = new Set<string>([
      ...LOCKED_ORDER,
      ...Array.from(selected),
      "__warnings",
    ].filter((k) => allKeys.includes(k) || LOCKED_ORDER.includes(k as any) || k === "__warnings"));

    const payload = cleaned.map((r) => orderRowByLockedAndAlpha(r, chosen));
    const missing = cleaned.filter((r) => !r.GUID).length;
    if (missing) setExportMsg(`⚠️ ${missing} row(s) without GUID – added __warnings and will send anyway.`);

    try {
      setBusy(true);
      localStorage.setItem("sheet_webapp", scriptUrl);
      localStorage.setItem("sheet_secret", secret);

      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows: payload }),
      });
      const data = await res.json();
      setTab("export");
      if (data?.ok) {
        setExportMsg(`✅ Added ${payload.length} row(s) to Google Sheet. Coloring selection dark red…`);
        await colorLastSelectionDarkRed();
      } else {
        setExportMsg(`❌ Error: ${data?.error || "unknown"}`);
      }
    } catch (e: any) {
      setTab("export");
      setExportMsg(`❌ Error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  /* ---- robust colorizer ---- */
  async function colorLastSelectionDarkRed() {
    const viewer: any = (api as any).viewer;
    // build selection fallback from current viewer if discover wasn’t run
    let blocks = lastSelection;
    if (!blocks?.length && typeof viewer?.getSelection === "function") {
      const sel: any[] = await viewer.getSelection();
      blocks = (sel || [])
        .filter(Boolean)
        .map(m => ({ modelId: String(m.modelId), ids: (m.objectRuntimeIds || []).slice() }))
        .filter(b => b.ids.length);
    }
    if (!blocks?.length) return;

    for (const b of blocks) {
      await tryApplyStateAny(viewer, b.modelId, b.ids);
    }
  }

  async function tryApplyStateAny(viewer: any, modelId: string, ids: number[]) {
    const c255 = { r: 140, g: 0, b: 0 };
    const c01  = { r: 0.55, g: 0, b: 0 };
    const trials = [
      () => viewer?.setObjectState?.({ modelId, objectRuntimeIds: ids, state: { color: c255, opacity: 255 } }),
      () => viewer?.setObjectState?.({ modelId, objectRuntimeIds: ids, color: c255, opacity: 255 }),
      () => viewer?.setObjectState?.({ modelId, objectRuntimeIds: ids, state: { color: c01,  opacity: 1 } }),
      () => viewer?.setObjectState?.({ modelId, objectRuntimeIds: ids, color: c01,  opacity: 1 }),
      () => viewer?.applyObjectStates?.([{ modelId, objectRuntimeIds: ids, state: { color: c255, opacity: 255 } }]),
      () => viewer?.colorizeObjects?.(modelId, ids, c255),
    ];
    for (const t of trials) {
      try { const r = await t(); if (r !== undefined) return; } catch { /* try next */ }
    }
  }

  async function resetState() {
    try {
      const viewer: any = (api as any).viewer;
      if (typeof viewer?.resetObjectState === "function") {
        await viewer.resetObjectState();
      } else if (typeof viewer?.clearObjectStates === "function") {
        await viewer.clearObjectStates();
      } else if (typeof viewer?.clearColors === "function") {
        await viewer.clearColors();
      }
      setExportMsg("View state reset.");
    } catch (e: any) {
      setExportMsg(`Reset failed: ${e?.message || e}`);
    }
  }

  /* ----------------- UI ----------------- */

  const c = styles;

  return (
    <div style={c.shell}>
      {/* Tabs */}
      <div style={c.topbar}>
        <button style={{ ...c.tab, ...(tab === "export" ? c.tabActive : {}) }} onClick={() => setTab("export")}>EXPORT</button>
        <button style={{ ...c.tab, ...(tab === "settings" ? c.tabActive : {}) }} onClick={() => setTab("settings")}>SETTINGS</button>
        <button style={{ ...c.tab, ...(tab === "about" ? c.tabActive : {}) }} onClick={() => setTab("about")}>ABOUT</button>
      </div>

      <div style={c.page}>
        {tab === "settings" && (
          <div style={c.section}>
            <div style={c.row}>
              <label style={c.label}>Google Apps Script URL</label>
              <input value={scriptUrl} onChange={(e) => setScriptUrl(e.target.value)} placeholder="https://…/exec" style={c.input}/>
            </div>
            <div style={c.row}>
              <label style={c.label}>Shared Secret</label>
              <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} style={c.input}/>
            </div>
            <div style={{ ...c.row, justifyContent: "flex-end" }}>
              <button style={c.btn} onClick={() => { localStorage.setItem("sheet_webapp", scriptUrl); localStorage.setItem("sheet_secret", secret); setSettingsMsg("Settings saved."); }}>Save</button>
              <button style={c.btnGhost} onClick={() => { localStorage.removeItem("sheet_webapp"); localStorage.removeItem("sheet_secret"); setScriptUrl(""); setSecret(""); setSettingsMsg("Settings cleared."); }}>Clear</button>
            </div>
            {!!settingsMsg && <div style={c.note}>{settingsMsg}</div>}
          </div>
        )}

        {tab === "about" && (
          <div style={c.section}>
            <div style={c.small}>
              Assembly Exporter – Trimble Connect → Google Sheet.<br/>
              • Multi-model • ProjectAPI.getProject() • PSL priority<br/>
              • GUID + GUID_IFC + GUID_MS • Number normalisation<br/>
              • Dark-red colorize & Reset • Presets • Locked column order
            </div>
          </div>
        )}

        {tab === "export" && (
          <div style={c.section}>
            <div style={c.controls}>
              <button style={c.btn} onClick={discover} disabled={busy}>{busy ? "…" : "Discover fields"}</button>
              <input placeholder="Filter columns…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...c.input, flex: 1, minWidth: 120 }}/>
              <button style={c.btnGhost} onClick={() => selectAll(true)} disabled={!rows.length}>Select all</button>
              <button style={c.btnGhost} onClick={() => selectAll(false)} disabled={!rows.length}>Clear</button>
              <button style={c.btnGhost} onClick={resetState}>Reset state</button>
              <button style={c.btnPrimary} onClick={send} disabled={busy || !rows.length}>
                {busy ? "Sending…" : `Send to Google Sheet (${rows.length} rows)`}
              </button>
            </div>

            <div style={c.meta}>
              Locked order: {Array.from(LOCKED_ORDER).join(", ")}. Selected: {selected.size}.
            </div>

            <div style={c.list}>
              {!rows.length ? (
                <div style={c.small}>Click “Discover fields”.</div>
              ) : (
                groupedSortedEntries.map(([groupName, keys]) => {
                  const keysShown = keys.filter(matches);
                  if (!keysShown.length) return null;
                  const allOn = keys.every((k) => selected.has(k));
                  const noneOn = keys.every((k) => !selected.has(k));
                  return (
                    <div key={groupName} style={c.group}>
                      <div style={c.groupHeader}>
                        <b>{groupName}</b>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={c.mini} onClick={() => toggleGroup(keys, true)}>select</button>
                          <button style={c.mini} onClick={() => toggleGroup(keys, false)}>clear</button>
                        </div>
                        <span style={c.faint}>{allOn ? "all" : noneOn ? "none" : "partial"}</span>
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

            {/* presets below list */}
            <div style={{marginTop:8, display:"flex", gap:6, flexWrap:"wrap"}}>
              <span style={{alignSelf:"center", opacity:.7}}>Presets:</span>
              <button style={c.btnGhost} onClick={presetRecommended} disabled={!rows.length}>Recommended</button>
              <button style={c.btnGhost} onClick={presetTeklaAssembly} disabled={!rows.length}>Tekla Assembly</button>
              <button style={c.btnGhost} onClick={presetIFCReference} disabled={!rows.length}>IFC Reference</button>
            </div>

            {!!exportMsg && <div style={{ ...c.note, marginTop: 6 }}>{exportMsg}</div>}
          </div>
        )}
      </div>

      <div style={c.footer}>created by <b>Silver Vatsel</b> | Consiva OÜ</div>
    </div>
  );
}

/* ----------------- styles ----------------- */

const styles: Record<string, React.CSSProperties> = {
  shell: { height: "100vh", display: "flex", flexDirection: "column", background: "#fff", color: "#111",
    fontFamily: "Inter, system-ui, Arial, sans-serif", fontSize: 13, lineHeight: 1.25 },
  topbar: { display: "flex", gap: 2, background: "#0a3a67", padding: "8px 10px", position: "sticky", top: 0, zIndex: 2 },
  tab: { all: "unset" as any, color: "rgba(255,255,255,.85)", padding: "6px 10px", borderRadius: 6, cursor: "pointer" },
  tabActive: { background: "rgba(255,255,255,.14)", color: "#fff", fontWeight: 600 },
  page: { flex: 1, display: "flex", flexDirection: "column", padding: 10, gap: 10, minHeight: 0 },
  section: { display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0 },
  row: { display: "flex", alignItems: "center", gap: 8 },
  label: { width: 160, opacity: 0.8 },
  input: { flex: 1, padding: "6px 8px", border: "1px solid #cfd6df", borderRadius: 8, outline: "none" },
  controls: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  btn: { padding: "6px 10px", borderRadius: 8, border: "1px solid #cfd6df", background: "#f6f8fb", cursor: "pointer" },
  btnGhost: { padding: "6px 10px", borderRadius: 8, border: "1px solid #d7dde6", background: "#fff", cursor: "pointer" },
  btnPrimary: { padding: "6px 12px", borderRadius: 8, border: "1px solid #0a3a67", background: "#0a3a67", color: "#fff", cursor: "pointer", marginLeft: "auto" },
  meta: { fontSize: 12, opacity: 0.75 },
  list: { flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #edf0f4", borderRadius: 8, padding: 8, background: "#fafbfc" },
  group: { marginBottom: 8, paddingBottom: 6, borderBottom: "1px dashed #e5e9f0" },
  groupHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  mini: { padding: "2px 6px", borderRadius: 6, border: "1px solid #d7dde6", background: "#fff", fontSize: 12, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 },
  checkRow: { display: "flex", alignItems: "center", gap: 6 },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  small: { fontSize: 12, opacity: 0.8 },
  faint: { fontSize: 12, opacity: 0.55, marginLeft: "auto" },
  note: { fontSize: 12, opacity: 0.9 },
  footer: { padding: "6px 10px", borderTop: "1px solid #eef2f6", fontSize: 12, color: "#66758c" },
};
