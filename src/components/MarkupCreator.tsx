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

// ========== CONSTANTS ==========
const COMPONENT_VERSION = "8.0.0";
const BUILD_DATE = new Date().toISOString().split("T")[0];
const MARKUP_COLOR = "FF0000";

const DEFAULTS: Settings = {
  delimiter: " | ",
  selectedFields: [],
};

// ========== TRANSLATIONS ==========
const translations = {
  et: {
    selectObjects: "Vali objektid 3D vaates...",
    noFields: "Pole väljasid",
    markupGenerator: "MARKUP GENERATOR",
    settings: "⚙️ Seaded",
    properties: "📋 Omadused",
    delimiter: "Eraldaja:",
    preview: "👁️ Eelvaade",
    noData: "(ei andmeid)",
    create: "➕ Loo",
    removeAll: "🗑️ Kustuta kõik",
    loading: "Töödelda...",
    refresh: "🔄 Uuenda valik",
    log: "📋 LOG",
    version: "MARKUP GENERATOR {version} • {date}",
    dragHint: "Punane värviga. Järjekord muudatav: drag-drop või ↑↓ nupud",
    allMarkupsRemoved: "KUSTUTAMINE ÕNNESTUS! {count} märgupit kustutatakse 🎉",
    noMarkups: "Markupeid mudelis pole",
    objectsSelected: "Valitud: {count} objekti | Väljad: {fields}",
  },
  en: {
    selectObjects: "Select objects in 3D view...",
    noFields: "No fields",
    markupGenerator: "MARKUP GENERATOR",
    settings: "⚙️ Settings",
    properties: "📋 Properties",
    delimiter: "Delimiter:",
    preview: "👁️ Preview",
    noData: "(no data)",
    create: "➕ Create",
    removeAll: "🗑️ Remove all",
    loading: "Processing...",
    refresh: "🔄 Refresh selection",
    log: "📋 LOG",
    version: "MARKUP GENERATOR {version} • {date}",
    dragHint: "Red color. Reorder: drag-drop or ↑↓ buttons",
    allMarkupsRemoved: "DELETION SUCCESS! {count} markups deleted 🎉",
    noMarkups: "No markups in model",
    objectsSelected: "Selected: {count} objects | Fields: {fields}",
  },
};

type Language = "et" | "en";

// ========== SETTINGS HOOK ==========
function useSettings() {
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

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage?.setItem?.("markupCreatorSettings", JSON.stringify(next));
      } catch {
        // Silent fail for incognito mode
      }
      return next;
    });
  }, []);

  return [settings, update] as const;
}

// ========== UTILITY FUNCTIONS ==========
function sanitizeKey(s: string): string {
  if (!s) return "";
  return String(s)
    .replace(/[\s\-_.+()[\]{}]/g, "")
    .trim();
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
    if (Array.isArray(layers) && layers.length > 0 && Array.isArray(layers[0])) {
      return layers[0].map((l: any) => String(l?.name || l)).join(" | ");
    }
  } catch (err) {
    console.warn("[getPresentationLayerString] error:", err);
  }
  return "";
}

