import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlertCircle, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, Copy, Trash } from "lucide-react";

export interface MarkupCreatorProps {
  api: any;
  lastSelection: Array<{
    modelId: string;
    objectId: number;
    name?: string;
    type?: string;
  }>;
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

const normalizeColor = (color: string): string => {
  let hex = color.replace(/^#/, "").toUpperCase();
  if (hex.length === 6 && /^[0-9A-F]{6}$/.test(hex)) return hex;
  return "FF0000";
};

export default function MarkupCreator({ api, lastSelection, onError }: MarkupCreatorProps) {
  const [fields, setFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupColor, setMarkupColor] = useState("FF0000");
  const [delimiter, setDelimiter] = useState(" | ");
  const [markupIds, setMarkupIds] = useState<number[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  
  // 🔍 DEBUG LOG
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const propsCache = useRef(new Map<string, any>());
  const bboxCache = useRef(new Map<string, any>());
  const mountedRef = useRef(true);

  // ✅ DEBUG: Lisa log kirje
  const addLog = useCallback((message: string, level: "info" | "success" | "warn" | "error" | "debug" = "info", details?: string) => {
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
      // Piirata max 100 entry-d
      if (updated.length > 100) {
        return updated.slice(-100);
      }
      return updated;
    });

    // Console-sse ka
    const icon = level === "success" ? "✅" : level === "error" ? "❌" : level === "warn" ? "⚠️" : "ℹ️";
    console.log(`${icon} [${timestamp}] ${message}`, details ? details : "");
  }, []);

  // ✅ Auto-scroll debugi logi
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    mountedRef.current = true;
    addLog("🚀 MarkupCreator komponenti laaditud", "info");
    return () => {
      mountedRef.current = false;
    };
  }, [addLog]);

  // ✅ Discover properties from selected objects
  useEffect(() => {
    const discoverFields = async () => {
      if (!lastSelection || lastSelection.length === 0) {
        setFields([]);
        addLog("❌ Valiku laadimine", "warn", "Valige objektid 3D vaates");
        return;
      }

      addLog(`📥 Omaduste avastamine algusele - ${lastSelection.length} objekti valitud`, "info");
      setIsLoading(true);
      try {
        const fieldSet = new Set<string>();

        // Get properties for FIRST selected object only
        const first = lastSelection[0];
        const cacheKey = `${first.modelId}:${first.objectId}`;

        let props = propsCache.current.get(cacheKey);
        if (!props) {
          addLog(`📥 API kutsed - model=${first.modelId}, objectId=${first.objectId}`, "debug");

          // ✅ TRY 1: Direct API call
          try {
            addLog("🔄 Proovime: api.viewer.getObjectProperties(modelId, objectId, {includeHidden:true})", "debug");
            const result = await api.viewer.getObjectProperties(first.modelId, first.objectId, {
              includeHidden: true,
            });
            props = result;
            addLog("✅ getObjectProperties (single) - ÕNNESTUS", "success", `${JSON.stringify(result).substring(0, 100)}...`);
          } catch (err1: any) {
            addLog("❌ getObjectProperties (single) - EBAÕNNESTUS", "warn", err1?.message);

            // ✅ TRY 2: Batch version
            try {
              addLog("🔄 Proovime: api.viewer.getObjectProperties(modelId, [objectId], {includeHidden:true})", "debug");
              const results = await api.viewer.getObjectProperties(first.modelId, [first.objectId], {
                includeHidden: true,
              });
              props = Array.isArray(results) ? results[0] : results;
              addLog("✅ getObjectProperties (batch) - ÕNNESTUS", "success", `Saadi ${Array.isArray(results) ? results.length : "1"} tulemust`);
            } catch (err2: any) {
              addLog("❌ getObjectProperties (batch) - EBAÕNNESTUS", "error", err2?.message);
              throw err2;
            }
          }

          if (props) {
            propsCache.current.set(cacheKey, props);
            addLog(`✅ Props cached - key: ${cacheKey}`, "debug");
          }
        } else {
          addLog("✅ Props laaditud cache'st", "debug");
        }

        // Extract all property fields
        if (props?.properties && Array.isArray(props.properties)) {
          addLog(`📋 Property sets leitud: ${props.properties.length}`, "info");
          
          props.properties.forEach((propSet: any, setIdx: number) => {
            const setName = propSet?.name || "Unknown";
            if (Array.isArray(propSet?.properties)) {
              addLog(
                `   📦 Set ${setIdx + 1}/${props.properties.length}: "${setName}" - ${propSet.properties.length} omadust`,
                "debug"
              );
              
              propSet.properties.forEach((prop: any) => {
                const propName = prop?.name || "Unknown";
                const displayValue = prop?.displayValue || prop?.value || "(tühi)";
                const key = `${setName}.${propName}`;
                fieldSet.add(key);
                addLog(
                  `      ✓ ${setName}.${propName}`,
                  "debug",
                  `= ${String(displayValue).substring(0, 60)}`
                );
              });
            }
          });
        } else {
          addLog("⚠️ Props.properties pole array", "warn", `Saadud: ${JSON.stringify(props).substring(0, 100)}`);
        }

        // Add standard fields
        fieldSet.add("Name");
        fieldSet.add("Type");
        fieldSet.add("ObjectId");
        addLog("✅ Standardväljad lisatud (Name, Type, ObjectId)", "debug");

        // Convert to sorted field list
        const newFields = Array.from(fieldSet)
          .sort()
          .map((key) => ({
            key,
            label: key,
            selected: ["Name", "Type"].includes(key),
          }));

        if (mountedRef.current) {
          setFields(newFields);
          addLog(`✅ OMADUSTE AVASTAMINE LÕPETATUD - ${newFields.length} omadust leitud`, "success");
        }
      } catch (err: any) {
        addLog("❌ OMADUSTE AVASTAMINE - VIGA", "error", err?.message);
        onError?.(err?.message);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    discoverFields();
  }, [lastSelection, api, addLog, onError]);

  const toggleField = useCallback((key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f))
    );
  }, []);

  // ✅ Get property value for single field
  const getPropertyValue = useCallback(
    async (modelId: string, objectId: number, fieldKey: string): Promise<string> => {
      try {
        // Handle standard fields
        if (fieldKey === "Name") {
          return lastSelection.find((s) => s.modelId === modelId && s.objectId === objectId)?.name || "";
        }
        if (fieldKey === "Type") {
          return lastSelection.find((s) => s.modelId === modelId && s.objectId === objectId)?.type || "";
        }
        if (fieldKey === "ObjectId") {
          return String(objectId);
        }

        // Get from property set
        const cacheKey = `${modelId}:${objectId}`;
        let props = propsCache.current.get(cacheKey);

        if (!props) {
          try {
            const result = await api.viewer.getObjectProperties(modelId, objectId, {
              includeHidden: true,
            });
            props = result;
          } catch (err: any) {
            try {
              const results = await api.viewer.getObjectProperties(modelId, [objectId], {
                includeHidden: true,
              });
              props = Array.isArray(results) ? results[0] : results;
            } catch {
              return "";
            }
          }

          if (props) propsCache.current.set(cacheKey, props);
        }

        // Find property set and value
        if (!props?.properties || !Array.isArray(props.properties)) return "";

        const dotIdx = fieldKey.indexOf(".");
        if (dotIdx === -1) return "";

        const setName = fieldKey.substring(0, dotIdx);
        const propName = fieldKey.substring(dotIdx + 1);

        const propSet = props.properties.find((p: any) => p?.name === setName);
        if (!propSet?.properties) return "";

        const prop = propSet.properties.find((p: any) => p?.name === propName);
        if (!prop) return "";

        return String(prop?.displayValue ?? prop?.value ?? "");
      } catch (err: any) {
        addLog(`⚠️ getPropertyValue error - ${fieldKey}`, "warn", err?.message);
        return "";
      }
    },
    [lastSelection, api, addLog]
  );

  // ✅ Get bounding box for object
  const getObjectBoundingBox = useCallback(
    async (modelId: string, objectId: number) => {
      const key = `${modelId}:${objectId}`;
      if (bboxCache.current.has(key)) {
        addLog(`✅ BBox cache hit - ${key}`, "debug");
        return bboxCache.current.get(key);
      }

      try {
        addLog(`📦 BBox laadimine - model=${modelId}, objectId=${objectId}`, "debug");

        // ✅ TRY 1: Single object
        try {
          addLog("🔄 Proovime: api.viewer.getObjectBoundingBox(modelId, objectId)", "debug");
          const bbox = await api.viewer.getObjectBoundingBox(modelId, objectId);
          if (bbox) {
            addLog("✅ getObjectBoundingBox (single) - ÕNNESTUS", "success");
            bboxCache.current.set(key, bbox);
            return bbox;
          }
        } catch (err1: any) {
          addLog("❌ getObjectBoundingBox (single) - EBAÕNNESTUS", "warn", err1?.message);

          // ✅ TRY 2: Batch
          try {
            addLog("🔄 Proovime: api.viewer.getObjectBoundingBoxes(modelId, [objectId])", "debug");
            const bboxes = await api.viewer.getObjectBoundingBoxes(modelId, [objectId]);
            if (Array.isArray(bboxes) && bboxes[0]) {
              const bbox = bboxes[0];
              addLog("✅ getObjectBoundingBoxes (batch) - ÕNNESTUS", "success");
              bboxCache.current.set(key, bbox);
              return bbox;
            }
          } catch (err2: any) {
            addLog("❌ getObjectBoundingBoxes (batch) - EBAÕNNESTUS", "error", err2?.message);
          }
        }
      } catch (err: any) {
        addLog("⚠️ BBox viga", "warn", err?.message);
      }

      return null;
    },
    [addLog]
  );

  // ✅ CREATE MARKUPS - MAIN FUNCTION
  const createMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔧 MARKUPITE LOOMINE ALUSTAMINE", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    const selectedFields = fields.filter((f) => f.selected);

    if (selectedFields.length === 0) {
      addLog("❌ Valitud väljad", "error", "Vali vähemalt üks väli");
      return;
    }
    addLog(`✅ Valitud väljad: ${selectedFields.length}`, "debug", selectedFields.map((f) => f.key).join(", "));

    if (lastSelection.length === 0) {
      addLog("❌ Valitud objektid", "error", "Vali objektid 3D vaates");
      return;
    }
    addLog(`✅ Valitud objektid: ${lastSelection.length}`, "debug");

    setIsLoading(true);
    addLog(`📍 Loeme ${lastSelection.length} märgupit...`, "info");

    try {
      const markupsToCreate: any[] = [];
      const createdIds: number[] = [];

      addLog(`⚙️ SEADISTUSED:`, "debug");
      addLog(`   - Värvus: #${markupColor}`, "debug");
      addLog(`   - Eraldaja: "${delimiter}"`, "debug");

      // Process each selected object
      for (let idx = 0; idx < lastSelection.length; idx++) {
        const selection = lastSelection[idx];
        try {
          addLog(`\n→ Objekt ${idx + 1}/${lastSelection.length}: ID=${selection.objectId}, nimi="${selection.name}"`, "info");

          // Get bounding box
          const bbox = await getObjectBoundingBox(selection.modelId, selection.objectId);
          if (!bbox) {
            addLog(`  ❌ BBox puudub`, "warn");
            continue;
          }
          addLog(`  ✅ BBox saadud`, "debug");

          // Extract bounding box coordinates (handle different formats)
          let minX, maxX, minY, maxY, minZ, maxZ;

          if (bbox.boundingBox) {
            const bb = bbox.boundingBox;
            minX = bb.min?.x ?? 0;
            maxX = bb.max?.x ?? 0;
            minY = bb.min?.y ?? 0;
            maxY = bb.max?.y ?? 0;
            minZ = bb.min?.z ?? 0;
            maxZ = bb.max?.z ?? 0;
            addLog(`  ✅ BBox format: boundingBox.min/max`, "debug");
          } else if (bbox.min && bbox.max) {
            minX = bbox.min.x;
            maxX = bbox.max.x;
            minY = bbox.min.y;
            maxY = bbox.max.y;
            minZ = bbox.min.z;
            maxZ = bbox.max.z;
            addLog(`  ✅ BBox format: direct min/max`, "debug");
          } else {
            addLog(`  ❌ BBox - tundmatu formaat`, "error", JSON.stringify(bbox).substring(0, 100));
            continue;
          }

          const center = {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            z: (minZ + maxZ) / 2,
          };
          addLog(
            `  📍 Keskpunkt: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
            "debug"
          );

          // Get field values
          const values: string[] = [];
          addLog(`  📋 Väljad laadimine (${selectedFields.length})...`, "debug");
          
          for (const field of selectedFields) {
            const value = await getPropertyValue(selection.modelId, selection.objectId, field.key);
            if (value && value.trim()) {
              values.push(value);
              addLog(`     ✓ ${field.key} = "${value}"`, "debug");
            } else {
              addLog(`     ✗ ${field.key} = (TÜHI)`, "debug");
            }
          }

          if (values.length === 0) {
            addLog(`  ⚠️ Ükski väli ei sisalda väärtust`, "warn");
            continue;
          }

          const text = values.join(delimiter);
          addLog(`  📝 Lõplik tekst: "${text}"`, "success");

          // Calculate start and end points for line
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
          addLog(`  ✅ Markup ettevalmistamine lõpetatud`, "success");
        } catch (err: any) {
          addLog(`  ❌ Objekti töötlemine ebaõnnestus`, "error", err?.message);
        }
      }

      addLog(`\n📤 API kutsed...`, "info");
      addLog(`   Saatmisele: ${markupsToCreate.length} märgupit`, "debug");

      if (markupsToCreate.length === 0) {
        addLog("❌ Ühtegi märgupit ei saadud luua", "error");
        return;
      }

      // ✅ TRY: Add markups
      try {
        addLog("🔄 Proovime: api.markup.addTextMarkup(array)", "debug");
        const result = await api.markup.addTextMarkup(markupsToCreate);
        addLog("✅ api.markup.addTextMarkup - ÕNNESTUS", "success", JSON.stringify(result).substring(0, 100));

        // Parse response
        if (Array.isArray(result)) {
          if (result.length > 0) {
            if (typeof result[0] === "number") {
              createdIds.push(...result);
              addLog(`✅ Tagastati ID-d (number array): ${result.join(", ")}`, "debug");
            } else if (typeof result[0] === "object" && result[0]?.id) {
              createdIds.push(...result.map((m: any) => m.id).filter(Boolean));
              addLog(`✅ Tagastati ID-d (object array): ${createdIds.join(", ")}`, "debug");
            }
          }
        } else if (result?.id) {
          createdIds.push(result.id);
          addLog(`✅ Tagastati üks ID: ${result.id}`, "debug");
        } else if (result?.ids && Array.isArray(result.ids)) {
          createdIds.push(...result.ids);
          addLog(`✅ Tagastati IDs massiiv: ${result.ids.join(", ")}`, "debug");
        } else {
          addLog(`⚠️ Tagastuse formaat tundmatu`, "warn", JSON.stringify(result).substring(0, 100));
        }
      } catch (err1: any) {
        addLog("❌ api.markup.addTextMarkup - EBAÕNNESTUS", "warn", err1?.message);

        // ✅ TRY 2: Add one by one
        addLog("🔄 Proovime ükshaaval lisada...", "info");
        for (const markup of markupsToCreate) {
          try {
            const result = await api.markup.addTextMarkup(markup);
            if (result?.id) {
              createdIds.push(result.id);
              addLog(`  ✅ Ühe markup ID: ${result.id}`, "debug");
            } else if (typeof result === "number") {
              createdIds.push(result);
              addLog(`  ✅ Ühe markup ID (number): ${result}`, "debug");
            }
          } catch (err2: any) {
            addLog(`  ❌ Ühe markup ebaõnnestus`, "error", err2?.message);
          }
        }
      }

      if (createdIds.length > 0) {
        setMarkupIds(createdIds);
        addLog(
          `\n✅ ✅ ✅ MARKUPID LOODUD! ✅ ✅ ✅`,
          "success",
          `${createdIds.length} märgupit ID-dega: ${createdIds.join(", ")}`
        );
      } else {
        addLog("⚠️ Markupit loodi, aga ID-sid ei saadud", "warn");
      }
    } catch (err: any) {
      addLog("❌ MARKUPITE LOOMINE - KRIITILINE VIGA", "error", err?.message);
      onError?.(err?.message);
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [fields, lastSelection, delimiter, markupColor, getPropertyValue, getObjectBoundingBox, addLog, onError]);

  // ✅ Remove markups
  const handleRemoveMarkups = useCallback(async () => {
    addLog("🗑️ MARKUPITE EEMALDAMINE", "info");

    if (markupIds.length === 0) {
      addLog("❌ Pole märgupeid kustutamiseks", "error");
      return;
    }

    setIsLoading(true);
    addLog(`📥 Eemaldamisele: ${markupIds.join(", ")}`, "debug");

    try {
      // ✅ TRY 1: removeMarkups
      try {
        addLog("🔄 Proovime: api.markup.removeMarkups()", "debug");
        await api.markup.removeMarkups(markupIds);
        addLog("✅ removeMarkups - ÕNNESTUS", "success");
      } catch (err1: any) {
        addLog("❌ removeMarkups - EBAÕNNESTUS", "warn", err1?.message);

        // ✅ TRY 2: removeTextMarkup
        try {
          addLog("🔄 Proovime: api.markup.removeTextMarkup()", "debug");
          await api.markup.removeTextMarkup(markupIds);
          addLog("✅ removeTextMarkup - ÕNNESTUS", "success");
        } catch (err2: any) {
          addLog("❌ removeTextMarkup - EBAÕNNESTUS", "error", err2?.message);
          throw err2;
        }
      }

      setMarkupIds([]);
      addLog("✅ ✅ Markupit kustutatud", "success");
    } catch (err: any) {
      addLog("❌ EEMALDAMINE - VIGA", "error", err?.message);
      onError?.(err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [markupIds, api, addLog, onError]);

  // ✅ Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    addLog("🧹 DEBUG LOG PUHASTATUD", "info");
  }, [addLog]);

  // ✅ Copy logs to clipboard
  const copyLogsToClipboard = useCallback(() => {
    const text = logs
      .map((log) => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${log.details ? "\n         " + log.details : ""}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    addLog("✅ DEBUG LOG kopeeritud", "success");
  }, [logs, addLog]);

  return (
    <div style={{ padding: 20, maxWidth: 900, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h2 style={{ margin: "0 0 20px 0", color: "#1a1a1a" }}>🎨 Märgupite Ehitaja</h2>

      {/* STATUS MESSAGE */}
      {statusMessage && (
        <div
          style={{
            marginBottom: 15,
            padding: 12,
            backgroundColor: statusMessage.includes("✅") ? "#e8f5e9" : statusMessage.includes("❌") ? "#ffebee" : "#e3f2fd",
            color: statusMessage.includes("✅") ? "#2e7d32" : statusMessage.includes("❌") ? "#c62828" : "#1565c0",
            borderRadius: 6,
            fontSize: 14,
            border: `1px solid ${statusMessage.includes("✅") ? "#81c784" : statusMessage.includes("❌") ? "#ef5350" : "#64b5f6"}`,
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* SELECTION INFO */}
      <div
        style={{
          marginBottom: 20,
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 15,
          backgroundColor: "#fafafa",
        }}
      >
        <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Valitud objektid: {lastSelection.length}</h3>
        {lastSelection.length === 0 ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#d32f2f" }}>
            <AlertCircle size={18} />
            <span>Vali objektid mudeli 3D vaates (kliki objektile)</span>
          </div>
        ) : (
          <ul style={{ margin: "10px 0 0 0", paddingLeft: 20, fontSize: 13 }}>
            {lastSelection.slice(0, 3).map((s, i) => (
              <li key={i}>
                <strong>#{i + 1}</strong> {s.name || `Object ${s.objectId}`} (ID: {s.objectId})
              </li>
            ))}
            {lastSelection.length > 3 && <li style={{ color: "#666" }}>... ja veel {lastSelection.length - 3}</li>}
          </ul>
        )}
      </div>

      {/* AVAILABLE FIELDS */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>
          Omadused ({fields.length}) {isLoading && "- tuvastan..."}
        </h3>
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
            <p style={{ margin: 0, color: "#999", fontSize: 13 }}>
              {isLoading ? "Laadin omadusi..." : "Valiku järgi omadused laadatakse"}
            </p>
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
                  transition: "background-color 0.15s",
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

      {/* SETTINGS */}
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
          <p style={{ margin: "6px 0 0 0", fontSize: 12, color: "#666" }}>Teksti eraldaja märgistuste vahel</p>
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
          <p style={{ margin: "6px 0 0 0", fontSize: 12, color: "#666" }}>Markupi värv (hex koodina)</p>
        </div>
      </div>

      {/* BUTTONS */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <button
          type="button"
          onClick={createMarkups}
          disabled={
            isLoading ||
            lastSelection.length === 0 ||
            fields.filter((f) => f.selected).length === 0
          }
          style={{
            padding: "12px 20px",
            backgroundColor:
              isLoading || lastSelection.length === 0 || fields.filter((f) => f.selected).length === 0
                ? "#ccc"
                : "#1976d2",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor:
              isLoading || lastSelection.length === 0 || fields.filter((f) => f.selected).length === 0
                ? "not-allowed"
                : "pointer",
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 14,
            fontWeight: "bold",
            transition: "background-color 0.2s",
          }}
        >
          <Plus size={18} />
          {isLoading ? "Loome..." : "➕ Loo Märgupid"}
        </button>

        <button
          type="button"
          onClick={() =>
            setFields((prev) =>
              prev.map((f) => ({ ...f, selected: false }))
            )
          }
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
          Tühjenda Valik
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
          🗑️ Kustuta ({markupIds.length})
        </button>
      </div>

      {/* INSTRUCTIONS */}
      <div
        style={{
          backgroundColor: "#f5f5f5",
          padding: 15,
          borderRadius: 6,
          fontSize: 13,
          border: "1px solid #e0e0e0",
          marginBottom: 20,
        }}
      >
        <p style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>📖 Kasutusjuhis:</p>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Vali üks või mitu objekti 3D mudeli vaates (kliki objektile)</li>
          <li>Omadused laaduvad automaatselt ja kuvatakse eespool</li>
          <li>Märgi checkboxit need omadused, mida soovid markupis näha</li>
          <li>Seada eraldaja (näit. " | ") ja värvus</li>
          <li>Klika "Loo Märgupid" nuppu</li>
          <li>Markupit näidatakse 3D mudelis objekti juures</li>
          <li>Markupi eemaldamiseks klika "Kustuta" nuppu</li>
        </ol>
      </div>

      {/* =============================================== */}
      {/* 🔍 DEBUG LOG - SISSEEHITATUD DIAGNOSTIKA */}
      {/* =============================================== */}
      <div
        style={{
          backgroundColor: "#1a1a1a",
          color: "#00ff00",
          border: "2px solid #00ff00",
          borderRadius: 8,
          overflow: "hidden",
          fontFamily: "monospace",
          fontSize: 11,
        }}
      >
        {/* DEBUG LOG HEADER */}
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
            <span style={{ fontWeight: "bold" }}>🔍 DEBUG LOG ({logs.length})</span>
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

        {/* DEBUG LOG CONTENT */}
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
              <div style={{ color: "#666" }}>--- Logisid pole ---</div>
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
    </div>
  );
}
