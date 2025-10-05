import { useEffect, useMemo, useState } from "react";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";

/** Alati kaasas + lukus järjekorras */
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

/* ----------------- Utils ----------------- */
function sanitizeKey(s: string) {
  return String(s).replace(/\s+/g, "_").replace(/[^\w.-]/g, "").trim();
}

/** Gruppide järjestus – “DATA” ja “Reference_Object” ettepoole */
function groupSortKey(group: string) {
  const g = group.toLowerCase();
  if (g === "data") return 0;
  if (g === "reference_object") return 1;
  if (g.startsWith("tekla_assembly")) return 2;
  return 10;
}

/** rühmitame väljad (LOCKED_ORDER ei peitu ühegi punkti sees ja jäävad “Other” alla) */
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

/** Trimble PropertySet kuju (docs: PropertySet) */
type TCProperty = { name: string; value: unknown };
type TCPropertySet = { name: string; properties: TCProperty[] };

/** Koonda PropertySet’id nii PS kui PSL (ja jäta fallbackid alles ühilduvuseks) */
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

/** kas string on “puhas number” (vältides nt 77/J-K) */
function isNumericString(s: string) {
  return /^[-+]?(\d+|\d*\.\d+)(e[-+]?\d+)?$/i.test(s.trim());
}
/** normaliseeri arv: 350.00000000000006 -> 350 ; muidu kuni 4 kohta (trimmitud) */
function normaliseNumberString(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  const roundedInt = Math.round(n);
  if (Math.abs(n - roundedInt) < 1e-9) return String(roundedInt);
  return String(parseFloat(n.toFixed(4)));
}

/** tasanda omadused + leia GUIDid; lisa FileName, BLOCK jms */
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

      // Name/Type heuristika
      if (!out.Name && /^(name|object[_\s]?name)$/i.test(String(nm))) out.Name = String(vv ?? "");
      if (out.Type === "Unknown" && /\btype\b/i.test(String(nm))) out.Type = String(vv ?? "Unknown");
    }
  }

  // --- FileName (“Reference Object” → “File Name”)
  const fileKeyCandidates = [
    "Reference_Object.File_Name",
    "Reference_Object.FileName",
    "IFC.File_Name",
  ];
  for (const k of fileKeyCandidates) {
    if (propMap.has(k)) { out.FileName = propMap.get(k)!; break; }
  }
  if (!out.FileName) {
    // kui leiad toor-nimest
    for (const r of rawNames) {
      if (/^file\s*name$/i.test(String(r.name || "")) && /reference/i.test(String(r.group || ""))) {
        out.FileName = r.value == null ? "" : String(r.value);
        break;
      }
    }
  }

  // --- BLOCK (nt “DATA.BLOCK” vms alias)
  const blockCandidates = [
    "DATA.BLOCK",
    "BLOCK.BLOCK",
    "BLOCK.BLOCK_2",
    "Tekla_Assembly.AssemblyCast_unit_Mark",
  ];
  for (const k of blockCandidates) { if (propMap.has(k)) { out.BLOCK = propMap.get(k)!; break; } }

  // --- GUIDid (IFC ja MS eraldi, lisaks peamine GUID eelistusega IFC > MS > muu “guid”)
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
    // viimane fallback – esimene “guid” mis iganes rühmast
    for (const r of rawNames) {
      const n = String(r.name || "");
      if (/guid/i.test(n)) return r.value == null ? "" : String(r.value);
    }
    return "";
  })();

  return out;
}

