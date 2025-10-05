import React, { useEffect, useMemo, useState } from "react";

/** ---------- Utilid ---------- */
type Rows = Array<Record<string, string>>;

const MANDATORY_COLS = [
  "ObjectId",
  "ModelId",
  "GUID",
  "Name",
  "Type",
  "BLOCK",
] as const;

function sanitizeKey(s: string) {
  return String(s).replace(/\s+/g, "_").replace(/[^\w.-]/g, "").trim();
}

function flattenProps(r: any) {
  const row: Record<string, string> = {};
  row.ObjectId = String(r.objectId ?? "");
  row.ModelId = String(r.modelId ?? "");
  row.GUID = String(r.guid ?? "");
  row.Name = String(r.name ?? "");
  row.Type = String(r.type ?? "");
  row.BLOCK = String(r.block ?? "");

  for (const g of r.groups ?? []) {
    const gName = sanitizeKey(g.name || "Group");
    for (const p of g.properties ?? []) {
      const key = `${gName}.${sanitizeKey(p.name || "Prop")}`;
      let val = p?.value;
      if (Array.isArray(val)) val = val.map(v => (v == null ? "" : String(v))).join(" | ");
      else if (typeof val === "object" && val !== null) val = JSON.stringify(val);
      row[key] = val == null ? "" : String(val);
    }
  }
  return row;
}

async function getAllPropsForSelection(tc: any) {
  const sel = await tc.viewer.selection.getSelectedObjects();
  const out: Record<string, string>[] = [];

  for (const { modelId, objectId } of sel) {
    const meta = await tc.viewer.objects.getObjectMeta(modelId, objectId).catch(() => ({}));
    const props = await tc.viewer.properties
      .getObjectProperties(modelId, objectId, { includeInherited: true })
      .catch(() => ({ groups: [] as any[] }));

    out.push(
      flattenProps({
        objectId,
        modelId,
        guid: meta?.guid ?? props?.guid,
        name: meta?.name ?? props?.name,
        type: meta?.type ?? props?.type,
        block: meta?.block ?? props?.block,
        groups: (props as any)?.groups ?? [],
      })
    );
  }
  return out;
}

async function postToWorker(workerUrl: string, secret: string, rows: Rows) {
  const res = await fetch(workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, rows }),
  });
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  return res.json();
}

/** ---------- Kategooria ja filter ---------- */
type GroupedKeys = Record<
  string, // group name
  string[] // property keys in this group
>;

// heuristika: võtme eesliide enne punkti on grupp
function groupKeys(keys: string[]): GroupedKeys {
  const g: GroupedKeys = {};
  for (const k of keys) {
    if (MANDATORY_COLS.includes(k as any)) continue;
    const dot = k.indexOf(".");
    const grp = dot > 0 ? k.slice(0, dot) : "Other";
    if (!g[grp]) g[grp] = [];
    g[grp].push(k);
  }
  // stabiilne sort
  for (const grp of Object.keys(g)) g[grp].sort((a, b) => a.localeCompare(b));
  return g;
}

function usePersistentSelection(storageKey: string) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set<string>();
    try {
      return new Set<string>(JSON.parse(raw));
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
  }, [storageKey, selected]);
  return [selected, setSelected] as const;
}

