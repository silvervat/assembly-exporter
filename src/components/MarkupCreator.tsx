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

const COMPONENT_VERSION = "6.6.0";
const BUILD_DATE = new Date().toISOString().split('T')[0];
const MARKUP_COLOR = "FF0000"; // ✅ Fikseeritud punane

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
  } catch {}

  if (!guidIfc && obj.id) {
    try {
      const externalIds = await api.viewer.convertToObjectIds(modelId, [obj.id]);
      const externalId = externalIds[0];
      if (externalId && classifyGuid(externalId) === "IFC") guidIfc = externalId;
    } catch {}
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

export default function MarkupCreator({ api, onError }: MarkupCreatorProps) {
  const [fields, setFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [delimiter, setDelimiter] = useState(" | ");
  const [markupIds, setMarkupIds] = useState<number[]>([]);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false); // ✅ Vaikimisi SULETUD
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [selectedData, setSelectedData] = useState<Row[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [stats, setStats] = useState({
    totalObjects: 0,
    totalKeys: 0,
    groupsCount: 0,
    fieldsWithData: 0,
  });

  const [previewMarkup, setPreviewMarkup] = useState<string>(""); // ✅ Eelvaade esimesest objektist

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

  // ✅ EI keri automaatselt
  useEffect(() => {
    if (showDebugLog && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [showDebugLog]);

  useEffect(() => {
    mountedRef.current = true;
    addLog(`🚀 MarkupCreator v${COMPONENT_VERSION} laaditud`, "info", `Build: ${BUILD_DATE}`);
    addLog("⏳ Oodates valimist 3D vaates...", "info");
    return () => {
      mountedRef.current = false;
    };
  }, [addLog]);

  // ✅ REAL-TIME: Kuula valimisi
  useEffect(() => {
    if (!api?.viewer || listenerRegistered.current) return;

    const loadSelectionData = async () => {
      try {
        const selectedWithBasic = await getSelectedObjects(api);

        if (!selectedWithBasic || selectedWithBasic.length === 0) {
          if (selectedIds.length > 0) {
            setSelectedIds([]);
            setSelectedData([]);
            setFields([]);
            setPreviewMarkup(""); // ✅ Tühjenda eelvaade
          }
          return;
        }

        const projectName = await getProjectName(api);
        const modelIds = selectedWithBasic.map((s) => s.modelId);
        const nameMap = await buildModelNameMap(api, modelIds);

        const allRows: Row[] = [];
        const allIds: number[] = [];

        for (const selection of selectedWithBasic) {
          const modelId = selection.modelId;
          const objectRuntimeIds = selection.objects.map((o: any) => o?.id || o).filter(Boolean);

          if (!objectRuntimeIds.length) continue;

          try {
            const fullObjects = await api.viewer.getObjectProperties(modelId, objectRuntimeIds, { includeHidden: true });
            const flattened = await Promise.all(
              fullObjects.map((o: any) => flattenProps(o, modelId, projectName, nameMap, api, addLog))
            );

            allRows.push(...flattened);
            flattened.forEach((row) => {
              const objId = Number(row.ObjectId);
              if (objId && !allIds.includes(objId)) allIds.push(objId);
            });
          } catch (err: any) {
            addLog(`Viga: ${err?.message}`, "error");
          }
        }

        if (allRows.length === 0) {
          return;
        }

        setSelectedIds(allIds);
        setSelectedData(allRows);

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

        setStats({
          totalObjects: allRows.length,
          totalKeys: allKeys.length,
          groupsCount: groups.size,
          fieldsWithData,
        });

        if (mountedRef.current) {
          setFields(newFields);
        }
      } catch (err: any) {
        addLog("REAL-TIME valimise laadimine ebaõnnestus", "error", err?.message);
      }
    };

    const handleSelectionChanged = () => {
      loadSelectionData();
    };

    api.viewer.addOnSelectionChanged?.(handleSelectionChanged);
    listenerRegistered.current = true;

    loadSelectionData();

    return () => {
      api.viewer.removeOnSelectionChanged?.(handleSelectionChanged);
      listenerRegistered.current = false;
    };
  }, [api, addLog]);

  // ✅ Arvuta eelvaade valitud väljadest
  const updatePreview = useCallback(() => {
    const selectedFields = fields.filter((f) => f.selected);
    
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

    const preview = values.join(delimiter);
    setPreviewMarkup(preview);
  }, [fields, selectedData, delimiter]);

  useEffect(() => {
    updatePreview();
  }, [updatePreview]);

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
      addLog("❌ VIGA: Valitud väljad puuduvad!", "error");
      addLog("   💡 Vali vähemalt üks väli (paremal menüüs)", "info");
      return;
    }
    addLog(`\n✅ 1. Valitud väljad: ${selectedFields.length}`, "success");
    selectedFields.forEach((f) => addLog(`      ☑ ${f.label}`, "debug"));

    if (selectedData.length === 0) {
      addLog("❌ VIGA: Valitud objektid puuduvad!", "error");
      addLog("   💡 Vali objektid 3D vaates", "info");
      return;
    }
    addLog(`\n✅ 2. Valitud objektid 3D vaates: ${selectedData.length}`, "success");
    selectedData.slice(0, 3).forEach((row, idx) => {
      addLog(`      ${idx + 1}. ObjectId ${row.ObjectId}: ${row.Name || "?"}`, "debug");
    });

    addLog(`\n✅ 3. ANDMETE KONTROLLIMINE VALITUD VÄLJADELE:`, "debug");
    let objectsWithData = 0;

    for (const row of selectedData) {
      const hasData = selectedFields.some((field) => {
        const value = row[field.key];
        return value && String(value).trim() !== "";
      });

      if (hasData) {
        objectsWithData++;
      } else {
        addLog(`      ⚠️ ObjectId ${row.ObjectId}: Andmeid valitud väljadele pole`, "warn");
      }
    }

    addLog(`   📊 Objektid andmetega: ${objectsWithData}/${selectedData.length}`, "success");

    if (objectsWithData === 0) {
      addLog("❌ VIGA: Ühelgi objektil pole andmeid valitud väljadele!", "error");
      addLog("   💡 Vali teised väljad", "info");
      return;
    }

    setIsLoading(true);
    addLog(`\n📍 Luues markup-id: ${objectsWithData} objektile...`, "info");

    try {
      const markupsToCreate: any[] = [];
      const modelId = selectedData[0]?.ModelId;

      addLog("\n🔍 1. BBOXE HANKIMINE:", "debug");

      const objectIds = selectedData.map((row) => Number(row.ObjectId)).filter(Boolean);

      if (objectIds.length === 0) {
        addLog("❌ ObjectId-d puuduvad", "error");
        return;
      }

      addLog(`   Hangin ${objectIds.length} BBox-i...`, "debug");

      let bBoxes: any[] = [];
      try {
        bBoxes = await api.viewer?.getObjectBoundingBoxes?.(modelId, objectIds);
        addLog(`   ✅ Saadud: ${bBoxes.length} BBox-i`, "success");
      } catch (err: any) {
        addLog(`   ⚠️ getObjectBoundingBoxes viga: ${err?.message}`, "warn");
        addLog(`   💡 Fallback: kasutame staatilist positsioonida`, "debug");

        bBoxes = objectIds.map((id) => ({
          id,
          boundingBox: {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 1 },
          },
        }));
      }

      addLog("\n📝 2. MARKUP'IDE LOOMINE:", "debug");

      for (let idx = 0; idx < selectedData.length; idx++) {
        const row = selectedData[idx];
        const objectId = Number(row.ObjectId);

        try {
          const bBox = bBoxes.find((b) => b.id === objectId);
          if (!bBox) {
            addLog(`      ⚠️ ${objectId}: BBox puudub`, "warn");
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
            addLog(`      ⚠️ ${objectId}: Andmeid pole`, "warn");
            continue;
          }

          const text = values.join(delimiter);

          const markup = {
            text: text,
            start: point,
            end: point,
            color: MARKUP_COLOR,
          };

          markupsToCreate.push(markup);

          if (idx < 3) {
            addLog(`      ✅ ${idx + 1}. ObjectId ${objectId}: "${text.substring(0, 40)}"`, "debug");
          }
        } catch (err: any) {
          addLog(`      ❌ ObjectId ${objectId}: ${err?.message}`, "error");
        }
      }

      addLog(`\n   📊 Valmis: ${markupsToCreate.length} märgupit`, "success");

      if (markupsToCreate.length === 0) {
        addLog("❌ Ühtegi märgupit ei saadud luua", "error");
        return;
      }

      addLog("\n📤 3. SAATMINE API-LE:", "debug");
      addLog(`   Saadetak: ${markupsToCreate.length} märgupit`, "debug");

      const result = await api.markup?.addTextMarkup?.(markupsToCreate);

      addLog(`   ✅ API vastus kätte`, "success");

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
        addLog(`   IDs: ${createdIds.join(", ")}`, "debug");
      } else {
        addLog("⚠️ Vastus saadi, aga ID-sid ei leitud", "warn");
      }
    } catch (err: any) {
      addLog("❌ Viga", "error", err?.message);
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [fields, selectedData, delimiter, addLog]);

  const handleRemoveMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🗑️ MARKUPITE KUSTUTAMINE", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    if (markupIds.length === 0) {
      addLog("❌ VIGA: Markupid puuduvad!", "error");
      addLog("   💡 Looge enne markupid nupuga ➕ LOO MÄRGUPID", "info");
      return;
    }

    addLog(`\n✅ 1. Kustutamiseks valitud markupid: ${markupIds.length}`, "success");
    markupIds.slice(0, 5).forEach((id, idx) => {
      addLog(`      ${idx + 1}. ID: ${id}`, "debug");
    });

    setIsLoading(true);

    try {
      addLog(`\n✅ 2. API KUTSE: removeMarkups()`, "debug");
      addLog(`   Saadetak: removeMarkups([${markupIds.join(", ")}])`, "debug");

      const result = await api.markup?.removeMarkups?.(markupIds);

      addLog(`   ✅ API vastus kätte`, "success");

      if (result === undefined || result === null) {
        addLog(`   ℹ️ Vastus: undefined (normaalne - kustutamine õnnestus)`, "debug");
      } else if (result === true || result === false) {
        addLog(`   📊 Vastus: ${result}`, "debug");
      } else {
        addLog(`   📊 Vastus: ${JSON.stringify(result)}`, "debug");
      }

      setMarkupIds([]);
      addLog(`\n✅ 3. KUSTUTAMINE ÕNNESTUS! 🎉`, "success");
      addLog(`   ${markupIds.length} märgupit kustutatud 3D mudelist`, "info");
    } catch (err: any) {
      addLog(`❌ KUSTUTAMINE EBAÕNNESTUS!`, "error", err?.message);
      addLog(`   💡 Kontrolli kas Trimble API removeMarkups() on saadaval`, "warn");
      addLog(`   💡 Kontrolli kas markupId-d on õiged`, "warn");

      addLog(`\n📋 API DEBUG INFO:`, "debug");
      addLog(`   api.markup: ${typeof api.markup}`, "debug");
      addLog(`   api.markup.removeMarkups: ${typeof api.markup?.removeMarkups}`, "debug");
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
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
        padding: 12,
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#f5f5f5",
        overflowY: "auto",
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: 14, fontWeight: 700 }}>🎨 Märgupite Ehitaja v{COMPONENT_VERSION}</h2>
        <div style={{ fontSize: 9, color: "#666" }}>
          📊 Objektid: {stats.totalObjects} | Väljad: {stats.fieldsWithData}/{fields.length}
        </div>
      </div>

      {/* ✅ SEADED PÄISES */}
      <div style={{ border: "1px solid #ddd", borderRadius: 4, padding: 10, backgroundColor: "white", marginBottom: 10 }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: 11, fontWeight: 700 }}>⚙️ Seaded</h3>

        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 8, fontWeight: 600, display: "block", marginBottom: 3 }}>Eraldaja:</label>
          <input
            type="text"
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value)}
            style={{ 
              width: "100%", 
              padding: 4, 
              border: "1px solid #ccc", 
              borderRadius: 3, 
              fontSize: 9, 
              boxSizing: "border-box" 
            }}
          />
        </div>

        {/* ✅ EELVAADE */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 8, fontWeight: 600, display: "block", marginBottom: 3 }}>👁️ Eelvaade:</label>
          <div style={{ 
            fontSize: 8, 
            color: previewMarkup ? "#333" : "#999", 
            fontFamily: "monospace",
            backgroundColor: "#f9f9f9",
            padding: 6,
            borderRadius: 2,
            border: "1px solid #ddd",
            wordBreak: "break-all",
            minHeight: 24,
            maxHeight: 50,
            overflowY: "auto"
          }}>
            {previewMarkup || "(ei andmeid)"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={createMarkups}
            disabled={isLoading || selectedData.length === 0 || fields.filter((f) => f.selected).length === 0}
            style={{
              flex: 1,
              padding: "6px 8px",
              backgroundColor: isLoading || selectedData.length === 0 || fields.filter((f) => f.selected).length === 0 ? "#ccc" : "#1976d2",
              color: "white",
              border: "none",
              borderRadius: 3,
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 9,
              fontWeight: 600,
            }}
          >
            ➕ Loo
          </button>

          <button
            onClick={handleRemoveMarkups}
            disabled={markupIds.length === 0 || isLoading}
            style={{
              flex: 1,
              padding: "6px 8px",
              backgroundColor: markupIds.length === 0 || isLoading ? "#ccc" : "#d32f2f",
              color: "white",
              border: "none",
              borderRadius: 3,
              cursor: markupIds.length === 0 || isLoading ? "not-allowed" : "pointer",
              fontSize: 9,
              fontWeight: 600,
            }}
          >
            🗑️ Kustuta
          </button>
        </div>

        <div style={{ fontSize: 8, color: "#666", marginTop: 6, padding: 6, backgroundColor: "#f9f9f9", borderRadius: 2 }}>
          ℹ️ Punane värv | 1. detail: {selectedData[0]?.Name || "?"}
        </div>
      </div>

      {/* ✅ OMADUSED ALL */}
      <div style={{ 
        border: "1px solid #ddd", 
        borderRadius: 4, 
        padding: 10, 
        backgroundColor: "white", 
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column"
      }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: 11, fontWeight: 700 }}>📋 Omadused ({fields.length})</h3>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {fields.length === 0 ? (
            <p style={{ color: "#999", fontSize: 9, margin: 0 }}>Vali objektid 3D vaates...</p>
          ) : (
            Array.from(groupedFields.entries()).map(([groupName, groupFields]) => (
              <div key={groupName} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    padding: "4px 6px",
                    backgroundColor: "#e8e8e8",
                    borderRadius: 3,
                    marginBottom: 3,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 9,
                    display: "flex",
                    justifyContent: "space-between",
                    userSelect: "none",
                  }}
                  onClick={() => toggleGroup(groupName)}
                >
                  <span>{groupName}</span>
                  <span style={{ fontSize: 8, color: "#666" }}>
                    {groupFields.filter((f) => f.selected).length}/{groupFields.length}
                  </span>
                </div>

                <div style={{ paddingLeft: 4 }}>
                  {groupFields.map((field) => (
                    <label
                      key={field.key}
                      style={{
                        display: "block",
                        marginBottom: 2,
                        padding: "2px 4px",
                        borderRadius: 2,
                        backgroundColor: field.selected ? "#e3f2fd" : "transparent",
                        cursor: "pointer",
                        fontSize: 8,
                        userSelect: "none",
                        opacity: field.hasData ? 1 : 0.6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={field.selected}
                        onChange={() => toggleField(field.key)}
                        style={{ marginRight: 3, cursor: "pointer", transform: "scale(0.8)" }}
                      />
                      <code style={{ color: "#0066cc", fontSize: 8, fontWeight: 500 }}>{field.label}</code>
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
          marginTop: 10,
          backgroundColor: "#1a1a1a",
          color: "#00ff00",
          border: "1px solid #00ff00",
          borderRadius: 3,
          overflow: "hidden",
          fontFamily: "monospace",
          fontSize: 8,
          maxHeight: showDebugLog ? 150 : 24,
          display: "flex",
          flexDirection: "column",
          transition: "max-height 0.2s",
        }}
      >
        <div
          style={{
            padding: "4px 8px",
            backgroundColor: "#0a0a0a",
            borderBottom: showDebugLog ? "1px solid #00ff00" : "none",
            cursor: "pointer",
            fontWeight: "bold",
            userSelect: "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          onClick={() => setShowDebugLog(!showDebugLog)}
        >
          <span>{showDebugLog ? "▼" : "▶"} 🔍 LOG ({logs.length})</span>
        </div>

        {showDebugLog && (
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px", backgroundColor: "#000" }}>
            {logs.map((log, idx) => {
              const colors: Record<string, string> = {
                success: "#00ff00",
                error: "#ff3333",
                warn: "#ffaa00",
                info: "#00ccff",
                debug: "#888888",
              };

              return (
                <div key={idx} style={{ marginBottom: 0, color: colors[log.level] || "#00ff00" }}>
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
