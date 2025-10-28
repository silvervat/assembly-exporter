import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlertCircle, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, Copy, Trash, Search } from "lucide-react";

export interface MarkupCreatorProps {
  api: any;
  lastSelection?: Array<{
    modelId: string;
    ids?: number[];
    objectId?: number;
    name?: string;
    type?: string;
  }>;
  selectedObjects?: Array<any>;
  onError?: (error: string) => void;
}

interface PropertyField {
  key: string;
  label: string;
  selected: boolean;
}

interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warn" | "error" | "debug";
  message: string;
  details?: string;
}

// VERSION INFO
const COMPONENT_VERSION = "4.2.0";
const BUILD_DATE = new Date().toISOString().split('T')[0];
const API_VERSION = "0.3.12";

const normalizeColor = (color: string): string => {
  let hex = color.replace(/^#/, "").toUpperCase();
  if (hex.length === 6 && /^[0-9A-F]{6}$/.test(hex)) return hex;
  return "FF0000";
};

// ✅ Assembly Exporter meetod: flattenProps (kopeeritud Assembly Exporter'ist)
const flattenProps = (
  obj: any,
  propMap: Map<string, string> = new Map()
): Map<string, string> => {
  const keyCounts = new Map<string, number>();

  const sanitizeKey = (key: string): string => {
    if (!key) return "Unknown";
    return String(key)
      .replace(/[+()]/g, ".")
      .replace(/\s+/g, "_")
      .substring(0, 100);
  };

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
    if (s) propMap.set(key, s);
  };

  // Property setid (sh peidetud)
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
  } else if (typeof obj?.properties === "object" && obj.properties !== null) {
    Object.entries(obj.properties).forEach(([key, val]) => push("Properties", key, val));
  }

  return propMap;
};

// ✅ GUID klassifitseerimine (Assembly Exporter meetod)
const classifyGuid = (guid: string): "IFC" | "MS" | "UNKNOWN" => {
  if (!guid) return "UNKNOWN";
  // IFC GUIDs on 36 chars, MS GUIDs on 32 chars
  const g = String(guid).trim();
  if (g.length === 36) return "IFC";
  if (g.length === 32) return "MS";
  return "UNKNOWN";
};