/** projekti nimi ainult ProjectAPI.getProject() kaudu (nagu soovisid) */
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
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  // viimane edukalt saadetud valik – kasutame tumepunaseks värvimiseks
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

  // ----- Presetid -----
  function presetRecommended() {
    // “Soovitused”: GUIDid, Project, FileName, Common Type, BLOCK, Name/Type
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

  // ----- Avasta valik (KÕIK mudelid) -----
  async function discover() {
    try {
      setBusy(true);
      setMsg("Loen valikut…");
      const selection: any[] = await (api as any).viewer.getSelection();
      if (!selection?.length) { setMsg("Vali mudelist objektid."); setRows([]); return; }

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
      setMsg(`Leidsin ${collectedRows.length} objekti. Võtmeid kokku ${Array.from(new Set(collectedRows.flatMap((r) => Object.keys(r)))).length}.`);
    } catch (e: any) {
      setMsg(`Viga: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  // ----- Saatmine -----
  function orderRowByLockedAndAlpha(r: Row, chosen: Set<string>): Row {
    const o: Row = {};
    // lukus järjestus
    for (const k of LOCKED_ORDER) {
      if (k in r) (o as any)[k] = r[k];
    }
    // ülejäänud valitud alfabeetiliselt
    const rest = Array.from(chosen).filter((k) => !(LOCKED_ORDER as readonly string[]).includes(k as LockedKey));
    rest.sort((a, b) => a.localeCompare(b));
    for (const k of rest) if (k in r) (o as any)[k] = r[k];
    return o;
  }

  async function send() {
    if (!scriptUrl || !secret) { setMsg("Täida Settings all URL ja Secret."); setTab("settings"); return; }
    if (!rows.length) { setMsg("Enne vajuta “Discover fields”."); setTab("export"); return; }

    // hoiatame kui mõnel real pole GUID – ja lisame __warnings välja
    const rowsWithWarn = rows.map((r) => {
      const warn: string[] = [];
      if (!r.GUID) warn.push("Missing GUID");
      const copy: Row = { ...r };
      if (warn.length) copy["__warnings"] = warn.join("; ");
      return copy;
    });

    // normaliseeri kõik numeric-stringid (v.a GUID/Project/Name/Type/…)
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

    // kasutame kasutaja valikuid + lukus järjekorda
    const chosen = new Set<string>([
      ...LOCKED_ORDER,
      ...Array.from(selected),
      "__warnings",
    ].filter((k) => allKeys.includes(k) || LOCKED_ORDER.includes(k as any) || k === "__warnings"));

    // ehitame objektid kindla võtmete lisamisjärjekorraga
    const payload = cleaned.map((r) => orderRowByLockedAndAlpha(r, chosen));

    // Kui leidus puuduvaid GUIDe, kuvame hoiatuse, aga saadame siiski (__warnings väljadega)
    const missing = cleaned.filter((r) => !r.GUID).length;
    if (missing) setMsg(`⚠️ ${missing} rida ilma GUIDita – lisasin __warnings veeru ja saadan edasi.`);

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
      if (data?.ok) {
        setMsg(`✅ Edukalt lisatud ${data.inserted} rida Google Sheeti! Märgistan valiku tumepunaseks…`);
        // märgista tumepunaseks
        await colorLastSelectionDarkRed();
      } else {
        setMsg(`❌ Viga: ${data?.error || "tundmatu"}`);
      }
    } catch (e: any) {
      setMsg(`❌ Viga: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function colorLastSelectionDarkRed() {
    try {
      const viewer: any = (api as any).viewer;
      for (const blk of lastSelection) {
        // Kasutan “any”, et vältida tüübi murde – tegelik signatuur vt ViewerAPI#setObjectState
        await viewer?.setObjectState?.({
          modelId: blk.modelId,
          objectRuntimeIds: blk.ids,
          color: { r: 140, g: 0, b: 0 }, // tumepunane
          opacity: 255,
        });
      }
    } catch { /* ignore */ }
  }

  async function resetState() {
    try {
      const viewer: any = (api as any).viewer;
      await viewer?.resetObjectState?.();
      setMsg("Vaate olek taastatud (reset).");
    } catch (e: any) {
      setMsg(`Reset ebaõnnestus: ${e?.message || e}`);
    }
  }

  /* ----------------- UI ----------------- */
  const c = styles;

  return (
    <div style={c.shell}>
      {/* Top bar / tabs */}
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
                  setMsg("Seaded salvestatud.");
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
                }}
              >
                Clear
              </button>
            </div>
            {!!msg && <div style={c.note}>{msg}</div>}
          </div>
        )}

        {tab === "about" && (
          <div style={c.section}>
            <div style={c.small}>
              Assembly Exporter – Trimble Connect → Google Sheet. <br />
              • Multi-model selection • ProjectAPI.getProject() • PSL/“DATA” prioriteet <br />
              • GUID + GUID_IFC + GUID_MS • numbrite normaliseerimine • tumepunane märgistus + reset <br />
              • Presetid: Soovitused, Tekla Assembly, IFC Reference • Lukus veerujärjestus.
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
              <button style={c.btnGhost} onClick={presetRecommended} disabled={!rows.length}>Soovitused</button>
              <button style={c.btnGhost} onClick={presetTeklaAssembly} disabled={!rows.length}>Tekla Assembly</button>
              <button style={c.btnGhost} onClick={presetIFCReference} disabled={!rows.length}>IFC Reference</button>
              <button style={c.btnGhost} onClick={resetState}>Reset state</button>
              <button style={c.btnPrimary} onClick={send} disabled={busy || !rows.length}>
                {busy ? "Sending…" : "Send to Google Sheet"}
              </button>
            </div>

            <div style={c.meta}>
              Locked order: {Array.from(LOCKED_ORDER).join(", ")}. Selected: {selected.size}.
            </div>

            {/* Väikese sisemise kerimisega list */}
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

            {!!msg && <div style={{ ...c.note, marginTop: 6 }}>{msg}</div>}
          </div>
        )}
      </div>
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
};
