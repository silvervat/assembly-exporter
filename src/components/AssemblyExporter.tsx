import { useEffect, useMemo, useState } from "react";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";

/** Ainsad automaatsed veerud */
const MANDATORY_COLS = ["GUID", "Project"] as const;

type Row = Record<string, string>;
type Props = { api: WorkspaceAPI };
type Tab = "export" | "settings" | "about";

/* ----------------- Utils ----------------- */
function sanitizeKey(s: string) {
  return String(s).replace(/\s+/g, "_").replace(/[^\w.-]/g, "").trim();
}

function groupKeys(keys: string[]) {
  const g: Record<string, string[]> = {};
  for (const k of keys) {
    if ((MANDATORY_COLS as readonly string[]).includes(k)) continue;
    const dot = k.indexOf(".");
    const grp = dot > 0 ? k.slice(0, dot) : "Other";
    (g[grp] ||= []).push(k);
  }
  Object.values(g).forEach(arr => arr.sort((a, b) => a.localeCompare(b)));
  return g;
}

/** Tasanda omadused + leia GUID; kõik võtmed lisatakse ritta valikuliseks */
function flattenProps(obj: any, modelId: string, projectName: string): Row {
  const out: Row = {
    GUID: "",
    Project: String(projectName),
    ObjectId: String(obj?.id ?? ""), // valikuline
    ModelId: String(modelId),        // valikuline
    Name: "",
    Type: "Unknown",
    BLOCK: "",
  };

  // Kogume kõik omadused kaardiks (Group.Property -> value)
  const propMap = new Map<string, string>();
  const push = (group: string, name: string, val: any) => {
    const key = `${sanitizeKey(group)}.${sanitizeKey(name)}`;
    let v = val;
    if (Array.isArray(v)) v = v.map(x => (x == null ? "" : String(x))).join(" | ");
    else if (typeof v === "object" && v !== null) v = JSON.stringify(v);
    const s = v == null ? "" : String(v);
    propMap.set(key, s);
    (out as any)[key] = s; // jätame dünaamilise veeru alles, et valikus näha
  };

  // Standard + PropertySet + Property Set Libraries (nt "DATA")
  const allGroups = [
    ...(obj?.properties ?? []),
    ...(obj?.propertySets ?? []),
    ...(obj?.propertySetLibraries ?? []),
  ] as Array<{ name: string; properties: Array<{ name: string; value: any }> }>;

  for (const set of allGroups) {
    const g = set?.name || "Group";
    for (const p of set?.properties ?? []) {
      push(g, p?.name || "Prop", p?.value);
      if (!out.Name && /^(name|object[_\s]?name)$/i.test(p?.name || "")) out.Name = String(p?.value ?? "");
      if (out.Type === "Unknown" && /\btype\b/i.test(p?.name || "")) out.Type = String(p?.value ?? "Unknown");
    }
  }

  // --- GUID (Reference Object → GUID (IFC/MS) + fallback 'guid') ---
  const guidCandidates = [
    "Reference_Object.GUID_IFC",
    "Reference_Object.GUID_(IFC)",
    "Reference_Object.GUID_(Ifc)",
    "Reference_Object.GUID_MS",
    "Reference_Object.GUID_(MS)",
    "IFC.GUID",
    "GUID",
    "Reference_Object.Guid",
  ];
  let guid = "";
  for (const k of guidCandidates) { if (propMap.has(k)) { guid = propMap.get(k)!; break; } }
  if (!guid) for (const [k, v] of propMap) { if (/guid/i.test(k)) { guid = v; break; } }
  out.GUID = guid;

  // --- BLOCK (valikuline; kui leidub, kuvame valikus võtmena) ---
  const blockCandidates = [
    "DATA.BLOCK",
    "BLOCK.BLOCK",
    "BLOCK.BLOCK_2",
    "Tekla_Assembly.AssemblyCast_unit_Mark",
  ];
  for (const k of blockCandidates) { if (propMap.has(k)) { out.BLOCK = propMap.get(k)!; break; } }

  return out;
}

