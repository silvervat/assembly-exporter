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

const COMPONENT_VERSION = "8.0.0";
const BUILD_DATE = new Date().toISOString().split("T")[0];
const MARKUP_COLOR = "FF0000";
const DEFAULTS: Settings = { delimiter: " | ", selectedFields: [] };

function useSettings(allFields: PropertyField[]) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem("markupCreatorSettings");
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (next.selectedFields) {
          const valid = new Set(allFields.map((f) => f.key));
          next.selectedFields = next.selectedFields.filter((k) => valid.has(k));
        }
        localStorage.setItem("markupCreatorSettings", JSON.stringify(next));
        return next;
      });
    },
    [allFields]
  );

  return [settings, update] as const;
}

function classifyGuid(guid: string): "IFC" | "MS" | "OTHER" {
  if (!guid) return "OTHER";
  const s = guid.toLowerCase();
  if (/^[\da-f]{22}$/.test(s.replace(/-/g, ""))) return "IFC";
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
    GUID: "", GUID_IFC: "", GUID_MS: "", Project: projectName, ModelId: modelId,
    FileName: modelNameById.get(modelId) || "", Name: obj?.name || "", Type: obj?.type || "Unknown",
    ObjectId: String(obj?.id || "")
  };

  const push = (group: string, name: string, val: unknown) => {
    const key = `${sanitizeKey(group)}.${sanitizeKey(name)}`.replace(/^\./, "");
    const v = val == null ? "" : Array.isArray(val) ? val.map(String).join(" | ") : String(val);
    out[key] = v;
  };

  (obj?.properties || []).forEach((set: any) => {
    (set?.properties || []).forEach((p: any) => push(set.name || "Unknown", p.name || "Unknown", p.displayValue ?? p.value));
  });

  let guidIfc = "", guidMs = "";
  Object.entries(out).forEach(([k, v]) => {
    if (!/guid|globalid/i.test(k)) return;
    const cls = classifyGuid(v);
    if (cls === "IFC" && !guidIfc) guidIfc = v;
    if (cls === "MS" && !guidMs) guidMs = v;
  });

  const rid = Number(obj?.id);
  if (Number.isFinite(rid)) {
    try { const meta = await api.viewer.getObjectMetadata(modelId, [rid]); if (meta?.[0]?.globalId) guidMs = meta[0].globalId; } catch {}
    if (!guidIfc) try { const ids = await api.viewer.convertToObjectIds(modelId, [rid]); if (ids[0] && classifyGuid(ids[0]) === "IFC") guidIfc = ids[0]; } catch {}

    if (!Object.keys(out).some(k => k.startsWith("Presentation_Layers"))) {
      const layers = await api.viewer.getPresentationLayers(modelId, [rid]).catch(() => []);
      if (layers?.[0]?.length) out["Presentation_Layers.Layer"] = layers[0].map((l: any) => l.name || l).join(" | ");
    }

    if (!Object.keys(out).some(k => k.startsWith("ReferenceObject"))) {
      const ref = await api.viewer.getReferenceObject(modelId, rid).catch(() => ({}));
      if (ref.file?.name) out["ReferenceObject.File_Name"] = ref.file.name;
      if (ref.fileFormat) out["ReferenceObject.File_Format"] = ref.fileFormat;
      if (ref.commonType) out["ReferenceObject.Common_Type"] = ref.commonType;
      if (ref.guid) {
        const cls = classifyGuid(ref.guid);
        if (cls === "IFC") guidIfc = ref.guid;
        if (cls === "MS") guidMs = ref.guid;
      }
    }
  }

  out.GUID_IFC = guidIfc;
  out.GUID_MS = guidMs;
  out.GUID = guidIfc || guidMs || "";
  return out;
}

async function getSelectedObjects(api: any) {
  const mos = await api?.viewer?.getObjects?.({ selected: true });
  return (Array.isArray(mos) ? mos : []).map((m: any) => ({ modelId: String(m.modelId), objects: m.objects || [] }));
}

async function buildModelNameMap(api: any, ids: string[]) {
  const map = new Map<string, string>();
  try { (await api.viewer.getModels?.() || []).forEach((m: any) => m.id && m.name && map.set(String(m.id), String(m.name))); } catch {}
  for (const id of new Set(ids)) if (!map.has(id)) try { const f = await api.viewer.getLoadedModel(id); const n = f?.name || f?.file?.name; if (n) map.set(id, n); } catch {}
  return map;
}

