import React, { useEffect, useMemo, useRef, useState } from "react";

/* =============================================================================
   Trimble Connect Workspace API (kitsendatud deklaratsioon)
   ========================================================================== */
type TVector3 = { x: number; y: number; z: number };

type TCProperty = { name: string; value?: any };
type TCPropertySet = { name: string; properties?: TCProperty[] };

type TCProduct = { name?: string; type?: string };

type TObjectProps = {
  id: number;
  class?: string;
  color?: string;
  position?: TVector3;
  product?: TCProduct;
  properties?: TCPropertySet[];
};

type TCViewerSelection = { modelId: string; ids: number[] };

type TCViewerAPI = {
  getSelection: () => Promise<TCViewerSelection[]>;
  getObjectProperties: (
    modelId: string,
    ids: number[],
    opts?: { loadProperties?: boolean }
  ) => Promise<TObjectProps[]>;
  setObjectState: (
    modelId: string,
    ids: number[],
    state: { color?: { r: number; g: number; b: number; a?: number }; opacity?: number; visible?: boolean }
  ) => Promise<void>;
  getModel?: (modelId: string) => Promise<{ id: string; name?: string }>;
};

type TCProjectAPI = {
  getProject?: () => Promise<{ name?: string }>;
};

declare global {
  interface Window {
    tcv?: {
      viewer: TCViewerAPI;
      project?: TCProjectAPI;
    };
  }
}

/* =============================================================================
   Abifunktsioonid ja tüübid
   ========================================================================== */
type Row = Record<string, string>;

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
];

const FORCE_TEXT_KEYS = new Set<string>([
  "Tekla_Assembly.AssemblyCast_unit_bottom_elevation",
  "Tekla_Assembly.AssemblyCast_unit_top_elevation",
]);

const numberLike = (v: string) => /^-?\d+(\.\d+)?$/.test(v.trim());
const clampDp = (n: number, dp = 4) => Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp);

function normaliseNumString(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return String(clampDp(n, 4));
}

function byAlpha(a: string, b: string) {
  return a.localeCompare(b);
}

function orderRow(row: Row, chosen: Set<string>): Row {
  const out: Row = {};
  for (const k of LOCKED_ORDER) if (k in row) out[k] = row[k];

  const tail = Array.from(chosen)
    .filter((k) => !LOCKED_ORDER.includes(k) && k in row)
    .sort(byAlpha);
  for (const k of tail) out[k] = row[k];

  return out;
}

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* =============================================================================
   Settings (localStorage)
   ========================================================================== */
type AppSettings = {
  scriptUrl: string;
  secret: string;
  autoColorize: boolean;
};

const SETTINGS_KEY = "assembly-exporter-settings-v3";

function useSettings(): [AppSettings, (p: Partial<AppSettings>) => void] {
  const [st, setSt] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { scriptUrl: "", secret: "", autoColorize: true };
  });
  const update = (p: Partial<AppSettings>) => {
    const next = { ...st, ...p };
    setSt(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };
  return [st, update];
}

/* =============================================================================
   Valideerija (kasutame ekspordi ees – väldib TS unused viga, annab kasu)
   ========================================================================== */
function validateRows(rows: Row[]): { valid: Row[]; errors: string[] } {
  const valid: Row[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const e: string[] = [];
    if (!r.GUID && !r.GUID_IFC && !r.GUID_MS) e.push("Missing all GUIDs");
    if (!r.Name?.trim()) e.push("Missing Name");
    if (!r.ModelId) e.push("Missing ModelId");
    if (e.length) errors.push(`Row ${i + 1}: ${e.join(", ")}`);
    else valid.push(r);
  });
  return { valid, errors };
}

/* =============================================================================
   Komponent
   ========================================================================== */