/** ---------- UI komponent ---------- */
export default function AssemblyExporter({ tc }: { tc: any }) {
  const [workerUrl, setWorkerUrl] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [rows, setRows] = useState<Rows>([]);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string>("");

  // avasta mudeli/kausta kontekst salvestusvõtme jaoks
  const storageKey = useMemo(() => {
    const proj = (tc?.project?.id ?? "proj").toString();
    return `assembly-exporter-selection-${proj}`;
  }, [tc]);

  const [selected, setSelected] = usePersistentSelection(storageKey);
  const allKeys = useMemo(() => Array.from(new Set(rows.flatMap(r => Object.keys(r)))) , [rows]);
  const grouped = useMemo(() => groupKeys(allKeys), [allKeys]);

  const [filter, setFilter] = useState("");

  function toggleKey(k: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  function toggleGroup(grp: string, keys: string[], state: "all" | "none") {
    setSelected(prev => {
      const next = new Set(prev);
      for (const k of keys) {
        if (state === "all") next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }
  function selectAll(state: "all" | "none") {
    setSelected(() => {
      if (state === "none") return new Set<string>();
      const every = new Set<string>(allKeys.filter(k => !(MANDATORY_COLS as any).includes(k)));
      return every;
    });
  }

  async function handleDiscover() {
    try {
      setLoading(true);
      const r = await getAllPropsForSelection(tc);
      setRows(r);
      if (!r.length) setToastMsg("Valik on tühi.");
      else setToastMsg(`Leidsin ${r.length} objekti, veerge kokku ~${Array.from(new Set(r.flatMap(o => Object.keys(o)))).length}`);
    } catch (e: any) {
      setToastMsg(`Viga: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!rows.length) {
      setToastMsg("Enne vajuta 'Avasta väljad'.");
      return;
    }
    if (!workerUrl || !secret) {
      setToastMsg("Täida Worker URL ja Secret.");
      return;
    }
    try {
      setLoading(true);
      // filtreeri read vastavalt valikule
      const pick = (r: Record<string, string>) => {
        const out: Record<string, string> = {};
        // alati lisame baasveerud
        for (const k of MANDATORY_COLS) out[k] = r[k] ?? "";
        // lisatud linnukestega
        for (const k of selected) if (k in r) out[k] = r[k];
        return out;
      };
      const filtered = rows.map(pick);
      const res = await postToWorker(workerUrl, secret, filtered);
      setToastMsg(res?.ok ? `Edukalt lisatud ${res.inserted} rida Google Sheeti!` : `Viga: ${res?.error ?? "tundmatu"}`);
    } catch (e: any) {
      setToastMsg(`Viga: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  const selectedCount = selected.size + MANDATORY_COLS.length;
  const matchesFilter = (k: string) => !filter || k.toLowerCase().includes(filter.toLowerCase());

  return (
    <div className="p-4 space-y-4" style={{ maxWidth: 560 }}>
      <h2 className="text-xl font-semibold">Assembly Exporter</h2>

      <div className="space-y-2">
        <label className="text-sm">Google Apps Script URL</label>
        <input className="w-full border rounded p-2" placeholder="https://xxx.workers.dev" value={workerUrl} onChange={e => setWorkerUrl(e.target.value)} />
        <label className="text-sm">Shared Secret</label>
        <input className="w-full border rounded p-2" type="password" value={secret} onChange={e => setSecret(e.target.value)} />
      </div>

      <div className="border rounded p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="font-medium">Väljade valik</div>
          <div className="text-xs opacity-70">Valitud veerge: {selectedCount}</div>
        </div>

        <div className="flex gap-2 mb-2">
          <button className="border rounded px-2 py-1" onClick={() => selectAll("all")}>Vali kõik</button>
          <button className="border rounded px-2 py-1" onClick={() => selectAll("none")}>Tühjenda</button>
          <input className="flex-1 border rounded px-2 py-1" placeholder="Otsi veergu (nt Tekla_Assembly.AssemblyCast_unit_weight)" value={filter} onChange={e => setFilter(e.target.value)} />
          <button className="border rounded px-2 py-1" onClick={handleDiscover} disabled={loading}>{loading ? "..." : "Avasta väljad"}</button>
        </div>

        <div className="text-xs mb-2">
          Alati lisatakse: {MANDATORY_COLS.join(", ")}
        </div>

        {/* Grupeeritud nimekiri */}
        <div className="max-h-64 overflow-auto border rounded p-2 space-y-3">
          {Object.keys(grouped).length === 0 && <div className="text-sm opacity-70">Vajuta “Avasta väljad”.</div>}
          {Object.entries(grouped).map(([grp, keys]) => {
            const keysShown = keys.filter(matchesFilter);
            if (!keysShown.length) return null;
            const allInGroupSelected = keys.every(k => selected.has(k));
            const noneInGroupSelected = keys.every(k => !selected.has(k));
            return (
              <div key={grp}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="font-medium">{grp}</div>
                  <button className="text-xs border rounded px-2 py-0.5" onClick={() => toggleGroup(grp, keys, "all")}>vali grupp</button>
                  <button className="text-xs border rounded px-2 py-0.5" onClick={() => toggleGroup(grp, keys, "none")}>eemalda grupp</button>
                  <span className="text-xs opacity-60">{allInGroupSelected ? "— kõik valitud" : noneInGroupSelected ? "— mitte ühtegi" : "— osaliselt"}</span>
                </div>
                <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                  {keysShown.map(k => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selected.has(k)} onChange={() => toggleKey(k)} />
                      <span title={k} className="truncate">{k}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button className="bg-blue-600 text-white rounded px-4 py-2" onClick={handleSend} disabled={loading}>
        {loading ? "Saatmine..." : "Saada valik Google Sheeti"}
      </button>

      {!!toastMsg && (
        <div className="mt-2 text-sm bg-green-50 border border-green-200 rounded p-2">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
