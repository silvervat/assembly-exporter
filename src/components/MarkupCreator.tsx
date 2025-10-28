import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlertCircle, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, Copy, Trash, Search } from "lucide-react";

export interface MarkupCreatorProps {
  api: any;
  lastSelection?: Array<{
    modelId: string;
    objectId: number;
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

const normalizeColor = (color: string): string => {
  let hex = color.replace(/^#/, "").toUpperCase();
  if (hex.length === 6 && /^[0-9A-F]{6}$/.test(hex)) return hex;
  return "FF0000";
};

export default function MarkupCreator({ 
  api, 
  lastSelection = [],
  selectedObjects = [],
  onError 
}: MarkupCreatorProps) {
  const [fields, setFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupColor, setMarkupColor] = useState("FF0000");
  const [delimiter, setDelimiter] = useState(" | ");
  const [markupIds, setMarkupIds] = useState<number[]>([]);
  
  // 🔍 DEBUG LOG - SUPER DETAILNE
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [internalSelection, setInternalSelection] = useState<Array<{
    modelId: string;
    objectId: number;
    name?: string;
    type?: string;
  }>>([]);

  const propsCache = useRef(new Map<string, any>());
  const bboxCache = useRef(new Map<string, any>());
  const mountedRef = useRef(true);

  // ✅ DEBUG: Lisa log kirje - SUPER DETAILNE
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
      if (updated.length > 200) { // Suurendame max entry
        return updated.slice(-200);
      }
      return updated;
    });

    console.log(`[${timestamp}] ${message}`, details ? details : "");
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    mountedRef.current = true;
    addLog("🚀 MarkupCreator komponenti laaditud - SUPER DEBUG versioon", "info", "v2.0 - Kõik omadused nähtavad");
    return () => {
      mountedRef.current = false;
    };
  }, [addLog]);

  const effectiveSelection = lastSelection && lastSelection.length > 0 ? lastSelection : internalSelection;

  // ✅ AVASTA NAPP - KÄSITSI
  const handleDiscoverProperties = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔎 KÄSITSI AVASTA ALGATAMINE", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    
    if (!api?.viewer) {
      addLog("❌ api.viewer pole saadaval", "error", JSON.stringify(Object.keys(api || {})));
      return;
    }

    setIsLoading(true);
    try {
      // Lae valitud objektid
      addLog("📥 Kutsume api.viewer.getSelectedObjects()...", "debug");
      const selected = await api.viewer.getSelectedObjects();
      addLog(`✅ getSelectedObjects tagastus: ${selected?.length} selection(s)`, "success", JSON.stringify(selected).substring(0, 150));

      if (!selected || selected.length === 0) {
        addLog("⚠️ Objektid pole valitud - array on tühi", "warn");
        setInternalSelection([]);
        return;
      }

      // Detailselt näita struktuuri
      selected.forEach((sel: any, selIdx: number) => {
        addLog(`\n📦 Selection ${selIdx + 1}/${selected.length}:`, "debug");
        addLog(`   modelId: ${sel.modelId}`, "debug");
        addLog(`   objects.length: ${sel.objects?.length || 0}`, "debug");
        
        if (sel.objects && Array.isArray(sel.objects)) {
          sel.objects.slice(0, 5).forEach((obj: any, objIdx: number) => {
            addLog(`     Obj ${objIdx + 1}: id=${obj.id}, name=${obj.name}, type=${obj.type}`, "debug");
          });
          if (sel.objects.length > 5) {
            addLog(`     ... ja veel ${sel.objects.length - 5} objekti`, "debug");
          }
        }
      });

      // Konverteeri õigeks formaadiks
      const converted = selected.flatMap((sel: any) => {
        return (sel.objects || []).map((obj: any) => ({
          modelId: sel.modelId,
          objectId: obj.id,
          name: obj.name || `Object ${obj.id}`,
          type: obj.type || "Unknown",
        }));
      });

      addLog(`\n✅ Konverteeritud: ${converted.length} objekti`, "success");
      converted.forEach((obj, idx) => {
        addLog(`   ${idx + 1}. ID=${obj.objectId}, name="${obj.name}", type="${obj.type}"`, "debug");
      });

      setInternalSelection(converted);

      // Nüüd laadi omadused
      await discoverFieldsFromSelection(converted);
    } catch (err: any) {
      addLog("❌ Avasta ebaõnnestus - EXCEPTION", "error", err?.message || err);
    } finally {
      setIsLoading(false);
    }
  }, [api, addLog]);

  // ✅ Discover properties - SUPER DETAILNE
  const discoverFieldsFromSelection = async (selection: any[]) => {
    if (!selection || selection.length === 0) {
      setFields([]);
      addLog("❌ Valiku laadimine - selection on tühi", "warn");
      return;
    }

    addLog("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog(`📥 OMADUSTE AVASTAMINE - ${selection.length} objekti`, "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    setIsLoading(true);
    try {
      const fieldSet = new Set<string>();
      const first = selection[0];
      const cacheKey = `${first.modelId}:${first.objectId}`;

      addLog(`\n🎯 Esimene objekt: modelId=${first.modelId}, objectId=${first.objectId}`, "debug");

      let props = propsCache.current.get(cacheKey);
      if (props) {
        addLog("✅ Props leitud cache'st", "success");
      } else {
        addLog("🔄 Props pole cache's - kutsume API-t...", "debug");

        try {
          addLog("   🔄 TRY 1: api.viewer.getObjectProperties(modelId, objectId, {includeHidden:true})", "debug");
          const result = await api.viewer.getObjectProperties(first.modelId, first.objectId, {
            includeHidden: true,
          });
          
          addLog("   ✅ Tagastus edukalt", "success");
          addLog(`      Andmete tüüp: ${typeof result}`, "debug");
          addLog(`      Is Array: ${Array.isArray(result)}`, "debug");
          addLog(`      Keys: ${Object.keys(result || {}).join(", ")}`, "debug");
          
          props = result;
        } catch (err1: any) {
          addLog(`   ❌ TRY 1 ebaõnnestus: ${err1?.message}`, "warn");

          try {
            addLog("   🔄 TRY 2: api.viewer.getObjectProperties(modelId, [objectId], {includeHidden:true})", "debug");
            const results = await api.viewer.getObjectProperties(first.modelId, [first.objectId], {
              includeHidden: true,
            });
            
            addLog("   ✅ Tagastus edukalt (batch)", "success");
            addLog(`      Is Array: ${Array.isArray(results)}`, "debug");
            addLog(`      Length: ${results?.length || "N/A"}`, "debug");
            
            props = Array.isArray(results) ? results[0] : results;
          } catch (err2: any) {
            addLog(`   ❌ TRY 2 ebaõnnestus: ${err2?.message}`, "error");
            throw err2;
          }
        }

        if (props) {
          propsCache.current.set(cacheKey, props);
          addLog("✅ Props salvestatud cache'sse", "debug");
        }
      }

      // SUPER DETAILNE: Näita KÕIKI omadusi
      addLog("\n📋 OMADUSTE ANALÜÜS:", "info");
      
      if (props?.properties && Array.isArray(props.properties)) {
        addLog(`✅ properties on ARRAY: ${props.properties.length} sets`, "success");
        
        let totalProps = 0;
        props.properties.forEach((propSet: any, setIdx: number) => {
          const setName = propSet?.name || "Unknown";
          const propsInSet = Array.isArray(propSet?.properties) ? propSet.properties.length : 0;
          totalProps += propsInSet;
          
          addLog(`\n   📦 SET ${setIdx + 1}: "${setName}"`, "info", `${propsInSet} omadust`);
          
          if (Array.isArray(propSet?.properties)) {
            propSet.properties.forEach((prop: any, propIdx: number) => {
              const propName = prop?.name || "Unknown";
              const displayValue = prop?.displayValue || prop?.value || "(TÜHI)";
              const key = `${setName}.${propName}`;
              fieldSet.add(key);
              
              // Näita väljad loetelu kujul
              const displayStr = String(displayValue).substring(0, 60);
              addLog(`      ${propIdx + 1}. ${propName}: "${displayStr}"`, "debug");
            });
          }
        });
        
        addLog(`\n✅ KOKKU: ${totalProps} omadust`, "success");
      } else {
        addLog(`⚠️ properties pole Array`, "warn", `Saadud: ${typeof props?.properties}, value: ${JSON.stringify(props?.properties).substring(0, 100)}`);
      }

      // Standard väljad
      addLog("\n📌 STANDARDVÄLJAD:", "info");
      ["Name", "Type", "ObjectId"].forEach(field => {
        fieldSet.add(field);
        addLog(`   ✓ ${field}`, "debug");
      });

      // METADATA - otsige lisaomadusi
      addLog("\n🔍 METADATA KONTROLL:", "info");
      try {
        addLog("   🔄 Kutsume api.viewer.getObjectMetadata()...", "debug");
        const meta = await api.viewer.getObjectMetadata(first.modelId, first.objectId);
        
        if (meta) {
          addLog("   ✅ Metadata saadud", "success", JSON.stringify(meta).substring(0, 100));
          
          if (meta.properties) {
            addLog("   📋 Metadata properties:", "debug");
            Object.entries(meta.properties).forEach(([k, v]: any) => {
              if (typeof v === "string" || typeof v === "number") {
                addLog(`      Metadata.${k}: ${String(v).substring(0, 40)}`, "debug");
              }
            });
          }
        } else {
          addLog("   ⚠️ Metadata tühi", "warn");
        }
      } catch (err: any) {
        addLog(`   ⚠️ Metadata kutsed ebaõnnestus: ${err?.message}`, "warn");
      }

      // GUID-id
      addLog("\n🔑 GUID KONTROLL:", "info");
      try {
        const guid = await api.viewer.getObjectMetadata(first.modelId, first.objectId);
        if (guid?.id) {
          addLog(`   ✓ GUID_MS: ${guid.id}`, "debug");
        }
      } catch (err: any) {
        addLog(`   ⚠️ GUID kutsed ebaõnnestus: ${err?.message}`, "warn");
      }

      // Convert to sorted field list
      const newFields = Array.from(fieldSet)
        .sort()
        .map((key) => ({
          key,
          label: key,
          selected: ["Name", "Type"].includes(key),
        }));

      addLog(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
      addLog(`✅ ✅ ✅ OMADUSTE AVASTAMINE LÕPETATUD ✅ ✅ ✅`, "success", `${newFields.length} OMADUST LEITUD`);
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");

      if (mountedRef.current) {
        setFields(newFields);
      }
    } catch (err: any) {
      addLog("❌ ❌ OMADUSTE AVASTAMINE EBAÕNNESTUS ❌ ❌", "error", err?.message || err);
      onError?.(err?.message);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // Auto-discover kui valitud muutub
  useEffect(() => {
    if (lastSelection && lastSelection.length > 0) {
      addLog(`📥 Assembly Exporter andmed saadud - ${lastSelection.length} objekti`, "debug");
      discoverFieldsFromSelection(lastSelection);
    }
  }, [lastSelection, addLog]);

  const toggleField = useCallback((key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f))
    );
  }, []);

  const getPropertyValue = useCallback(
    async (modelId: string, objectId: number, fieldKey: string): Promise<string> => {
      try {
        if (fieldKey === "Name") {
          return effectiveSelection.find((s) => s.modelId === modelId && s.objectId === objectId)?.name || "";
        }
        if (fieldKey === "Type") {
          return effectiveSelection.find((s) => s.modelId === modelId && s.objectId === objectId)?.type || "";
        }
        if (fieldKey === "ObjectId") {
          return String(objectId);
        }

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
    [effectiveSelection, api, addLog]
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
        } catch (err1: any) {
          try {
            const bboxes = await api.viewer.getObjectBoundingBoxes(modelId, [objectId]);
            if (Array.isArray(bboxes) && bboxes[0]) {
              const bbox = bboxes[0];
              bboxCache.current.set(key, bbox);
              return bbox;
            }
          } catch (err2: any) {
            addLog("❌ getObjectBoundingBoxes - EBAÕNNESTUS", "error", err2?.message);
          }
        }
      } catch (err: any) {
        addLog("⚠️ BBox viga", "warn", err?.message);
      }

      return null;
    },
    [api, addLog]
  );

  const createMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔧 MARKUPITE LOOMINE ALUSTAMINE", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    const selectedFields = fields.filter((f) => f.selected);

    if (selectedFields.length === 0) {
      addLog("❌ Valitud väljad", "error", "Vali vähemalt üks väli");
      return;
    }

    if (effectiveSelection.length === 0) {
      addLog("❌ Valitud objektid", "error", "Klõpsake 'Avasta' nuppu");
      return;
    }

    setIsLoading(true);
    addLog(`📍 Loeme ${effectiveSelection.length} märgupit...`, "info", `Väljad: ${selectedFields.map(f => f.key).join(", ")}`);

    try {
      const markupsToCreate: any[] = [];
      const createdIds: number[] = [];

      for (let idx = 0; idx < effectiveSelection.length; idx++) {
        const selection = effectiveSelection[idx];
        try {
          addLog(`\n→ Objekt ${idx + 1}/${effectiveSelection.length}: ID=${selection.objectId}, nimi="${selection.name}"`, "info");

          const bbox = await getObjectBoundingBox(selection.modelId, selection.objectId);
          if (!bbox) {
            addLog(`  ❌ BBox puudub`, "warn");
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
            addLog(`  ❌ BBox - tundmatu formaat`, "error", JSON.stringify(bbox).substring(0, 100));
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
              addLog(`     ✓ ${field.key} = "${value}"`, "debug");
            }
          }

          if (values.length === 0) {
            addLog(`  ⚠️ Ükski väli ei sisalda väärtust`, "warn");
            continue;
          }

          const text = values.join(delimiter);
          addLog(`  📝 Lõplik tekst: "${text}"`, "success");

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
        addLog("❌ api.markup.addTextMarkup - EBAÕNNESTUS", "error", err1?.message);
      }

      if (createdIds.length > 0) {
        setMarkupIds(createdIds);
        addLog(
          `\n✅ ✅ ✅ MARKUPID LOODUD! ✅ ✅ ✅`,
          "success",
          `${createdIds.length} märgupit ID-dega: ${createdIds.join(", ")}`
        );
      }
    } catch (err: any) {
      addLog("❌ MARKUPITE LOOMINE - KRIITILINE VIGA", "error", err?.message);
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [fields, effectiveSelection, delimiter, markupColor, getPropertyValue, getObjectBoundingBox, addLog]);

  const handleRemoveMarkups = useCallback(async () => {
    if (markupIds.length === 0) return;

    setIsLoading(true);
    addLog("🗑️ Markupite eemaldamine...", "info");

    try {
      try {
        await api.markup.removeMarkups(markupIds);
      } catch {
        await api.markup.removeTextMarkup(markupIds);
      }

      setMarkupIds([]);
      addLog("✅ Markupit kustutatud", "success");
    } catch (err: any) {
      addLog("❌ EEMALDAMINE - VIGA", "error", err?.message);
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
    <div style={{ padding: 20, maxWidth: 900, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h2 style={{ margin: "0 0 20px 0", color: "#1a1a1a" }}>🎨 Märgupite Ehitaja</h2>

      <div
        style={{
          marginBottom: 20,
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 15,
          backgroundColor: "#fafafa",
        }}
      >
        <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Valitud objektid: {effectiveSelection.length}</h3>
        {effectiveSelection.length === 0 ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#d32f2f", marginBottom: 10 }}>
            <AlertCircle size={18} />
            <span>Vali objektid 3D vaates</span>
          </div>
        ) : (
          <ul style={{ margin: "10px 0 0 0", paddingLeft: 20, fontSize: 13 }}>
            {effectiveSelection.slice(0, 3).map((s, i) => (
              <li key={i}>
                <strong>#{i + 1}</strong> {s.name || `Object ${s.objectId}`} (ID: {s.objectId})
              </li>
            ))}
            {effectiveSelection.length > 3 && <li style={{ color: "#666" }}>... ja veel {effectiveSelection.length - 3}</li>}
          </ul>
        )}
        
        <button
          type="button"
          onClick={handleDiscoverProperties}
          disabled={isLoading}
          style={{
            marginTop: 12,
            padding: "10px 16px",
            backgroundColor: isLoading ? "#ccc" : "#ff9800",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: isLoading ? "not-allowed" : "pointer",
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 13,
            fontWeight: "bold",
          }}
        >
          <Search size={16} />
          🔎 Avasta Omadused
        </button>
      </div>

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
              {isLoading ? "Laadin omadusi..." : "Klõpsake 'Avasta' nuppu"}
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
          disabled={
            isLoading ||
            effectiveSelection.length === 0 ||
            fields.filter((f) => f.selected).length === 0
          }
          style={{
            padding: "12px 20px",
            backgroundColor:
              isLoading || effectiveSelection.length === 0 || fields.filter((f) => f.selected).length === 0
                ? "#ccc"
                : "#1976d2",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor:
              isLoading || effectiveSelection.length === 0 || fields.filter((f) => f.selected).length === 0
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

      {/* SUPER DEBUG LOG */}
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
            <span style={{ fontWeight: "bold" }}>🔍 SUPER DEBUG LOG ({logs.length})</span>
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
              maxHeight: 400,
              overflowY: "auto",
              padding: "10px 15px",
              backgroundColor: "#000",
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: "#666" }}>--- Klõpsake "Avasta" et näha logisid ---</div>
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
