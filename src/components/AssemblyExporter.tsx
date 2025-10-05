import { useEffect, useMemo, useState } from "react";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";

/** Ainsad automaatsed veerud */
const MANDATORY_COLS = ["GUID", "Project"] as const;

type Row = Record<string, string>;
type Props = { api: WorkspaceAPI };

/* ------------ Abi ------------- */
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
  Object.values(g).forEach((arr) => arr.sort((a, b) => a.localeCompare(b)));
  return g;
}

/** Tasandab ühe objekti omadused + leiab GUID-i; kõik võtmed lisatakse ritta valikuliseks */
function flattenProps(obj: any, modelId: string, projectName: string): Row {
  const out: Row = {
    GUID: "",
    Project: String(projectName),
    ObjectId: String(obj?.id ?? ""), // valikuline (kuvatakse nimekirjas)
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
    if (Array.isArray(v)) v = v.map((x) => (x == null ? "" : String(x))).join(" | ");
    else if (typeof v === "object" && v !== null) v = JSON.stringify(v);
    const s = v == null ? "" : String(v);
    propMap.set(key, s);
    (out as any)[key] = s; // jätame dünaamilise veeru alles, et saaks valikus näidata
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

/* ============ Komponent ============ */
export default function AssemblyExporter({ api }: Props) {
  const [scriptUrl, setScriptUrl] = useState(localStorage.getItem("scriptUrl") || "");
  const [secret, setSecret] = useState(localStorage.getItem("secret") || "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU");

  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(JSON.parse(localStorage.getItem("fieldSel") || "[]")));
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const allKeys = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).sort(),
    [rows]
  );
  const grouped = useMemo(() => groupKeys(allKeys), [allKeys]);

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
      // vali kõik peale automaatsete
      const base = allKeys.filter((k) => !(MANDATORY_COLS as readonly string[]).includes(k));
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
    if (!scriptUrl || !secret) { setMsg("Täida URL ja Secret."); return; }
    if (!rows.length) { setMsg("Enne vajuta “Avasta väljad”."); return; }

    try {
      setBusy(true);
      setMsg("Saadan…");
      localStorage.setItem("scriptUrl", scriptUrl);
      localStorage.setItem("secret", secret);

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

  return (
    <div style={{ maxWidth: 760, padding: 16, fontFamily: "Inter, system-ui, Arial, sans-serif" }}>
      <h3 style={{ marginTop: 0 }}>Assembly Exporter</h3>

      {/* Seaded */}
      <div style={{ display: "grid", gap: 8 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Google Apps Script URL</div>
          <input
            value={scriptUrl}
            onChange={(e) => setScriptUrl(e.target.value)}
            placeholder="https://…/exec"
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Shared Secret</div>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>
      </div>

      {/* Avasta / otsing / globaalsed nupud */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button onClick={discover} disabled={busy} style={{ padding: "8px 12px" }}>
          {busy ? "…" : "Avasta väljad"}
        </button>
        <input
          placeholder="Otsi veergu…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <button onClick={() => selectAll(true)} disabled={!rows.length}>Vali kõik</button>
        <button onClick={() => selectAll(false)} disabled={!rows.length}>Tühjenda</button>
      </div>

      {/* Info */}
      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
        Alati lisatakse: {Array.from(MANDATORY_COLS).join(", ")}. Valitud lisavälju: {selected.size}.
      </div>

      {/* Väljade nimekiri */}
      <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 8, padding: 10, maxHeight: 380, overflow: "auto" }}>
        {!rows.length ? (
          <div style={{ opacity: 0.6 }}>Vajuta “Avasta väljad”.</div>
        ) : (
          Object.entries(grouped).map(([groupName, keys]) => {
            const keysShown = keys.filter(matches);
            if (!keysShown.length) return null;
            const allOn = keys.every((k) => selected.has(k));
            const noneOn = keys.every((k) => !selected.has(k));
            return (
              <div key={groupName} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <strong>{groupName}</strong>
                  <button onClick={() => toggleGroup(keys, true)} style={{ fontSize: 12, padding: "2px 6px" }}>
                    vali grupp
                  </button>
                  <button onClick={() => toggleGroup(keys, false)} style={{ fontSize: 12, padding: "2px 6px" }}>
                    eemalda grupp
                  </button>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>
                    {allOn ? "— kõik valitud" : noneOn ? "— mitte ühtegi" : "— osaliselt"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                  {keysShown.map((k) => (
                    <label key={k} style={{ display: "flex", gap: 6, fontSize: 13, alignItems: "center" }}>
                      <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} />
                      <span title={k} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {k}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Saatmine */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button onClick={send} disabled={busy || !rows.length} style={{ padding: "8px 12px" }}>
          {busy ? "Saatmine…" : "Saada valik Google Sheeti"}
        </button>
        {!!msg && <div style={{ fontSize: 13, opacity: 0.9 }}>{msg}</div>}
      </div>
    </div>
  );
}