async function getProjectName(api: any) {
  try { const p = typeof api.project?.getProject === "function" ? await api.project.getProject() : api.project || {}; return p.name || ""; } catch { return ""; }
}

const groupKeys = (keys: string[]) => {
  const g = new Map<string, string[]>();
  keys.forEach((k) => {
    let grp = "Other";
    if (k.startsWith("Tekla_Assembly.")) grp = "Tekla_Assembly";
    else if (k.startsWith("Nordec_Dalux.")) grp = "Nordec_Dalux";
    else if (k.startsWith("IfcElementAssembly.")) grp = "IfcElementAssembly";
    else if (k.startsWith("AssemblyBaseQuantities.")) grp = "AssemblyBaseQuantities";
    else if (["GUID_IFC","GUID_MS","GUID","ModelId","Name","Type","ObjectId","Project","FileName"].includes(k)) grp = "Standard";
    if (!g.has(grp)) g.set(grp, []);
    g.get(grp)!.push(k);
  });
  return g;
};

const sanitizeKey = (s: string) => String(s).replace(/[\s\-_.+()[\]{}]/g, "").trim();

export default function MarkupCreator({ api }: MarkupCreatorProps) {
  const [allFields, setAllFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupIds, setMarkupIds] = useState<number[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [previewMarkup, setPreviewMarkup] = useState("");
  const [draggedField, setDraggedField] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const listenerRegistered = useRef(false);

  const [settings, updateSettings] = useSettings(allFields);

  const addLog = useCallback((message: string, level: "info" | "success" | "warn" | "error" | "debug" = "info") => {
    const timestamp = new Date().toLocaleTimeString("et-EE", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => (prev.length > 500 ? prev.slice(-500) : [...prev, { timestamp, level, message }]));
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  }, []);

  useEffect(() => {
    addLog(`🚀 MarkupCreator v${COMPONENT_VERSION} laaditud`, "info");
  }, [addLog]);

  // Reaalajas valiku kuulamine + automaatne uuendamine
  useEffect(() => {
    if (!api?.viewer || listenerRegistered.current) return;

    const loadSelectionData = async () => {
      try {
        const selectedWithBasic = await getSelectedObjects(api);
        if (!selectedWithBasic?.length) {
          setAllFields([]);
          setPreviewMarkup("");
          addLog("❌ Valitud objektid puuduvad", "warn");
          return;
        }

        const projectName = await getProjectName(api);
        const modelIds = selectedWithBasic.map((s) => s.modelId);
        const nameMap = await buildModelNameMap(api, modelIds);
        const allRows: Row[] = [];

        for (const selection of selectedWithBasic) {
          const modelId = selection.modelId;
          const objectRuntimeIds = selection.objects.map((o: any) => o?.id || o).filter(Boolean);
          if (!objectRuntimeIds.length) continue;

          try {
            const fullObjects = await api.viewer.getObjectProperties(modelId, objectRuntimeIds, { includeHidden: true });
            const flattened = await Promise.all(
              fullObjects.map((o: any) => flattenProps(o, modelId, projectName, nameMap, api))
            );
            allRows.push(...flattened);
          } catch (err: any) {
            addLog(`Viga: ${err?.message}`, "error");
          }
        }

        if (allRows.length === 0) {
          addLog("❌ Andmeid ei leitud", "error");
          return;
        }

        addLog(`✅ Laaditud ${allRows.length} objekti`, "success");

        const allKeys = Array.from(new Set(allRows.flatMap((r) => Object.keys(r)))).sort();
        const groups = groupKeys(allKeys);
        const groupOrder = ["Standard", "Tekla_Assembly", "Nordec_Dalux", "IfcElementAssembly", "AssemblyBaseQuantities", "Other"];
        const newFields: PropertyField[] = [];
        let fieldsWithData = 0;

        groupOrder.forEach((groupName) => {
          const groupKeys = groups.get(groupName) || [];
          groupKeys.forEach((key) => {
            const hasData = allRows.some((row) => row[key]?.trim());
            if (hasData) fieldsWithData++;

            const isSelected = settings.selectedFields.length > 0
              ? settings.selectedFields.includes(key)
              : key === "Tekla_Assembly.AssemblyCast_unit_Mark" && hasData;

            newFields.push({
              key,
              label: key,
              selected: isSelected,
              group: groupName,
              hasData,
            });
          });
        });

        if (mountedRef.current) {
          setAllFields(newFields);
          addLog(`✅ Väljad uuendatud: ${newFields.filter((f) => f.selected).length} valitud`, "success");
        }

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
        addLog(`❌ Valimise laadimine ebaõnnestus: ${err?.message}`, "error");
      }
    };

    const handleSelectionChanged = () => loadSelectionData();
    api.viewer.addOnSelectionChanged?.(handleSelectionChanged);
    listenerRegistered.current = true;
    loadSelectionData();

    return () => {
      api.viewer.removeOnSelectionChanged?.(handleSelectionChanged);
      listenerRegistered.current = false;
    };
  }, [api, addLog, settings]);

  const getOrderedSelectedFields = useCallback(() => {
    const selected = allFields.filter(f => f.selected);
    if (!selected.length) return [];
    if (settings.selectedFields.length > 0) {
      return settings.selectedFields.map(k => selected.find(f => f.key === k)).filter(Boolean) as PropertyField[];
    }
    return selected;
  }, [allFields, settings.selectedFields]);

  const handleDragStart = (field: PropertyField) => setDraggedField(field.key);
  const handleDrop = (targetField: PropertyField) => {
    if (!draggedField || draggedField === targetField.key) {
      setDraggedField(null);
      return;
    }
    const ordered = getOrderedSelectedFields();
    const draggedIdx = ordered.findIndex(f => f.key === draggedField);
    const targetIdx = ordered.findIndex(f => f.key === targetField.key);
    if (draggedIdx === -1 || targetIdx === -1) {
      setDraggedField(null);
      return;
    }
    const newOrder = ordered.map(f => f.key);
    newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, draggedField);
    updateSettings({ selectedFields: newOrder });
    setDraggedField(null);
    addLog(`✅ "${draggedField}" liigutatud`, "success");
  };

  const moveField = (key: string, direction: "up" | "down") => {
    const ordered = getOrderedSelectedFields();
    const idx = ordered.findIndex(f => f.key === key);
    if (idx === -1 || (direction === "up" && idx === 0) || (direction === "down" && idx === ordered.length - 1)) return;
    const newOrder = ordered.map(f => f.key);
    const target = direction === "up" ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    updateSettings({ selectedFields: newOrder });
    addLog(`✅ "${key}" liigutatud ${direction === "up" ? "üles" : "alla"}`, "success");
  };

  const toggleField = (key: string) => {
    setAllFields(prev => {
      const updated = prev.map(f => f.key === key ? { ...f, selected: !f.selected } : f);
      updateSettings({ selectedFields: updated.filter(f => f.selected).map(f => f.key) });
      return updated;
    });
  };

  const createMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔍 KONTROLL - ALUSTAN VÄRSKE VALIKUGA", "info");

    const fresh = await getSelectedObjects(api);
    if (!fresh.length) {
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
        rows.push(...await Promise.all(objs.map(o => flattenProps(o, modelId, projectName, nameMap, api))));
      } catch (err: any) {
        addLog(`Viga: ${err.message}`, "error");
      }
    }

    if (!rows.length) {
      addLog("❌ Andmeid ei leitud", "error");
      return;
    }

    const selectedFields = getOrderedSelectedFields();
    if (!selectedFields.length) {
      addLog("❌ Valitud väljad puuduvad!", "error");
      return;
    }

    addLog(`\n✅ LOON MARKUPID ${rows.length} OBJEKTILE`, "success");
    setIsLoading(true);

    try {
      const markupsToCreate: any[] = [];
      const modelId = rows[0].ModelId;
      const objectIds = rows.map(r => Number(r.ObjectId)).filter(Boolean);
      let bBoxes: any[] = [];
      try {
        bBoxes = await api.viewer?.getObjectBoundingBoxes?.(modelId, objectIds);
        addLog(`✅ Saadud ${bBoxes.length} BBox-i`, "success");
      } catch (err: any) {
        addLog(`⚠️ BBox viga: ${err?.message}`, "warn");
        bBoxes = objectIds.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }));
      }

      const bBoxMap = new Map(bBoxes.map(b => [b.id, b]));
      let successCount = 0;

      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const objectId = Number(row.ObjectId);
        const bBox = bBoxMap.get(objectId);

        if (!bBox) {
          addLog(` ⚠️ ${idx + 1}. ID ${objectId}: BBox puudub`, "warn");
          continue;
        }

        const values = selectedFields.map(f => row[f.key] || "").filter(v => v.trim());
        if (!values.length) {
          addLog(` ⚠️ ${idx + 1}. ID ${objectId}: andmed puuduvad`, "warn");
          continue;
        }

        const bb = bBox.boundingBox;
        const mid = {
          x: (bb.min.x + bb.max.x) / 2,
          y: (bb.min.y + bb.max.y) / 2,
          z: (bb.min.z + bb.max.z) / 2,
        };

        markupsToCreate.push({
          text: values.join(settings.delimiter),
          start: { positionX: mid.x * 1000, positionY: mid.y * 1000, positionZ: mid.z * 1000 },
          end: { positionX: mid.x * 1000, positionY: mid.y * 1000, positionZ: mid.z * 1000 },
          color: MARKUP_COLOR,
        });

        successCount++;
        if (idx < 3) addLog(` ✅ ${idx + 1}. "${values.join(settings.delimiter).substring(0, 50)}"`, "debug");
      }

      if (!markupsToCreate.length) {
        addLog("❌ Ühtegi märgupit ei saadud luua", "error");
        return;
      }

      const result = await api.markup?.addTextMarkup?.(markupsToCreate);
      const createdIds = (Array.isArray(result) ? result : []).map((i: any) => i?.id).filter(Boolean);
      if (createdIds.length) {
        setMarkupIds(createdIds);
        addLog(`\n✅ LOODUD: ${createdIds.length} märgupit! 🎉`, "success");
      }
    } catch (err: any) {
      addLog(`❌ Viga: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [api, addLog, getOrderedSelectedFields, settings.delimiter]);

  const handleRemoveAllMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🗑️ KÕIGI MARKUPITE KUSTUTAMINE", "info");

    setIsLoading(true);
    try {
      const all = await api.markup?.getTextMarkups?.();
      const ids = (all || []).map((m: any) => m?.id).filter(Boolean);
      if (ids.length) {
        await api.markup?.removeMarkups?.(ids);
        addLog(`✅ Kustutatud ${ids.length} märgupit`, "success");
        setMarkupIds([]);
      } else {
        addLog("ℹ️ Markupeid pole", "warn");
      }
    } catch (err: any) {
      addLog(`❌ Viga: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [api, addLog]);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, PropertyField[]>();
    allFields.forEach(f => {
      const g = f.group || "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(f);
    });
    return groups;
  }, [allFields]);

  const selectedCount = allFields.filter(f => f.selected).length;

  return (
    <div style={{ padding: 12, fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#f5f5f5" }}>
      <div style={{ marginBottom: 12, textAlign: "center", padding: "12px 12px 0 12px" }}>
        <div style={{ fontSize: 13, color: "#333", fontWeight: 600 }}>
          📊 Valitud: {allFields.length ? selectedCount : 0} välja
        </div>
      </div>

      <div style={{ border: "1px solid #e0e0e0", borderRadius: 6, padding: 12, backgroundColor: "#fff", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: 13, fontWeight: 600, color: "#333" }}>⚙️ Seaded</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 500, display: "block", marginBottom: 6, color: "#555" }}>Eraldaja:</label>
          <input
            type="text"
            value={settings.delimiter}
            onChange={e => updateSettings({ delimiter: e.target.value })}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #d0d0d0", borderRadius: 4, fontSize: 11 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 500, display: "block", marginBottom: 6, color: "#555" }}>👁️ Eelvaade:</label>
          <div style={{ fontSize: 11, color: previewMarkup ? "#333" : "#999", fontFamily: "monospace", backgroundColor: "#fafbfc", padding: 10, borderRadius: 4, border: "1px solid #e0e0e0", wordBreak: "break-all", minHeight: 36 }}>
            {previewMarkup || "(ei andmeid)"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={createMarkups}
            disabled={isLoading || selectedCount === 0}
            style={{
              flex: 1, padding: "10px 12px", backgroundColor: isLoading || selectedCount === 0 ? "#d0d0d0" : "#1976d2",
              color: "white", border: "none", borderRadius: 4, cursor: isLoading || selectedCount === 0 ? "not-allowed" : "pointer",
              fontSize: 12, fontWeight: 600
            }}
          >
            ➕ Loo
          </button>
          <button
            onClick={handleRemoveAllMarkups}
            disabled={isLoading}
            style={{ flex: 1, padding: "6px 8px", backgroundColor: isLoading ? "#ccc" : "#d32f2f", color: "white", border: "none", borderRadius: 3, fontSize: 9, fontWeight: 600 }}
          >
            🗑️ Kustuta kõik
          </button>
        </div>
        <div style={{ fontSize: 8, color: "#666", marginTop: 6, padding: 6, backgroundColor: "#f9f9f9", borderRadius: 2 }}>
          ℹ️ Punane värviga. Järjekord muudatav: drag-drop või ↑↓ nupud
        </div>
      </div>

      <div style={{ flex: 1, border: "1px solid #e0e0e0", borderRadius: 6, padding: 12, backgroundColor: "#fff", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: 13, fontWeight: 600, color: "#333" }}>📋 Omadused ({selectedCount} valitud)</h3>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {allFields.length === 0 ? (
            <p style={{ color: "#999", fontSize: 11, margin: 0 }}>Vali objektid 3D vaates...</p>
          ) : (
            Array.from(groupedFields.entries()).map(([groupName, groupFields]) => (
              <div key={groupName} style={{ marginBottom: 12 }}>
                <div style={{ padding: "8px 10px", backgroundColor: "#f5f5f5", borderRadius: 4, marginBottom: 6, fontWeight: 600, fontSize: 11, color: "#333", border: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between" }}>
                  <span>{groupName}</span>
                  <span style={{ fontWeight: 500, color: "#666" }}>{groupFields.filter(f => f.selected).length}/{groupFields.length}</span>
                </div>
                {groupFields.map(field => {
                  const ordered = getOrderedSelectedFields();
                  const idx = ordered.findIndex(f => f.key === field.key);
                  const isFirst = idx === 0, isLast = idx === ordered.length - 1;
                  const isSelected = idx !== -1;
                  return (
                    <div
                      key={field.key}
                      draggable={field.selected}
                      onDragStart={() => handleDragStart(field)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleDrop(field)}
                      style={{
                        display: "flex", gap: 8, alignItems: "center", marginBottom: 6, padding: "8px 10px", borderRadius: 4,
                        backgroundColor: field.selected ? "#e3f2fd" : "transparent",
                        opacity: field.hasData ? 1 : 0.6,
                        border: field.selected ? "1px solid #1976d2" : draggedField === field.key ? "1px dashed #1976d2" : "1px solid transparent",
                        cursor: field.selected ? "grab" : "default"
                      }}
                    >
                      <span style={{ fontSize: 10, color: field.selected ? "#1976d2" : "#ccc" }}>⋮⋮</span>
                      <input type="checkbox" checked={field.selected} onChange={() => toggleField(field.key)} style={{ cursor: "pointer", width: 16, height: 16 }} />
                      <span style={{ color: "#0066cc", fontSize: 11, fontWeight: 500, flex: 1, wordBreak: "break-word" }}>{field.label}</span>
                      {isSelected && (
                        <div style={{ display: "flex", gap: 4 }}>
                          {!isFirst && <button onClick={() => moveField(field.key, "up")} style={{ padding: "4px 6px", fontSize: 11, background: "#f0f0f0", border: "1px solid #d0d0d0", borderRadius: 4 }}>↑</button>}
                          {!isLast && <button onClick={() => moveField(field.key, "down")} style={{ padding: "4px 6px", fontSize: 11, background: "#f0f0f0", border: "1px solid #d0d0d0", borderRadius: 4 }}>↓</button>}
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

      <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, overflow: "hidden", fontFamily: "monospace", fontSize: 10, maxHeight: showDebugLog ? 140 : 28, transition: "max-height 0.2s" }}>
        <div onClick={() => setShowDebugLog(!showDebugLog)} style={{ padding: "8px 12px", backgroundColor: "#f5f5f5", cursor: "pointer", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
          <span>{showDebugLog ? "▼" : "▶"} 📋 LOG ({logs.length})</span>
          {showDebugLog && <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(logs.map(l => `[${l.timestamp}] ${l.message}`).join("\n")); addLog("LOG kopeeritud", "success"); }} style={{ padding: "2px 6px", fontSize: 8, background: "#e0e0e0", border: "none", borderRadius: 2 }}>Kopeeri</button>}
        </div>
        {showDebugLog && <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px", backgroundColor: "#fafafa" }}>
          {logs.map((log, i) => {
            const colors = { success: "#2e7d32", error: "#c62828", warn: "#f57f17", info: "#0277bd", debug: "#666" };
            return <div key={i} style={{ marginBottom: 1, color: colors[log.level] || "#333" }}>[{log.timestamp}] {log.message}</div>;
          })}
        </div>}
      </div>

      <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #e0e0e0", textAlign: "center", fontSize: 10, color: "#999", fontWeight: 500 }}>
        MARKUP GENERATOR {COMPONENT_VERSION} • {BUILD_DATE}
      </div>
    </div>
  );
}
