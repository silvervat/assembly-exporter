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
  autoRefresh: boolean;
}

const COMPONENT_VERSION = "8.2.1-AUTO";
const BUILD_DATE = new Date().toISOString().split("T")[0];
const MARKUP_COLOR = "FF0000";

const DEFAULTS: Settings = {
  delimiter: " | ",
  selectedFields: [],
  autoRefresh: true,
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

async function getSelectedObjects(api: any) {
  try {
    const selected = await api?.viewer?.getSelectedObjects?.();
    if (!selected || !Array.isArray(selected)) return [];

    const result: Array<{ modelId: string; objects: any[] }> = [];
    for (const item of selected) {
      if (item?.modelId && item?.objects) {
        result.push({
          modelId: String(item.modelId),
          objects: Array.isArray(item.objects) ? item.objects : [item.objects],
        });
      }
    }
    return result;
  } catch (err) {
    console.error("[getSelectedObjects] error:", err);
    return [];
  }
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
  const nameMap = new Map<string, string>();
  for (const modelId of modelIds) {
    try {
      const refObj = await api?.viewer?.getReferenceObject?.(modelId, 0);
      if (refObj?.file?.name) {
        nameMap.set(modelId, String(refObj.file.name));
      }
    } catch {
      // Silent fail
    }
  }
  return nameMap;
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

  const processProps = (props: any[], prefix = "") => {
    if (!Array.isArray(props)) return;
    for (const prop of props) {
      if (typeof prop === "object" && prop !== null) {
        const name = prop.name || prop.propertyName || prop.id;
        const value = prop.value || prop.propertyValue || "";
        if (name) {
          const key = prefix ? `${prefix}.${name}` : name;
          const clean = sanitizeKey(key);
          if (clean) {
            const count = (keyCounts.get(clean) || 0) + 1;
            keyCounts.set(clean, count);
            propMap.set(`${clean}__${count}`, String(value || ""));
          }
        }
        if (prop.propertySet || prop.propertySets) {
          processProps(prop.propertySet || prop.propertySets, prefix ? `${prefix}.${name}` : name);
        }
      }
    }
  };

  processProps(obj.properties || []);

  for (const [keyWithCount, value] of propMap.entries()) {
    const key = keyWithCount.replace(/__\d+$/, "");
    out[key] = value;
  }

  if (obj.name) out.Name = String(obj.name);
  if (obj.type) out.Type = String(obj.type);
  if (obj.guid) {
    out.GUID = String(obj.guid);
    const cls = classifyGuid(obj.guid);
    if (cls === "IFC") out.GUID_IFC = obj.guid;
    if (cls === "MS") out.GUID_MS = obj.guid;
  }

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
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    const handleSelectionChanged = () => {
      // Debounce 200ms
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (settings.autoRefresh) {
        debounceTimerRef.current = setTimeout(() => {
          addLog("🎯 Valik muutus – uuendan andmeid (AUTO)", "info");
          loadSelectionData();
        }, 200);
      }
    };

    try {
      api.viewer.on("Viewer.SelectionChanged", handleSelectionChanged);
      listenerRegistered.current = true;
      addLog("✅ Auto-refresh aktiveeeritud", "success");
    } catch (err) {
      console.error("[AutoRefresh] setup error:", err);
    }

    return () => {
      try {
        api.viewer?.off?.("Viewer.SelectionChanged", handleSelectionChanged);
      } catch {
        // Silent fail
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [api, settings.autoRefresh, addLog, loadSelectionData]);

  const getOrderedSelectedFields = () => {
    return allFields.filter((f) => f.selected).sort((a, b) => {
      const idxA = settings.selectedFields.indexOf(a.key);
      const idxB = settings.selectedFields.indexOf(b.key);
      return idxA - idxB;
    });
  };

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

  const handleDragStart = (e: React.DragEvent, key: string) => {
    setDraggedField(key);
    e.dataTransfer.effectAllowed = "move";
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
    return Array.from(groups.entries());
  }, [allFields]);

  const previewText = getOrderedSelectedFields()
    .filter((f) => selectedData.length > 0 && selectedData[0][f.key])
    .map((f) => selectedData[0][f.key])
    .join(settings.delimiter);

  useEffect(() => {
    setPreviewMarkup(previewText);
  }, [previewText]);

  const createMarkup = async () => {
    if (!selectedData.length || !getOrderedSelectedFields().length) {
      addLog("❌ Andmeid ei ole", "error");
      return;
    }

    try {
      for (const row of selectedData) {
        const markupText = getOrderedSelectedFields()
          .map((f) => row[f.key] || "")
          .join(settings.delimiter);

        if (markupText.trim()) {
          const modelId = row.ModelId;
          await api?.markup?.create?.({
            modelId,
            worldPosition: { x: 0, y: 0, z: 0 },
            type: "text",
            text: markupText,
            color: MARKUP_COLOR,
          });
        }
      }
      addLog("✅ Markupid loodud", "success");
    } catch (err: any) {
      addLog(`❌ Markup viga: ${err?.message}`, "error");
    }
  };

  const removeAllMarkups = async () => {
    try {
      await api?.markup?.deleteAll?.();
      addLog("✅ Markupid kustutatud", "success");
    } catch (err: any) {
      addLog(`❌ Kustutamise viga: ${err?.message}`, "error");
    }
  };

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
      {/* HEADER */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "2px solid #0277bd",
        paddingBottom: 6,
      }}>
        <h2 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#0277bd" }}>
          {t.markupGenerator}
        </h2>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={loadSelectionData}
            disabled={isLoading}
            style={{
              padding: "4px 8px",
              backgroundColor: "#0277bd",
              color: "white",
              border: "none",
              borderRadius: 3,
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 10,
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? t.loading : t.refresh}
          </button>
          <button
            onClick={() => setShowGuide(!showGuide)}
            style={{
              padding: "4px 8px",
              backgroundColor: "#f0f0f0",
              border: "1px solid #d0d0d0",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 10,
            }}
          >
            {t.guide}
          </button>
        </div>
      </div>

      {/* GUIDE */}
      {showGuide && (
        <div style={{
          padding: 8,
          backgroundColor: "#e3f2fd",
          borderLeft: "3px solid #0277bd",
          fontSize: 9,
          whiteSpace: "pre-wrap",
          color: "#0277bd",
          fontFamily: "system-ui",
        }}>
          {guideText}
        </div>
      )}

      {/* AUTO-REFRESH TOGGLE */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 6,
        backgroundColor: "#e8f5e9",
        borderRadius: 3,
      }}>
        <input
          type="checkbox"
          checked={settings.autoRefresh ?? true}
          onChange={(e) => updateSettings({ autoRefresh: e.target.checked })}
          style={{ cursor: "pointer", width: 16, height: 16 }}
          title={t.autoRefreshTooltip}
        />
        <label
          style={{
            cursor: "pointer",
            fontSize: 10,
            fontWeight: 500,
            color: "#1b5e20",
            flex: 1,
          }}
          title={t.autoRefreshTooltip}
        >
          {t.autoRefresh} {settings.autoRefresh ? "✅" : "❌"}
        </label>
      </div>

      {/* ACTION BUTTONS */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={createMarkup}
          disabled={!selectedData.length || !getOrderedSelectedFields().length}
          style={{
            flex: 1,
            padding: 6,
            backgroundColor: "#4caf50",
            color: "white",
            border: "none",
            borderRadius: 3,
            cursor: !selectedData.length ? "not-allowed" : "pointer",
            fontSize: 10,
            fontWeight: 500,
            opacity: !selectedData.length ? 0.6 : 1,
          }}
        >
          {t.create}
        </button>
        <button
          onClick={removeAllMarkups}
          style={{
            padding: "6px 8px",
            backgroundColor: "#f44336",
            color: "white",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          {t.removeAll}
        </button>
      </div>

      {/* PROPERTIES SECTION */}
      <div style={{
        border: "1px solid #e0e0e0",
        borderRadius: 4,
        padding: 8,
        backgroundColor: "#ffffff",
      }}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 10, fontWeight: 600, color: "#555" }}>
          {t.properties}
        </h4>
        {selectedData.length === 0 ? (
          <div style={{ fontSize: 9, color: "#999", fontStyle: "italic" }}>
            {t.selectObjects}
          </div>
        ) : (
          <div style={{ fontSize: 8, color: "#0066cc", marginBottom: 6 }}>
            {t.objectsSelected.replace("{count}", String(selectedData.length)).replace("{fields}", String(getOrderedSelectedFields().length))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {groupedFields.map(([groupName, fields]) => (
            <div key={groupName}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                color: "#555",
                marginBottom: 4,
                paddingLeft: 4,
              }}>
                {groupName}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {fields.map((field) => (
                  <div
                    key={field.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      padding: 4,
                      borderRadius: 3,
                      border: field.selected ? "1px solid #1976d2" : "1px solid #eef1f6",
                      background: field.selected ? "#e3f2fd" : "#fff",
                      opacity: field.hasData ? 1 : 0.6,
                    }}
                  >
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
                    }}>
                      {field.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{
        border: "1px solid #e0e0e0",
        borderRadius: 4,
        padding: 8,
        backgroundColor: "#ffffff",
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
            }}
          />
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
          <div style={{
            fontSize: 9,
            color: previewMarkup ? "#333" : "#999",
            fontFamily: "monospace",
            backgroundColor: "#fafbfc",
            padding: 6,
            borderRadius: 3,
            border: "1px solid #e0e0e0",
            minHeight: 22,
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
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 9,
            }}
            onClick={() => setShowDebugLog(!showDebugLog)}
          >
            {showDebugLog ? "▼" : "▶"} {t.log} ({logs.length})
          </div>

          {showDebugLog && (
            <div style={{
              overflowY: "auto",
              padding: "4px 6px",
              backgroundColor: "#fafafa",
              maxHeight: 80,
              fontSize: 8,
              fontFamily: "monospace",
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

      {/* VERSION */}
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

export default MarkupCreator;
