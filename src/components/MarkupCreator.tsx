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

// VERSION INFO - NÄHTAV JALUSES
const COMPONENT_VERSION = "4.0.0";
const BUILD_DATE = new Date().toISOString().split('T')[0];
const API_VERSION = "0.3.12";

const normalizeColor = (color: string): string => {
  let hex = color.replace(/^#/, "").toUpperCase();
  if (hex.length === 6 && /^[0-9A-F]{6}$/.test(hex)) return hex;
  return "FF0000";
};

// ✅ Assembly Exporter lahendus: flattenProps
const flattenProps = (properties: any[]): Map<string, string> => {
  const result = new Map<string, string>();
  const keyCounts = new Map<string, number>();

  const push = (key: string, value: any) => {
    const displayValue = value?.displayValue ?? value?.value ?? "";
    const strValue = String(displayValue).trim();
    
    if (!strValue) return;

    let fullKey = key;
    const count = keyCounts.get(key) ?? 0;
    
    if (count > 0) {
      fullKey = `${key} (${count + 1})`;
    }
    
    result.set(fullKey, strValue);
    keyCounts.set(key, count + 1);
  };

  if (!Array.isArray(properties)) return result;

  properties.forEach((propSet: any) => {
    const setName = propSet?.name || "Unknown";
    
    if (Array.isArray(propSet?.properties)) {
      propSet.properties.forEach((prop: any) => {
        const propName = prop?.name || "Unknown";
        const key = `${setName}.${propName}`;
        push(key, prop);
      });
    }
  });

  return result;
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
  const [lastLoadTime, setLastLoadTime] = useState<string>("");
  
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
      if (updated.length > 400) {
        return updated.slice(-400);
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
    const loadTime = new Date().toLocaleTimeString("et-EE");
    setLastLoadTime(loadTime);
    addLog(`🚀 MarkupCreator v${COMPONENT_VERSION} laaditud`, "info", `API: ${API_VERSION}, Build: ${BUILD_DATE}`);
    return () => {
      mountedRef.current = false;
    };
  }, [addLog]);

  const effectiveSelection = lastSelection && lastSelection.length > 0 ? lastSelection : internalSelection;

  // ✅ Assembly Exporter meetod - getSelectedObjects ja andmete kätte saamise voovoog
  const handleDiscoverProperties = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔎 ASSEMBLY EXPORTER MEETODIGA - KÕIK TRIMBLE API KUTSED", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    
    if (!api?.viewer) {
      addLog("❌ api.viewer pole saadaval", "error");
      return;
    }

    setIsLoading(true);
    const startTime = Date.now();
    
    try {
      // 1️⃣ STEP 1: getSelectedObjects() - Assembly Exporter meetod
      addLog("\n1️⃣ STEP: api.viewer.getSelectedObjects()", "info", "Hangi valitud objektid");
      const selected = await api.viewer.getSelectedObjects();
      addLog(`   ✅ Tagastus: ${selected?.length} selection(s)`, "success");

      if (!selected || selected.length === 0) {
        addLog("   ⚠️ Objektid pole valitud", "warn");
        setInternalSelection([]);
        return;
      }

      selected.forEach((sel: any, selIdx: number) => {
        addLog(`\n   📦 Selection ${selIdx + 1}:`, "debug");
        addLog(`      modelId: ${sel.modelId}`, "debug");
        addLog(`      objects.length: ${sel.objects?.length || 0}`, "debug");
        
        if (sel.objects?.length > 0) {
          sel.objects.slice(0, 5).forEach((obj: any, objIdx: number) => {
            addLog(`         ${objIdx + 1}. id=${obj.id}, name=${obj.name}, type=${obj.type}`, "debug");
          });
          if (sel.objects.length > 5) {
            addLog(`         ... ja veel ${sel.objects.length - 5}`, "debug");
          }
        }
      });

      const converted = selected.flatMap((sel: any) => {
        return (sel.objects || []).map((obj: any) => ({
          modelId: sel.modelId,
          objectId: obj.id,
          name: obj.name || `Object ${obj.id}`,
          type: obj.type || "Unknown",
        }));
      });

      addLog(`\n   ✅ Konverteeritud: ${converted.length} objekti`, "success");
      setInternalSelection(converted);

      // 2️⃣ Nüüd laadi omadused
      await discoverFieldsFromSelection(converted);

    } catch (err: any) {
      addLog("❌ getSelectedObjects ebaõnnestus", "error", err?.message);
    } finally {
      setIsLoading(false);
      const elapsed = Date.now() - startTime;
      addLog(`\n⏱️ Avastamise aeg: ${elapsed}ms`, "info");
    }
  }, [api, addLog]);

  // ✅ KÕIK TRIMBLE API KUTSED LOGISSE
  const discoverFieldsFromSelection = async (selection: any[]) => {
    if (!selection || selection.length === 0) {
      setFields([]);
      addLog("❌ Selection on tühi", "warn");
      return;
    }

    addLog("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog(`📥 OMADUSTE AVASTAMINE - ${selection.length} objekti`, "info");
    addLog("Loeme KÕIK andmed: Properties, Metadata, BBox, Layers, jne", "debug");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    setIsLoading(true);
    try {
      const fieldSet = new Set<string>();
      const first = selection[0];
      
      addLog(`\n🎯 ESIMENE OBJEKT (kasutame teda as template):`, "debug");
      addLog(`   modelId: ${first.modelId}`, "debug");
      addLog(`   objectId: ${first.objectId}`, "debug");
      addLog(`   name: ${first.name}`, "debug");
      addLog(`   type: ${first.type}`, "debug");
      
      if (!first.objectId) {
        addLog(`\n⚠️ KRIITILINE: objectId on undefined!`, "error");
        addLog(`   Kontrollige Assembly Exporterit - andmed pole korrektsed`, "warn");
        return;
      }

      const cacheKey = `${first.modelId}:${first.objectId}`;
      let props = propsCache.current.get(cacheKey);
      
      // 2️⃣ getObjectProperties() - KRIITILISED ANDMED
      if (!props) {
        addLog("\n2️⃣ KRIITILNE KUTSE: api.viewer.getObjectProperties()", "info", "{ includeHidden: true }");
        
        try {
          const result = await api.viewer.getObjectProperties(first.modelId, first.objectId, {
            includeHidden: true,
          });
          
          // Assembly Exporter tehnika - käsitle kõiki formaate
          if (Array.isArray(result)) {
            addLog(`   ✅ Tagastus Array[${result.length}]`, "success");
            props = result[0] || { properties: [] };
          } else if (typeof result === "object") {
            addLog(`   ✅ Tagastus Object`, "success");
            props = result;
          } else {
            addLog(`   ⚠️ Tundmatu formaat: ${typeof result}`, "warn");
            props = { properties: [] };
          }

          if (props?.properties) {
            addLog(`   📋 Properties: ${Array.isArray(props.properties) ? props.properties.length + " sets" : "Not array"}`, "debug");
          }
          
        } catch (err: any) {
          addLog(`   ❌ Single kutse ebaõnnestus: ${err?.message}`, "warn");
          
          try {
            addLog("   🔄 Proovime batch meetodit...", "debug");
            const results = await api.viewer.getObjectProperties(first.modelId, [first.objectId], {
              includeHidden: true,
            });
            
            props = Array.isArray(results) ? results[0] : results;
            addLog(`   ✅ Batch kutse õnnestus`, "success");
          } catch (err2: any) {
            addLog(`   ❌ Batch kutse ka ebaõnnestus: ${err2?.message}`, "error");
            props = { properties: [] };
          }
        }

        if (props) {
          propsCache.current.set(cacheKey, props);
        }
      }

      // 📋 Property Sets analüüs - Assembly Exporter meetod kasutab flattenProps
      addLog("\n3️⃣ PROPERTY SETS ANALÜÜS:", "info", "flattenProps() abil teisendamine lameks");
      
      const flatProps = flattenProps(props?.properties || []);
      flatProps.forEach((value, key) => {
        fieldSet.add(key);
      });

      if (flatProps.size > 0) {
        addLog(`   ✅ flattenProps(): ${flatProps.size} omadust`, "success");
        
        let count = 0;
        flatProps.forEach((value, key) => {
          if (count < 15) {
            const displayValue = String(value).substring(0, 50);
            addLog(`      ${count + 1}. ${key}: "${displayValue}"`, "debug");
          }
          count++;
        });
        
        if (count > 15) {
          addLog(`      ... ja veel ${count - 15} omadust`, "debug");
        }
      }

      // 4️⃣ getObjectMetadata() - GUID ja metadata
      addLog("\n4️⃣ TRIMBLE API: api.viewer.getObjectMetadata()", "info");
      try {
        const meta = await api.viewer.getObjectMetadata(first.modelId, first.objectId);
        
        if (meta) {
          addLog(`   ✅ Metadata saadud`, "success");
          if (meta.id) addLog(`      id (GUID_MS): ${meta.id}`, "debug");
          if (meta.name) addLog(`      name: ${meta.name}`, "debug");
          if (meta.type) addLog(`      type: ${meta.type}`, "debug");
          if (meta.revision) addLog(`      revision: ${meta.revision}`, "debug");
          if (meta.created) addLog(`      created: ${meta.created}`, "debug");
          if (meta.modified) addLog(`      modified: ${meta.modified}`, "debug");
        }
      } catch (err: any) {
        addLog(`   ⚠️ Metadata ebaõnnestus: ${err?.message}`, "warn");
      }

      // 5️⃣ convertToObjectIds() - IFC GUID
      addLog("\n5️⃣ TRIMBLE API: api.viewer.convertToObjectIds()", "info", "IFC GUID konversioon");
      try {
        const objectIds = await api.viewer.convertToObjectIds(first.modelId, [first.objectId]);
        if (objectIds && objectIds[0]) {
          addLog(`   ✅ IFC GUID: ${objectIds[0]}`, "success");
        }
      } catch (err: any) {
        addLog(`   ⚠️ IFC GUID konversioon ebaõnnestus: ${err?.message}`, "warn");
      }

      // 6️⃣ getObjectBoundingBox() - KOORDINAADID
      addLog("\n6️⃣ TRIMBLE API: api.viewer.getObjectBoundingBox()", "info");
      try {
        const bbox = await api.viewer.getObjectBoundingBox(first.modelId, first.objectId);
        
        if (bbox) {
          addLog(`   ✅ BBox saadud`, "success");
          if (bbox.min && bbox.max) {
            addLog(`      min: (${bbox.min.x.toFixed(2)}, ${bbox.min.y.toFixed(2)}, ${bbox.min.z.toFixed(2)})`, "debug");
            addLog(`      max: (${bbox.max.x.toFixed(2)}, ${bbox.max.y.toFixed(2)}, ${bbox.max.z.toFixed(2)})`, "debug");
          }
        }
      } catch (err: any) {
        addLog(`   ⚠️ BBox ebaõnnestus: ${err?.message}`, "warn");
      }

      // 7️⃣ getLayers() - KIHTID
      addLog("\n7️⃣ TRIMBLE API: api.viewer.getLayers()", "info");
      try {
        const layers = await api.viewer.getLayers(first.modelId);
        
        if (layers && Array.isArray(layers)) {
          addLog(`   ✅ Layers: ${layers.length}`, "success");
          layers.slice(0, 5).forEach((layer: any, idx: number) => {
            addLog(`      ${idx + 1}. ${layer.name || layer.id}`, "debug");
          });
          if (layers.length > 5) {
            addLog(`      ... ja veel ${layers.length - 5}`, "debug");
          }
        }
      } catch (err: any) {
        addLog(`   ⚠️ Layers ebaõnnestus: ${err?.message}`, "warn");
      }

      // 8️⃣ getPresentationLayers() - ESITUSE KIHTID
      addLog("\n8️⃣ TRIMBLE API: api.viewer.getPresentationLayers()", "info");
      try {
        const presLayers = await api.viewer.getPresentationLayers(first.modelId);
        
        if (presLayers && Array.isArray(presLayers)) {
          addLog(`   ✅ Presentation layers: ${presLayers.length}`, "success");
          presLayers.slice(0, 5).forEach((layer: any, idx: number) => {
            addLog(`      ${idx + 1}. ${layer.name || layer.id}`, "debug");
          });
        }
      } catch (err: any) {
        addLog(`   ⚠️ Presentation layers ebaõnnestus: ${err?.message}`, "warn");
      }

      // 9️⃣ getHierarchyChildren() - HIERARHIA LAPSED
      addLog("\n9️⃣ TRIMBLE API: api.viewer.getHierarchyChildren()", "info");
      try {
        const children = await api.viewer.getHierarchyChildren(first.modelId, [first.objectId], "product", false);
        
        if (children && Array.isArray(children)) {
          addLog(`   ✅ Hierarchy children: ${children.length}`, "success");
          if (children.length > 0) {
            children.slice(0, 3).forEach((child: any, idx: number) => {
              addLog(`      ${idx + 1}. ID: ${child.id}, name: ${child.name}`, "debug");
            });
          }
        }
      } catch (err: any) {
        addLog(`   ⚠️ Hierarchy children ebaõnnestus: ${err?.message}`, "warn");
      }

      // 🔟 getObjectPosition() - OBJEKTI ASUKOHT
      addLog("\n🔟 TRIMBLE API: api.viewer.getObjectPosition()", "info");
      try {
        const positions = await api.viewer.getObjectPosition(first.modelId, [first.objectId]);
        
        if (positions && Array.isArray(positions) && positions[0]) {
          const pos = positions[0];
          addLog(`   ✅ Position saadud`, "success");
          if (pos.position) {
            addLog(`      position: (${pos.position.x.toFixed(2)}, ${pos.position.y.toFixed(2)}, ${pos.position.z.toFixed(2)})`, "debug");
          }
        }
      } catch (err: any) {
        addLog(`   ⚠️ Position ebaõnnestus: ${err?.message}`, "warn");
      }

      // 1️⃣1️⃣ getExternalIds() - VÄLISED ID-D
      addLog("\n1️⃣1️⃣ TRIMBLE API: api.viewer.getExternalIds()", "info");
      try {
        const externalIds = await api.viewer.getExternalIds(first.modelId, [first.objectId]);
        
        if (externalIds && Array.isArray(externalIds) && externalIds[0]) {
          addLog(`   ✅ External ID: ${externalIds[0]}`, "success");
        }
      } catch (err: any) {
        addLog(`   ⚠️ External IDs ebaõnnestus: ${err?.message}`, "warn");
      }

      // 1️⃣2️⃣ getCamera() - KAAMERA ANDMED
      addLog("\n1️⃣2️⃣ TRIMBLE API: api.viewer.getCamera()", "info");
      try {
        const camera = await api.viewer.getCamera();
        
        if (camera) {
          addLog(`   ✅ Camera data saadud`, "success");
          if (camera.position) {
            addLog(`      position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`, "debug");
          }
          if (camera.target) {
            addLog(`      target: (${camera.target.x.toFixed(2)}, ${camera.target.y.toFixed(2)}, ${camera.target.z.toFixed(2)})`, "debug");
          }
        }
      } catch (err: any) {
        addLog(`   ⚠️ Camera ebaõnnestus: ${err?.message}`, "warn");
      }

      // 1️⃣3️⃣ getLoadedModels() - LAADITUD MUDELID
      addLog("\n1️⃣3️⃣ TRIMBLE API: api.viewer.getLoadedModels()", "info");
      try {
        const models = await api.viewer.getLoadedModels();
        
        if (models && Array.isArray(models)) {
          addLog(`   ✅ Loaded models: ${models.length}`, "success");
          models.forEach((model: any, idx: number) => {
            addLog(`      ${idx + 1}. ID: ${model.id}, name: ${model.name}`, "debug");
          });
        }
      } catch (err: any) {
        addLog(`   ⚠️ Loaded models ebaõnnestus: ${err?.message}`, "warn");
      }

      // 1️⃣4️⃣ getSelectedObjects() - PRAEGU VALITUD
      addLog("\n1️⃣4️⃣ TRIMBLE API: api.viewer.getSelectedObjects() - PRAEGU VALITUD", "info");
      try {
        const currentSelection = await api.viewer.getSelectedObjects();
        
        if (currentSelection && Array.isArray(currentSelection)) {
          addLog(`   ✅ Current selection: ${currentSelection.length} objects`, "success");
          currentSelection.forEach((sel: any, idx: number) => {
            addLog(`      ${idx + 1}. ${sel.objects?.length || 0} objekti`, "debug");
          });
        }
      } catch (err: any) {
        addLog(`   ⚠️ Selection ebaõnnestus: ${err?.message}`, "warn");
      }

      // 1️⃣5️⃣ getViewerSettings() - VIEWER SEADISTUSED
      addLog("\n1️⃣5️⃣ TRIMBLE API: api.viewer.getViewerSettings()", "info");
      try {
        const settings = await api.viewer.getViewerSettings();
        
        if (settings) {
          addLog(`   ✅ Viewer settings saadud`, "success");
          addLog(`      Keys: ${Object.keys(settings).join(", ")}`, "debug");
        }
      } catch (err: any) {
        addLog(`   ⚠️ Viewer settings ebaõnnestus: ${err?.message}`, "warn");
      }

      // Add standard fields
      addLog("\n✅ STANDARDVÄLJAD:", "info");
      ["Name", "Type", "ObjectId"].forEach(field => {
        fieldSet.add(field);
      });

      const newFields = Array.from(fieldSet)
        .sort()
        .map((key) => ({
          key,
          label: key,
          selected: ["Name", "Type"].includes(key),
        }));

      addLog(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
      addLog(`✅ ✅ ✅ AVASTAMINE LÕPETATUD ✅ ✅ ✅`, "success", `${newFields.length} OMADUST LEITUD`);
      addLog(`15 TRIMBLE API kutsed - 2 ebaõnnestus võib olla normaalne`, "info");
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
            
            props = Array.isArray(result) ? result[0] : result;
          } catch {
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

        const flatProps = flattenProps(props.properties);
        const fullKey = Array.from(flatProps.keys()).find(k => k.includes(fieldKey));
        
        return flatProps.get(fullKey || fieldKey) || "";
      } catch {
        return "";
      }
    },
    [effectiveSelection, api]
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
      addLog("❌ Valitud väljad", "error");
      return;
    }

    if (effectiveSelection.length === 0) {
      addLog("❌ Valitud objektid", "error");
      return;
    }

    setIsLoading(true);
    addLog(`📍 Loeme ${effectiveSelection.length} märgupit...`, "info");

    try {
      const markupsToCreate: any[] = [];
      const createdIds: number[] = [];

      for (let idx = 0; idx < effectiveSelection.length; idx++) {
        const selection = effectiveSelection[idx];
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
  }, [fields, effectiveSelection, delimiter, markupColor, getPropertyValue, getObjectBoundingBox, addLog]);

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
    <div style={{ padding: 20, maxWidth: 900, fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column", height: "100vh" }}>
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
                  <strong>#{i + 1}</strong> {s.name} (ID: {s.objectId})
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
              <p style={{ margin: 0, color: "#999", fontSize: 13 }}>Klõpsake 'Avasta' nuppu</p>
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
            disabled={isLoading || effectiveSelection.length === 0 || fields.filter((f) => f.selected).length === 0}
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

      {/* DEBUG LOG - JALUSES FIKSEERITUD */}
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
              <div style={{ color: "#666" }}>--- Klõpsake 'Avasta' ---</div>
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

      {/* VERSION INFO JALUSES */}
      <div style={{ 
        fontSize: 10, 
        color: "#999", 
        textAlign: "center", 
        marginTop: 10, 
        paddingTop: 10, 
        borderTop: "1px solid #e0e0e0" 
      }}>
        MarkupCreator v{COMPONENT_VERSION} | Assembly Exporter meetod | 15 Trimble API kutsed | Build: {BUILD_DATE}
      </div>
    </div>
  );
}
