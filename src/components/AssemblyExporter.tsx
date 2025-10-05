import { useEffect, useMemo, useState } from "react";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";

/** Locked column order (after Timestamp) */
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

/* ----------------- Utilities ----------------- */
function sanitizeKey(s: string) {
  return String(s).replace(/\s+/g, "_").replace(/[^\w.-]/g, "").trim();
}

/** Put DATA and Reference_Object groups first, Tekla_Assembly next */
function groupSortKey(group: string) {
  const g = group.toLowerCase();
  if (g === "data") return 0;
  if (g === "reference_object") return 1;
  if (g.startsWith("tekla_assembly")) return 2;
  return 10;
}

/** Group keys by prefix before first dot (fallback "Other") */
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

/** Trimble PropertySet (docs: PropertySet) */
type TCProperty = { name: string; value: unknown };
type TCPropertySet = { name: string; properties: TCProperty[] };

/** Collect Property Sets from both PS and PSL (keep fallbacks for compatibility) */
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

/** Only normalise pure numeric strings (not 77/J-K etc) */
function isNumericString(s: string) {
  return /^[-+]?(\d+|\d*\.\d+)(e[-+]?\d+)?$/i.test(s.trim());
}
function normaliseNumberString(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  const roundedInt = Math.round(n);
  if (Math.abs(n - roundedInt) < 1e-9) return String(roundedInt);
  return String(parseFloat(n.toFixed(4)));
}

/** Deep-scan entire object to find GUIDs / FileName / CommonType even if outside PS/PSL */
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

/** Flatten to row + heuristics for Name/Type/BLOCK/FileName/GUIDs */
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

  // File name
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

  // GUIDs from property sets
  const candsSan = [
    { t: "IFC", k: "Reference_Object.GUID_IFC" },
    { t: "IFC", k: "Reference_Object.GUID_(IFC)" },
    { t: "IFC", k: "IFC.GUID" },
    { t: "MS",  k: "Reference_Object.GUID_MS" },
    { t: "MS",  k: "Reference_Object.GUID_(MS)" },
    { t: "ANY", k: "GUID" },
    { t: "ANY", k: "Reference_Object.Guid" },
  ] as const;

  let guidIfc = "";
  let guidMs  = "";
  for (const c of candsSan) {
    const v = propMap.get(c.k);
    if (!v) continue;
    if (c.t === "IFC" && !guidIfc) guidIfc = v;
    if (c.t === "MS"  && !guidMs)  guidMs  = v;
  }
  if (!guidIfc || !guidMs) {
    for (const r of rawNames) {
      const n = String(r.name || "");
      if (/guid/i.test(n)) {
        const val = r.value == null ? "" : String(r.value);
        if (!guidIfc && (/\( *ifc *\)/i.test(n) || /\bifc\b/i.test(n))) { guidIfc = val; continue; }
        if (!guidMs && (/\( *ms *\)/i.test(n) || /\bms\b/i.test(n)))   { guidMs  = val; continue; }
      }
    }
  }
  out.GUID_IFC = guidIfc;
  out.GUID_MS  = guidMs;
  out.GUID     = guidIfc || guidMs || (() => {
    for (const r of rawNames) {
      const n = String(r.name || "");
      if (/guid/i.test(n)) return r.value == null ? "" : String(r.value);
    }
    return "";
  })();

  // Fallback deep-scan if still missing
  if (!out.GUID || !out.GUID_IFC || !out.GUID_MS || !out.FileName) {
    const found = deepScanForGuidAndMeta(obj);
    if (!out.GUID_IFC && found.ifc) out.GUID_IFC = found.ifc;
    if (!out.GUID_MS  && found.ms)  out.GUID_MS  = found.ms;
    if (!out.GUID     && (found.ifc || found.ms || found.any)) {
      out.GUID = found.ifc || found.ms || found.any || out.GUID;
    }
    if (!out.FileName && found.file) out.FileName = found.file;
  }

  return out;
}