const AssemblyExporter: React.FC = () => {
  const api = (window.tcv || {}) as { viewer: TCViewerAPI; project?: TCProjectAPI };
  const [tab, setTab] = useState<"export" | "settings" | "about">("export");

  const [settings, setSettings] = useSettings();

  // avastatud read ja võtmed
  const [rows, setRows] = useState<Row[]>([]);
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // progress
  const [progress, setProgress] = useState<{ cur: number; total: number }>({ cur: 0, total: 0 });

  // filter
  const [filter, setFilter] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(filter), 250);
    return () => clearTimeout(t);
  }, [filter]);

  // rühmitus (Property Set järgi)
  const groupedKeys = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const k of allKeys) {
      const i = k.indexOf(".");
      const group = i > 0 ? k.substring(0, i) : "Other";
      if (!g.has(group)) g.set(group, []);
      g.get(group)!.push(k);
    }
    for (const [, arr] of g) arr.sort(byAlpha);
    return g;
  }, [allKeys]);

  const filteredKeys = useMemo(() => {
    if (!debounced) return allKeys;
    const f = debounced.toLowerCase();
    return allKeys.filter((k) => k.toLowerCase().includes(f));
  }, [allKeys, debounced]);

  /* -------------------------------------------------------------------------
     Discover
     ---------------------------------------------------------------------- */
  async function discover() {
    setTab("export");
    setMsg("Reading current selection…");
    setBusy(true);
    setProgress({ cur: 0, total: 0 });

    try {
      // project name
      let projectName = "";
      try {
        const p = await api.project?.getProject?.();
        projectName = p?.name || "";
      } catch {}

      const selection = await api.viewer.getSelection();
      if (!selection?.length) {
        setRows([]);
        setAllKeys([]);
        setMsg("⚠️ Please select objects first.");
        return;
      }

      const newRows: Row[] = [];
      const keys = new Set<string>(LOCKED_ORDER);
      setProgress({ cur: 0, total: selection.length });

      // ühes mudelis korraga
      for (let mi = 0; mi < selection.length; mi++) {
        const { modelId, ids } = selection[mi];
        let fileName = "";
        try {
          const m = await api.viewer.getModel?.(modelId);
          fileName = m?.name || "";
        } catch {}

        const objs = await api.viewer.getObjectProperties(modelId, ids, { loadProperties: true });

        for (const o of objs) {
          const r: Row = { ModelId: modelId, FileName: fileName, Project: projectName };
          if (o.product?.name) r.Name = String(o.product.name);
          if (o.product?.type) r.Type = String(o.product.type);

          let guidIFC = "";
          let guidMS = "";
          let block = "";

          for (const set of o.properties || []) {
            const setName = set.name?.trim() || "";
            for (const p of set.properties || []) {
              const prop = p.name?.trim() || "";
              const full = setName ? `${setName}.${prop}` : prop;
              const v = p.value;
              if (full) {
                keys.add(full);
                if (v != null && v !== "" && typeof v !== "object") {
                  r[full] = String(v);
                }
              }
              const low = prop.toLowerCase();
              if (!guidIFC && (low === "guid (ifc)" || low === "guid_ifc" || low === "guidifc"))
                guidIFC = String(v || "");
              if (!guidMS && (low === "guid (ms)" || low === "guid_ms" || low === "guidms"))
                guidMS = String(v || "");
              if (!block && setName.toLowerCase() === "data" && low === "block")
                block = String(v || "");
            }
          }

          const guidPrimary = guidIFC || guidMS || "";
          if (guidPrimary) r.GUID = guidPrimary;
          if (guidIFC) r.GUID_IFC = guidIFC;
          if (guidMS) r.GUID_MS = guidMS;
          if (block) r.BLOCK = block;

          newRows.push(r);
        }

        setProgress({ cur: mi + 1, total: selection.length });
      }

      setRows(newRows);
      setAllKeys(Array.from(keys));
      setMsg(`Found ${newRows.length} object(s). Choose columns and export.`);
    } catch (e: any) {
      console.error(e);
      setRows([]);
      setAllKeys([]);
      setMsg(`❌ Discovery error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------------------------------------------------------
     Color & reset
     ---------------------------------------------------------------------- */
  async function colorSelectionDarkRed() {
    try {
      const selection = await api.viewer.getSelection();
      if (!selection?.length) return;
      const color = { r: 140, g: 20, b: 20, a: 255 };
      for (const sel of selection) {
        await api.viewer.setObjectState(sel.modelId, sel.ids, { color, opacity: 255, visible: true });
      }
    } catch (e) {
      console.warn("Coloring failed:", e);
    }
  }

  async function resetState() {
    try {
      const selection = await api.viewer.getSelection();
      if (!selection?.length) return;
      for (const sel of selection) {
        await api.viewer.setObjectState(sel.modelId, sel.ids, {
          color: { r: 255, g: 255, b: 255, a: 255 },
          opacity: 255,
          visible: true,
        });
      }
      setMsg("Viewer state reset for current selection.");
    } catch (e) {
      console.warn("Reset state failed:", e);
    }
  }

  /* -------------------------------------------------------------------------
     Export: Google Sheets
     ---------------------------------------------------------------------- */
  async function send() {
    if (!settings.scriptUrl || !settings.secret) {
      setTab("settings");
      setMsg("Fill Script URL and Shared Secret first.");
      return;
    }
    if (!rows.length) {
      setMsg("Nothing to export.");
      return;
    }

    // run validator (keeps TS and gives hints)
    const { errors } = validateRows(rows);
    if (errors.length) console.warn("Validation warnings:", errors);

    // add warnings + cleanup
    const withWarnings = rows.map((r) => {
      const copy: Row = { ...r };
      if (!r.GUID) copy.__warnings = "Missing GUID";
      return copy;
    });

    const skipNum = new Set<string>([
      "GUID",
      "GUID_IFC",
      "GUID_MS",
      "Project",
      "Name",
      "Type",
      "FileName",
    ]);

    const cleaned = withWarnings.map((r) => {
      const c: Row = {};
      for (const [k, v] of Object.entries(r)) {
        if (FORCE_TEXT_KEYS.has(k) && typeof v === "string" && !v.startsWith("'")) {
          c[k] = `'${v}`;
        } else if (typeof v === "string" && !skipNum.has(k) && numberLike(v)) {
          c[k] = normaliseNumString(v);
        } else {
          c[k] = v as string;
        }
      }
      return c;
    });

    const chosen = new Set<string>([
      ...LOCKED_ORDER,
      ...Array.from(selected),
      "__warnings",
    ].filter((k) => allKeys.includes(k) || LOCKED_ORDER.includes(k) || k === "__warnings"));

    const payload = cleaned.map((r) => orderRow(r, chosen));

    try {
      setBusy(true);
      setMsg("Sending rows to Google Sheet…");
      const res = await fetch(settings.scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: settings.secret, rows: payload }),
      });
      const data = await res.json();
      if (data?.ok) {
        setMsg(
          `✅ Added ${payload.length} row(s) to Google Sheet.` +
            (settings.autoColorize ? " Coloring selection dark red…" : "")
        );
        if (settings.autoColorize) await colorSelectionDarkRed();
      } else {
        setMsg(`❌ Error: ${data?.error || "unknown"}`);
      }
    } catch (e: any) {
      setMsg(`❌ Error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------------------------------------------------------
     Optional: CSV download (backup)
     ---------------------------------------------------------------------- */
  function downloadCSV() {
    if (!rows.length) return;
    const chosen = new Set<string>([...LOCKED_ORDER, ...Array.from(selected)]);
    const headers = Array.from(chosen).filter(
      (k) => allKeys.includes(k) || LOCKED_ORDER.includes(k)
    );

    const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
    const lines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => esc(r[h] || "")).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assembly-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* -------------------------------------------------------------------------
     Select helpers, group actions, presets
     ---------------------------------------------------------------------- */
  function toggleKey(k: string) {
    const next = new Set(selected);
    next.has(k) ? next.delete(k) : next.add(k);
    setSelected(next);
  }
  function selectAllVisible() {
    const next = new Set(selected);
    filteredKeys.forEach((k) => next.add(k));
    setSelected(next);
  }
  function clearAll() {
    setSelected(new Set());
  }
  function selectGroup(g: string) {
    const arr = groupedKeys.get(g) || [];
    const next = new Set(selected);
    arr.forEach((k) => next.add(k));
    setSelected(next);
  }
  function clearGroup(g: string) {
    const arr = groupedKeys.get(g) || [];
    const next = new Set(selected);
    arr.forEach((k) => next.delete(k));
    setSelected(next);
  }

  function presetRecommended() {
    const want = [
      "AssemblyBaseQuantities.Width",
      "IfcElementAssembly.AssemblyPlace",
      "IfcElementAssembly.PredefinedType",
      "Tekla_Assembly.AssemblyCast_unit_mark",
      "Tekla_Assembly.AssemblyCast_unit_bottom_elevation",
      "Tekla_Assembly.AssemblyCast_unit_top_elevation",
      "Tekla_Assembly.AssemblyCast_unit_position_code",
      "Tekla_Assembly.AssemblyCast_unit_weight",
      "Tekla_Assembly.Cast_unit_rebar_weight",
      "Tekla_Assembly.Cast_unit_type",
      "Tekla_Assembly.Control_number",
    ];
    const next = new Set(selected);
    want.forEach((k) => allKeys.includes(k) && next.add(k));
    setSelected(next);
  }
  function presetTekla() {
    const next = new Set(selected);
    allKeys.filter((k) => k.startsWith("Tekla_Assembly.")).forEach((k) => next.add(k));
    setSelected(next);
  }
  function presetIFCRef() {
    const want = ["IfcElementAssembly.AssemblyPlace", "IfcElementAssembly.PredefinedType"];
    const next = new Set(selected);
    want.forEach((k) => allKeys.includes(k) && next.add(k));
    setSelected(next);
  }

  /* -------------------------------------------------------------------------
     Render
     ---------------------------------------------------------------------- */
  const totalRows = rows.length;
  const groupsInOrder = useMemo(() => Array.from(groupedKeys.keys()).sort(byAlpha), [groupedKeys]);

  return (
    <div style={{ fontFamily: "Inter, system-ui, Arial, sans-serif", fontSize: 13, lineHeight: 1.25 }}>
      {/* Top bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button className={cls("border", "px-8 py-6", tab === "export" && "bg-[#0b5cab] text-white")} onClick={() => setTab("export")}>EXPORT</button>
        <button className={cls("border", "px-8 py-6", tab === "settings" && "bg-[#0b5cab] text-white")} onClick={() => setTab("settings")}>SETTINGS</button>
        <button className={cls("border", "px-8 py-6", tab === "about" && "bg-[#0b5cab] text-white")} onClick={() => setTab("about")}>ABOUT</button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="border px-8 py-6" onClick={discover} disabled={busy}>Discover fields</button>
          <input className="border px-8 py-6" placeholder="Filter columns…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200 }} />
          <button className="border px-8 py-6" onClick={selectAllVisible}>Select all</button>
          <button className="border px-8 py-6" onClick={clearAll}>Clear</button>
          <button className="border px-8 py-6" onClick={resetState}>Reset state</button>
          <button className="border px-8 py-6" onClick={downloadCSV} disabled={!totalRows}>Export CSV</button>
          <button
            className="px-10 py-6"
            style={{ borderRadius: 6, color: "white", background: "#198754", border: "1px solid #0d6efd22", fontWeight: 600 }}
            onClick={send}
            disabled={busy || !totalRows}
            title={!totalRows ? "Run Discover first" : ""}
          >
            {`Send to Google Sheet (${totalRows} row${totalRows === 1 ? "" : "s"})`}
          </button>
        </div>
      </div>

      {tab === "export" && (
        <div>
          <div style={{ color: "#0b5cab", minHeight: 20, marginBottom: 6 }}>{msg}</div>
          {progress.total > 0 && progress.cur < progress.total && (
            <div className="mb-2" style={{ color: "#666" }}>
              Processing model {progress.cur}/{progress.total}…
            </div>
          )}

          {/* Rühmad – iga set oma plokis */}
          <div className="grid" style={{ gridTemplateColumns: "1fr", gap: 10 }}>
            {groupsInOrder.map((g) => {
              const list = (groupedKeys.get(g) || []).filter((k) => filteredKeys.includes(k));
              if (!list.length) return null;

              return (
                <div key={g} className="border rounded p-10">
                  <div className="flex mb-2" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{g}</strong>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="border px-6 py-4" onClick={() => selectGroup(g)}>select</button>
                      <button className="border px-6 py-4" onClick={() => clearGroup(g)}>clear</button>
                      <span className="text-[#999]">all</span>
                    </div>
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
                    {list.map((k) => (
                      <label key={k} className="flex items-center gap-2">
                        <input type="checkbox" checked={selected.has(k)} onChange={() => toggleKey(k)} />
                        {k}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Presets */}
          <div className="mt-3 flex items-center gap-8" style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <span>Presets:</span>
            <button className="border px-8 py-6" onClick={presetRecommended}>Recommended</button>
            <button className="border px-8 py-6" onClick={presetTekla}>Tekla Assembly</button>
            <button className="border px-8 py-6" onClick={presetIFCRef}>IFC Reference</button>
          </div>

          <div className="mt-2 text-[#6a6a6a]">
            Locked order: <code>{LOCKED_ORDER.join(", ")}</code>. Selected: <strong>{selected.size}</strong>.
          </div>

          <div className="mt-4 text-[#7b7b7b]">created by <strong>Silver Vatsel</strong> | Consiva OÜ</div>
        </div>
      )}

      {tab === "settings" && (
        <div className="border rounded p-12" style={{ maxWidth: 760 }}>
          <div className="mb-3">
            <label className="block mb-1">Google Apps Script URL</label>
            <input className="border w-full px-10 py-6" value={settings.scriptUrl} onChange={(e) => setSettings({ scriptUrl: e.target.value })} placeholder="https://script.google.com/macros/s/XXXXX/exec" />
          </div>
          <div className="mb-3">
            <label className="block mb-1">Shared Secret</label>
            <input className="border w-full px-10 py-6" value={settings.secret} onChange={(e) => setSettings({ secret: e.target.value })} placeholder="secret string" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.autoColorize} onChange={(e) => setSettings({ autoColorize: e.target.checked })} />
            Color selection dark red after export
          </label>
        </div>
      )}

      {tab === "about" && (
        <div className="border rounded p-12" style={{ maxWidth: 760 }}>
          <h3 className="mb-2">Assembly Exporter</h3>
          <p className="mb-2">
            Export selected objects from Trimble Connect viewer to Google Sheets. Supports multi-model
            selections, Property Set Libraries, IFC reference fields and Tekla Assembly attributes.
          </p>
          <ul className="list-disc pl-5">
            <li>Project name via ProjectAPI</li>
            <li>Primary <code>GUID</code> + separate <code>GUID_IFC</code> and <code>GUID_MS</code></li>
            <li>Forced text for Tekla elevations (keeps +/−)</li>
            <li>Post-export dark red color; Reset state button</li>
            <li>CSV backup export</li>
          </ul>
          <div className="mt-4 text-[#7b7b7b]">created by <strong>Silver Vatsel</strong> | Consiva OÜ</div>
        </div>
      )}
    </div>
  );
};

export default AssemblyExporter;
