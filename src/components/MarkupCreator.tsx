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
  autoRefreshEnabled: boolean;
  markupColor?: string;
}

const COMPONENT_VERSION = "9.00";
const BUILD_DATE = new Date().toISOString().split("T")[0];
const MARKUP_COLOR = "#FF0000"; // Väärtus õige formaadiga

const DEFAULTS: Settings = {
  delimiter: " | ",
  selectedFields: [],
  autoRefreshEnabled: true,
  markupColor: "#FF0000",
};

const translations = {
  et: {
    selectObjects: "Vali objektid 3D vaates...",
    noFields: "Pole väljasid",
    markupGenerator: "MARKUP GENERATOR",
    settings: "⚙️ Seaded",
    properties: "📋 Omadused",
    delimiter: "Eraldaja:",
    preview: "Eelvaade:",
    noData: "(ei andmeid)",
    create: "➕ Loo",
    removeAll: "🗑️",
    refresh: "🔄 Uuenda",
    loading: "...",
    log: "📋 LOG",
    guide: "ℹ️",
    version: "MARKUP GENERATOR {version} • {date}",
    dragHint: "Drag-drop või ↑↓ nupud järjestuse muutmiseks",
    objectsSelected: "✅ {count} objekti | Väljad: {fields}",
    autoRefresh: "🔄 Auto",
    autoRefreshTooltip: "Laadi andmed automaatselt valiku muutumisel",
  },
  en: {
    selectObjects: "Select objects in 3D view...",
    noFields: "No fields",
    markupGenerator: "MARKUP GENERATOR",
    settings: "⚙️ Settings",
    properties: "📋 Properties",
    delimiter: "Delimiter:",
    preview: "Preview:",
    noData: "(no data)",
    create: "➕ Create",
    removeAll: "🗑️",
    refresh: "🔄 Refresh",
    loading: "...",
    log: "📋 LOG",
    guide: "ℹ️",
    version: "MARKUP GENERATOR {version} • {date}",
    dragHint: "Drag-drop or ↑↓ buttons to reorder",
    objectsSelected: "✅ {count} objects | Fields: {fields}",
    autoRefresh: "🔄 Auto",
    autoRefreshTooltip: "Auto-load data when selection changes",
  },
};

type Language = "et" | "en";

const GUIDE_TEXT = {
  et: `
📖 KASUTAMISE JUHEND

1️⃣ VALI OBJEKTID 3D VAATES
   • Klõpsa objektile 3D mudeli sees
   • Markupid ilmuvad automaatselt siia

2️⃣ VALI OMADUSED
   • Märgi linnukesed omaduste tüüpide juures
   • Need andmed näidatakse markupis

3️⃣ MUUDA JÄRJESTUST
   • Lohista omadust hiire abil
   • Kasuta ↑↓ nooli järjestuse muutmiseks

4️⃣ MUUDA ERALDAJAT
   • Avaldamisale taga "Eraldaja: " rida
   • Näiteks: " | " või " - "

5️⃣ LOO MARKUP
   • Klõpsa nupul "➕ Loo"
   • Markup ilmub 3D mudelisse
`,
  en: `
📖 USER GUIDE

1️⃣ SELECT OBJECTS IN 3D VIEW
   • Click on object in 3D model
   • Markups appear here automatically

2️⃣ SELECT PROPERTIES
   • Check boxes next to property types
   • These will be shown in the markup

3️⃣ REORDER
   • Drag property to reorder
   • Use ↑↓ buttons to reorder

4️⃣ CHANGE DELIMITER
   • Find "Delimiter: " setting
   • Example: " | " or " - "

5️⃣ CREATE MARKUP
   • Click "➕ Create" button
   • Markup appears in 3D model
`,
};

function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = window.localStorage?.getItem?.("markupCreatorSettings");
      if (!raw) return DEFAULTS;
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULTS, ...parsed };
    } catch (err) {
      console.warn("[useSettings] localStorage error:", err);
      return DEFAULTS;
    }
  });

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage?.setItem?.("markupCreatorSettings", JSON.stringify(next));
      } catch (err) {
        console.warn("[useSettings] localStorage save error:", err);
      }
      return next;
    });
  }, []);

  return [settings, update] as const;
}

function sanitizeKey(s: string): string {
  if (!s) return "";
  return String(s).replace(/[\s\-_.+()[\]{}]/g, "").trim();
}