async function getReferenceObjectInfo(api: any, modelId: string, runtimeId: number) {
  const result = { fileName: "", fileFormat: "", commonType: "", guidIfc: "", guidMs: "" };
  try {
    const refObj = await api?.viewer?.getReferenceObject?.(modelId, runtimeId);
    if (!refObj) return result;
    if (refObj?.file?.name) result.fileName = String(refObj.file.name);
    if (refObj?.fileFormat) result.fileFormat = String(refObj.fileFormat);
    if (refObj?.commonType) result.commonType = String(refObj.commonType);
    if (refObj?.guid) {
      const cls = classifyGuid(refObj.guid);
      if (cls === "IFC") result.guidIfc = refObj.guid;
      if (cls === "MS") result.guidMs = refObj.guid;
    }
  } catch (err) {
    console.warn("[getReferenceObjectInfo] error:", err);
  }
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
    Name: "",
    Type: "Unknown",
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
    let v: unknown = val;
    if (Array.isArray(v)) v = v.map((x) => (x == null ? "" : String(x))).join(" | ");
    else if (typeof v === "object" && v !== null) v = JSON.stringify(v);
    const s = v == null ? "" : String(v);
    propMap.set(key, s);
    out[key] = s;
  };

  if (Array.isArray(obj?.properties)) {
    obj.properties.forEach((propSet: any) => {
      const setName = propSet?.name || "Unknown";
      const setProps = propSet?.properties || [];
      if (Array.isArray(setProps)) {
        setProps.forEach((prop: any) => {
          const value = prop?.displayValue ?? prop?.value;
          const name = prop?.name || "Unknown";
          push(setName, name, value);
        });
      }
    });
  }

  if (obj?.id) out.ObjectId = String(obj.id);
  if (obj?.name) out.Name = String(obj.name);
  if (obj?.type) out.Type = String(obj.type);

  let guidIfc = "";
  let guidMs = "";

  for (const [k, v] of propMap) {
    if (!/guid|globalid/i.test(k)) continue;
    const cls = classifyGuid(v);
    if (cls === "IFC" && !guidIfc) guidIfc = v;
    if (cls === "MS" && !guidMs) guidMs = v;
  }

  try {
    const metaArr = await api?.viewer?.getObjectMetadata?.(modelId, [obj?.id]);
    const metaOne = Array.isArray(metaArr) ? metaArr[0] : metaArr;
    if (metaOne?.globalId) {
      const g = String(metaOne.globalId);
      out.GUID_MS = out.GUID_MS || g;
      guidMs = guidMs || g;
    }
  } catch (err) {
    console.warn("[flattenProps] getObjectMetadata failed:", err);
  }

  if (!guidIfc && obj.id) {
    try {
      const externalIds = await api.viewer.convertToObjectIds(modelId, [obj.id]);
      const externalId = externalIds[0];
      if (externalId && classifyGuid(externalId) === "IFC") guidIfc = externalId;
    } catch (err) {
      console.warn("[flattenProps] convertToObjectIds failed:", err);
    }
  }

  if (![...propMap.keys()].some((k) => k.toLowerCase().startsWith("presentation_layers."))) {
    const rid = Number(obj?.id);
    if (Number.isFinite(rid)) {
      const layerStr = await getPresentationLayerString(api, modelId, rid);
      if (layerStr) {
        const key = "Presentation_Layers.Layer";
        propMap.set(key, layerStr);
        out[key] = layerStr;
      }
    }
  }

  const hasRefBlock = [...propMap.keys()].some((k) => k.toLowerCase().startsWith("referenceobject."));
  if (!hasRefBlock) {
    const rid = Number(obj?.id);
    if (Number.isFinite(rid)) {
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
  const viewer: any = api?.viewer;
  const mos = await viewer?.getObjects?.({ selected: true });
  if (!Array.isArray(mos) || !mos.length) return [];
  return mos.map((mo: any) => ({ modelId: String(mo.modelId), objects: mo.objects || [] }));
}

async function buildModelNameMap(api: any, modelIds: string[]) {
  const map = new Map<string, string>();
  try {
    const list: any[] = await api?.viewer?.getModels?.();
    for (const m of list || []) {
      if (m?.id && m?.name) map.set(String(m.id), String(m.name));
    }
  } catch {
    // Silent fail
  }
  for (const id of new Set(modelIds)) {
    if (map.has(id)) continue;
    try {
      const f = await api?.viewer?.getLoadedModel?.(id);
      const n = f?.name || f?.file?.name;
      if (n) map.set(id, String(n));
    } catch {
      // Silent fail
    }
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

// ========== STYLES (Assembly Exporter style) ==========
const styles = {
  container: {
    padding: 12,
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    backgroundColor: "#f5f5f5",
    gap: 12,
  },
  header: {
    fontSize: 13,
    color: "#333",
    fontWeight: 600,
    textAlign: "center" as const,
  },
  section: {
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    padding: 12,
    backgroundColor: "#ffffff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  heading: {
    margin: "0 0 12px 0",
    fontSize: 13,
    fontWeight: 600,
    color: "#333",
  },
  controls: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap" as const,
  },
  btn: {
    flex: 1,
    minWidth: 80,
    padding: "10px 12px",
    backgroundColor: "#1976d2",
    color: "white",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    transition: "background-color 0.2s",
  },
  btnDisabled: {
    backgroundColor: "#d0d0d0",
    cursor: "not-allowed",
  },
  btnDanger: {
    flex: 1,
    minWidth: 60,
    padding: "6px 8px",
    backgroundColor: "#d32f2f",
    color: "white",
    border: "none",
    borderRadius: 3,
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 600,
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #d0d0d0",
    borderRadius: 4,
    fontSize: 11,
    boxSizing: "border-box" as const,
    fontFamily: "system-ui, -apple-system, sans-serif",
    transition: "border-color 0.2s",
  },
  label: {
    fontSize: 11,
    fontWeight: 500,
    display: "block" as const,
    marginBottom: 6,
    color: "#555",
  },
  preview: {
    fontSize: 11,
    color: "#333",
    fontFamily: "monospace",
    backgroundColor: "#fafbfc",
    padding: 10,
    borderRadius: 4,
    border: "1px solid #e0e0e0",
    wordBreak: "break-all" as const,
    minHeight: 36,
    maxHeight: 60,
    overflowY: "auto" as const,
    lineHeight: "1.4",
  },
  previewEmpty: {
    color: "#999",
  },
  columnListNoscroll: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    border: "1px solid #e6eaf0",
    borderRadius: 6,
    padding: 8,
    background: "#fff",
    maxHeight: 480,
    overflow: "auto" as const,
    flex: 1,
    minHeight: 0,
  },
  columnItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: 6,
    borderRadius: 6,
    border: "1px solid #eef1f6",
    background: "#fff",
    cursor: "grab",
  },
  columnItemHighlight: {
    boxShadow: "0 0 0 2px rgba(22,119,255,0.2)",
  },
  columnItemDragging: {
    opacity: 0.5,
  },
  dragHandle: {
    userSelect: "none" as const,
    fontWeight: 600,
    fontSize: 12,
    color: "#1976d2",
  },
  miniBtn: {
    padding: "4px 6px",
    fontSize: 11,
    backgroundColor: "#f0f0f0",
    border: "1px solid #d0d0d0",
    borderRadius: 4,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  groupHeader: {
    padding: "8px 10px",
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
    marginBottom: 6,
    fontWeight: 600,
    fontSize: 11,
    color: "#333",
    border: "1px solid #e0e0e0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hint: {
    fontSize: 8,
    color: "#666",
    marginTop: 6,
    padding: 6,
    backgroundColor: "#f9f9f9",
    borderRadius: 2,
  },
  logContainer: {
    backgroundColor: "#ffffff",
    color: "#333",
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    overflow: "hidden",
    fontFamily: "monospace",
    fontSize: 10,
    display: "flex",
    flexDirection: "column" as const,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  logHeader: {
    padding: "8px 12px",
    backgroundColor: "#f5f5f5",
    borderBottom: "1px solid #e0e0e0",
    cursor: "pointer",
    fontWeight: 600,
    userSelect: "none" as const,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 11,
  },
  logContent: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "4px 8px",
    backgroundColor: "#fafafa",
    maxHeight: 140,
  },
  logEntry: {
    marginBottom: 1,
    fontSize: 10,
  },
  footer: {
    marginTop: 12,
    paddingTop: 8,
    borderTop: "1px solid #e0e0e0",
    textAlign: "center" as const,
    fontSize: 10,
    color: "#999",
    fontWeight: 500,
  },
};

// ========== MAIN COMPONENT ==========
export default function MarkupCreator({ api, onError }: MarkupCreatorProps) {
  const [language, setLanguage] = useState<Language>("et");
  const [settings, updateSettings] = useSettings();
  const [allFields, setAllFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupIds, setMarkupIds] = useState<number[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [selectedData, setSelectedData] = useState<Row[]>([]);
  const [stats, setStats] = useState({ totalObjects: 0, totalKeys: 0, fieldsWithData: 0 });
  const [previewMarkup, setPreviewMarkup] = useState<string>("");
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [highlightedColumn, setHighlightedColumn] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const listenerRegistered = useRef(false);

  const t = translations[language];

  // ========== LOGGING ==========
  const addLog = useCallback(
    (message: string, level: "info" | "success" | "warn" | "error" | "debug" = "info") => {
      const now = new Date();
      const timestamp = now.toLocaleTimeString("et-EE", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setLogs((prev) => {
        const updated = [...prev, { timestamp, level, message }];
        return updated.length > 500 ? updated.slice(-500) : updated;
      });
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    },
    []
  );

  // ========== LOAD SELECTION DATA - REUSABLE FUNCTION ==========
  const loadSelectionData = useCallback(async () => {
    if (!api?.viewer) {
      addLog("❌ API pole saadaval", "error");
      return;
    }

    try {
      setIsLoading(true);
      addLog("🔄 Laadin valitud objektide andmeid...", "info");

      const selectedWithBasic = await getSelectedObjects(api);
      if (!selectedWithBasic || selectedWithBasic.length === 0) {
        setSelectedData([]);
        setAllFields([]);
        setPreviewMarkup("");
        addLog("⚪ Valitud objektid puuduvad", "warn");
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
          addLog(`Viga mudelis ${modelId}: ${err?.message}`, "error");
        }
      }

      if (allRows.length === 0) {
        addLog("❌ Andmeid ei leitud", "error");
        setSelectedData([]);
        setAllFields([]);
        setPreviewMarkup("");
        return;
      }

      setSelectedData(allRows);
      addLog(`✅ Laaditud ${allRows.length} objekti`, "success");

      // --- BUILD FIELDS ---
      const allKeys = Array.from(new Set(allRows.flatMap((r) => Object.keys(r)))).sort();
      const groups = groupKeys(allKeys);
      const groupOrder = ["Standard", "Tekla_Assembly", "Nordec_Dalux", "IfcElementAssembly", "AssemblyBaseQuantities", "Other"];
      const newFields: PropertyField[] = [];
      let fieldsWithData = 0;

      groupOrder.forEach((groupName) => {
        const groupKeys = groups.get(groupName) || [];
        groupKeys.forEach((key) => {
          const hasData = allRows.some((row) => {
            const val = row[key];
            return val && val.trim() !== "";
          });

          if (hasData) fieldsWithData++;

          let isSelected = false;
          if (settings.selectedFields && settings.selectedFields.length > 0) {
            isSelected = settings.selectedFields.includes(key);
          } else {
            isSelected = key === "Tekla_Assembly.AssemblyCast_unit_Mark" && hasData;
          }

          newFields.push({
            key,
            label: key,
            selected: isSelected,
            group: groupName,
            hasData,
          });
        });
      });

      // ✅ Sort fields by savedFields order
      if (settings.selectedFields.length > 0) {
        newFields.sort((a, b) => {
          const idxA = settings.selectedFields.indexOf(a.key);
          const idxB = settings.selectedFields.indexOf(b.key);
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
      }

      setStats({
        totalObjects: allRows.length,
        totalKeys: allKeys.length,
        fieldsWithData,
      });

      if (mountedRef.current) {
        setAllFields(newFields);
        addLog(`✅ Väljad uuendatud: ${newFields.filter((f) => f.selected).length} valitud`, "success");
      }
    } catch (err: any) {
      addLog(`❌ Valimise laadimine ebaõnnestus: ${err?.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [api, settings.selectedFields, addLog]);

  // ========== LIFECYCLE & REAL-TIME LISTENING ==========
  useEffect(() => {
    addLog(`🚀 MarkupCreator v${COMPONENT_VERSION} laaditud`, "info");
    return () => {
      mountedRef.current = false;
    };
  }, [addLog]);

  // ✅ REAL-TIME selection listening with proper cleanup
  useEffect(() => {
    if (!api?.viewer || listenerRegistered.current) return;

    const handleSelectionChanged = () => {
      addLog("🎯 Valik muutus – uuendan andmeid", "info");
      loadSelectionData();
    };

    api.viewer.addOnSelectionChanged?.(handleSelectionChanged);
    listenerRegistered.current = true;

    // Initial load
    loadSelectionData();

    return () => {
      api.viewer.removeOnSelectionChanged?.(handleSelectionChanged);
      listenerRegistered.current = false;
      mountedRef.current = false;
    };
  }, [api, loadSelectionData, addLog]);

  // ========== FIELD ORDERING ==========
  const getOrderedSelectedFields = useCallback(() => {
    const selectedFields = allFields.filter((f) => f.selected);
    if (selectedFields.length === 0) return [];

    if (settings.selectedFields.length > 0) {
      return settings.selectedFields
        .map((k) => selectedFields.find((f) => f.key === k))
        .filter(Boolean) as PropertyField[];
    }

    return selectedFields;
  }, [allFields, settings.selectedFields]);

  // ========== PREVIEW UPDATE ==========
  const updatePreview = useCallback(() => {
    const selectedFields = getOrderedSelectedFields();

    if (selectedFields.length === 0 || selectedData.length === 0) {
      setPreviewMarkup("");
      return;
    }

    const firstRow = selectedData[0];
    const values: string[] = [];

    for (const field of selectedFields) {
      const value = firstRow[field.key] || "";
      if (value && String(value).trim()) {
        values.push(String(value));
      }
    }

    const preview = values.join(settings.delimiter);
    setPreviewMarkup(preview);
  }, [getOrderedSelectedFields, selectedData, settings.delimiter]);

  useEffect(() => {
    updatePreview();
  }, [updatePreview]);

  // ========== DRAG-DROP HANDLERS ==========
  const handleDragStart = (field: PropertyField) => {
    setDraggedField(field.key);
  };

  const handleDragEnd = () => {
    setDraggedField(null);
    setHighlightedColumn(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetField: PropertyField) => {
    if (!draggedField || draggedField === targetField.key) {
      setDraggedField(null);
      return;
    }

    const orderedFields = getOrderedSelectedFields();
    if (orderedFields.length === 0) {
      setDraggedField(null);
      return;
    }

    const draggedIdx = orderedFields.findIndex((f) => f.key === draggedField);
    const targetIdx = orderedFields.findIndex((f) => f.key === targetField.key);

    if (draggedIdx === -1 || targetIdx === -1) {
      setDraggedField(null);
      return;
    }

    const newOrder = orderedFields.map((f) => f.key);
    const [moved] = newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, moved);

    updateSettings({ selectedFields: newOrder });
    setDraggedField(null);
    addLog(`✅ "${draggedField}" liigutatud järjestuses`, "success");
  };

  // ========== MOVE FIELD UP/DOWN ==========
  const moveField = (key: string, direction: "up" | "down") => {
    const orderedFields = getOrderedSelectedFields();
    if (orderedFields.length === 0) return;

    const idx = orderedFields.findIndex((f) => f.key === key);

    if (idx === -1) return;
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === orderedFields.length - 1)) return;

    const newOrder = orderedFields.map((f) => f.key);
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];

    updateSettings({ selectedFields: newOrder });
    addLog(`✅ "${key}" liigutatud ${direction === "up" ? "üles ⬆️" : "alla ⬇️"}`, "success");
  };

  // ========== TOGGLE FIELD ==========
  const toggleField = useCallback(
    (key: string) => {
      setAllFields((prev) => {
        const updated = prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f));
        const newSelected = updated.filter((f) => f.selected).map((f) => f.key);
        updateSettings({ selectedFields: newSelected });
        return updated;
      });
    },
    [updateSettings]
  );

  // ========== CREATE MARKUPS ==========
  const createMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔍 KONTROLL - VALITUD VÄLJAD JA OBJEKTID", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    const selectedFields = getOrderedSelectedFields();

    if (selectedFields.length === 0) {
      addLog("❌ VIGA: Valitud väljad puuduvad!", "error");
      return;
    }

    addLog(`\n✅ 1. VALITUD VÄLJAD - JÄRJEKORD (${selectedFields.length}):`, "success");
    selectedFields.forEach((f, idx) => {
      addLog(`      ${idx + 1}. ${f.label}`, "debug");
    });

    if (selectedData.length === 0) {
      addLog("❌ VIGA: Valitud objektid puuduvad!", "error");
      return;
    }

    addLog(`\n✅ 2. VALITUD OBJEKTID 3D VAATES (${selectedData.length}):`, "success");
    selectedData.slice(0, 5).forEach((row, idx) => {
      const fieldValues = selectedFields.map((f) => row[f.key] || "-").join(" | ");
      addLog(`      ${idx + 1}. ID ${row.ObjectId}: ${fieldValues}`, "debug");
    });
    if (selectedData.length > 5) {
      addLog(`      ... ja ${selectedData.length - 5} veel`, "debug");
    }

    addLog(`\n✅ 3. EELVAADE - MARKUP TEKST:`, "success");
    addLog(`      "${previewMarkup}"`, "debug");

    addLog(`\n✅ KONTROLL LÕPETATUD - Looma markupeid ${selectedData.length} objektile!`, "success");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    setIsLoading(true);
    try {
      const markupsToCreate: any[] = [];
      const modelId = selectedData[0]?.ModelId;

      addLog("\n🔧 MARKUPITE LOOMINE", "info");

      const objectIds = selectedData.map((row) => Number(row.ObjectId)).filter(Boolean);

      let bBoxes: any[] = [];
      try {
        bBoxes = await api.viewer?.getObjectBoundingBoxes?.(modelId, objectIds);
        addLog(`✅ Saadud ${bBoxes.length} BBox-i (${objectIds.length} objektile)`, "success");
      } catch (err: any) {
        addLog(`⚠️ BBox viga: ${err?.message}`, "warn");
        bBoxes = objectIds.map((id) => ({
          id,
          boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
        }));
      }

      let successCount = 0;

      for (let idx = 0; idx < selectedData.length; idx++) {
        const row = selectedData[idx];
        const objectId = Number(row.ObjectId);

        try {
          const bBox = bBoxes.find((b) => b.id === objectId);
          if (!bBox) {
            addLog(`   ⚠️ ${idx + 1}. ID ${objectId}: BBox puudub`, "warn");
            continue;
          }

          const bb = bBox.boundingBox;
          const midPoint = {
            x: (bb.min.x + bb.max.x) / 2,
            y: (bb.min.y + bb.max.y) / 2,
            z: (bb.min.z + bb.max.z) / 2,
          };

          const point = {
            positionX: midPoint.x * 1000,
            positionY: midPoint.y * 1000,
            positionZ: midPoint.z * 1000,
          };

          const values: string[] = [];
          for (const field of selectedFields) {
            const value = row[field.key] || "";
            if (value && String(value).trim()) {
              values.push(String(value));
            }
          }

          if (values.length === 0) {
            addLog(`   ⚠️ ${idx + 1}. ID ${objectId}: andmeid valitud väljadele pole`, "warn");
            continue;
          }

          const text = values.join(settings.delimiter);

          markupsToCreate.push({
            text,
            start: point,
            end: point,
            color: MARKUP_COLOR,
          });

          successCount++;

          if (idx < 3) {
            addLog(`   ✅ ${idx + 1}. ID ${objectId}: "${text.substring(0, 50)}"`, "debug");
          }
        } catch (err: any) {
          addLog(`   ❌ ${idx + 1}. ID ${objectId}: ${err?.message}`, "error");
        }
      }

      addLog(`\n📊 ETTEVALMISTUS VALMIS: ${successCount}/${selectedData.length} objektil on andmed`, "success");

      if (markupsToCreate.length === 0) {
        addLog("❌ Ühtegi märgupit ei saadud luua", "error");
        return;
      }

      addLog(`\n📤 SAATMINE API-LE: ${markupsToCreate.length} märgupit`, "debug");

      let result: any = [];
      try {
        result = await api.markup?.addTextMarkup?.(markupsToCreate);
        if (!result) result = [];
      } catch (err: any) {
        addLog(`❌ API addTextMarkup viga: ${err?.message}`, "error");
        throw err;
      }

      const createdIds: number[] = [];

      if (Array.isArray(result)) {
        result.forEach((item: any) => {
          if (typeof item === "object" && item?.id) {
            createdIds.push(Number(item.id));
          } else if (typeof item === "number") {
            createdIds.push(item);
          }
        });
      }

      if (createdIds.length > 0) {
        setMarkupIds(createdIds);
        addLog(`\n✅ MARKUPID LOODUD: ${createdIds.length} märgupit! 🎉`, "success");
      }
    } catch (err: any) {
      addLog(`❌ Viga: ${err?.message}`, "error");
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [getOrderedSelectedFields, selectedData, settings.delimiter, previewMarkup, api, addLog]);

  // ========== REMOVE ALL MARKUPS ==========
  const handleRemoveAllMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🗑️ KÕIGIDE MARKUPITE KUSTUTAMINE MUDELIS", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    setIsLoading(true);
    try {
      addLog("🔍 Otsitakse kõik markupid mudelis...", "debug");

      const allMarkups = await api.markup?.getTextMarkups?.();

      if (!allMarkups || allMarkups.length === 0) {
        addLog("ℹ️ Markupeid mudelis pole", "warn");
        addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
        return;
      }

      const allIds = allMarkups.map((m: any) => m?.id).filter((id: any) => id != null);
      addLog(`✅ Leitud ${allIds.length} märgupit:`, "success");
      allIds.slice(0, 10).forEach((id: number, idx: number) => {
        addLog(`   ${idx + 1}. ID: ${id}`, "debug");
      });
      if (allIds.length > 10) {
        addLog(`   ... ja ${allIds.length - 10} veel`, "debug");
      }

      if (allIds.length === 0) {
        addLog("ℹ️ ID-sid ei leitud", "warn");
        addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
        return;
      }

      addLog(`\n📤 Kustutatakse ${allIds.length} märgupit API-st...`, "debug");

      const result = await api.markup?.removeMarkups?.(allIds);

      addLog(`✅ API vastus: ${typeof result}`, "debug");
      addLog(`\n✅ KUSTUTAMINE ÕNNESTUS! ${allIds.length} märgupit kustutatakse 🎉`, "success");

      setMarkupIds([]);
    } catch (err: any) {
      addLog(`❌ VIGA: ${err?.message}`, "error");
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [api, addLog]);

  // ========== GROUPED FIELDS ==========
  const groupedFields = useMemo(() => {
    const groups = new Map<string, PropertyField[]>();
    allFields.forEach((field) => {
      const group = field.group || "Other";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(field);
    });
    return groups;
  }, [allFields]);

  const selectedCount = allFields.filter((f) => f.selected).length;

  // ========== RENDER ==========
  return (
    <div style={styles.container as any}>
      {/* HEADER */}
      <div style={styles.header}>
        {selectedData.length > 0 ? (
          <div style={{ color: "#2e7d32", fontWeight: 700 }}>
            ✅ {t.objectsSelected.replace("{count}", String(selectedData.length)).replace("{fields}", String(selectedCount))}
          </div>
        ) : (
          <div style={{ color: "#999" }}>⚪ {t.selectObjects}</div>
        )}
      </div>

      {/* SETTINGS SECTION */}
      <div style={styles.section as any}>
        <h3 style={styles.heading}>{t.settings}</h3>

        <div style={{ marginBottom: 12 }}>
          <label style={styles.label}>{t.delimiter}</label>
          <input
            type="text"
            value={settings.delimiter}
            onChange={(e) => updateSettings({ delimiter: e.target.value })}
            style={{
              ...styles.input,
              borderColor: "#d0d0d0",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#1976d2")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#d0d0d0")}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={styles.label}>{t.preview}</label>
          <div style={{ ...styles.preview, ...(previewMarkup ? {} : styles.previewEmpty) }}>
            {previewMarkup || t.noData}
          </div>
        </div>

        <div style={styles.controls as any}>
          <button
            onClick={createMarkups}
            disabled={isLoading || selectedData.length === 0 || selectedCount === 0}
            style={{
              ...styles.btn,
              ...(isLoading || selectedData.length === 0 || selectedCount === 0 ? styles.btnDisabled : {}),
            }}
            onMouseOver={(e) => {
              if (!(isLoading || selectedData.length === 0 || selectedCount === 0)) {
                e.currentTarget.style.backgroundColor = "#1565c0";
              }
            }}
            onMouseOut={(e) => {
              if (!(isLoading || selectedData.length === 0 || selectedCount === 0)) {
                e.currentTarget.style.backgroundColor = "#1976d2";
              }
            }}
          >
            {isLoading ? t.loading : t.create}
          </button>

          <button
            onClick={handleRemoveAllMarkups}
            disabled={isLoading}
            style={{
              ...styles.btnDanger,
              backgroundColor: isLoading ? "#ccc" : "#d32f2f",
            }}
            title="Kustuta KÕik markupid mudelis"
          >
            {t.removeAll}
          </button>

          <button
            onClick={loadSelectionData}
            disabled={isLoading}
            style={{
              ...styles.btn,
              ...(isLoading ? styles.btnDisabled : {}),
              backgroundColor: isLoading ? "#d0d0d0" : "#43a047",
            }}
          >
            {isLoading ? t.loading : t.refresh}
          </button>
        </div>

        <div style={styles.hint}>{t.dragHint}</div>
      </div>

      {/* PROPERTIES SECTION */}
      <div
        style={{
          ...styles.section,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        } as any}
      >
        <h3 style={styles.heading}>
          {t.properties} ({selectedCount} valitud)
        </h3>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {allFields.length === 0 ? (
            <p style={{ color: "#999", fontSize: 11, margin: 0 }}>{t.selectObjects}</p>
          ) : (
            Array.from(groupedFields.entries()).map(([groupName, groupFields]) => (
              <div key={groupName} style={{ marginBottom: 12 }}>
                <div style={styles.groupHeader as any}>
                  <span>{groupName}</span>
                  <span style={{ fontWeight: 500, color: "#666", fontSize: 10 }}>
                    {groupFields.filter((f) => f.selected).length}/{groupFields.length}
                  </span>
                </div>

                <div style={styles.columnListNoscroll as any}>
                  {groupFields.map((field) => {
                    const orderedSelected = getOrderedSelectedFields();
                    const fieldIdx = orderedSelected.findIndex((f) => f.key === field.key);
                    const isFirst = fieldIdx === 0;
                    const isLast = fieldIdx === orderedSelected.length - 1;
                    const isInOrder = fieldIdx !== -1;

                    return (
                      <div
                        key={field.key}
                        draggable={field.selected}
                        onDragStart={() => handleDragStart(field)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(field)}
                        onDragEnd={handleDragEnd}
                        style={{
                          ...styles.columnItem,
                          ...(field.selected ? { backgroundColor: "#e3f2fd", borderColor: "#1976d2" } : {}),
                          ...(draggedField === field.key ? styles.columnItemHighlight : {}),
                          ...(draggedField === field.key ? styles.columnItemDragging : {}),
                          opacity: field.hasData ? 1 : 0.6,
                          cursor: field.selected ? "grab" : "default",
                        } as any}
                      >
                        <span style={styles.dragHandle}>⋮⋮</span>

                        <input
                          type="checkbox"
                          checked={field.selected}
                          onChange={() => toggleField(field.key)}
                          style={{
                            cursor: "pointer",
                            transform: "scale(1)",
                            margin: 0,
                            width: 16,
                            height: 16,
                          }}
                        />

                        <span
                          style={{
                            color: "#0066cc",
                            fontSize: 11,
                            fontWeight: 500,
                            flex: 1,
                            wordBreak: "break-word",
                            lineHeight: "1.3",
                          }}
                        >
                          {field.label}
                        </span>

                        <div style={{ display: "flex", gap: 4, visibility: isInOrder ? "visible" : "hidden" }}>
                          {!isFirst && (
                            <button
                              onClick={() => moveField(field.key, "up")}
                              title="Liiguta üles"
                              style={styles.miniBtn as any}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = "#1976d2";
                                e.currentTarget.style.color = "white";
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = "#f0f0f0";
                                e.currentTarget.style.color = "black";
                              }}
                            >
                              ↑
                            </button>
                          )}
                          {!isLast && (
                            <button
                              onClick={() => moveField(field.key, "down")}
                              title="Liiguta alla"
                              style={styles.miniBtn as any}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = "#1976d2";
                                e.currentTarget.style.color = "white";
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = "#f0f0f0";
                                e.currentTarget.style.color = "black";
                              }}
                            >
                              ↓
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* LOG SECTION */}
      <div style={styles.logContainer as any}>
        <div
          style={styles.logHeader as any}
          onClick={() => setShowDebugLog(!showDebugLog)}
        >
          <span>{showDebugLog ? "▼" : "▶"} {t.log} ({logs.length})</span>
          {showDebugLog && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const logText = logs.map((l) => `[${l.timestamp}] ${l.message}`).join("\n");
                navigator.clipboard.writeText(logText);
                addLog("✅ LOG kopeeritud lõikelauale", "success");
              }}
              style={{
                padding: "2px 6px",
                fontSize: 8,
                backgroundColor: "#e0e0e0",
                border: "none",
                borderRadius: 2,
                cursor: "pointer",
              }}
            >
              📋 Kopeeri
            </button>
          )}
        </div>

        {showDebugLog && (
          <div style={styles.logContent as any}>
            {logs.map((log, idx) => {
              const colors: Record<string, string> = {
                success: "#2e7d32",
                error: "#c62828",
                warn: "#f57f17",
                info: "#0277bd",
                debug: "#666666",
              };
              return (
                <div key={idx} style={{ ...styles.logEntry, color: colors[log.level] || "#333" }}>
                  [{log.timestamp}] {log.message}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={styles.footer}>
        {t.version.replace("{version}", COMPONENT_VERSION).replace("{date}", BUILD_DATE)}
      </div>
    </div>
  );
}
