import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

export interface MarkupCreatorProps {
  api: any;
  onError?: (error: string) => void;
}

interface PropertyField {
  key: string;
  label: string;
  selected: boolean;
  group?: string;
  hasData?: boolean;
}

interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warn" | "error" | "debug";
  message: string;
}

interface Row {
  [key: string]: string;
}

interface Settings {
  delimiter: string;
  selectedFields: string[];
}

const COMPONENT_VERSION = "7.8.1";
const BUILD_DATE = new Date().toISOString().split("T")[0];
const MARKUP_COLOR = "FF0000";
const DEFAULTS: Settings = { delimiter: " | ", selectedFields: [] };

function useSettings(allFields: PropertyField[]) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = window.localStorage?.getItem?.("markupCreatorSettings");
      if (!raw) return DEFAULTS;
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULTS, ...parsed };
    } catch {
      return DEFAULTS;
    }
  });

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (next.selectedFields) {
          const validKeys = new Set(allFields.map((f) => f.key));
          next.selectedFields = next.selectedFields.filter((k) => validKeys.has(k));
        }
        window.localStorage?.setItem?.("markupCreatorSettings", JSON.stringify(next));
        return next;
      });
    },
    [allFields]
  );

  return [settings, update] as const;
}

function sanitizeKey(s: string): string {
  return !s ? "" : String(s).replace(/[\s\-_.+()[\]{}]/g, "").trim();
}

function classifyGuid(guid: string): "IFC" | "MS" | "OTHER" {
  if (!guid) return "OTHER";
  const s = String(guid).toLowerCase();
  if (/^[\da-f]{4}[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s)) return "IFC";
  if (/^\d{20,}$/.test(s)) return "MS";
  return "OTHER";
}

async function getPresentationLayerString(api: any, modelId: string, runtimeId: number): Promise<string> {
  try {
    const layers = await api?.viewer?.getPresentationLayers?.(modelId, [runtimeId]);
    if (Array.isArray(layers) && layers[0] && Array.isArray(layers[0])) {
      return layers[0].map((l: any) => String(l?.name || l)).join(" | ");
    }
  } catch {}
  return "";
}

async function getReferenceObjectInfo(api: any, modelId: string, runtimeId: number) {
  const result = { fileName: "", fileFormat: "", commonType: "", guidIfc: "", guidMs: "" };
  try {
    const refObj = await api?.viewer?.getReferenceObject?.(modelId, runtimeId);
    if (!refObj) return result;
    result.fileName = String(refObj.file?.name || "");
    result.fileFormat = String(refObj.fileFormat || "");
    result.commonType = String(refObj.commonType || "");
    if (refObj.guid) {
      const cls = classifyGuid(refObj.guid);
      if (cls === "IFC") result.guidIfc = refObj.guid;
      if (cls === "MS") result.guidMs = refObj.guid;
    }
  } catch {}
  return result;
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
    Name: String(obj?.name || ""),
    Type: String(obj?.type || "Unknown"),
    ObjectId: String(obj?.id || ""), // Kriitiline: alati olemas
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
    const s = val == null ? "" : Array.isArray(val) ? val.map(String).join(" | ") : String(val);
    propMap.set(key, s);
    out[key] = s;
  };

  if (Array.isArray(obj?.properties)) {
    obj.properties.forEach((set: any) => {
      const setName = set?.name || "Unknown";
      (set?.properties || []).forEach((prop: any) => {
        push(setName, prop?.name || "Unknown", prop?.displayValue ?? prop?.value);
      });
    });
  }

  let guidIfc = "", guidMs = "";
  for (const [k, v] of propMap) {
    if (!/guid|globalid/i.test(k)) continue;
    const cls = classifyGuid(v);
    if (cls === "IFC" && !guidIfc) guidIfc = v;
    if (cls === "MS" && !guidMs) guidMs = v;
  }

  try {
    const meta = await api?.viewer?.getObjectMetadata?.(modelId, [obj?.id]);
    const g = String(meta?.[0]?.globalId || "");
    if (g) { out.GUID_MS = g; guidMs = g; }
  } catch {}

  if (!guidIfc && obj.id) {
    try {
      const externalIds = await api.viewer.convertToObjectIds(modelId, [obj.id]);
      if (externalIds[0] && classifyGuid(externalIds[0]) === "IFC") guidIfc = externalIds[0];
    } catch {}
  }

  const rid = Number(obj?.id);
  if (Number.isFinite(rid)) {
    if (![...propMap.keys()].some(k => k.toLowerCase().startsWith("presentation_layers."))) {
      const layerStr = await getPresentationLayerString(api, modelId, rid);
      if (layerStr) out["Presentation_Layers.Layer"] = layerStr;
    }

    const hasRef = [...propMap.keys()].some(k => k.toLowerCase().startsWith("referenceobject."));
    if (!hasRef) {
      const ref = await getReferenceObjectInfo(api, modelId, rid);
      if (ref.fileName) out["ReferenceObject.File_Name"] = ref.fileName;
      if (ref.fileFormat) out["ReferenceObject.File_Format"] = ref.fileFormat;
      if (ref.commonType) out["ReferenceObject.Common_Type"] = ref.commonType;
      if (!guidIfc && ref.guidIfc) guidIfc = ref.guidIfc;
      if (!guidMs && ref.guidMs) guidMs = ref.guidMs;
    }
  }

  out.GUID_IFC = guidIfc;
  out.GUID_MS = guidMs;
  out.GUID = guidIfc || guidMs || "";
  return out;
}