export default function MarkupCreator({
  api,
  lastSelection = [],
  onError,
}: MarkupCreatorProps) {
  const [fields, setFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupColor, setMarkupColor] = useState("FF0000");
  const [delimiter, setDelimiter] = useState(" | ");
  const [markupIds, setMarkupIds] = useState<number[]>([]);
  const [lastLoadTime, setLastLoadTime] = useState<string>("");

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [processedSelection, setProcessedSelection] = useState<
    Array<{
      modelId: string;
      objectId: number;
      name?: string;
      type?: string;
    }>
  >([]);

  const propsCache = useRef(new Map<string, any>());
  const bboxCache = useRef(new Map<string, any>());
  const guidCache = useRef(new Map<string, { guidIfc: string; guidMs: string }>());
  const mountedRef = useRef(true);

  const addLog = useCallback(
    (message: string, level: "info" | "success" | "warn" | "error" | "debug" = "info", details?: string) => {
      const now = new Date();
      const timestamp = now.toLocaleTimeString("et-EE", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

      const entry: LogEntry = {
        timestamp,
        level,
        message,
        details,
      };

      setLogs((prev) => {
        const updated = [...prev, entry];
        return updated.length > 400 ? updated.slice(-400) : updated;
      });

      console.log(`[${timestamp}] ${message}`, details ? details : "");
    },
    []
  );

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    mountedRef.current = true;
    const loadTime = new Date().toLocaleTimeString("et-EE");
    setLastLoadTime(loadTime);
    addLog(`🚀 MarkupCreator v${COMPONENT_VERSION} laaditud`, "info", `API: ${API_VERSION}, Build: ${BUILD_DATE}`);
    return () => {
      mountedRef.current = false;
    };
  }, [addLog]);

  // ✅ Assembly Exporter andmestruktuuriga töötamine
  useEffect(() => {
    if (!lastSelection || lastSelection.length === 0) {
      setProcessedSelection([]);
      return;
    }

    addLog("📥 Assembly Exporter andmed saadud", "info", `${lastSelection.length} blokki`);

    const converted: Array<{
      modelId: string;
      objectId: number;
      name?: string;
      type?: string;
    }> = [];

    lastSelection.forEach((selection: any, idx: number) => {
      addLog(`📦 Block ${idx + 1}:`, "debug");
      addLog(`   modelId: ${selection.modelId}`, "debug");

      if (Array.isArray(selection.ids)) {
        addLog(`   ids.length: ${selection.ids.length}`, "debug");

        selection.ids.forEach((id: number) => {
          converted.push({
            modelId: selection.modelId,
            objectId: id,
            name: `Object ${id}`,
            type: "Unknown",
          });
        });
      }
    });

    addLog(`✅ Konverteeritud: ${converted.length} objekti`, "success");
    setProcessedSelection(converted);

    if (converted.length > 0) {
      discoverFieldsFromSelection(converted);
    }
  }, [lastSelection, addLog]);

  // ✅ Assembly Exporter flattenProps loogika
  const discoverFieldsFromSelection = async (selection: any[]) => {
    if (!selection || selection.length === 0) {
      setFields([]);
      return;
    }

    addLog("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog(`📥 ASSEMBLY EXPORTER FLATTENPROPS - ${selection.length} objekti`, "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    setIsLoading(true);
    try {
      const fieldSet = new Set<string>();
      const first = selection[0];

      addLog(`\n🎯 ESIMENE OBJEKT (template):`, "debug");
      addLog(`   modelId: ${first.modelId}`, "debug");
      addLog(`   objectId: ${first.objectId}`, "debug");

      if (!first.objectId) {
        addLog(`❌ objectId puudub!`, "error");
        return;
      }

      const cacheKey = `${first.modelId}:${first.objectId}`;
      let fullObj = propsCache.current.get(cacheKey);

      // 1️⃣ getObjectProperties() - Assembly Exporter meetod
      if (!fullObj) {
        addLog("\n1️⃣ api.viewer.getObjectProperties() - { includeHidden: true }", "info");

        try {
          const result = await api.viewer.getObjectProperties(first.modelId, first.objectId, {
            includeHidden: true,
          });

          fullObj = Array.isArray(result) ? result[0] : result;
          addLog(`   ✅ Saadud: ${fullObj ? "Object" : "null"}`, "success");

          if (fullObj?.properties?.length) {
            addLog(`   📋 Property sets: ${fullObj.properties.length}`, "debug");
          }
        } catch (err: any) {
          addLog(`   ❌ Ebaõnnestus: ${err?.message}`, "error");
          fullObj = { properties: [] };
        }

        if (fullObj) {
          propsCache.current.set(cacheKey, fullObj);
        }
      }

      // 2️⃣ flattenProps teisendamine (Assembly Exporter meetod)
      addLog("\n2️⃣ flattenProps() - Property setid lameeks", "info");

      const propMap = flattenProps(fullObj || {});

      if (propMap.size > 0) {
        addLog(`   ✅ Omadused: ${propMap.size}`, "success");

        let count = 0;
        propMap.forEach((value, key) => {
          if (count < 12) {
            const displayValue = String(value).substring(0, 40);
            addLog(`      ${count + 1}. ${key}: "${displayValue}"`, "debug");
          }
          count++;
        });

        if (count > 12) {
          addLog(`      ... ja veel ${count - 12} omadust`, "debug");
        }
      }

      // 3️⃣ GUID käsitlemine (Assembly Exporter meetod)
      addLog("\n3️⃣ GUID Käsitlemine:", "info");

      let guidIfc = "";
      let guidMs = "";
      const cacheGuid = guidCache.current.get(cacheKey);

      if (cacheGuid) {
        guidIfc = cacheGuid.guidIfc;
        guidMs = cacheGuid.guidMs;
        addLog(`   ✅ Cache'st: IFC=${guidIfc.substring(0, 10)}..., MS=${guidMs.substring(0, 10)}...`, "debug");
      } else {
        // Otsi propidest
        for (const [k, v] of propMap) {
          if (!/guid|globalid|tekla_guid|id_guid/i.test(k)) continue;
          const cls = classifyGuid(v);
          if (cls === "IFC" && !guidIfc) guidIfc = v;
          if (cls === "MS" && !guidMs) guidMs = v;
        }

        if (guidIfc || guidMs) {
          addLog(`   ✅ Propsidest: IFC=${guidIfc.substring(0, 10) || "puudub"}..., MS=${guidMs.substring(0, 10) || "puudub"}...`, "debug");
        }

        // 4️⃣ Metadata (Assembly Exporter meetod)
        addLog("\n4️⃣ getObjectMetadata() - GUID_MS", "info");

        try {
          const metaArr = await api.viewer.getObjectMetadata(first.modelId, [first.objectId]);
          const metaOne = Array.isArray(metaArr) ? metaArr[0] : metaArr;

          if (metaOne?.globalId) {
            const g = String(metaOne.globalId);
            guidMs = guidMs || g;
            addLog(`   ✅ Metadata globalId: ${g.substring(0, 10)}...`, "success");
          } else {
            addLog(`   ⚠️ Metadata puudub (normaalne IFC jaoks)`, "warn");
          }
        } catch (err: any) {
          addLog(`   ⚠️ Ebaõnnestus: ${err?.message}`, "warn");
        }

        // 5️⃣ IFC GUID fallback (Assembly Exporter meetod)
        if (!guidIfc && first.objectId) {
          addLog("\n5️⃣ convertToObjectIds() - IFC GUID fallback", "info");

          try {
            const externalIds = await api.viewer.convertToObjectIds(first.modelId, [first.objectId]);
            const externalId = externalIds[0];

            if (externalId && classifyGuid(externalId) === "IFC") {
              guidIfc = externalId;
              addLog(`   ✅ IFC GUID fallback: ${guidIfc.substring(0, 10)}...`, "success");
            }
          } catch (err: any) {
            addLog(`   ⚠️ Ebaõnnestus: ${err?.message}`, "warn");
          }
        }

        guidCache.current.set(cacheKey, { guidIfc, guidMs });
      }

      // 6️⃣ Standard väljad
      addLog("\n6️⃣ STANDARDVÄLJAD:", "info");

      const standardFields = [
        "Name",
        "Type",
        "ObjectId",
        "GUID_IFC",
        "GUID_MS",
        "ProductName",
        "ProductDescription",
        "ProductType",
      ];

      standardFields.forEach((field) => {
        fieldSet.add(field);
      });

      // 7️⃣ Kõik propidest leitud väljad
      propMap.forEach((_, key) => {
        fieldSet.add(key);
      });

      const newFields = Array.from(fieldSet)
        .sort()
        .map((key) => ({
          key,
          label: key,
          selected: ["Name", "Type", "GUID_MS"].includes(key),
        }));

      addLog(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
      addLog(`✅ AVASTAMINE LÕPETATUD`, "success", `${newFields.length} OMADUST LEITUD`);
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");

      if (mountedRef.current) {
        setFields(newFields);
      }
    } catch (err: any) {
      addLog("❌ AVASTAMINE EBAÕNNESTUS", "error", err?.message);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const toggleField = useCallback((key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f))
    );
  }, []);

  const getPropertyValue = useCallback(
    async (modelId: string, objectId: number, fieldKey: string): Promise<string> => {
      try {
        // Standard väljad
        if (fieldKey === "Name") {
          return processedSelection.find((s) => s.modelId === modelId && s.objectId === objectId)?.name || "";
        }
        if (fieldKey === "Type") {
          return processedSelection.find((s) => s.modelId === modelId && s.objectId === objectId)?.type || "";
        }
        if (fieldKey === "ObjectId") {
          return String(objectId);
        }

        // GUID väljad
        if (fieldKey === "GUID_IFC" || fieldKey === "GUID_MS") {
          const cacheKey = `${modelId}:${objectId}`;
          const guidCache = guidCache.current.get(cacheKey);
          if (guidCache) {
            return fieldKey === "GUID_IFC" ? guidCache.guidIfc : guidCache.guidMs;
          }
          return "";
        }

        // Property väljad
        const cacheKey = `${modelId}:${objectId}`;
        let props = propsCache.current.get(cacheKey);

        if (!props) {
          try {
            const result = await api.viewer.getObjectProperties(modelId, objectId, {
              includeHidden: true,
            });
            props = Array.isArray(result) ? result[0] : result;
          } catch {
            return "";
          }

          if (props) propsCache.current.set(cacheKey, props);
        }

        if (!props?.properties || !Array.isArray(props.properties)) return "";

        const propMap = flattenProps(props);
        const fullKey = Array.from(propMap.keys()).find((k) => k === fieldKey || k.includes(fieldKey));

        return propMap.get(fullKey || fieldKey) || "";
      } catch {
        return "";
      }
    },
    [processedSelection, api]
  );

  const getObjectBoundingBox = useCallback(
    async (modelId: string, objectId: number) => {
      const key = `${modelId}:${objectId}`;
      if (bboxCache.current.has(key)) {
        return bboxCache.current.get(key);
      }

      try {
        try {
          const bbox = await api.viewer.getObjectBoundingBox(modelId, objectId);
          if (bbox) {
            bboxCache.current.set(key, bbox);
            return bbox;
          }
        } catch {
          try {
            const bboxes = await api.viewer.getObjectBoundingBoxes(modelId, [objectId]);
            if (Array.isArray(bboxes) && bboxes[0]) {
              bboxCache.current.set(key, bboxes[0]);
              return bboxes[0];
            }
          } catch {}
        }
      } catch {}

      return null;
    },
    [api]
  );

  const createMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔧 MARKUPITE LOOMINE", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    const selectedFields = fields.filter((f) => f.selected);

    if (selectedFields.length === 0) {
      addLog("❌ Valitud väljad puuduvad", "error");
      return;
    }

    if (processedSelection.length === 0) {
      addLog("❌ Valitud objektid puuduvad", "error");
      return;
    }

    setIsLoading(true);
    addLog(`📍 Loem ${processedSelection.length} märgupit...`, "info");

    try {
      const markupsToCreate: any[] = [];
      const createdIds: number[] = [];

      for (let idx = 0; idx < processedSelection.length; idx++) {
        const selection = processedSelection[idx];
        try {
          const bbox = await getObjectBoundingBox(selection.modelId, selection.objectId);
          if (!bbox) continue;

          let minX, maxX, minY, maxY, minZ, maxZ;

          if (bbox.boundingBox) {
            const bb = bbox.boundingBox;
            minX = bb.min?.x ?? 0;
            maxX = bb.max?.x ?? 0;
            minY = bb.min?.y ?? 0;
            maxY = bb.max?.y ?? 0;
            minZ = bb.min?.z ?? 0;
            maxZ = bb.max?.z ?? 0;
          } else if (bbox.min && bbox.max) {
            minX = bbox.min.x;
            maxX = bbox.max.x;
            minY = bbox.min.y;
            maxY = bbox.max.y;
            minZ = bbox.min.z;
            maxZ = bbox.max.z;
          } else {
            continue;
          }

          const center = {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            z: (minZ + maxZ) / 2,
          };

          const values: string[] = [];
          for (const field of selectedFields) {
            const value = await getPropertyValue(selection.modelId, selection.objectId, field.key);
            if (value && value.trim()) {
              values.push(value);
            }
          }

          if (values.length === 0) continue;

          const text = values.join(delimiter);
          const offset = 0.5;
          const start = { x: center.x, y: center.y, z: center.z };
          const end = { x: center.x + offset, y: center.y + offset, z: center.z };

          const hexColor = normalizeColor(markupColor);

          const markupObj = {
            text: text,
            start: {
              positionX: start.x * 1000,
              positionY: start.y * 1000,
              positionZ: start.z * 1000,
            },
            end: {
              positionX: end.x * 1000,
              positionY: end.y * 1000,
              positionZ: end.z * 1000,
            },
            color: hexColor,
          };

          markupsToCreate.push(markupObj);
        } catch (err: any) {
          addLog(`❌ Objekti töötlemine ebaõnnestus: ${err?.message}`, "error");
        }
      }

      if (markupsToCreate.length === 0) {
        addLog("❌ Ühtegi märgupit ei saadud luua", "error");
        return;
      }

      try {
        const result = await api.markup.addTextMarkup(markupsToCreate);

        if (Array.isArray(result)) {
          if (result.length > 0) {
            if (typeof result[0] === "number") {
              createdIds.push(...result);
            } else if (typeof result[0] === "object" && result[0]?.id) {
              createdIds.push(...result.map((m: any) => m.id).filter(Boolean));
            }
          }
        } else if (result?.id) {
          createdIds.push(result.id);
        }
      } catch (err1: any) {
        addLog("❌ Markup loomine ebaõnnestus", "error", err1?.message);
      }

      if (createdIds.length > 0) {
        setMarkupIds(createdIds);
        addLog(`✅ MARKUPID LOODUD!`, "success", `${createdIds.length} märgupit`);
      }
    } catch (err: any) {
      addLog("❌ MARKUPITE LOOMINE EBAÕNNESTUS", "error", err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [fields, processedSelection, delimiter, markupColor, getPropertyValue, getObjectBoundingBox, addLog]);

  const handleRemoveMarkups = useCallback(async () => {
    if (markupIds.length === 0) return;

    setIsLoading(true);

    try {
      try {
        await api.markup.removeMarkups(markupIds);
      } catch {
        await api.markup.removeTextMarkup(markupIds);
      }

      setMarkupIds([]);
      addLog("✅ Markupit kustutatud", "success");
    } catch (err: any) {
      addLog("❌ Eemaldamine ebaõnnestus", "error", err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [markupIds, api, addLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    addLog("🧹 DEBUG LOG PUHASTATUD", "info");
  }, [addLog]);

  const copyLogsToClipboard = useCallback(() => {
    const text = logs
      .map((log) => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${log.details ? "\n         " + log.details : ""}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    addLog("✅ DEBUG LOG kopeeritud", "success");
  }, [logs, addLog]);

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 900,
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: "#1a1a1a" }}>🎨 Märgupite Ehitaja</h2>
        <div style={{ fontSize: 11, color: "#999", textAlign: "right" }}>
          <div>v{COMPONENT_VERSION}</div>
          <div>API: {API_VERSION}</div>
          <div>📅 {BUILD_DATE}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            marginBottom: 20,
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: 15,
            backgroundColor: "#fafafa",
          }}
        >
          <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Valitud objektid: {processedSelection.length}</h3>
          {processedSelection.length === 0 ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#d32f2f", marginBottom: 10 }}>
              <AlertCircle size={18} />
              <span>Vali Assembly Exporteris objektid ja lülitu märgupitele</span>
            </div>
          ) : (
            <ul style={{ margin: "10px 0 0 0", paddingLeft: 20, fontSize: 13 }}>
              {processedSelection.slice(0, 3).map((s, i) => (
                <li key={i}>
                  <strong>#{i + 1}</strong> ID: {s.objectId}
                </li>
              ))}
              {processedSelection.length > 3 && (
                <li style={{ color: "#666" }}>... ja veel {processedSelection.length - 3}</li>
              )}
            </ul>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Omadused ({fields.length})</h3>
          <div
            style={{
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              padding: 12,
              maxHeight: 280,
              overflowY: "auto",
              backgroundColor: "#fafafa",
            }}
          >
            {fields.length === 0 ? (
              <p style={{ margin: 0, color: "#999", fontSize: 13 }}>Oodates omaduste laadimist...</p>
            ) : (
              fields.map((field) => (
                <label
                  key={field.key}
                  style={{
                    display: "block",
                    marginBottom: 8,
                    padding: 8,
                    borderRadius: 4,
                    backgroundColor: field.selected ? "#e3f2fd" : "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={field.selected}
                    onChange={() => toggleField(field.key)}
                    style={{ marginRight: 8, cursor: "pointer" }}
                  />
                  <code style={{ fontSize: 12, color: "#0066cc" }}>{field.label}</code>
                </label>
              ))
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 15,
            marginBottom: 20,
          }}
        >
          <div>
            <label style={{ display: "block", marginBottom: 8, fontWeight: "bold", fontSize: 14 }}>Eraldaja</label>
            <input
              type="text"
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              placeholder=" | "
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 4,
                fontSize: 12,
                fontFamily: "monospace",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 8, fontWeight: "bold", fontSize: 14 }}>Värv</label>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="color"
                value={"#" + normalizeColor(markupColor)}
                onChange={(e) => setMarkupColor(e.target.value.replace(/^#/, "").toUpperCase())}
                style={{
                  width: 50,
                  height: 40,
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={markupColor}
                onChange={(e) => setMarkupColor(e.target.value.replace(/^#/, "").toUpperCase())}
                style={{
                  flex: 1,
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
                placeholder="FF0000"
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <button
            type="button"
            onClick={createMarkups}
            disabled={isLoading || processedSelection.length === 0 || fields.filter((f) => f.selected).length === 0}
            style={{
              padding: "12px 20px",
              backgroundColor:
                isLoading || processedSelection.length === 0 || fields.filter((f) => f.selected).length === 0 ? "#ccc" : "#1976d2",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor:
                isLoading || processedSelection.length === 0 || fields.filter((f) => f.selected).length === 0
                  ? "not-allowed"
                  : "pointer",
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 14,
              fontWeight: "bold",
            }}
          >
            <Plus size={18} />
            ➕ Loo Märgupid
          </button>

          <button
            type="button"
            onClick={() => setFields((prev) => prev.map((f) => ({ ...f, selected: false })))}
            style={{
              padding: "12px 20px",
              backgroundColor: "#757575",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 14,
            }}
          >
            <RefreshCw size={18} />
            Tühjenda
          </button>

          <button
            type="button"
            onClick={handleRemoveMarkups}
            disabled={markupIds.length === 0 || isLoading}
            style={{
              padding: "12px 20px",
              backgroundColor: markupIds.length === 0 || isLoading ? "#ccc" : "#d32f2f",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: markupIds.length === 0 || isLoading ? "not-allowed" : "pointer",
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 14,
            }}
          >
            <Trash2 size={18} />
            🗑️ Kustuta
          </button>
        </div>
      </div>

      {/* DEBUG LOG */}
      <div
        style={{
          backgroundColor: "#1a1a1a",
          color: "#00ff00",
          border: "2px solid #00ff00",
          borderRadius: 8,
          overflow: "hidden",
          fontFamily: "monospace",
          fontSize: 11,
          marginTop: 10,
        }}
      >
        <div
          style={{
            padding: "10px 15px",
            backgroundColor: "#0a0a0a",
            borderBottom: "2px solid #00ff00",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
          onClick={() => setShowDebugLog(!showDebugLog)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {showDebugLog ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span style={{ fontWeight: "bold" }}>🔍 DEBUG LOG v{COMPONENT_VERSION} ({logs.length})</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyLogsToClipboard();
              }}
              style={{
                background: "none",
                border: "1px solid #00ff00",
                color: "#00ff00",
                padding: "4px 8px",
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                gap: 4,
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <Copy size={12} />
              Kopeeri
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearLogs();
              }}
              style={{
                background: "none",
                border: "1px solid #ff3333",
                color: "#ff3333",
                padding: "4px 8px",
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                gap: 4,
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <Trash size={12} />
              Puhasta
            </button>
          </div>
        </div>

        {showDebugLog && (
          <div
            style={{
              maxHeight: 350,
              overflowY: "auto",
              padding: "10px 15px",
              backgroundColor: "#000",
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: "#666" }}>--- Logid ilmuvad siin ---</div>
            ) : (
              logs.map((log, idx) => {
                const levelColors: Record<string, string> = {
                  success: "#00ff00",
                  error: "#ff3333",
                  warn: "#ffaa00",
                  info: "#00ccff",
                  debug: "#888888",
                };

                return (
                  <div key={idx} style={{ marginBottom: 4 }}>
                    <div style={{ color: levelColors[log.level] || "#00ff00" }}>
                      [{log.timestamp}] {log.message}
                    </div>
                    {log.details && (
                      <div style={{ color: "#666", marginLeft: 20, marginTop: 2 }}>
                        → {log.details}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* VERSION INFO */}
      <div
        style={{
          fontSize: 10,
          color: "#999",
          textAlign: "center",
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid #e0e0e0",
        }}
      >
        MarkupCreator v{COMPONENT_VERSION} | Assembly Exporter flattenProps | GUID käsitlemine | Build: {BUILD_DATE}
      </div>
    </div>
  );
}