/** Project name strictly via ProjectAPI.getProject() */
async function getProjectName(api: any): Promise<string> {
  if (typeof api?.project?.getProject === "function") {
    const proj = await api.project.getProject();
    if (proj?.name) return String(proj.name);
  }
  return "";
}

/* ----------------- Component ----------------- */
export default function AssemblyExporter({ api }: Props) {
  const [tab, setTab] = useState<Tab>("export");

  // settings
  const [scriptUrl, setScriptUrl] = useState<string>(localStorage.getItem("sheet_webapp") || "");
  const [secret, setSecret] = useState<string>(localStorage.getItem("sheet_secret") || "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU");

  // export state
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set<string>(JSON.parse(localStorage.getItem("fieldSel") || "[]")));
  const [filter, setFilter] = useState<string>("");

  // messages
  const [exportMsg, setExportMsg] = useState<string>("");
  const [settingsMsg, setSettingsMsg] = useState<string>("");

  const [busy, setBusy] = useState<boolean>(false);

  // last selection (for colorizing)
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
    setSelected(() => {
      if (!on) return new Set();
      return new Set(allKeys);
    });
  }

  // Presets (shown below the list)
  function presetRecommended() {
    const wanted = new Set<string>([
      ...LOCKED_ORDER,
      "Reference_Object.Common_Type",
      "Reference_Object.File_Name",
    ]);
    setSelected(new Set(allKeys.filter((k) => wanted.has(k))));
  }
  function presetTeklaAssembly() {
    setSelected(new Set(allKeys.filter((k) => k.startsWith("Tekla_Assembly." ) || k === "BLOCK" || k === "Reference_Object.File_Name")));
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

  // Discover (all models)
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

  // Row ordering (locked + selected alphabetically)
  function orderRowByLockedAndAlpha(r: Row, chosen: Set<string>): Row {
    const o: Row = {};
    for (const k of LOCKED_ORDER) {
      if (k in r) (o as any)[k] = r[k];
    }
    const rest = Array.from(chosen).filter((k) => !(LOCKED_ORDER as readonly string[]).includes(k as LockedKey));
    rest.sort((a, b) => a.localeCompare(b));
    for (const k of rest) if (k in r) (o as any)[k] = r[k];
    return o;
  }

  async function send() {
    if (!scriptUrl || !secret) { setTab("settings"); setSettingsMsg("Please fill Script URL and Shared Secret."); return; }
    if (!rows.length) { setTab("export"); setExportMsg("Click “Discover fields” first."); return; }

    // Add __warnings if GUID is missing
    const rowsWithWarn = rows.map((r) => {
      const warn: string[] = [];
      if (!r.GUID) warn.push("Missing GUID");
      const copy: Row = { ...r };
      if (warn.length) copy["__warnings"] = warn.join("; ");
      return copy;
    });

    // Normalise numeric-only strings (skip these keys)
    const numericSkip = new Set<string>(["GUID", "GUID_IFC", "GUID_MS", "Project", "Name", "Type", "FileName"]);
    const cleaned = rowsWithWarn.map((r) => {
      const c: Row = {};
      for (const [k, v] of Object.entries(r) as [string, string][]) {
        if (typeof v === "string" && !numericSkip.has(k) && isNumericString(v)) {
          c[k] = normaliseNumberString(v);
        } else {
          c[k] = v;
        }
      }
      return c;
    });

    // Build payload with chosen keys and locked order
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
      setTab("export"); // show message on EXPORT
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

  // Colorize selection (proper state shape; fallbacks for older APIs)
  async function colorLastSelectionDarkRed() {
    try {
      const viewer: any = (api as any).viewer;

      let blocks = lastSelection;
      if (!blocks?.length && typeof viewer?.getSelection === "function") {
        const sel: any[] = await viewer.getSelection();
        blocks = (sel || [])
          .filter(Boolean)
          .map(m => ({ modelId: String(m.modelId), ids: (m.objectRuntimeIds || []).slice() }))
          .filter(b => b.ids.length);
      }
      if (!blocks?.length) return;

      const color = { r: 140, g: 0, b: 0 };
      const statePayload = (b: {modelId: string; ids: number[]}) => ({
        modelId: b.modelId,
        objectRuntimeIds: b.ids,
        state: { color, opacity: 255 },   // correct API shape
      });

      for (const b of blocks) {
        if (typeof viewer?.setObjectState === "function") {
          await viewer.setObjectState(statePayload(b));
        } else if (typeof viewer?.applyObjectStates === "function") {
          await viewer.applyObjectStates([statePayload(b)]);
        } else if (typeof viewer?.colorizeObjects === "function") {
          await viewer.colorizeObjects(b.modelId, b.ids, color);
        }
      }
    } catch {
      /* ignore */
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
        <button style={{ ...c.tab, ...(tab === "export" ? c.tabActive : {}) }} onClick={() => setTab("export")}>
          EXPORT
        </button>
        <button style={{ ...c.tab, ...(tab === "settings" ? c.tabActive : {}) }} onClick={() => setTab("settings")}>
          SETTINGS
        </button>
        <button style={{ ...c.tab, ...(tab === "about" ? c.tabActive : {}) }} onClick={() => setTab("about")}>
          ABOUT
        </button>
      </div>

      <div style={c.page}>
        {tab === "settings" && (
          <div style={c.section}>
            <div style={c.row}>
              <label style={c.label}>Google Apps Script URL</label>
              <input
                value={scriptUrl}
                onChange={(e) => setScriptUrl(e.target.value)}
                placeholder="https://…/exec"
                style={c.input}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Shared Secret</label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                style={c.input}
              />
            </div>
            <div style={{ ...c.row, justifyContent: "flex-end" }}>
              <button
                style={c.btn}
                onClick={() => {
                  localStorage.setItem("sheet_webapp", scriptUrl);
                  localStorage.setItem("sheet_secret", secret);
                  setSettingsMsg("Settings saved.");
                }}
              >
                Save
              </button>
              <button
                style={c.btnGhost}
                onClick={() => {
                  localStorage.removeItem("sheet_webapp");
                  localStorage.removeItem("sheet_secret");
                  setScriptUrl("");
                  setSecret("");
                  setSettingsMsg("Settings cleared.");
                }}
              >
                Clear
              </button>
            </div>
            {!!settingsMsg && <div style={c.note}>{settingsMsg}</div>}
          </div>
        )}

        {tab === "about" && (
          <div style={c.section}>
            <div style={c.small}>
              Assembly Exporter – Trimble Connect → Google Sheet.<br />
              • Multi-model selection • ProjectAPI.getProject() • PSL priority<br />
              • GUID + GUID_IFC + GUID_MS • Number normalisation<br />
              • Dark-red colorize & Reset • Presets • Locked column order
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
                  const allOn = keys.every((k: string) => selected.has(k));
                  const noneOn = keys.every((k: string) => !selected.has(k));
                  return (
                    <div key={groupName} style={c.group}>
                      <div style={c.groupHeader}>
                        <b>{groupName}</b>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={c.mini} onClick={() => toggleGroup(keys, true)}>select</button>
                          <button style={c.mini} onClick={() => toggleGroup(keys, false)}>clear</button>
                        </div>
                        <span style={c.faint}>
                          {allOn ? "all" : noneOn ? "none" : "partial"}
                        </span>
                      </div>
                      <div style={c.grid}>
                        {keysShown.map((k: string) => (
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

            {/* Presets area (below the list) */}
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

      {/* Footer credit */}
      <div style={c.footer}>created by <b>Silver Vatsel</b> | Consiva OÜ</div>
    </div>
  );
}

/* ----------------- Minimal, compact styles ----------------- */
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
  btnPrimary: { padding: "6px 12px", borderRadius: 8, border: "1px solid #0a3a67", background: "#0a3a67",
    color: "#fff", cursor: "pointer", marginLeft: "auto" },
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
  footer: { padding: "6px 10px", borderTop: "1px solid #eef2f6", fontSize: 12, color: "#66758c" }
};
