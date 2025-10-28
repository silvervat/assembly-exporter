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
  details?: string;
}

interface Row {
  [key: string]: string;
}

const COMPONENT_VERSION = "6.3.0";
const BUILD_DATE = new Date().toISOString().split('T')[0];

// ✅ Samad funktsioonid kui Assembly Exporter'is

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
  } catch {}
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
  } catch {}
  return result;
}

// ✅ flattenProps - Assembly Exporter loogika
async function flattenProps(
  obj: any,
  modelId: string,
  projectName: string,
  modelNameById: Map<string, string>,
  api: any,
  addLog: (msg: string, level?: string) => void
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

  // Property setid
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

  // Standard väljad
  if (obj?.id) out.ObjectId = String(obj.id);
  if (obj?.name) out.Name = String(obj.name);
  if (obj?.type) out.Type = String(obj.type);

  // GUIDid
  let guidIfc = "";
  let guidMs = "";

  for (const [k, v] of propMap) {
    if (!/guid|globalid/i.test(k)) continue;
    const cls = classifyGuid(v);
    if (cls === "IFC" && !guidIfc) guidIfc = v;
    if (cls === "MS" && !guidMs) guidMs = v;
  }

  // Metadata GUID_MS
  try {
    const metaArr = await api?.viewer?.getObjectMetadata?.(modelId, [obj?.id]);
    const metaOne = Array.isArray(metaArr) ? metaArr[0] : metaArr;
    if (metaOne?.globalId) {
      const g = String(metaOne.globalId);
      out.GUID_MS = out.GUID_MS || g;
      guidMs = guidMs || g;
    }
  } catch {}

  // IFC GUID fallback
  if (!guidIfc && obj.id) {
    try {
      const externalIds = await api.viewer.convertToObjectIds(modelId, [obj.id]);
      const externalId = externalIds[0];
      if (externalId && classifyGuid(externalId) === "IFC") guidIfc = externalId;
    } catch {}
  }

  // Presentation Layers
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

  // Reference Object
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

// ✅ getSelectedObjects - Assembly Exporter loogika
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

const normalizeColor = (color: string): string => {
  let hex = color.replace(/^#/, "").toUpperCase();
  if (hex.length === 6 && /^[0-9A-F]{6}$/.test(hex)) return hex;
  return "FF0000";
};

export default function MarkupCreator({ api, onError }: MarkupCreatorProps) {
  const [fields, setFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupColor, setMarkupColor] = useState("FF0000");
  const [delimiter, setDelimiter] = useState(" | ");
  const [markupIds, setMarkupIds] = useState<number[]>([]);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [selectedData, setSelectedData] = useState<Row[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [stats, setStats] = useState({
    totalObjects: 0,
    totalKeys: 0,
    groupsCount: 0,
    fieldsWithData: 0,
  });

  const bboxCache = useRef(new Map<string, any>());
  const mountedRef = useRef(true);
  const listenerRegistered = useRef(false);

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
    addLog("⏳ Oodates valimist 3D vaates...", "info");
    return () => {
      mountedRef.current = false;
    };
  }, [addLog]);

  // ✅ REAL-TIME: Kuula valimisi - Assembly Exporter loogika
  useEffect(() => {
    if (!api?.viewer || listenerRegistered.current) return;

    const loadSelectionData = async () => {
      try {
        addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
        addLog("🎯 REAL-TIME VALIMISE TUVASTAMINE", "info");
        addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

        // 1️⃣ Hangi valitud objektid
        addLog("\n1️⃣ VALITUD OBJEKTIDE LEIDMINE:", "debug");
        const selectedWithBasic = await getSelectedObjects(api);

        if (!selectedWithBasic || selectedWithBasic.length === 0) {
          if (selectedIds.length > 0) {
            addLog("⏳ Valik tühjaks - oodates uut valimist...", "info");
            setSelectedIds([]);
            setSelectedData([]);
            setFields([]);
          }
          return;
        }

        addLog(`   ✅ Leitud: ${selectedWithBasic.length} mudeli/mudeleid`, "success");

        // 2️⃣ Hangi andmed Assembly Exporter loogikaga
        addLog("\n2️⃣ ANDMETE HANKIMINE:", "debug");

        const projectName = await getProjectName(api);
        const modelIds = selectedWithBasic.map((s) => s.modelId);
        const nameMap = await buildModelNameMap(api, modelIds);

        const allRows: Row[] = [];
        const allIds: number[] = [];

        for (const selection of selectedWithBasic) {
          const modelId = selection.modelId;
          const objectRuntimeIds = selection.objects.map((o: any) => o?.id || o).filter(Boolean);

          if (!objectRuntimeIds.length) continue;

          addLog(`   🔍 Mudel ${modelId}: ${objectRuntimeIds.length} objekti`, "debug");

          try {
            // Hangi objektide andmed
            const fullObjects = await api.viewer.getObjectProperties(modelId, objectRuntimeIds, { includeHidden: true });

            // Flatten properties
            const flattened = await Promise.all(
              fullObjects.map((o: any) => flattenProps(o, modelId, projectName, nameMap, api, addLog))
            );

            allRows.push(...flattened);
            flattened.forEach((row) => {
              const objId = Number(row.ObjectId);
              if (objId && !allIds.includes(objId)) allIds.push(objId);
            });

            addLog(`      ✅ Laaditud: ${flattened.length} objekti`, "debug");
          } catch (err: any) {
            addLog(`      ❌ Viga: ${err?.message}`, "error");
          }
        }

        if (allRows.length === 0) {
          addLog("   ⚠️ Andmeid ei leitud", "warn");
          return;
        }

        addLog(`\n   ✅ Kokku laaditud: ${allRows.length} objekti`, "success");

        setSelectedIds(allIds);
        setSelectedData(allRows);

        // 3️⃣ Väljadega täitmine
        addLog("\n3️⃣ VÄLJADEGA TÄITMINE:", "debug");

        const allKeys = Array.from(new Set(allRows.flatMap((r) => Object.keys(r)))).sort();
        const groups = groupKeys(allKeys);
        let groupOrder = ["Standard", "Tekla_Assembly", "Nordec_Dalux", "IfcElementAssembly", "AssemblyBaseQuantities", "Other"];

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

            const hasData = allRows.some((row) => {
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
          totalObjects: allRows.length,
          totalKeys: allKeys.length,
          groupsCount: groups.size,
          fieldsWithData,
        });

        if (mountedRef.current) {
          setFields(newFields);
        }

        addLog("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
        addLog("✅ REAL-TIME LAADIMISE LÕPETATUD", "success", "Valmis märgupiteks!");
        addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      } catch (err: any) {
        addLog("❌ REAL-TIME valimise laadimine ebaõnnestus", "error", err?.message);
      }
    };

    // Kuula muutusi
    const handleSelectionChanged = () => {
      loadSelectionData();
    };

    api.viewer.addOnSelectionChanged?.(handleSelectionChanged);
    listenerRegistered.current = true;

    // Kohe alguses
    loadSelectionData();

    return () => {
      api.viewer.removeOnSelectionChanged?.(handleSelectionChanged);
      listenerRegistered.current = false;
    };
  }, [api, addLog]);

  const toggleField = useCallback((key: string) => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f)));
  }, []);

  const toggleGroup = useCallback(
    (group: string) => {
      const groupFields = fields.filter((f) => f.group === group);
      const allSelected = groupFields.every((f) => f.selected);
      setFields((prev) => prev.map((f) => (f.group === group ? { ...f, selected: !allSelected } : f)));
    },
    [fields]
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
    if (selectedData.length === 0) {
      addLog("❌ Valitud andmed puuduvad", "error");
      return;
    }

    setIsLoading(true);
    addLog(`\n📍 Luues ${selectedData.length} märgupit...`, "info");

    try {
      const markupsToCreate: any[] = [];
      const modelId = selectedData[0]?.ModelId;

      // ✅ PRODUKTIIVSUSEST: Hangi KÕIK BBox-id KORRAGA
      addLog("\n1️⃣ BBOXE HANKIMINE:", "debug");

      const objectIds = selectedData.map((row) => Number(row.ObjectId)).filter(Boolean);
      
      if (objectIds.length === 0) {
        addLog("❌ ObjectId-d puuduvad", "error");
        return;
      }

      addLog(`   Hangin ${objectIds.length} BBox-i korraga...`, "debug");

      let bBoxes: any[] = [];
      try {
        // ✅ ÕIGE API: getObjectBoundingBoxes (MASSIIV!)
        bBoxes = await api.viewer?.getObjectBoundingBoxes?.(modelId, objectIds);
        addLog(`   ✅ Saadud: ${bBoxes.length} BBox-i`, "success");
      } catch (err: any) {
        addLog(`   ⚠️ getObjectBoundingBoxes viga: ${err?.message}`, "warn");
        addLog(`   💡 Fallback: kasutame staatilist positsioonida`, "debug");
        
        // Fallback: lihtne fallback
        bBoxes = objectIds.map((id) => ({
          id,
          boundingBox: {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 1 },
          },
        }));
      }

      // ✅ PRODUKTIIVSUSEST: Loome markup'id BBox-idest
      addLog("\n2️⃣ MARKUP'IDE LOOMINE:", "debug");

      for (let idx = 0; idx < selectedData.length; idx++) {
        const row = selectedData[idx];
        const objectId = Number(row.ObjectId);

        try {
          // Leia vastav BBox
          const bBox = bBoxes.find((b) => b.id === objectId);
          if (!bBox) {
            addLog(`   ⚠️ ${objectId}: BBox puudub`, "warn");
            continue;
          }

          // ✅ PRODUKTIIVSUSEST: getMidPoint
          const bb = bBox.boundingBox;
          const midPoint = {
            x: (bb.min.x + bb.max.x) / 2,
            y: (bb.min.y + bb.max.y) / 2,
            z: (bb.min.z + bb.max.z) / 2,
          };

          // ✅ PRODUKTIIVSUSEST: start JA end on SAMAD!
          const point = {
            positionX: midPoint.x * 1000,
            positionY: midPoint.y * 1000,
            positionZ: midPoint.z * 1000,
          };

          // Koguma teksti
          const values: string[] = [];
          for (const field of selectedFields) {
            const value = row[field.key] || "";
            if (value && value.trim()) {
              values.push(value);
            }
          }

          if (values.length === 0) {
            addLog(`   ⚠️ ${objectId}: Andmeid pole`, "warn");
            continue;
          }

          const text = values.join(delimiter);
          const hexColor = normalizeColor(markupColor);

          // ✅ TextMarkup struktuuri ÕIGESTI
          const markup = {
            text: text,
            start: point,
            end: point, // ← SAMA!
            color: hexColor,
          };

          markupsToCreate.push(markup);

          if (idx < 3) {
            addLog(`   ✅ ${idx + 1}. "${text.substring(0, 40)}"`, "debug");
          }
        } catch (err: any) {
          addLog(`   ❌ Objekti ${idx + 1}: ${err?.message}`, "error");
        }
      }

      addLog(`\n   📊 Valmis: ${markupsToCreate.length} märgupit`, "success");

      if (markupsToCreate.length === 0) {
        addLog("❌ Ühtegi märgupit ei saadud luua", "error");
        return;
      }

      // ✅ PRODUKTIIVSUSEST: addTextMarkup tagastab OBJEKTIDE massiivi
      addLog("\n3️⃣ SAATMINE API-LE:", "debug");
      addLog(`   📤 Saadetak: ${markupsToCreate.length} märgupit`, "debug");

      const result = await api.markup?.addTextMarkup?.(markupsToCreate);

      addLog(`   ✅ API vastus kätte`, "success");

      // ✅ Parse vastused - koguvad .id omadust
      const createdIds: number[] = [];

      if (Array.isArray(result)) {
        addLog(`   📊 Vastus: massiiv ${result.length} elemendiga`, "debug");

        result.forEach((item: any, idx: number) => {
          if (typeof item === "object" && item?.id) {
            createdIds.push(Number(item.id));
            if (idx < 3) addLog(`      ✅ ${idx + 1}. ID: ${item.id}`, "debug");
          }
        });
      }

      if (createdIds.length > 0) {
        setMarkupIds(createdIds);
        addLog(`\n✅ MARKUPID LOODUD: ${createdIds.length} märgupit! 🎉`, "success");
      } else {
        addLog("⚠️ Vastus saadi, aga ID-sid ei leitud", "warn");
      }
    } catch (err: any) {
      addLog("❌ Viga", "error", err?.message);
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [fields, selectedData, delimiter, markupColor, addLog]);

  const handleRemoveMarkups = useCallback(async () => {
    if (markupIds.length === 0) return;

    setIsLoading(true);
    try {
      await api.markup?.removeMarkups?.(markupIds);
      setMarkupIds([]);
      addLog("✅ Markupit kustutatud", "success");
    } catch (err: any) {
      addLog("❌ Viga", "error", err?.message);
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

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#f5f5f5",
        overflowY: "auto",
      }}
    >
      <div style={{ marginBottom: 15 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 16 }}>🎨 Märgupite Ehitaja v{COMPONENT_VERSION}</h2>
        <div style={{ fontSize: 10, color: "#666" }}>
          📊 Objektid: {stats.totalObjects} | Võtid: {stats.totalKeys} | Väljad andmetega: {stats.fieldsWithData}/{fields.length}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, flex: 1, minHeight: 0 }}>
        {/* VASAKPOOLNE */}
        <div style={{ overflowY: "auto" }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, backgroundColor: "white", marginBottom: 12 }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 13 }}>⚙️ Seaded</h3>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, fontWeight: "bold", display: "block", marginBottom: 4 }}>Eraldaja:</label>
              <input
                type="text"
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                style={{ width: "100%", padding: 6, border: "1px solid #ccc", borderRadius: 3, fontSize: 10, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, fontWeight: "bold", display: "block", marginBottom: 4 }}>Värv:</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="color"
                  value={"#" + normalizeColor(markupColor)}
                  onChange={(e) => setMarkupColor(e.target.value.replace(/^#/, "").toUpperCase())}
                  style={{ width: 30, height: 30, border: "1px solid #ccc", borderRadius: 3, cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={markupColor}
                  onChange={(e) => setMarkupColor(e.target.value.replace(/^#/, "").toUpperCase())}
                  style={{ flex: 1, padding: 6, border: "1px solid #ccc", borderRadius: 3, fontSize: 10, boxSizing: "border-box", fontFamily: "monospace" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={createMarkups}
                disabled={isLoading || selectedData.length === 0 || fields.filter((f) => f.selected).length === 0}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  backgroundColor: isLoading || selectedData.length === 0 || fields.filter((f) => f.selected).length === 0 ? "#ccc" : "#1976d2",
                  color: "white",
                  border: "none",
                  borderRadius: 3,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  fontSize: 11,
                  fontWeight: "bold",
                }}
              >
                ➕ Loo Märgupid
              </button>

              <button
                onClick={handleRemoveMarkups}
                disabled={markupIds.length === 0 || isLoading}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  backgroundColor: markupIds.length === 0 || isLoading ? "#ccc" : "#d32f2f",
                  color: "white",
                  border: "none",
                  borderRadius: 3,
                  cursor: markupIds.length === 0 || isLoading ? "not-allowed" : "pointer",
                  fontSize: 11,
                }}
              >
                🗑️ Kustuta
              </button>
            </div>
          </div>
        </div>

        {/* PAREMPOOLNE */}
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, backgroundColor: "white", overflowY: "auto" }}>
          <h3 style={{ margin: "0 0 10px 0", fontSize: 13 }}>📋 Omadused ({fields.length})</h3>

          {fields.length === 0 ? (
            <p style={{ color: "#999", fontSize: 10 }}>Vali objektid 3D vaates...</p>
          ) : (
            Array.from(groupedFields.entries()).map(([groupName, groupFields]) => (
              <div key={groupName} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    padding: 6,
                    backgroundColor: "#f0f0f0",
                    borderRadius: 3,
                    marginBottom: 4,
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: 10,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                  onClick={() => toggleGroup(groupName)}
                >
                  <span>{groupName}</span>
                  <span style={{ fontSize: 9, color: "#666" }}>
                    {groupFields.filter((f) => f.selected).length}/{groupFields.length}
                  </span>
                </div>

                <div style={{ paddingLeft: 6 }}>
                  {groupFields.map((field) => (
                    <label
                      key={field.key}
                      style={{
                        display: "block",
                        marginBottom: 4,
                        padding: 4,
                        borderRadius: 2,
                        backgroundColor: field.selected ? "#e3f2fd" : "transparent",
                        cursor: "pointer",
                        fontSize: 10,
                        userSelect: "none",
                        opacity: field.hasData ? 1 : 0.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={field.selected}
                        onChange={() => toggleField(field.key)}
                        style={{ marginRight: 4, cursor: "pointer" }}
                      />
                      <code style={{ color: "#0066cc", fontSize: 9 }}>{field.label}</code>
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
          marginTop: 12,
          backgroundColor: "#1a1a1a",
          color: "#00ff00",
          border: "2px solid #00ff00",
          borderRadius: 4,
          overflow: "hidden",
          fontFamily: "monospace",
          fontSize: 8,
          maxHeight: 180,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "6px 10px",
            backgroundColor: "#0a0a0a",
            borderBottom: "2px solid #00ff00",
            cursor: "pointer",
            fontWeight: "bold",
          }}
          onClick={() => setShowDebugLog(!showDebugLog)}
        >
          {showDebugLog ? "▼" : "▶"} 🔍 LOG ({logs.length})
        </div>

        {showDebugLog && (
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", backgroundColor: "#000" }}>
            {logs.map((log, idx) => {
              const colors: Record<string, string> = {
                success: "#00ff00",
                error: "#ff3333",
                warn: "#ffaa00",
                info: "#00ccff",
                debug: "#888888",
              };

              return (
                <div key={idx} style={{ marginBottom: 1, color: colors[log.level] || "#00ff00" }}>
                  [{log.timestamp}] {log.message}
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