async function getSelectedObjects(api: any): Promise<Array<{ modelId: string; objects: any[] }>> {
  const mos = await api?.viewer?.getObjects?.({ selected: true });
  if (!Array.isArray(mos) || !mos.length) return [];
  return mos.map((mo: any) => ({ modelId: String(mo.modelId), objects: mo.objects || [] }));
}

async function buildModelNameMap(api: any, modelIds: string[]) {
  const map = new Map<string, string>();
  try {
    const list = await api?.viewer?.getModels?.();
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

async function getProjectName(api: any): Promise<string> {
  try {
    const proj = typeof api?.project?.getProject === "function" ? await api.project.getProject() : api?.project || {};
    return String(proj?.name || "");
  } catch {
    return "";
  }
}

const groupKeys = (keys: string[]): Map<string, string[]> => {
  const groups = new Map<string, string[]>();
  keys.forEach((key) => {
    let group = "Other";
    if (key.startsWith("Tekla_Assembly.")) group = "Tekla_Assembly";
    else if (key.startsWith("Nordec_Dalux.")) group = "Nordec_Dalux";
    else if (key.startsWith("IfcElementAssembly.")) group = "IfcElementAssembly";
    else if (key.startsWith("AssemblyBaseQuantities.")) group = "AssemblyBaseQuantities";
    else if (["GUID_IFC", "GUID_MS", "GUID", "ModelId", "Name", "Type", "ObjectId", "Project", "FileName"].includes(key))
      group = "Standard";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(key);
  });
  return groups;
};

export default function MarkupCreator({ api, onError }: MarkupCreatorProps) {
  const [allFields, setAllFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupIds, setMarkupIds] = useState<number[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [previewMarkup, setPreviewMarkup] = useState<string>("");
  const [draggedField, setDraggedField] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const listenerRegistered = useRef(false);

  const [settings, updateSettings] = useSettings(allFields);

  const addLog = useCallback((message: string, level: "info" | "success" | "warn" | "error" | "debug" = "info") => {
    const timestamp = new Date().toLocaleTimeString("et-EE", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => (prev.length > 500 ? prev.slice(-500) : [...prev, { timestamp, level, message }]));
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  }, []);

  // ✅ Reaalajas valiku kuulamine + automaatne uuendamine
  useEffect(() => {
    if (!api?.viewer || listenerRegistered.current) return;

    const loadSelectionData = async () => {
      try {
        const selectedWithBasic = await getSelectedObjects(api);
        if (!selectedWithBasic?.length) {
          setAllFields([]);
          setPreviewMarkup("");
          addLog("⚠️ Valik tühi", "warn");
          return;
        }

        const projectName = await getProjectName(api);
        const modelIds = selectedWithBasic.map((s) => s.modelId);
        const nameMap = await buildModelNameMap(api, modelIds);
        const allRows: Row[] = [];

        for (const { modelId, objects } of selectedWithBasic) {
          const ids = objects.map((o: any) => o?.id || o).filter(Boolean);
          if (!ids.length) continue;
          try {
            const fullObjs = await api.viewer.getObjectProperties(modelId, ids, { includeHidden: true });
            const flattened = await Promise.all(fullObjs.map((o: any) => flattenProps(o, modelId, projectName, nameMap, api)));
            allRows.push(...flattened);
          } catch (err: any) {
            addLog(`Viga: ${err.message}`, "error");
          }
        }

        if (!allRows.length) {
          addLog("❌ Andmed puuduvad", "error");
          return;
        }

        const allKeys = Array.from(new Set(allRows.flatMap(Object.keys))).sort();
        const groups = groupKeys(allKeys);
        const groupOrder = ["Standard", "Tekla_Assembly", "Nordec_Dalux", "IfcElementAssembly", "AssemblyBaseQuantities", "Other"];
        const newFields: PropertyField[] = [];
        let fieldsWithData = 0;

        groupOrder.forEach((groupName) => {
          (groups.get(groupName) || []).forEach((key) => {
            const hasData = allRows.some((r) => r[key]?.trim());
            if (hasData) fieldsWithData++;
            const isSelected = settings.selectedFields.length
              ? settings.selectedFields.includes(key)
              : key === "Tekla_Assembly.AssemblyCast_unit_Mark" && hasData;

            newFields.push({ key, label: key, selected: isSelected, group: groupName, hasData });
          });
        });

        setAllFields(newFields);
        addLog(`✅ ${allRows.length} objekti, ${newFields.filter(f => f.selected).length} välja`, "success");

        // Eelvaade
        const selected = newFields.filter(f => f.selected);
        if (selected.length) {
          const row = allRows.find(r => selected.some(f => r[f.key]?.trim())) || allRows[0];
          const values = selected.map(f => row[f.key] || "").filter(v => v.trim());
          setPreviewMarkup(values.join(settings.delimiter));
        } else {
          setPreviewMarkup("");
        }

      } catch (err: any) {
        addLog(`❌ Laadimine ebaõnnestus: ${err.message}`, "error");
      }
    };

    const handleSelection = () => loadSelectionData();
    api.viewer.addOnSelectionChanged?.(handleSelection);
    listenerRegistered.current = true;
    loadSelectionData();

    return () => {
      api.viewer.removeOnSelectionChanged?.(handleSelection);
      listenerRegistered.current = false;
    };
  }, [api, addLog, settings]);

  // ✅ Drag & Drop – kompaktne ja ilus
  const selectedFields = useMemo(() => allFields.filter(f => f.selected), [allFields]);
  const orderedFields = useMemo(() => {
    if (!settings.selectedFields.length) return selectedFields;
    return settings.selectedFields
      .map(k => selectedFields.find(f => f.key === k))
      .filter(Boolean) as PropertyField[];
  }, [selectedFields, settings.selectedFields]);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    setDraggedField(key);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (!draggedField || draggedField === targetKey) return;

    const newOrder = orderedFields.map(f => f.key);
    const fromIdx = newOrder.indexOf(draggedField);
    const toIdx = newOrder.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;

    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedField);
    updateSettings({ selectedFields: newOrder });
    setDraggedField(null);
    addLog(`✅ "${draggedField}" liigutatud`, "success");
  };

  const moveField = (key: string, dir: "up" | "down") => {
    const idx = orderedFields.findIndex(f => f.key === key);
    if (idx === -1 || (dir === "up" && idx === 0) || (dir === "down" && idx === orderedFields.length - 1)) return;
    const newOrder = orderedFields.map(f => f.key);
    const target = dir === "up" ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    updateSettings({ selectedFields: newOrder });
  };

  const toggleField = (key: string) => {
    const updated = allFields.map(f => f.key === key ? { ...f, selected: !f.selected } : f);
    const newSelected = updated.filter(f => f.selected).map(f => f.key);
    updateSettings({ selectedFields: newSelected });
    setAllFields(updated);
  };

  // ✅ createMarkups – alati värske valik
  const createMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔄 ALUSTAN VÄRSKE VALIKU KONTROLLI", "info");

    const fresh = await getSelectedObjects(api);
    if (!fresh?.length) {
      addLog("❌ Ühtegi objekti pole valitud", "error");
      return;
    }

    const projectName = await getProjectName(api);
    const modelIds = fresh.map(s => s.modelId);
    const nameMap = await buildModelNameMap(api, modelIds);
    const rows: Row[] = [];

    for (const { modelId, objects } of fresh) {
      const ids = objects.map((o: any) => o?.id || o).filter(Boolean);
      if (!ids.length) continue;
      try {
        const objs = await api.viewer.getObjectProperties(modelId, ids, { includeHidden: true });
        const flat = await Promise.all(objs.map(o => flattenProps(o, modelId, projectName, nameMap, api)));
        rows.push(...flat);
      } catch (err: any) {
        addLog(`Viga: ${err.message}`, "error");
      }
    }

    if (!rows.length) {
      addLog("❌ Andmed puuduvad", "error");
      return;
    }

    const selected = orderedFields;
    if (!selected.length) {
      addLog("❌ Valitud väljad puuduvad", "error");
      return;
    }

    addLog(`✅ Loen ${rows.length} objektile markupid`, "success");
    setIsLoading(true);

    try {
      const markups: any[] = [];
      const modelId = rows[0].ModelId;
      const ids = rows.map(r => Number(r.ObjectId)).filter(Boolean);
      const bBoxes = await api.viewer?.getObjectBoundingBoxes?.(modelId, ids).catch(() => []);
      const bBoxMap = new Map(bBoxes.map((b: any) => [b.id, b]));

      for (const row of rows) {
        const values = selected.map(f => row[f.key] || "").filter(v => v.trim());
        if (!values.length) continue;

        const bBox = bBoxMap.get(Number(row.ObjectId));
        const mid = bBox?.boundingBox
          ? {
              x: (bBox.boundingBox.min.x + bBox.boundingBox.max.x) / 2,
              y: (bBox.boundingBox.min.y + bBox.boundingBox.max.y) / 2,
              z: (bBox.boundingBox.min.z + bBox.boundingBox.max.z) / 2,
            }
          : { x: 0, y: 0, z: 0 };

        markups.push({
          text: values.join(settings.delimiter),
          start: { positionX: mid.x * 1000, positionY: mid.y * 1000, positionZ: mid.z * 1000 },
          end: { positionX: mid.x * 1000, positionY: mid.y * 1000, positionZ: mid.z * 1000 },
          color: MARKUP_COLOR,
        });
      }

      if (!markups.length) {
        addLog("❌ Ühtegi markupit ei loodud", "error");
        return;
      }

      const result = await api.markup?.addTextMarkup?.(markups);
      const ids = (Array.isArray(result) ? result : []).map((i: any) => i?.id).filter(Boolean);
      if (ids.length) {
        setMarkupIds(ids);
        addLog(`✅ Loodi ${ids.length} markupit!`, "success");
      }
    } catch (err: any) {
      addLog(`❌ Viga: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [api, addLog, orderedFields, settings.delimiter]);

  const handleRemoveAllMarkups = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await api.markup?.getTextMarkups?.();
      const ids = (all || []).map((m: any) => m?.id).filter(Boolean);
      if (ids.length) {
        await api.markup?.removeMarkups?.(ids);
        addLog(`✅ Kustutatud ${ids.length} markupit`, "success");
        setMarkupIds([]);
      } else {
        addLog("ℹ️ Markupeid pole", "warn");
      }
    } catch (err: any) {
      addLog(`❌ Viga: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [api, addLog]);

  const grouped = useMemo(() => {
    const g = new Map<string, PropertyField[]>();
    allFields.forEach(f => {
      const grp = f.group || "Other";
      if (!g.has(grp)) g.set(grp, []);
      g.get(grp)!.push(f);
    });
    return g;
  }, [allFields]);

  return (
    <div style={{ padding: 12, fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#f5f5f5" }}>
      <div style={{ marginBottom: 12, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#333", fontWeight: 600 }}>
          Valitud: {allFields.length ? orderedFields.length : 0} välja
        </div>
      </div>

      <div style={{ border: "1px solid #e0e0e0", borderRadius: 6, padding: 12, backgroundColor: "#fff", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#333" }}>⚙️ Seaded</h3>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 500, display: "block", marginBottom: 4, color: "#555" }}>Eraldaja:</label>
          <input
            type="text"
            value={settings.delimiter}
            onChange={e => updateSettings({ delimiter: e.target.value })}
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #d0d0d0", borderRadius: 4, fontSize: 11 }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 500, display: "block", marginBottom: 4, color: "#555" }}>Eelvaade:</label>
          <div style={{ fontFamily: "monospace", fontSize: 11, backgroundColor: "#fafbfc", padding: 8, borderRadius: 4, border: "1px solid #e0e0e0", minHeight: 32, wordBreak: "break-all" }}>
            {previewMarkup || "(vali objektid)"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={createMarkups} disabled={isLoading || !orderedFields.length} style={{ flex: 1, padding: "8px", backgroundColor: isLoading || !orderedFields.length ? "#ccc" : "#1976d2", color: "#fff", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            Loo
          </button>
          <button onClick={handleRemoveAllMarkups} disabled={isLoading} style={{ padding: "6px 8px", backgroundColor: "#d32f2f", color: "#fff", border: "none", borderRadius: 3, fontSize: 9 }}>
            Kustuta
          </button>
        </div>
      </div>

      <div style={{ flex: 1, border: "1px solid #e0e0e0", borderRadius: 6, padding: 12, backgroundColor: "#fff", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#333" }}>Omadused</h3>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {allFields.length === 0 ? (
            <p style={{ color: "#999", fontSize: 11, margin: 0 }}>Vali objektid 3D vaates...</p>
          ) : (
            Array.from(grouped.entries()).map(([group, fields]) => (
              <div key={group} style={{ marginBottom: 12 }}>
                <div style={{ padding: "6px 8px", backgroundColor: "#f5f5f5", borderRadius: 4, fontWeight: 600, fontSize: 11, color: "#333", border: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between" }}>
                  <span>{group}</span>
                  <span style={{ color: "#666" }}>{fields.filter(f => f.selected).length}/{fields.length}</span>
                </div>
                {fields.map((f) => {
                  const idx = orderedFields.findIndex(x => x.key === f.key);
                  const isFirst = idx === 0;
                  const isLast = idx === orderedFields.length - 1;
                  return (
                    <div
                      key={f.key}
                      draggable={f.selected}
                      onDragStart={(e) => handleDragStart(e, f.key)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, f.key)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", margin: "2px 0", borderRadius: 4,
                        backgroundColor: f.selected ? "#e3f2fd" : "transparent",
                        border: f.selected ? "1px solid #1976d2" : draggedField === f.key ? "1px dashed #1976d2" : "1px solid transparent",
                        opacity: f.hasData ? 1 : 0.6,
                        cursor: f.selected ? "grab" : "default",
                      }}
                    >
                      <span style={{ fontSize: 10, color: f.selected ? "#1976d2" : "#ccc" }}>⋮⋮</span>
                      <input type="checkbox" checked={f.selected} onChange={() => toggleField(f.key)} style={{ cursor: "pointer" }} />
                      <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: "#0066cc" }}>{f.label}</span>
                      {f.selected && (
                        <div style={{ display: "flex", gap: 2 }}>
                          {!isFirst && <button onClick={() => moveField(f.key, "up")} style={{ padding: "2px 6px", fontSize: 10, background: "#f0f0f0", border: "1px solid #d0d0d0", borderRadius: 3 }}>↑</button>}
                          {!isLast && <button onClick={() => moveField(f.key, "down")} style={{ padding: "2px 6px", fontSize: 10, background: "#f0f0f0", border: "1px solid #d0d0d0", borderRadius: 3 }}>↓</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, overflow: "hidden", fontFamily: "monospace", fontSize: 10, maxHeight: showDebugLog ? 120 : 28, transition: "max-height 0.2s" }}>
        <div onClick={() => setShowDebugLog(!showDebugLog)} style={{ padding: "6px 10px", backgroundColor: "#f5f5f5", cursor: "pointer", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
          <span>{showDebugLog ? "▼" : "▶"} LOG ({logs.length})</span>
          {showDebugLog && <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(logs.map(l => `[${l.timestamp}] ${l.message}`).join("\n")); addLog("LOG kopeeritud", "success"); }} style={{ fontSize: 8, padding: "2px 6px", background: "#e0e0e0", border: "none", borderRadius: 2 }}>Kopeeri</button>}
        </div>
        {showDebugLog && <div style={{ maxHeight: 100, overflowY: "auto", padding: "4px 8px", backgroundColor: "#fafafa" }}>
          {logs.map((l, i) => <div key={i} style={{ color: { success: "#2e7d32", error: "#c62828", warn: "#f57f17", info: "#0277bd", debug: "#666" }[l.level] || "#333" }}>[{l.timestamp}] {l.message}</div>)}
        </div>}
      </div>

      <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #e0e0e0", textAlign: "center", fontSize: 10, color: "#999" }}>
        MARKUP GENERATOR {COMPONENT_VERSION} • {BUILD_DATE}
      </div>
    </div>
  );
}