function classifyGuid(guid: string): "IFC" | "MS" | "OTHER" {
  if (!guid) return "OTHER";
  const s = String(guid).toLowerCase();
  if (/^[\da-f]{4}[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s)) return "IFC";
  if (/^\d{20,}$/.test(s)) return "MS";
  return "OTHER";
}

async function getSelectedObjects(api: any): Promise<Array<{ modelId: string; objects: any[] }>> {
  const viewer: any = api?.viewer;
  const mos = await viewer?.getObjects?.({ selected: true });
  if (!Array.isArray(mos) || !mos.length) return [];
  return mos.map((mo: any) => ({ modelId: String(mo.modelId), objects: mo.objects || [] }));
}

async function getProjectName(api: any) {
  try {
    const proj = await api?.project?.getProperties?.();
    return proj?.name || "Unknown Project";
  } catch {
    return "Unknown Project";
  }
}

async function buildModelNameMap(api: any, modelIds: string[]) {
  const map = new Map<string, string>();
  try {
    const list: any[] = await api?.viewer?.getModels?.();
    for (const m of list || []) {
      if (m?.id && m?.name) map.set(String(m.id), String(m.name));
    }
  } catch {
    // Silent
  }
  for (const id of new Set(modelIds)) {
    if (map.has(id)) continue;
    try {
      const f = await api?.viewer?.getLoadedModel?.(id);
      if (f?.filename || f?.name) map.set(id, String(f.filename || f.name));
    } catch {
      // Silent
    }
  }
  return map;
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
    console.warn("[flattenProps] metadata:", err);
  }

  if (!guidIfc && obj.id) {
    try {
      const externalIds = await api.viewer.convertToObjectIds(modelId, [obj.id]);
      const externalId = externalIds[0];
      if (externalId && classifyGuid(externalId) === "IFC") guidIfc = externalId;
    } catch (err) {
      console.warn("[flattenProps] convert:", err);
    }
  }

  out.GUID = guidIfc || guidMs || obj.guid || "";
  out.GUID_IFC = guidIfc;
  out.GUID_MS = guidMs;

  return out;
}

const groupKeys = (keys: string[]) => {
  const groups = new Map<string, string[]>();
  const groupOrder = ["Standard", "Tekla_Assembly", "Nordec_Dalux", "IfcElementAssembly", "AssemblyBaseQuantities", "Other"];

  for (const group of groupOrder) {
    groups.set(group, []);
  }

  for (const key of keys) {
    let added = false;
    for (const group of groupOrder) {
      if (key.startsWith(group)) {
        groups.get(group)?.push(key);
        added = true;
        break;
      }
    }
    if (!added) {
      groups.get("Other")?.push(key);
    }
  }

  return groups;
};

