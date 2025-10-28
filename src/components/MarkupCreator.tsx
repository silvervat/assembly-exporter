import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AlertCircle, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, Copy, Trash } from "lucide-react";

export interface MarkupCreatorProps {
  api: any;
  // ✅ Assembly Exporter andmed - AUTOMAATSELT
  selectedObjects?: Array<{
    objectId?: number;
    modelId?: string;
    [key: string]: any;
  }>;
  allRows?: Array<{
    [key: string]: string;
  }>;
  allKeys?: string[];
  onError?: (error: string) => void;
}

interface PropertyField {
  key: string;
  label: string;
  selected: boolean;
  group?: string;
  value?: string;
  hasData?: boolean;
}

interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warn" | "error" | "debug";
  message: string;
  details?: string;
}

const COMPONENT_VERSION = "5.1.0";
const BUILD_DATE = new Date().toISOString().split('T')[0];

const normalizeColor = (color: string): string => {
  let hex = color.replace(/^#/, "").toUpperCase();
  if (hex.length === 6 && /^[0-9A-F]{6}$/.test(hex)) return hex;
  return "FF0000";
};

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

export default function MarkupCreator({
  api,
  selectedObjects = [],
  allRows = [],
  allKeys = [],
  onError,
}: MarkupCreatorProps) {
  const [fields, setFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupColor, setMarkupColor] = useState("FF0000");
  const [delimiter, setDelimiter] = useState(" | ");
  const [markupIds, setMarkupIds] = useState<number[]>([]);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [rowsData, setRowsData] = useState<Array<{ [key: string]: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [stats, setStats] = useState({
    totalRows: 0,
    totalKeys: 0,
    groupsCount: 0,
    fieldsWithData: 0,
  });

  const bboxCache = useRef(new Map<string, any>());
  const mountedRef = useRef(true);

  const addLog = useCallback(
    (message: string, level: "info" | "success" | "warn" | "error" | "debug" = "info", details?: string) => {
      const now = new Date();
      const timestamp = now.toLocaleTimeString("et-EE", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const entry: LogEntry = { timestamp, level, message, details };

      setLogs((prev) => {
        const updated = [...prev, entry];
        return updated.length > 500 ? updated.slice(-500) : updated;
      });

      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${details ? ` - ${details}` : ""}`);
    },
    []
  );

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    mountedRef.current = true;
    addLog(`🚀 MarkupCreator v${COMPONENT_VERSION} laaditud`, "info", `Build: ${BUILD_DATE}`);
    return () => {
      mountedRef.current = false;
    };
  }, [addLog]);

  // ✅ AUTO-LOAD Assembly Exporter andmed
  useEffect(() => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("📥 ASSEMBLY EXPORTER ANDMETE AUTOMAATNE LAADIMISE", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    // 1️⃣ Kontrolli andmeid
    addLog("\n1️⃣ ANDMETE KONTROLLIMINE:", "debug");

    if (!allKeys || allKeys.length === 0) {
      addLog("   ⚠️ allKeys puuduvad", "warn");
      return;
    }
    addLog(`   ✅ allKeys: ${allKeys.length} võtit`, "success");

    if (!allRows || allRows.length === 0) {
      addLog("   ⚠️ allRows puuduvad", "warn");
      return;
    }
    addLog(`   ✅ allRows: ${allRows.length} rida`, "success");

    if (!selectedObjects || selectedObjects.length === 0) {
      addLog("   ⚠️ selectedObjects puuduvad", "warn");
      return;
    }
    addLog(`   ✅ selectedObjects: ${selectedObjects.length} objekti`, "success");

    // 2️⃣ Leida valitud objektide andmed
    addLog("\n2️⃣ VALITUD OBJEKTIDE ANDMETE LEIDMINE:", "debug");

    const selectedIds: number[] = [];
    const matchingRows: Array<{ [key: string]: string }> = [];

    selectedObjects.forEach((obj, idx) => {
      const objId = obj.objectId || Number(obj.ObjectId);
      if (objId) {
        selectedIds.push(objId);

        // Leida rida mis vastab
        const row = allRows.find((r) => Number(r.ObjectId) === objId);
        if (row) {
          matchingRows.push(row);
          addLog(`   ✅ ${idx + 1}. ObjectId ${objId}: ${row.Name || "?"}`, "debug");
        } else {
          addLog(`   ⚠️ ${idx + 1}. ObjectId ${objId}: Rida ei leitud`, "warn");
        }
      }
    });

    addLog(`\n   📊 Leitud: ${matchingRows.length}/${selectedObjects.length}`, "success");

    if (matchingRows.length === 0) {
      addLog("   ❌ Ühtegi rida ei leitud", "error");
      return;
    }

    setSelectedIds(selectedIds);
    setRowsData(matchingRows);

    // 3️⃣ Väljadega täitmine
    addLog("\n3️⃣ VÄLJADEGA TÄITMINE:", "debug");

    const groups = groupKeys(allKeys);
    let groupOrder = ["Standard", "Tekla_Assembly", "Nordec_Dalux", "IfcElementAssembly", "AssemblyBaseQuantities", "Other"];

    addLog(`   📊 Grupid: ${groupOrder.length}`, "debug");
    groups.forEach((keys, groupName) => {
      addLog(`      ${groupName}: ${keys.length} välja`, "debug");
    });

    const newFields: PropertyField[] = [];
    let fieldsWithData = 0;

    groupOrder.forEach((groupName) => {
      const groupKeys = groups.get(groupName) || [];
      groupKeys.forEach((key) => {
        const isStandard = [
          "Name",
          "Type",
          "Tekla_Assembly.AssemblyCast_unit_Mark",
          "Tekla_Assembly.AssemblyCast_unit_top_elevation",
        ].includes(key);

        // Kontrolli kas väljal on andmeid
        const hasData = matchingRows.some((row) => {
          const val = row[key];
          return val && val.trim() !== "";
        });

        if (hasData) fieldsWithData++;

        newFields.push({
          key,
          label: key,
          selected: isStandard,
          group: groupName,
          hasData,
        });
      });
    });

    addLog(`   ✅ Väljad loodud: ${newFields.length}`, "success");
    addLog(`      Väljad andmetega: ${fieldsWithData}/${newFields.length}`, "debug");
    addLog(`      Vaikimisi valitud: ${newFields.filter((f) => f.selected).length} välja`, "debug");

    setStats({
      totalRows: matchingRows.length,
      totalKeys: allKeys.length,
      groupsCount: groups.size,
      fieldsWithData,
    });

    if (mountedRef.current) {
      setFields(newFields);
    }

    addLog("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("✅ LAADIMISE LÕPETATUD", "success", "Valmis märgupiteks!");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
  }, [selectedObjects, allRows, allKeys, addLog]);

  const toggleField = useCallback((key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f))
    );
  }, []);

  const toggleGroup = useCallback((group: string) => {
    const groupFields = fields.filter((f) => f.group === group);
    const allSelected = groupFields.every((f) => f.selected);

    setFields((prev) =>
      prev.map((f) => (f.group === group ? { ...f, selected: !allSelected } : f))
    );
  }, [fields]);

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
          const bboxes = await api.viewer.getObjectBoundingBoxes(modelId, [objectId]);
          if (Array.isArray(bboxes) && bboxes[0]) {
            bboxCache.current.set(key, bboxes[0]);
            return bboxes[0];
          }
        }
      } catch (err: any) {
        addLog(`⚠️ BBox päringu viga: ${err?.message}`, "warn");
      }

      return null;
    },
    [api, addLog]
  );

  const createMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔧 MARKUPITE LOOMINE", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    const selectedFields = fields.filter((f) => f.selected);

    addLog(`\n1️⃣ VALIDEERIMINE:`, "debug");
    if (selectedFields.length === 0) {
      addLog("   ❌ Valitud väljad puuduvad", "error");
      return;
    }
    addLog(`   ✅ Valitud väljad: ${selectedFields.length}`, "success");

    if (rowsData.length === 0) {
      addLog("   ❌ Valitud read puuduvad", "error");
      return;
    }
    addLog(`   ✅ Valitud read: ${rowsData.length}`, "success");

    setIsLoading(true);
    addLog(`\n2️⃣ BBOXI JA TEKSTIGA KÄSITLEMINE:`, "debug");
    addLog(`   Luues ${rowsData.length} märgupit...`, "info");

    try {
      const markupsToCreate: any[] = [];
      const createdIds: number[] = [];
      let processed = 0;
      let skipped = 0;

      // Leida ModelId esimesest reast
      const modelId = rowsData[0]?.ModelId;
      if (!modelId) {
        addLog("   ❌ ModelId ei leitud", "error");
        return;
      }

      for (let idx = 0; idx < rowsData.length; idx++) {
        const row = rowsData[idx];
        try {
          const objectId = Number(row.ObjectId);
          if (!objectId) {
            addLog(`   ⚠️ ObjectId puudub reale ${idx + 1}`, "warn");
            skipped++;
            continue;
          }

          const bbox = await getObjectBoundingBox(modelId, objectId);
          if (!bbox) {
            addLog(`   ⚠️ ${objectId}: BBox puudub`, "warn");
            skipped++;
            continue;
          }

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
            skipped++;
            continue;
          }

          const center = {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            z: (minZ + maxZ) / 2,
          };

          const values: string[] = [];
          for (const field of selectedFields) {
            const value = row[field.key] || "";
            if (value && value.trim()) {
              values.push(value);
            }
          }

          if (values.length === 0) {
            addLog(`   ⚠️ ${objectId}: Andmeid valitud väljadele pole`, "warn");
            skipped++;
            continue;
          }

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
          processed++;

          if (idx < 5 || idx % 5 === 0) {
            addLog(`   ✅ ${objectId}: "${text.substring(0, 50)}"`, "debug");
          }
        } catch (err: any) {
          addLog(`   ❌ Real ${idx + 1}: ${err?.message}`, "error");
          skipped++;
        }
      }

      addLog(`\n   📊 Statustika: ${processed} valmis, ${skipped} vahele jäetud`, "info");

      if (markupsToCreate.length === 0) {
        addLog("   ❌ Ühtegi märgupit ei saadud luua", "error");
        return;
      }

      addLog(`\n3️⃣ API KUTSE: addTextMarkup()`, "debug");
      addLog(`   Saadetak: ${markupsToCreate.length} märgupit`, "debug");

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

        addLog(`   ✅ API vastus: ${createdIds.length} ID`, "success");
      } catch (err1: any) {
        addLog("   ❌ API kutse ebaõnnestus", "error", err1?.message);
      }

      if (createdIds.length > 0) {
        setMarkupIds(createdIds);
        addLog(
          `\n✅ MARKUPID LOODUD!`,
          "success",
          `${createdIds.length} märgupit - IDs: ${createdIds.slice(0, 3).join(", ")}${createdIds.length > 3 ? "..." : ""}`
        );
      }
    } catch (err: any) {
      addLog("❌ MARKUPITE LOOMINE EBAÕNNESTUS", "error", err?.message);
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [fields, rowsData, delimiter, markupColor, getObjectBoundingBox, addLog]);

  const handleRemoveMarkups = useCallback(async () => {
    if (markupIds.length === 0) return;

    addLog(`🗑️ MARKUPITE KUSTUTAMINE - ${markupIds.length} märgupit`, "info");

    setIsLoading(true);

    try {
      try {
        await api.markup.removeMarkups(markupIds);
        addLog("   ✅ removeMarkups() õnnestus", "success");
      } catch {
        await api.markup.removeTextMarkup(markupIds);
        addLog("   ✅ removeTextMarkup() õnnestus", "success");
      }

      setMarkupIds([]);
      addLog("✅ Markupit kustutatud", "success");
    } catch (err: any) {
      addLog("❌ Eemaldamine ebaõnnestus", "error", err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [markupIds, api, addLog]);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, PropertyField[]>();
    fields.forEach((field) => {
      const group = field.group || "Other";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(field);
    });
    return groups;
  }, [fields]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    addLog("🧹 DEBUG LOG PUHASTATUD", "info");
  }, [addLog]);

  const copyLogsToClipboard = useCallback(() => {
    const text = logs
      .map(
        (log) =>
          `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${log.details ? "\n                    " + log.details : ""}`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    addLog("✅ DEBUG LOG kopeeritud", "success");
  }, [logs, addLog]);

  return (
    <div
      style={{
        padding: 20,
        maxWidth: "100%",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#f5f5f5",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: "#1a1a1a" }}>🎨 Märgupite Ehitaja v{COMPONENT_VERSION}</h2>
        <div style={{ fontSize: 11, color: "#666", textAlign: "right" }}>
          <div>📊 Read: {stats.totalRows} | Võtid: {stats.totalKeys} | Rühmad: {stats.groupsCount}</div>
          <div>✅ Väljad andmetega: {stats.fieldsWithData}/{fields.length}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* VASAKPOOLNE */}
        <div>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 15,
              backgroundColor: "white",
              marginBottom: 20,
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", fontSize: 14 }}>📍 Valitud objektid</h3>
            {selectedIds.length === 0 ? (
              <div style={{ color: "#999", fontSize: 12 }}>Vali objektid Assembly Exporter'is</div>
            ) : (
              <div style={{ fontSize: 12 }}>
                <div style={{ color: "#1976d2", fontWeight: "bold" }}>{selectedIds.length} objekti</div>
                <ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 11 }}>
                  {selectedIds.slice(0, 5).map((id, i) => {
                    const row = rowsData.find((r) => Number(r.ObjectId) === id);
                    return (
                      <li key={i}>
                        ID {id}: {row?.Name || "?"}
                      </li>
                    );
                  })}
                  {selectedIds.length > 5 && <li>... + {selectedIds.length - 5}</li>}
                </ul>
              </div>
            )}
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 15, backgroundColor: "white" }}>
            <h3 style={{ margin: "0 0 10px 0", fontSize: 14 }}>⚙️ Seaded</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: "bold" }}>Eraldaja:</label>
              <input
                type="text"
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4, fontSize: 11, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: "bold" }}>Värv:</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="color"
                  value={"#" + normalizeColor(markupColor)}
                  onChange={(e) => setMarkupColor(e.target.value.replace(/^#/, "").toUpperCase())}
                  style={{ width: 40, height: 36, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={markupColor}
                  onChange={(e) => setMarkupColor(e.target.value.replace(/^#/, "").toUpperCase())}
                  style={{
                    flex: 1,
                    padding: 8,
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    fontSize: 11,
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={createMarkups}
                disabled={isLoading || rowsData.length === 0 || fields.filter((f) => f.selected).length === 0}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  backgroundColor:
                    isLoading || rowsData.length === 0 || fields.filter((f) => f.selected).length === 0
                      ? "#ccc"
                      : "#1976d2",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor:
                    isLoading || rowsData.length === 0 || fields.filter((f) => f.selected).length === 0
                      ? "not-allowed"
                      : "pointer",
                  fontSize: 12,
                  fontWeight: "bold",
                }}
              >
                ➕ Loo Märgupid
              </button>

              <button
                type="button"
                onClick={handleRemoveMarkups}
                disabled={markupIds.length === 0 || isLoading}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  backgroundColor: markupIds.length === 0 || isLoading ? "#ccc" : "#d32f2f",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: markupIds.length === 0 || isLoading ? "not-allowed" : "pointer",
                  fontSize: 12,
                }}
              >
                🗑️ Kustuta
              </button>
            </div>
          </div>
        </div>

        {/* PAREMPOOLNE */}
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 15, backgroundColor: "white", overflowY: "auto" }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 14 }}>📋 Omadused ({fields.length})</h3>

          {fields.length === 0 ? (
            <p style={{ color: "#999", fontSize: 12 }}>Oodates andmete laadimist...</p>
          ) : (
            Array.from(groupedFields.entries()).map(([groupName, groupFields]) => (
              <div key={groupName} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    padding: 8,
                    backgroundColor: "#f0f0f0",
                    borderRadius: 4,
                    marginBottom: 6,
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: 11,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                  onClick={() => toggleGroup(groupName)}
                >
                  <span>{groupName}</span>
                  <span style={{ fontSize: 10, color: "#666" }}>
                    {groupFields.filter((f) => f.selected).length}/{groupFields.length}
                  </span>
                </div>

                <div style={{ paddingLeft: 8 }}>
                  {groupFields.map((field) => (
                    <label
                      key={field.key}
                      style={{
                        display: "block",
                        marginBottom: 6,
                        padding: 6,
                        borderRadius: 3,
                        backgroundColor: field.selected ? "#e3f2fd" : "transparent",
                        cursor: "pointer",
                        fontSize: 11,
                        userSelect: "none",
                        opacity: field.hasData ? 1 : 0.6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={field.selected}
                        onChange={() => toggleField(field.key)}
                        style={{ marginRight: 6, cursor: "pointer" }}
                      />
                      <code style={{ color: "#0066cc" }}>{field.label}</code>
                      {!field.hasData && <span style={{ color: "#999", fontSize: 10 }}> (tühi)</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* DEBUG LOG */}
      <div
        style={{
          backgroundColor: "#1a1a1a",
          color: "#00ff00",
          border: "2px solid #00ff00",
          borderRadius: 6,
          overflow: "hidden",
          fontFamily: "monospace",
          fontSize: 9,
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: "#0a0a0a",
            borderBottom: "2px solid #00ff00",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
          onClick={() => setShowDebugLog(!showDebugLog)}
        >
          <span style={{ fontWeight: "bold" }}>
            {showDebugLog ? "▼" : "▶"} 🔍 DEBUG LOG ({logs.length})
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyLogsToClipboard();
              }}
              style={{
                background: "none",
                border: "1px solid #00ff00",
                color: "#00ff00",
                padding: "2px 4px",
                borderRadius: 2,
                cursor: "pointer",
                fontSize: 9,
              }}
            >
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
                padding: "2px 4px",
                borderRadius: 2,
                cursor: "pointer",
                fontSize: 9,
              }}
            >
              Puhasta
            </button>
          </div>
        </div>

        {showDebugLog && (
          <div style={{ maxHeight: 220, overflowY: "auto", padding: "8px 12px", backgroundColor: "#000" }}>
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
                  <div key={idx} style={{ marginBottom: 2 }}>
                    <span style={{ color: levelColors[log.level] || "#00ff00" }}>
                      [{log.timestamp}] {log.message}
                    </span>
                    {log.details && (
                      <div style={{ color: "#666", marginLeft: 12, fontSize: 8, marginTop: 1 }}>
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
