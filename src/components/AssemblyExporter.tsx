import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

/* =========================================================
   TYPES / CONSTANTS
   ========================================================= */
type Tab = "search" | "discover" | "export" | "settings" | "about";
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
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("assemblyExporterSettings");
    if (saved) {
      try {
        return JSON.parse(saved) as AppSettings;
      } catch {}
    }
    return {
      scriptUrl: localStorage.getItem("sheet_webapp") || "",
      secret: localStorage.getItem("sheet_secret") || "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU",
      autoColorize: true,
      defaultPreset: "recommended",
      colorizeColor: DEFAULT_COLORS.darkRed,
    };
  });

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
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

function isNumericString(s: string) {
  return /^[-+]?(\d+|\d*\.\d+)(e[-+]?\d+)?$/i.test(s.trim());
}

function normaliseNumberString(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  const r = Math.round(n);
  if (Math.abs(n - r) < 1e-9) return String(r);
  return String(parseFloat(n.toFixed(4)));
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
    const groupName = set?.set || "Group";
    for (const p of set?.properties ?? []) {
      push(groupName, p?.name ?? "Prop", p?.value);
      if (!out.Name && /^(name|object[_\s]?name)$/i.test(String(p?.name)))
        out.Name = String(p?.value ?? "");
      if (out.Type === "Unknown" && /\btype\b/i.test(String(p?.name)))
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
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  
  const [searchInput, setSearchInput] = useState("");
  const [searchField, setSearchField] = useState<string>("AssemblyMark");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("clipboard");
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
                if (/assemblycast_unit_mark|^mark$|block/i.test(String(p?.name))) {
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
        // Tee päris .xlsx fail xlsx paketiga
        const aoa: any[][] = [];
        aoa.push(exportCols); // header

        for (const r of rows) {
          aoa.push(
            exportCols.map((k) => {
              const v = r[k] ?? "";
              if (FORCE_TEXT_KEYS.has(k)) return `'${String(v)}`; // sunni tekstiks
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

    const { r, g, b } = settings.colorizeColor;
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

  const c = styles;

  return (
    <div style={c.shell}>
      <div style={c.topbar}>
        <button style={{ ...c.tab, ...(tab === "search" ? c.tabActive : {}) }} onClick={() => setTab("search")}>SEARCH</button>
        <button style={{ ...c.tab, ...(tab === "discover" ? c.tabActive : {}) }} onClick={() => setTab("discover")}>DISCOVER</button>
        <button style={{ ...c.tab, ...(tab === "export" ? c.tabActive : {}) }} onClick={() => setTab("export")}>EXPORT</button>
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
              placeholder="Kleebi siia otsitavad väärtused (üks rea kohta või komadega eraldatud)&#10;Näiteks:&#10;2COL25&#10;2COL26&#10;2COL27"
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
              {columnOrder.filter(k => selected.has(k) && allKeys.includes(k)).map((col, idx, arr) => (
                <div key={col} style={c.columnItem}>
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
                    const col = DEFAULT_COLORS[k as keyof typeof DEFAULT_COLORS];
                    return col.r === settings.colorizeColor.r && 
                           col.g === settings.colorizeColor.g && 
                           col.b === settings.colorizeColor.b;
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
  list: { flex: 1, minHeight: 0, maxHeight: 400, overflow: "auto", border: "1px solid #edf0f4", borderRadius: 8, padding: 8, background: "#fafbfc" },
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