/* ----------------- Component ----------------- */
export default function AssemblyExporter({ api }: Props) {
  // top nav
  const [tab, setTab] = useState<Tab>("export");

  // settings
  const [scriptUrl, setScriptUrl] = useState(localStorage.getItem("sheet_webapp") || "");
  const [secret, setSecret] = useState(localStorage.getItem("sheet_secret") || "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU");

  // export state
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(JSON.parse(localStorage.getItem("fieldSel") || "[]")));
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const allKeys = useMemo(() => Array.from(new Set(rows.flatMap(r => Object.keys(r)))).sort(), [rows]);
  const grouped = useMemo(() => groupKeys(allKeys), [allKeys]);

  useEffect(() => {
    localStorage.setItem("fieldSel", JSON.stringify(Array.from(selected)));
  }, [selected]);

  const matches = (k: string) => !filter || k.toLowerCase().includes(filter.toLowerCase());

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
    setSelected(() => {
      if (!on) return new Set();
      const base = allKeys.filter(k => !(MANDATORY_COLS as readonly string[]).includes(k));
      return new Set(base);
    });
  }

  async function discover() {
    try {
      setBusy(true);
      setMsg("Loen valikut…");
      const selection = await api.viewer.getSelection();
      if (!selection?.length) { setMsg("Vali mudelist objektid."); setRows([]); return; }

      const model = selection[0];
      const ids: number[] = (model.objectRuntimeIds ?? []).slice();
      if (!ids.length) { setMsg("Valik on tühi."); setRows([]); return; }

      const projectName: string = (api as any)?.project?.name ?? "";
      const props = await api.viewer.getObjectProperties(model.modelId, ids);
      const flat = props.map((o: any) => flattenProps(o, model.modelId, projectName));

      setRows(flat);
      setMsg(`Leidsin ${flat.length} objekti. Võtmeid kokku ${Array.from(new Set(flat.flatMap(Object.keys))).length}.`);
    } catch (e: any) {
      setMsg(`Viga: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!scriptUrl || !secret) { setMsg("Täida Settings all URL ja Secret."); setTab("settings"); return; }
    if (!rows.length) { setMsg("Enne vajuta “Discover fields”."); setTab("export"); return; }

    try {
      setBusy(true);
      setMsg("Saadan…");
      localStorage.setItem("sheet_webapp", scriptUrl);
      localStorage.setItem("sheet_secret", secret);

      const pick = (r: Row) => {
        const out: Row = {};
        for (const k of MANDATORY_COLS) out[k] = r[k] ?? "";
        for (const k of selected) if (k in r) out[k] = r[k];
        return out;
      };
      const payload = rows.map(pick);

      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows: payload }),
      });
      const data = await res.json();
      setMsg(data?.ok ? `✅ Edukalt lisatud ${data.inserted} rida Google Sheeti!` : `❌ Viga: ${data?.error || "tundmatu"}`);
    } catch (e: any) {
      setMsg(`❌ Viga: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  /* ----------------- UI ----------------- */
  const c = styles; // lühem

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

      {/* Content area */}
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
              Assembly Exporter – Trimble Connecti valiku eksport Google Sheeti. <br />
              Automaatsed veerud: <b>GUID</b>, <b>Project</b>. Ülejäänu on valikuline. <br />
              Valik salvestub brauseri <i>localStorage</i>’isse.
            </div>
          </div>
        )}

        {tab === "export" && (
          <div style={c.section}>
            {/* Controls row */}
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
              <button style={c.btnPrimary} onClick={send} disabled={busy || !rows.length}>
                {busy ? "Sending…" : "Send to Google Sheet"}
              </button>
            </div>

            <div style={c.meta}>Always included: {Array.from(MANDATORY_COLS).join(", ")}. Selected: {selected.size}.</div>

            {/* Field list panel – internal scroll */}
            <div style={c.list}>
              {!rows.length ? (
                <div style={c.small}>Click “Discover fields”.</div>
              ) : (
                Object.entries(grouped).map(([groupName, keys]) => {
                  const keysShown = keys.filter(matches);
                  if (!keysShown.length) return null;
                  const allOn = keys.every(k => selected.has(k));
                  const noneOn = keys.every(k => !selected.has(k));
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
                        {keysShown.map(k => (
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
  page: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: 10,
    gap: 10,
    minHeight: 0, // võimaldab sisemist kerimist
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    height: "100%",
    minHeight: 0,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  label: { width: 160, opacity: 0.8 },
  input: {
    flex: 1,
    padding: "6px 8px",
    border: "1px solid #cfd6df",
    borderRadius: 8,
    outline: "none",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  btn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #cfd6df",
    background: "#f6f8fb",
    cursor: "pointer",
  },
  btnGhost: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #d7dde6",
    background: "#fff",
    cursor: "pointer",
  },
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
  list: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    border: "1px solid #edf0f4",
    borderRadius: 8,
    padding: 8,
    background: "#fafbfc",
  },
  group: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "1px dashed #e5e9f0",
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  mini: {
    padding: "2px 6px",
    borderRadius: 6,
    border: "1px solid #d7dde6",
    background: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 6,
  },
  checkRow: { display: "flex", alignItems: "center", gap: 6 },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  small: { fontSize: 12, opacity: 0.8 },
  faint: { fontSize: 12, opacity: 0.55, marginLeft: "auto" },
  note: { fontSize: 12, opacity: 0.9 },
};
