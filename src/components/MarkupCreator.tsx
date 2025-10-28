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
  selectedFields: string[]; // ✅ Salvestatav väljude järjekord
}

const COMPONENT_VERSION = "7.3.1";
const BUILD_DATE = new Date().toISOString().split('T')[0];
const MARKUP_COLOR = "FF0000";

const DEFAULTS: Settings = {
  delimiter: " | ",
  selectedFields: [],
};

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
      window.localStorage?.setItem?.("markupCreatorSettings", JSON.stringify(next));
      return next;
    });
  }, []);

  return [settings, update] as const;
}

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
  const [settings, updateSettings] = useSettings(); // ✅ localStorage
  const [allFields, setAllFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupIds, setMarkupIds] = useState<number[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);

  const [selectedData, setSelectedData] = useState<Row[]>([]);
  const [stats, setStats] = useState({ totalObjects: 0, totalKeys: 0, fieldsWithData: 0 });
  const [previewMarkup, setPreviewMarkup] = useState<string>("");
  const [draggedField, setDraggedField] = useState<string | null>(null); // ✅ Drag-drop

  const mountedRef = useRef(true);
  const listenerRegistered = useRef(false);

  const addLog = useCallback((message: string, level: "info" | "success" | "warn" | "error" | "debug" = "info") => {
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
  }, []);

  // ✅ Laadi seaded
  useEffect(() => {
    addLog(`🚀 MarkupCreator v${COMPONENT_VERSION} laaditud`, "info");
  }, [addLog]);

  // ✅ REAL-TIME valimiste kuulamine
  useEffect(() => {
    if (!api?.viewer || listenerRegistered.current) return;

    const loadSelectionData = async () => {
      try {
        const selectedWithBasic = await getSelectedObjects(api);
        if (!selectedWithBasic || selectedWithBasic.length === 0) {
          setSelectedData([]);
          setAllFields([]);
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
            addLog(`Viga: ${err?.message}`, "error");
          }
        }

        if (allRows.length === 0) return;

        setSelectedData(allRows);

        // ✅ Väljad - järjekord salvestatud seadetes
        const allKeys = Array.from(new Set(allRows.flatMap((r) => Object.keys(r)))).sort();
        const groups = groupKeys(allKeys);
        let groupOrder = ["Standard", "Tekla_Assembly", "Nordec_Dalux", "IfcElementAssembly", "AssemblyBaseQuantities", "Other"];

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

            // ✅ Smart default: 
            // 1. Kui localStorage'ss on savedFields, kasuta neid
            // 2. Muidu default: ainult AssemblyCast_unit_Mark
            let isSelected = false;
            
            if (settings.selectedFields && settings.selectedFields.length > 0) {
              // ✅ Restore saved selection
              isSelected = settings.selectedFields.includes(key);
            } else {
              // ✅ Default: ainult AssemblyCast_unit_Mark
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

        setStats({
          totalObjects: allRows.length,
          totalKeys: allKeys.length,
          fieldsWithData,
        });

        if (mountedRef.current) {
          setAllFields(newFields);
        }
      } catch (err: any) {
        addLog("REAL-TIME valimise laadimine ebaõnnestus", "error");
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
  }, [api, addLog, settings]);

  // ✅ Arvuta eelvaade
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

  // ✅ Drag-drop muutmine järjekorda
  // ✅ Hangi salvestatud või valitud väljad
  const getOrderedSelectedFields = useCallback(() => {
    const selectedFields = allFields.filter((f) => f.selected);
    if (selectedFields.length === 0) return [];

    // Kui järjekord salvestatud, kasuta seda järjekorda
    if (settings.selectedFields.length > 0) {
      return settings.selectedFields
        .map((k) => selectedFields.find((f) => f.key === k))
        .filter(Boolean) as PropertyField[];
    }

    // Muidu valitud väljad originaalses järjekorras
    return selectedFields;
  }, [allFields, settings.selectedFields]);

  const handleDragStart = (field: PropertyField) => {
    setDraggedField(field.key);
  };

  const handleDrop = (targetField: PropertyField) => {
    if (!draggedField || draggedField === targetField.key) {
      setDraggedField(null);
      return;
    }

    // ✅ Drag-drop ainult VALITUD väljadega
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

    // Järjestuse array - ainult valitud väljad
    const newOrder = orderedFields.map((f) => f.key);
    const [moved] = newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, moved);

    updateSettings({ selectedFields: newOrder });
    setDraggedField(null);
    addLog(`✅ "${draggedField}" liigutatud järjestuses`, "success");
  };

  // ✅ Move up/down - ainult VALITUD väljadega
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
    addLog(
      `✅ "${key}" liigutatud ${direction === "up" ? "üles ⬆️" : "alla ⬇️"}`,
      "success"
    );
  };

  // ✅ Toggle field - salvesta settings'sse
  const toggleField = (key: string) => {
    setAllFields((prev) => {
      const updated = prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f));
      
      // ✅ Salvesta selectedFields
      const newSelected = updated.filter((f) => f.selected).map((f) => f.key);
      updateSettings({ selectedFields: newSelected });
      
      return updated;
    });
  };

  // ✅ Kontroll enne LOO nuppu
  const createMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🔍 KONTROLL - VALITUD VÄLJAD JA OBJEKTID", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    // ✅ Hangi valitud väljad õiges järjekorras
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

    // ✅ Nüüd loe reaalselt markupid KÕIGILE VALITUD OBJEKTIDELE
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

      const result = await api.markup?.addTextMarkup?.(markupsToCreate);
      const createdIds: number[] = [];

      if (Array.isArray(result)) {
        result.forEach((item: any) => {
          if (typeof item === "object" && item?.id) {
            createdIds.push(Number(item.id));
          }
        });
      }

      if (createdIds.length > 0) {
        setMarkupIds(createdIds);
        addLog(`\n✅ MARKUPID LOODUD: ${createdIds.length} märgupit! 🎉`, "success");
      }
    } catch (err: any) {
      addLog("❌ Viga", "error");
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [getOrderedSelectedFields, selectedData, settings.delimiter, previewMarkup, api, addLog]);

  const handleRemoveAllMarkups = useCallback(async () => {
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    addLog("🗑️ KÕIGIDE MARKUPITE KUSTUTAMINE MUDELIS", "info");
    addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

    setIsLoading(true);
    try {
      addLog("🔍 Otsitakse kõik markupid mudelis...", "debug");

      // ✅ Hangi kõik markupid
      const allMarkups = await api.markup?.getTextMarkups?.();

      if (!allMarkups || allMarkups.length === 0) {
        addLog("ℹ️ Markupeid mudelis pole", "warn");
        addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
        setIsLoading(false);
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
        setIsLoading(false);
        return;
      }

      addLog(`\n📤 Kustutatakse ${allIds.length} märgupit API-st...`, "debug");

      const result = await api.markup?.removeMarkups?.(allIds);

      addLog(`✅ API vastus: ${typeof result}`, "debug");
      addLog(`\n✅ KUSTUTAMINE ÕNNESTUS! ${allIds.length} märgupit kustutatakse 🎉`, "success");

      setMarkupIds([]);
    } catch (err: any) {
      addLog(`❌ VIGA: ${err?.message}`, "error");
      addLog(`\n💡 Võimalikud lahendused:`, "warn");
      addLog(`   - Kontrollida kas API getTextMarkups on saadaval`, "debug");
      addLog(`   - Kontrollida kas API removeMarkups on saadaval`, "debug");
      addLog(`   - Proovida käsitsi markupite kustutamist Trimble'is`, "debug");
    } finally {
      setIsLoading(false);
      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
    }
  }, [api, addLog]);

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

  return (
    <div
      style={{
        padding: 12,
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#f5f5f5",
      }}
    >
      {/* HEADER - MINIMEERITUD */}
      <div style={{ marginBottom: 8, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#666" }}>
          📊 Objektid: {stats.totalObjects} | Väljad: {stats.fieldsWithData}/{allFields.length} | Valitud: {selectedCount}
        </div>
      </div>

      {/* SEADED PÄISES */}
      <div style={{ border: "1px solid #ddd", borderRadius: 4, padding: 10, backgroundColor: "white", marginBottom: 10 }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: 11, fontWeight: 700 }}>⚙️ Seaded</h3>

        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 8, fontWeight: 600, display: "block", marginBottom: 3 }}>Eraldaja:</label>
          <input
            type="text"
            value={settings.delimiter}
            onChange={(e) => updateSettings({ delimiter: e.target.value })}
            style={{
              width: "100%",
              padding: 4,
              border: "1px solid #ccc",
              borderRadius: 3,
              fontSize: 9,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 8, fontWeight: 600, display: "block", marginBottom: 3 }}>👁️ Eelvaade:</label>
          <div
            style={{
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
              overflowY: "auto",
            }}
          >
            {previewMarkup || "(ei andmeid)"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={createMarkups}
            disabled={isLoading || selectedData.length === 0 || selectedCount === 0}
            style={{
              flex: 1,
              padding: "6px 8px",
              backgroundColor: isLoading || selectedData.length === 0 || selectedCount === 0 ? "#ccc" : "#1976d2",
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
            onClick={handleRemoveAllMarkups}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: "6px 8px",
              backgroundColor: isLoading ? "#ccc" : "#d32f2f",
              color: "white",
              border: "none",
              borderRadius: 3,
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 9,
              fontWeight: 600,
            }}
            title="Kustuta KÕik markupid mudelis"
          >
            🗑️ Kustuta kõik
          </button>
        </div>

        <div style={{ fontSize: 8, color: "#666", marginTop: 6, padding: 6, backgroundColor: "#f9f9f9", borderRadius: 2 }}>
          ℹ️ Punane värviga. Järjekord muudatav: drag-drop või ↑↓ nupud
        </div>
      </div>

      {/* ✅ VÄLJAD - DRAG-DROP JÄRJESTUS */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 4,
          padding: 10,
          backgroundColor: "white",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: "0 0 8px 0", fontSize: 11, fontWeight: 700 }}>
          📋 Omadused ({selectedCount} valitud)
        </h3>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {allFields.length === 0 ? (
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
                    fontWeight: 600,
                    fontSize: 9,
                  }}
                >
                  {groupName} ({groupFields.filter((f) => f.selected).length}/{groupFields.length})
                </div>

                <div style={{ paddingLeft: 4 }}>
                  {groupFields.map((field, idx) => {
                    // ✅ Nooled ainult VALITUD väljadele, õiges järjekorras
                    const orderedSelected = getOrderedSelectedFields();
                    const fieldIdx = orderedSelected.findIndex((f) => f.key === field.key);
                    const isFirst = fieldIdx === 0;
                    const isLast = fieldIdx === orderedSelected.length - 1;
                    const isInOrder = fieldIdx !== -1;  // Field on valitud

                    return (
                      <div
                        key={field.key}
                        draggable={field.selected}
                        onDragStart={() => handleDragStart(field)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(field)}
                        style={{
                          display: "flex",
                          gap: 4,
                          alignItems: "center",
                          marginBottom: 2,
                          padding: "2px 4px",
                          borderRadius: 2,
                          backgroundColor: field.selected ? "#e3f2fd" : "transparent",
                          opacity: field.hasData ? 1 : 0.6,
                          border: draggedField === field.key ? "1px dashed #1976d2" : "none",
                          cursor: field.selected ? "grab" : "default",
                        }}
                      >
                        {/* ✅ Drag handle */}
                        <span style={{ fontSize: 8, color: field.selected ? "#666" : "#ccc", cursor: "grab" }}>⋮⋮</span>

                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={field.selected}
                          onChange={() => toggleField(field.key)}
                          style={{ cursor: "pointer", transform: "scale(0.8)", margin: 0 }}
                        />

                        {/* Label */}
                        <code style={{ color: "#0066cc", fontSize: 8, fontWeight: 500, flex: 1 }}>{field.label}</code>

                        {/* ✅ Nooled üles/alla - ainult VALITUD väljadele */}
                        <div style={{ display: "flex", gap: 2, visibility: isInOrder ? "visible" : "hidden" }}>
                          {!isFirst && (
                            <button
                              onClick={() => moveField(field.key, "up")}
                              title="Liiguta üles"
                              style={{
                                padding: "2px 4px",
                                fontSize: 8,
                                backgroundColor: "#e0e0e0",
                                border: "none",
                                borderRadius: 2,
                                cursor: "pointer",
                              }}
                            >
                              ↑
                            </button>
                          )}
                          {!isLast && (
                            <button
                              onClick={() => moveField(field.key, "down")}
                              title="Liiguta alla"
                              style={{
                                padding: "2px 4px",
                                fontSize: 8,
                                backgroundColor: "#e0e0e0",
                                border: "none",
                                borderRadius: 2,
                                cursor: "pointer",
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

      {/* LOG - VALGE TAUST */}
      <div
        style={{
          backgroundColor: "#ffffff",
          color: "#333",
          border: "1px solid #ddd",
          borderRadius: 3,
          overflow: "hidden",
          fontFamily: "monospace",
          fontSize: 8,
          maxHeight: showDebugLog ? 120 : 24,
          display: "flex",
          flexDirection: "column",
          transition: "max-height 0.2s",
        }}
      >
        <div
          style={{
            padding: "4px 8px",
            backgroundColor: "#f5f5f5",
            borderBottom: showDebugLog ? "1px solid #ddd" : "none",
            cursor: "pointer",
            fontWeight: "bold",
            userSelect: "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          onClick={() => setShowDebugLog(!showDebugLog)}
        >
          <span>{showDebugLog ? "▼" : "▶"} 📋 LOG ({logs.length})</span>
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
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px", backgroundColor: "#fafafa" }}>
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

      {/* JALUS */}
      <div style={{ marginTop: 8, textAlign: "center", fontSize: 8, color: "#999" }}>
        MARKUP GENERATOR V7 • {BUILD_DATE}
      </div>
    </div>
  );
}
