import { useEffect, useMemo, useState, type CSSProperties } from "react";

/* =========================================================
   TYPES / CONSTANTS
   ========================================================= */

type Tab = "export" | "settings" | "about";
type Row = Record<string, string>;

type WorkspaceAPI = any;     // Tüübi saab soovi korral importida @trimble/workspace-api paketist
type ViewerAPI = any;

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
}

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
      secret:
        localStorage.getItem("sheet_secret") ||
        "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU",
      autoColorize: true,
      defaultPreset: "recommended",
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
  if (g === "referenceobject") return 1;
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
  if (/^[0-9A-Za-z_$]{22}$/.test(s)) return "IFC"; // IFC GlobalId (base64-ish 22)
  if (
    /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(
      s
    ) || /^[0-9A-Fa-f]{32}$/.test(s)
  ) return "MS"; // UUID või 32hex
  return "UNKNOWN";
}

/* =========================================================
   PROPERTY FLATTENING
   ========================================================= */

function flattenProps(
  obj: any,
  modelId: string,
  projectName: string,
  modelNameById: Map<string, string>
): Row {
  // NB! tugineb Workspace API ametlikule struktuurile:
  // ObjectProperties.properties?: PropertySet[] { set?: string, properties?: Property[] } :contentReference[oaicite:2]{index=2}
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
  const push = (group: string, name: string, val: unknown) => {
    const key = `${sanitizeKey(group)}.${sanitizeKey(name)}`;
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

  // BLOCK kandidaadid (tekla/ifc)
  for (const k of [
    "DATA.BLOCK",
    "BLOCK.BLOCK",
    "BLOCK.BLOCK_2",
    "Tekla_Assembly.AssemblyCast_unit_Mark",
  ]) if (propMap.has(k)) { out.BLOCK = propMap.get(k)!; break; }

  // GUID tuvastus
  let guidIfc = "";
  let guidMs = "";
  for (const [k, v] of propMap) {
    if (!/guid|globalid/i.test(k)) continue;
    const cls = classifyGuid(v);
    if (cls === "IFC" && !guidIfc) guidIfc = v;
    if (cls === "MS" && !guidMs) guidMs = v;
  }
  out.GUID_IFC = guidIfc;
  out.GUID_MS = guidMs;
  out.GUID = guidIfc || guidMs || "";

  return out;
}

/* =========================================================
   API HELPERS
   ========================================================= */

async function getProjectName(api: WorkspaceAPI): Promise<string> {
  try {
    const proj = await api?.project?.getProject?.(); // :contentReference[oaicite:3]{index=3}
    return String(proj?.name || "");
  } catch { return ""; }
}

async function getSelectedObjects(api: WorkspaceAPI): Promise<Array<{ modelId: string; objects: any[] }>> {
  const viewer: ViewerAPI = api?.viewer;
  // Lihtsaim viis on küsida otse valitud objektid koos omadustega
  // viewer.getObjects({ selected: true }) → ModelObjects[] :contentReference[oaicite:4]{index=4}
  const mos = await viewer?.getObjects?.({ selected: true });
  if (!Array.isArray(mos) || !mos.length) return [];
  return mos.map((mo: any) => ({ modelId: String(mo.modelId), objects: mo.objects || [] }));
}

async function buildModelNameMap(api: WorkspaceAPI, modelIds: string[]) {
  const map = new Map<string, string>();
  try {
    // Proovi esmalt getModels (kiire) :contentReference[oaicite:5]{index=5}
    const list: any[] = await api?.viewer?.getModels?.();
    for (const m of list || []) if (m?.id && m?.name) map.set(String(m.id), String(m.name));
  } catch {}
  // Täienda koormatud mudelite tegeliku nimega
  for (const id of new Set(modelIds)) {
    if (map.has(id)) continue;
    try {
      const f = await api?.viewer?.getLoadedModel?.(id); // :contentReference[oaicite:6]{index=6}
      const n = f?.name || f?.file?.name;
      if (n) map.set(id, String(n));
    } catch {}
  }
  return map;
}

/* =========================================================
   COMPONENT
   ========================================================= */

type Props = { api: WorkspaceAPI };

export default function AssemblyExporter({ api }: Props) {
  const [settings, updateSettings] = useSettings();

  const [tab, setTab] = useState<Tab>("export");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    new Set<string>(JSON.parse(localStorage.getItem("fieldSel") || "[]"))
  );

  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filter]);

  const [busy, setBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // meelde jäetud viimane valik (värvimiseks)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

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
      k.startsWith("Tekla_Assembly.") ||
      k === "BLOCK" ||
      k === "ReferenceObject.File_Name"
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
      setExportMsg("Reading current selection…");
      setProgress({ current: 0, total: 0 });

      const selectedWithProps = await getSelectedObjects(api);
      if (!selectedWithProps.length) {
        setExportMsg("⚠️ Palun vali 3D vaates objektid.");
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
        setExportMsg(`Processing model ${i + 1}/${selectedWithProps.length}…`);
        lastSel.push({
          modelId,
          ids: (objects || []).map((o: any) => Number(o?.id)).filter((n: any) => Number.isFinite(n)),
        });
        for (const o of objects || []) {
          out.push(flattenProps(o, modelId, projectName, nameMap));
        }
        setProgress({ current: i + 1, total: selectedWithProps.length });
      }

      setRows(out);
      setLastSelection(lastSel);
      setExportMsg(
        `Leidsin ${out.length} objekti. Võtmeid kokku: ${Array.from(new Set(out.flatMap(r => Object.keys(r)))).length}.`
      );
    } catch (e: any) {
      console.error(e);
      setExportMsg(`❌ Viga: ${e?.message || "tundmatu viga avastamisel"}`);
    } finally {
      setBusy(false);
    }
  }

  function orderRowByLockedAndAlpha(r: Row, chosen: Set<string>): Row {
    const o: Row = {};
    for (const k of LOCKED_ORDER) if (k in r) o[k] = r[k];
    const rest = Array.from(chosen).filter(
      k => !(LOCKED_ORDER as readonly string[]).includes(k as LockedKey)
    ).sort((a, b) => a.localeCompare(b));
    for (const k of rest) if (k in r) o[k] = r[k];
    return o;
  }

  function validateRows(input: Row[]): { valid: Row[]; errors: string[] } {
    const valid: Row[] = [];
    const errors: string[] = [];
    input.forEach((row, idx) => {
      const rowErrors: string[] = [];
      if (!row.GUID && !row.GUID_IFC && !row.GUID_MS)
        rowErrors.push("Missing all GUID fields");
      if (!row.Name?.trim()) rowErrors.push("Missing Name");
      if (rowErrors.length) errors.push(`Row ${idx + 1}: ${rowErrors.join(", ")}`);
      else valid.push(row);
    });
    return { valid, errors };
  }

  async function send() {
    const { scriptUrl, secret, autoColorize } = settings;

    if (!scriptUrl || !secret) {
      setTab("settings");
      setSettingsMsg("Täida Script URL ja Shared Secret.");
      return;
    }
    if (!rows.length) {
      setTab("export");
      setExportMsg('Klõpsa kõigepealt "Discover fields".');
      return;
    }

    const { errors: validationErrors } = validateRows(rows);
    if (validationErrors.length) console.warn("Validation warnings:", validationErrors);

    const warnRows = rows.map(r => {
      const warn: string[] = [];
      if (!r.GUID) warn.push("Missing GUID");
      const copy: Row = { ...r };
      if (warn.length) (copy as any)["__warnings"] = warn.join("; ");
      return copy;
    });

    const numericSkip = new Set<string>([
      "GUID","GUID_IFC","GUID_MS","Project","Name","Type","FileName"
    ]);
    const cleaned = warnRows.map(r => {
      const c: Row = {};
      for (const [k, v] of Object.entries(r) as [string, string][]) {
        if (FORCE_TEXT_KEYS.has(k) && typeof v === "string" && !v.startsWith("'")) {
          c[k] = `'${v}`;
        } else if (typeof v === "string" && !numericSkip.has(k) && isNumericString(v)) {
          c[k] = normaliseNumberString(v);
        } else {
          c[k] = v as string;
        }
      }
      return c;
    });

    const chosen = new Set<string>(
      [...LOCKED_ORDER, ...Array.from(selected), "__warnings"].filter(
        k =>
          allKeys.includes(k) ||
          (LOCKED_ORDER as readonly string[]).includes(k as any) ||
          k === "__warnings"
      )
    );

    const payload = cleaned.map(r => orderRowByLockedAndAlpha(r, chosen));
    const missing = cleaned.filter(r => !r.GUID).length;
    if (missing) setExportMsg(`⚠️ ${missing} rida ilma GUIDita – lisasin __warnings.`);

    try {
      setBusy(true);
      setExportMsg("Saadan read Google Sheeti…");
      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows: payload }),
      });
      const data = await res.json();
      setTab("export");
      if (data?.ok) {
        const extra =
          validationErrors.length > 0 ? ` (${validationErrors.length} hoiatus(t))` : "";
        setExportMsg(`✅ Lisatud ${payload.length} rida Google Sheeti${extra}.` + (autoColorize ? " Värvin valiku tumepunaseks…" : ""));
        if (autoColorize) await colorLastSelectionDarkRed();
      } else {
        setExportMsg(`❌ Viga: ${data?.error || "unknown"}`);
      }
    } catch (e: any) {
      setTab("export");
      setExportMsg(`❌ Viga: ${e?.message || e}`);
    } finally { setBusy(false); }
  }

  async function colorLastSelectionDarkRed() {
    const viewer: ViewerAPI = api?.viewer;
    let blocks = lastSelection;
    if (!blocks?.length) {
      // kui Discoveri järel pole talletatud, võta otseselt valikust
      const mos = await getSelectedObjects(api);
      blocks = mos.map(m => ({ modelId: m.modelId, ids: (m.objects || []).map((o: any) => o?.id).filter(Boolean) }));
    }
    if (!blocks?.length) return;

    // Õige viis: viewer.setObjectState(selector, state) + ColorRGBA 0..255 :contentReference[oaicite:7]{index=7}
    for (const b of blocks) {
      const selector = { modelObjectIds: [{ modelId: b.modelId, objectRuntimeIds: b.ids }] };
      await viewer.setObjectState(selector, { color: { r: 140, g: 0, b: 0, a: 255 } });
    }
  }

  async function resetState() {
    try {
      // Rakenda kõigile objektidele "reset" (värv ja nähtavus) :contentReference[oaicite:8]{index=8}
      await api?.viewer?.setObjectState?.(undefined, { color: "reset", visible: "reset" });
      setExportMsg("View state reset.");
    } catch (e: any) {
      setExportMsg(`Reset failed: ${e?.message || e}`);
    }
  }

  function exportToCSV() {
    if (!rows.length) return;
    const chosen = [...LOCKED_ORDER, ...Array.from(selected)]
      .filter(k => allKeys.includes(k) || (LOCKED_ORDER as readonly string[]).includes(k as any));

    const head = chosen.join(",");
    const body = rows
      .map(r => chosen.map(k => `"${((r[k] ?? "") as string).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([head + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assembly-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const c = styles;

  return (
    <div style={c.shell}>
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
              <label style={c.label}>Auto colorize after export</label>
              <input
                type="checkbox"
                checked={settings.autoColorize}
                onChange={(e) => updateSettings({ autoColorize: e.target.checked })}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Default preset</label>
              <select
                value={settings.defaultPreset}
                onChange={(e) => updateSettings({ defaultPreset: e.target.value as DefaultPreset })}
                style={c.input}
              >
                <option value="recommended">Recommended</option>
                <option value="tekla">Tekla Assembly</option>
                <option value="ifc">IFC Reference</option>
              </select>
            </div>
            <div style={{ ...c.row, justifyContent: "flex-end" }}>
              <button style={c.btn} onClick={() => setSettingsMsg("Settings saved.")}>Save</button>
              <button
                style={c.btnGhost}
                onClick={() => {
                  localStorage.removeItem("assemblyExporterSettings");
                  updateSettings({
                    scriptUrl: "",
                    secret: "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU",
                    autoColorize: true,
                    defaultPreset: "recommended",
                  });
                  setSettingsMsg("Settings reset.");
                }}
              >Reset</button>
            </div>
            {!!settingsMsg && <div style={c.note}>{settingsMsg}</div>}
          </div>
        )}

        {tab === "about" && (
          <div style={c.section}>
            <div style={c.small}>
              Assembly Exporter – Trimble Connect → Google Sheet.
              <br />
              • Multi-model • ProjectAPI.getProject() • getObjects(selected) • getModels/getLoadedModel
              <br />
              • GUID + GUID_IFC + GUID_MS • Number normalisation
              <br />• Dark-red colorize & Reset • Presets • Locked column order
            </div>
          </div>
        )}

        {tab === "export" && (
          <div style={c.section}>
            <div style={c.controls}>
              <button style={c.btn} onClick={discover} disabled={busy}>{busy ? "…" : "Discover fields"}</button>
              <input
                placeholder="Filter columns…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ ...c.input, flex: 1, minWidth: 120 }}
              />
              <button style={c.btnGhost} onClick={() => selectAll(true)} disabled={!rows.length}>Select all</button>
              <button style={c.btnGhost} onClick={() => selectAll(false)} disabled={!rows.length}>Clear</button>
              <button style={c.btnGhost} onClick={resetState}>Reset state</button>
              <button style={c.btnGhost} onClick={exportToCSV} disabled={!rows.length}>Download CSV</button>
              <button style={c.btnPrimary} onClick={send} disabled={busy || !rows.length}>
                {busy ? "Sending…" : `Send to Google Sheet (${rows.length} rows)`}
              </button>
            </div>

            {!!progress.total && progress.total > 1 && (
              <div style={c.small}>Progress: {progress.current}/{progress.total}</div>
            )}

            <div style={c.meta}>
              Locked order: {Array.from(LOCKED_ORDER).join(", ")}. Selected: {selected.size}.
            </div>

            <div style={c.list}>
              {!rows.length ? (
                <div style={c.small}>Click "Discover fields".</div>
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

            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ alignSelf: "center", opacity: 0.7 }}>Presets:</span>
              <button style={c.btnGhost} onClick={presetRecommended} disabled={!rows.length}>Recommended</button>
              <button style={c.btnGhost} onClick={presetTekla} disabled={!rows.length}>Tekla Assembly</button>
              <button style={c.btnGhost} onClick={presetIFC} disabled={!rows.length}>IFC Reference</button>
            </div>

            {!!exportMsg && <div style={{ ...c.note, marginTop: 6 }}>{exportMsg}</div>}
          </div>
        )}
      </div>

      <div style={c.footer}>created by <b>Silver Vatsel</b> | Consiva OÜ</div>
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
  page: { flex: 1, display: "flex", flexDirection: "column", padding: 10, gap: 10, minHeight: 0 },
  section: { display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0 },
  row: { display: "flex", alignItems: "center", gap: 8 },
  label: { width: 160, opacity: 0.8 },
  input: { flex: 1, padding: "6px 8px", border: "1px solid #cfd6df", borderRadius: 8, outline: "none" },
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
    marginLeft: "auto",
  },
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