export default function MarkupCreator({ api, onError }: MarkupCreatorProps) {
  const [language] = useState<Language>("et");
  const [settings, updateSettings] = useSettings();
  const [allFields, setAllFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [selectedData, setSelectedData] = useState<Row[]>([]);
  const [previewMarkup, setPreviewMarkup] = useState<string>("");
  const [draggedField, setDraggedField] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const listenerRegistered = useRef(false);
  const lastSelectionTimeRef = useRef(0);

  const t = translations[language];
  const guideText = GUIDE_TEXT[language];

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
    },
    []
  );

  const loadSelectionData = useCallback(async () => {
    if (!api?.viewer) {
      addLog("❌ API pole saadaval", "error");
      return;
    }

    try {
      setIsLoading(true);
      addLog("🔄 Laadin andmeid...", "info");

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
        return;
      }

      setSelectedData(allRows);
      addLog(`✅ Laaditud ${allRows.length} objekti`, "success");

      const allKeys = Array.from(new Set(allRows.flatMap((r) => Object.keys(r)))).sort();
      const groups = groupKeys(allKeys);
      const groupOrder = ["Standard", "Tekla_Assembly", "Nordec_Dalux", "IfcElementAssembly", "AssemblyBaseQuantities", "Other"];
      const newFields: PropertyField[] = [];

      groupOrder.forEach((groupName) => {
        const groupKeys = groups.get(groupName) || [];
        groupKeys.forEach((key) => {
          const hasData = allRows.some((row) => row[key]?.trim());

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

      if (settings.selectedFields.length > 0) {
        newFields.sort((a, b) => {
          const idxA = settings.selectedFields.indexOf(a.key);
          const idxB = settings.selectedFields.indexOf(b.key);
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
      }

      if (mountedRef.current) {
        // Puhasta vana selectedFields (kui väli ei eksisteeri enam)
        const allKeys = newFields.map((f) => f.key);
        const validSelected = settings.selectedFields.filter((key) =>
          allKeys.includes(key)
        );
        if (validSelected.length !== settings.selectedFields.length) {
          updateSettings({ selectedFields: validSelected });
          addLog("🧹 Vana väljad eemaldatud", "info");
        }

        setAllFields(newFields);
        addLog(`✅ Väljad uuendatud: ${newFields.filter((f) => f.selected).length} valitud`, "success");
      }
    } catch (err: any) {
      addLog(`❌ Viga: ${err?.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [api, settings.selectedFields, addLog]);

  useEffect(() => {
    addLog(`🚀 MarkupCreator v${COMPONENT_VERSION} laaditud`, "info");
    return () => {
      mountedRef.current = false;
    };
  }, [addLog]);

  // ✅ AUTO-REFRESH EVENT LISTENER
  useEffect(() => {
    if (!api?.viewer || listenerRegistered.current) return;
    if (!settings.autoRefreshEnabled) return;

    const handleSelectionChanged = async () => {
      // DEBOUNCE 200ms
      const now = Date.now();
      const timeSinceLastLoad = now - lastSelectionTimeRef.current;
      
      if (timeSinceLastLoad < 200) {
        return;
      }

      lastSelectionTimeRef.current = now;
      addLog("🎯 Valik muutus – uuendan andmeid (AUTO)", "info");
      await loadSelectionData();
    };

    try {
      api.viewer.addOnSelectionChanged?.(handleSelectionChanged);
      listenerRegistered.current = true;
      addLog("✅ Auto-refresh aktiveeeritud", "success");
      
      // Esimene laadimine viivitusega (API valmimisele)
      const initialLoadTimer = setTimeout(() => {
        loadSelectionData();
      }, 500);

      return () => clearTimeout(initialLoadTimer);
    } catch (err) {
      console.error("[AutoRefresh] setup error:", err);
    }

    return () => {
      try {
        api.viewer.removeOnSelectionChanged?.(handleSelectionChanged);
      } catch {
        // Silent fail
      }
      listenerRegistered.current = false;
    };
  }, [api, settings.autoRefreshEnabled, addLog, loadSelectionData]);

  // ✅ PERIOODILINE REFRESH - Iga 2 sekund kui auto on sees
  useEffect(() => {
    if (!settings.autoRefreshEnabled) return;
    if (selectedData.length === 0) return;

    const interval = setInterval(() => {
      addLog("⏱️ Perioodiline uuendus (AUTO)", "info");
      loadSelectionData();
    }, 2000); // Iga 2 sekund

    return () => clearInterval(interval);
  }, [settings.autoRefreshEnabled, selectedData.length, loadSelectionData, addLog]);

  const selectedCount = allFields.filter((f) => f.selected).length;

  const getOrderedSelectedFields = useCallback(() => {
    const selectedFields = allFields.filter((f) => f.selected);
    if (selectedFields.length === 0) return [];

    if (settings.selectedFields.length > 0) {
      return settings.selectedFields
        .map((key) => allFields.find((f) => f.key === key))
        .filter((f) => f !== undefined) as PropertyField[];
    }

    return selectedFields;
  }, [allFields, settings.selectedFields]);

  const previewText = getOrderedSelectedFields()
    .filter((f) => selectedData.length > 0 && selectedData[0][f.key])
    .map((f) => selectedData[0][f.key])
    .join(settings.delimiter);

  useEffect(() => {
    setPreviewMarkup(previewText);
  }, [previewText]);

  const toggleField = (key: string) => {
    const current = settings.selectedFields || [];
    const newFields = current.includes(key) ? current.filter((f) => f !== key) : [...current, key];
    updateSettings({ selectedFields: newFields });
    setAllFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f))
    );
  };

  const moveField = (key: string, direction: "up" | "down") => {
    const current = settings.selectedFields || [];
    const idx = current.indexOf(key);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === current.length - 1) return;

    const newFields = [...current];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    [newFields[idx], newFields[targetIdx]] = [newFields[targetIdx], newFields[idx]];
    updateSettings({ selectedFields: newFields });
  };

  const handleDragStart = (field: PropertyField) => {
    setDraggedField(field.key);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (targetField: PropertyField) => {
    if (!draggedField || draggedField === targetField.key) {
      setDraggedField(null);
      return;
    }

    const current = settings.selectedFields || [];
    const dragIdx = current.indexOf(draggedField);
    const targetIdx = current.indexOf(targetField.key);

    if (dragIdx === -1 || targetIdx === -1) {
      setDraggedField(null);
      return;
    }

    const newFields = [...current];
    [newFields[dragIdx], newFields[targetIdx]] = [newFields[targetIdx], newFields[dragIdx]];
    updateSettings({ selectedFields: newFields });
    setDraggedField(null);
  };

  const handleDragEnd = () => {
    setDraggedField(null);
  };

  const groupedFields = useMemo(() => {
    const groups = new Map<string, PropertyField[]>();
    for (const field of allFields) {
      const groupName = field.group || "Other";
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName)?.push(field);
    }
    return groups;
  }, [allFields]);

  const createMarkups = useCallback(async () => {
    // ESMALT uuenda andmed
    await loadSelectionData();
    
    // Seejärel loo markupid
    const selectedFields = getOrderedSelectedFields();

    if (selectedFields.length === 0) {
      addLog("❌ Valitud väljad puuduvad!", "error");
      return;
    }

    if (selectedData.length === 0) {
      addLog("❌ Valitud objektid puuduvad!", "error");
      return;
    }

    setIsLoading(true);
    try {
      addLog("📊 Looma markupeid...", "info");
      const modelId = selectedData[0]?.ModelId;
      const objectIds = selectedData.map((row) => Number(row.ObjectId)).filter(Boolean);

      let bBoxes: any[] = [];
      try {
        bBoxes = await api.viewer?.getObjectBoundingBoxes?.(modelId, objectIds);
        if (!Array.isArray(bBoxes) || bBoxes.length === 0) {
          throw new Error("No bounding boxes returned");
        }
      } catch (err: any) {
        addLog(`⚠️ Bounding boxes ei saadud: ${err?.message}`, "warn");
        bBoxes = objectIds.map((id) => ({
          id,
          boundingBox: { 
            min: { x: 0, y: 0, z: 0 }, 
            max: { x: 1, y: 1, z: 1 } 
          },
        }));
      }

      const markupsToCreate: any[] = [];

      for (const row of selectedData) {
        const objectId = Number(row.ObjectId);
        const bBox = bBoxes.find((b) => b.id === objectId);
        if (!bBox) continue;

        const bb = bBox.boundingBox;
        const midPoint = {
          x: (bb.min.x + bb.max.x) / 2,
          y: (bb.min.y + bb.max.y) / 2,
          z: (bb.min.z + bb.max.z) / 2,
        };

        const startPos = { 
          positionX: midPoint.x * 1000, 
          positionY: midPoint.y * 1000, 
          positionZ: midPoint.z * 1000
        };
        const endPos = {
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

        if (values.length === 0) continue;

        markupsToCreate.push({
          text: values.join(settings.delimiter),
          start: startPos,
          end: endPos,
          color: settings.markupColor || MARKUP_COLOR,
        });
      }

      if (markupsToCreate.length === 0) {
        addLog("❌ Andmeid pole", "error");
        return;
      }

      const result = await api.markup?.addTextMarkup?.(markupsToCreate);
      let createdIds: number[] = [];

      if (Array.isArray(result)) {
        result.forEach((item: any) => {
          if (typeof item === "object" && item?.id) createdIds.push(Number(item.id));
          else if (typeof item === "number") createdIds.push(item);
        });
      } else if (result?.ids && Array.isArray(result.ids)) {
        createdIds = result.ids.map((id: any) => Number(id)).filter(Boolean);
      } else if (typeof result === "number") {
        createdIds = [result];
      }

      if (createdIds.length > 0) {
        addLog(`✅ ${createdIds.length} märgupit loodud! 🎉`, "success");
      }
    } catch (err: any) {
      addLog(`❌ Viga: ${err?.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [getOrderedSelectedFields, selectedData, settings.delimiter, api, addLog, loadSelectionData]);

  const handleRemoveAllMarkups = useCallback(async () => {
    setIsLoading(true);
    try {
      const allMarkups = await api.markup?.getTextMarkups?.();

      if (!allMarkups || allMarkups.length === 0) {
        addLog("ℹ️ Markupeid pole", "warn");
        return;
      }

      const allIds = allMarkups.map((m: any) => m?.id).filter((id: any) => id != null);

      if (allIds.length === 0) {
        addLog("ℹ️ ID-sid ei leitud", "warn");
        return;
      }

      await api.markup?.removeMarkups?.(allIds);
      addLog(`✅ ${allIds.length} märgupit kustutatud! 🎉`, "success");
    } catch (err: any) {
      addLog(`❌ Viga: ${err?.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [api, addLog]);

  return (
    <div style={{
      fontFamily: "system-ui, -apple-system, sans-serif",
      backgroundColor: "#fafbfc",
      padding: 12,
      borderRadius: 4,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      fontSize: 11,
      color: "#333",
      maxHeight: "100vh",
      overflowY: "auto",
    }}>
      {/* GUIDE SECTION */}
      {showGuide && (
        <div style={{
          padding: 10,
          backgroundColor: "#e3f2fd",
          borderLeft: "4px solid #1976d2",
          borderRadius: 4,
          fontSize: 10,
          whiteSpace: "pre-wrap",
          color: "#0277bd",
        }}>
          {guideText}
          <button
            onClick={() => setShowGuide(false)}
            style={{
              marginTop: 10,
              padding: "6px 12px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            Sulge
          </button>
        </div>
      )}

      {/* HEADER WITH GUIDE BUTTON */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <div style={{
          fontSize: 12,
          color: selectedData.length > 0 ? "#2e7d32" : "#999",
          fontWeight: 600,
          flex: 1,
          textAlign: "center" as const,
        }}>
          {selectedData.length > 0 
            ? `✅ ${selectedData.length} objekti | Väljad: ${selectedCount}`
            : "⚪ Vali objektid 3D vaates..."
          }
        </div>

        <button
          onClick={() => setShowGuide(!showGuide)}
          style={{
            padding: "4px 8px",
            backgroundColor: showGuide ? "#1976d2" : "#e0e0e0",
            color: showGuide ? "white" : "#333",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            minWidth: 32,
            height: 32,
          }}
          title="Näita juhendit"
        >
          {t.guide}
        </button>
      </div>

      {/* AUTO-REFRESH TOGGLE */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 8,
        backgroundColor: "#e8f5e9",
        borderRadius: 4,
        marginBottom: 4,
      }}>
        <input
          type="checkbox"
          checked={settings.autoRefreshEnabled ?? true}
          onChange={(e) => updateSettings({ autoRefreshEnabled: e.target.checked })}
          style={{ cursor: "pointer", width: 16, height: 16 }}
          title={t.autoRefreshTooltip}
        />
        <label
          style={{
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            color: "#1b5e20",
            flex: 1,
          }}
          title={t.autoRefreshTooltip}
        >
          {t.autoRefresh} {settings.autoRefreshEnabled ? "✅" : "❌"}
        </label>
      </div>

      {/* ACTION BUTTONS - COMPACT */}
      <div style={{
        display: "flex",
        gap: 6,
        marginBottom: 8,
      } as any}>
        <button
          onClick={createMarkups}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "7px 10px",
            backgroundColor: isLoading ? "#d0d0d0" : "#1976d2",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 600,
            transition: "background-color 0.2s",
          }}
          onMouseOver={(e) => {
            if (!isLoading) e.currentTarget.style.backgroundColor = "#1565c0";
          }}
          onMouseOut={(e) => {
            if (!isLoading) e.currentTarget.style.backgroundColor = "#1976d2";
          }}
          title="Uuenda andmed ja loo markupid"
        >
          {isLoading ? "..." : t.create}
        </button>

        <button
          onClick={() => loadSelectionData()}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "7px 10px",
            backgroundColor: isLoading ? "#d0d0d0" : "#43a047",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 600,
            transition: "background-color 0.2s",
          }}
          onMouseOver={(e) => {
            if (!isLoading) e.currentTarget.style.backgroundColor = "#388e3c";
          }}
          onMouseOut={(e) => {
            if (!isLoading) e.currentTarget.style.backgroundColor = "#43a047";
          }}
          title="Uuenda kõik andmed"
        >
          {isLoading ? "..." : t.refresh}
        </button>

        <button
          onClick={handleRemoveAllMarkups}
          disabled={isLoading}
          style={{
            padding: "7px 10px",
            backgroundColor: isLoading ? "#ccc" : "#d32f2f",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 600,
            minWidth: 50,
          }}
          title="Kustuta kõik markupid"
        >
          {isLoading ? "..." : t.removeAll}
        </button>
      </div>

      {/* PROPERTIES SECTION */}
      <div style={{
        border: "1px solid #e0e0e0",
        borderRadius: 4,
        padding: 8,
        backgroundColor: "#ffffff",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      } as any}>
        <h3 style={{
          margin: "0 0 8px 0",
          fontSize: 12,
          fontWeight: 600,
          color: "#333",
        }}>
          {t.properties} ({selectedCount})
        </h3>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {allFields.length === 0 ? (
            <p style={{ color: "#999", fontSize: 10, margin: 0 }}>{t.selectObjects}</p>
          ) : (
            Array.from(groupedFields.entries()).map(([groupName, groupFields]) => (
              <div key={groupName} style={{ marginBottom: 8 }}>
                <div style={{
                  padding: "6px 8px",
                  backgroundColor: "#f5f5f5",
                  borderRadius: 3,
                  marginBottom: 4,
                  fontWeight: 600,
                  fontSize: 10,
                  color: "#333",
                  border: "1px solid #e0e0e0",
                  display: "flex",
                  justifyContent: "space-between",
                }}>
                  <span>{groupName}</span>
                  <span style={{ fontWeight: 500, color: "#666", fontSize: 9 }}>
                    {groupFields.filter((f) => f.selected).length}/{groupFields.length}
                  </span>
                </div>

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  border: "1px solid #e6eaf0",
                  borderRadius: 4,
                  padding: 4,
                  background: "#fff",
                  maxHeight: 300,
                  overflow: "auto",
                }}>
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
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                          padding: 4,
                          borderRadius: 3,
                          border: field.selected ? "1px solid #1976d2" : draggedField === field.key ? "1px dashed #1976d2" : "1px solid #eef1f6",
                          background: field.selected ? "#e3f2fd" : "#fff",
                          opacity: field.hasData ? 1 : 0.6,
                          cursor: field.selected ? "grab" : "default",
                          transition: "all 0.15s",
                        } as any}
                      >
                        <span style={{ fontSize: 9, color: field.selected ? "#1976d2" : "#ccc", userSelect: "none" }}>⋮⋮</span>

                        <input
                          type="checkbox"
                          checked={field.selected}
                          onChange={() => toggleField(field.key)}
                          style={{
                            cursor: "pointer",
                            margin: 0,
                            width: 14,
                            height: 14,
                          }}
                        />

                        <span style={{
                          color: "#0066cc",
                          fontSize: 9,
                          fontWeight: 500,
                          flex: 1,
                          wordBreak: "break-word",
                          lineHeight: "1.2",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {field.label}
                        </span>

                        <div style={{ display: "flex", gap: 2, visibility: isInOrder ? "visible" : "hidden" }}>
                          {!isFirst && (
                            <button
                              onClick={() => moveField(field.key, "up")}
                              title="Üles"
                              style={{
                                padding: "3px 5px",
                                fontSize: 9,
                                backgroundColor: "#f0f0f0",
                                border: "1px solid #d0d0d0",
                                borderRadius: 2,
                                cursor: "pointer",
                                transition: "all 0.15s",
                              }}
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
                              title="Alla"
                              style={{
                                padding: "3px 5px",
                                fontSize: 9,
                                backgroundColor: "#f0f0f0",
                                border: "1px solid #d0d0d0",
                                borderRadius: 2,
                                cursor: "pointer",
                                transition: "all 0.15s",
                              }}
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

      {/* FOOTER WITH SETTINGS */}
      <div style={{
        border: "1px solid #e0e0e0",
        borderRadius: 4,
        padding: 8,
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}>
        <div style={{ marginBottom: 6 }}>
          <label style={{
            fontSize: 10,
            fontWeight: 500,
            color: "#555",
            display: "block",
            marginBottom: 2,
          }}>
            {t.delimiter}
          </label>
          <input
            type="text"
            value={settings.delimiter}
            onChange={(e) => updateSettings({ delimiter: e.target.value })}
            style={{
              width: "100%",
              padding: "5px 8px",
              border: "1px solid #d0d0d0",
              borderRadius: 3,
              fontSize: 10,
              boxSizing: "border-box",
              fontFamily: "system-ui",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#1976d2")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#d0d0d0")}
          />
          <div style={{ fontSize: 8, color: "#999", marginTop: 2, fontStyle: "italic" }}>
            Andmete kihtide eraldaja (näit: " | " näitab kihid eraldatult, "\n" näitab real)
          </div>
        </div>

        <div style={{ marginBottom: 6 }}>
          <label style={{
            fontSize: 10,
            fontWeight: 500,
            color: "#555",
            display: "block",
            marginBottom: 4,
          }}>
            🎨 Markupi värv:
          </label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              { color: "#FF0000", label: "Punane" },
              { color: "#00FF00", label: "Roheline" },
              { color: "#0000FF", label: "Sinine" },
              { color: "#FFFF00", label: "Kollane" },
              { color: "#FF00FF", label: "Magenta" },
              { color: "#00FFFF", label: "Cyan" },
              { color: "#FFFFFF", label: "Valge" },
              { color: "#000000", label: "Must" },
            ].map((opt) => (
              <button
                key={opt.color}
                onClick={() => updateSettings({ markupColor: opt.color })}
                style={{
                  width: 28,
                  height: 28,
                  backgroundColor: opt.color,
                  border: settings.markupColor === opt.color ? "3px solid #333" : "1px solid #ccc",
                  borderRadius: 4,
                  cursor: "pointer",
                  title: opt.label,
                }}
                title={opt.label}
              />
            ))}
          </div>
        </div>

        <div>
          <label style={{
            fontSize: 10,
            fontWeight: 500,
            color: "#555",
            display: "block",
            marginBottom: 2,
          }}>
            {t.preview}
          </label>
          {selectedData.length > 1 && (
            <div style={{
              fontSize: 8,
              color: "#d32f2f",
              marginBottom: 4,
              fontWeight: 500,
            }}>
              ⚠️ Eelvaade näitab ainult esimest objekti ({selectedData.length} valitud)
            </div>
          )}
          <div style={{
            fontSize: 9,
            color: previewMarkup ? "#333" : "#999",
            fontFamily: "monospace",
            backgroundColor: "#fafbfc",
            padding: 6,
            borderRadius: 3,
            border: "1px solid #e0e0e0",
            wordBreak: "break-all",
            minHeight: 22,
            maxHeight: 35,
            overflowY: "auto",
            lineHeight: "1.3",
          }}>
            {previewMarkup || t.noData}
          </div>
        </div>

        {/* LOG */}
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              padding: "4px 6px",
              backgroundColor: "#f5f5f5",
              borderBottom: showDebugLog ? "1px solid #e0e0e0" : "none",
              cursor: "pointer",
              fontWeight: 600,
              userSelect: "none",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 9,
              borderRadius: "3px 3px 0 0",
              border: "1px solid #e0e0e0",
            }}
            onClick={() => setShowDebugLog(!showDebugLog)}
          >
            <span>{showDebugLog ? "▼" : "▶"} {t.log} ({logs.length})</span>
            {showDebugLog && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(logs.map((l) => `[${l.timestamp}] ${l.message}`).join("\n"));
                  addLog("✅ Kopeeritud!", "success");
                }}
                style={{
                  padding: "1px 4px",
                  fontSize: 8,
                  backgroundColor: "#e0e0e0",
                  border: "none",
                  borderRadius: 2,
                  cursor: "pointer",
                }}
              >
                📋
              </button>
            )}
          </div>

          {showDebugLog && (
            <div style={{
              overflowY: "auto",
              padding: "4px 6px",
              backgroundColor: "#fafafa",
              maxHeight: 80,
              fontSize: 8,
              fontFamily: "monospace",
              borderRadius: "0 0 3px 3px",
              border: "1px solid #e0e0e0",
              borderTop: "none",
            }}>
              {logs.map((log, idx) => {
                const colors: Record<string, string> = {
                  success: "#2e7d32",
                  error: "#c62828",
                  warn: "#f57f17",
                  info: "#0277bd",
                  debug: "#666666",
                };
                return (
                  <div key={idx} style={{ marginBottom: 1, color: colors[log.level] || "#333" }}>
                    [{log.timestamp}] {log.message}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* VERSION FOOTER */}
      <div style={{
        textAlign: "center" as const,
        fontSize: 8,
        color: "#999",
        fontWeight: 500,
      }}>
        v{COMPONENT_VERSION} • {BUILD_DATE}
      </div>
    </div>
  );
}
