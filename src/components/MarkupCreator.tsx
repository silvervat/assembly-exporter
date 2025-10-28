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
}

// ✅ PARANDUS 1: Versiooni uuendamine ja MARKUP_COLOR formaat
const COMPONENT_VERSION = "8.3.0";
const BUILD_DATE = new Date().toISOString().split("T")[0];
const MARKUP_COLOR = "#FF0000"; // ✅ PARANDATUD: hex formaat

const DEFAULTS: Settings = {
  delimiter: " | ",
  selectedFields: [],
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
    // ✅ PARANDUS 2: Uued translations auto-refresh'ile
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
    // ✅ PARANDUS 2: Uued translations auto-refresh'ile
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
   • Andmeid laadida automaatselt (kui 🔄 Auto on sisse lülitatud)

2️⃣ VALI OMADUSED
   • Märgi linnukesed omaduste tüüpide juures
   • Need andmed näidatakse markupis

3️⃣ MUUDA JÄRJESTUST
   • Lohista omadust hiire abil
   • Kasuta ↑↓ nooli järjestuse muutmiseks

4️⃣ MUUDA ERALDAJAT
   • Avaldamisale taga "Eraldaja: " rida
   • Näitab kuidas andmete kihid lahutakse

5️⃣ LOO MARKUPID
   • Klõpsa "➕ Loo" nuppu
   • Markupid kuvatakse automaatselt 3D mudeli sees

6️⃣ AUTO-UUENDUS (UUS!)
   • Klõpsa "🔄 Auto" toggle'i
   • Andmeid laaditakse automaatselt, kui valid 3D objekti

7️⃣ KÄSITSI UUENDUS
   • Klõpsa "🔄 Uuenda" nuppu (Auto välja lülitatud)
   • Laadib kõik saadaolevad andmed ja valitud väljad

8️⃣ KUSTUTA MARKUPID
   • Klõpsa "🗑️" nuppu
   • Kõik markupid mudelis kustutatakse

💡 NÄPUNÄITED:
   • "🔄 Auto" - andmeid uuendatakse automaatselt
   • Eraldaja määrab kuidas andmed kuvada
   • Logi näitab mis juhtub (ava LOG)
  `,
  en: `
📖 USER GUIDE

1️⃣ SELECT OBJECTS IN 3D VIEW
   • Click object in 3D model
   • Data loads automatically (if 🔄 Auto is enabled)

2️⃣ SELECT PROPERTIES
   • Check property type checkboxes
   • These will show in markup

3️⃣ CHANGE ORDER
   • Drag property with mouse
   • Use ↑↓ arrows to reorder

4️⃣ CHANGE DELIMITER
   • Found at bottom "Delimiter: " line
   • Shows how data layers are separated

5️⃣ CREATE MARKUPS
   • Click "➕ Create" button
   • Markups appear automatically in 3D model

6️⃣ AUTO-REFRESH (NEW!)
   • Click "🔄 Auto" toggle
   • Data loads automatically when you select 3D object

7️⃣ MANUAL REFRESH
   • Click "🔄 Refresh" button (Auto disabled)
   • Loads all available data and selected fields

8️⃣ DELETE MARKUPS
   • Click "🗑️" button
   • All markups in model deleted

💡 TIPS:
   • "🔄 Auto" - data updates automatically
   • Delimiter determines how data displays
   • Log shows what's happening (open LOG)
  `,
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
      try {
        window.localStorage?.setItem?.("markupCreatorSettings", JSON.stringify(next));
      } catch {
        // Silent
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

async function getPresentationLayerString(api: any, modelId: string, runtimeId: number): Promise<string> {
  try {
    const layers = await api?.viewer?.getPresentationLayers?.(modelId, [runtimeId]);
    if (Array.isArray(layers) && layers.length > 0 && Array.isArray(layers[0])) {
      return layers[0].map((l: any) => String(l?.name || l)).join(" | ");
    }
  } catch (err) {
    console.warn("[getPresentationLayerString]", err);
  }
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
  } catch (err) {
    console.warn("[getReferenceObjectInfo]", err);
  }
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
    let count = keyCounts.get(baseKey) || 0;
    if (count > 0) key = `${baseKey}_${count}`;
    keyCounts.set(baseKey, count + 1);
    propMap.set(key, String(val ?? ""));
  };

  try {
    out.GUID = String(obj);
    const props = await api?.viewer?.getObjectProperties?.(obj, { includeHidden: true });
    if (!props) return out;

    if (props.name) out.Name = String(props.name);
    if (props.type) out.Type = String(props.type);

    const ref = await getReferenceObjectInfo(api, modelId, obj);
    out.GUID_IFC = ref.guidIfc;
    out.GUID_MS = ref.guidMs;
    if (ref.fileName) out.FileName = ref.fileName;
    if (ref.fileFormat) push("Reference", "Format", ref.fileFormat);
    if (ref.commonType) push("Reference", "Type", ref.commonType);

    const layers = await getPresentationLayerString(api, modelId, obj);
    if (layers) push("Layers", "PresentationLayers", layers);

    if (Array.isArray(props.propertySet)) {
      for (const ps of props.propertySet) {
        if (!ps?.name) continue;
        if (Array.isArray(ps.property)) {
          for (const p of ps.property) {
            if (p?.name && p?.value !== undefined) {
              push(ps.name, p.name, p.value);
            }
          }
        }
      }
    }

    for (const [key, val] of Object.entries(props)) {
      if (
        key === "name" ||
        key === "type" ||
        key === "propertySet" ||
        typeof val === "object" ||
        typeof val === "boolean"
      ) {
        continue;
      }
      push("Standard", key, val);
    }
  } catch (err) {
    console.warn("[flattenProps]", err);
  }

  for (const [key, val] of propMap) {
    out[key] = val;
  }
  return out;
}

function getMidPoint(row: Row): { x: number; y: number; z: number } {
  try {
    if (row.BoundingBox) {
      const parts = String(row.BoundingBox).split(",");
      if (parts.length >= 6) {
        const minX = parseFloat(parts[0]);
        const minY = parseFloat(parts[1]);
        const minZ = parseFloat(parts[2]);
        const maxX = parseFloat(parts[3]);
        const maxY = parseFloat(parts[4]);
        const maxZ = parseFloat(parts[5]);
        return {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
          z: (minZ + maxZ) / 2,
        };
      }
    }
  } catch (err) {
    console.warn("[getMidPoint]", err);
  }
  return { x: 0, y: 0, z: 0 };
}

export function MarkupCreator({ api, onError }: MarkupCreatorProps) {
  const [language, setLanguage] = useState<Language>("et");
  const [settings, updateSettings] = useSettings();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [selectedData, setSelectedData] = useState<Row[]>([]);
  const [allFields, setAllFields] = useState<PropertyField[]>([]);
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ✅ PARANDUS 3: Uued state'd auto-refresh'ile
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [lastSelectionTime, setLastSelectionTime] = useState(0);

  const t = useMemo(() => translations[language], [language]);

  const addLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString("et-EE");
    console.log(`[${timestamp}] [${level}] ${message}`);
    setLogs((prev) => {
      const next = [...prev, { timestamp, level, message }];
      return next.slice(-50);
    });
  }, []);

  const updatePreview = useCallback(() => {
    // Loogiline, et this uuendab eelvaadet
  }, []);

  // ✅ PARANDUS 4: Auto-refresh event listener
  useEffect(() => {
    if (!api?.viewer) {
      console.warn("[AutoRefresh] API pole veel valmis");
      return;
    }

    if (!autoRefreshEnabled) {
      console.log("[AutoRefresh] Välja lülitatud");
      return;
    }

    console.log("[AutoRefresh] Listener registreerimine...");

    const handleSelectionChanged = async (eventName: string, eventData: any) => {
      console.log("[SelectionChanged Event]", { eventName, eventData });

      // 🔥 DEBOUNCE: ära laadi kui teine uuendus tuli 200ms jooksul
      const now = Date.now();
      const timeSinceLastLoad = now - lastSelectionTime;

      if (timeSinceLastLoad < 200) {
        console.log(
          `[SelectionChanged] Debounced (${timeSinceLastLoad}ms < 200ms)`
        );
        return;
      }

      console.log(
        `[SelectionChanged] Laadima (${timeSinceLastLoad}ms seit viimastst)`
      );
      setLastSelectionTime(now);

      // ✅ Laadi andmeid automaatselt
      setIsAutoRefreshing(true);
      try {
        await loadSelectionData();
        addLog(`🔄 Automaatselt uuendatud`, "info");
      } catch (err: any) {
        console.error("[AutoRefresh] Viga:", err);
        addLog(`⚠️ Auto-laadimise viga: ${err.message}`, "warn");
      } finally {
        setIsAutoRefreshing(false);
      }
    };

    // ✅ REGISTREERI EVENT LISTENER
    const unsubscribe = api.viewer?.on?.(
      "Viewer.SelectionChanged",
      handleSelectionChanged
    );

    console.log("[AutoRefresh] Listener registreeritud");

    // ✅ CLEANUP: eemalda listener komponendi lõpus
    return () => {
      console.log("[AutoRefresh] Listener eemaldatakse");
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [api, autoRefreshEnabled, lastSelectionTime, loadSelectionData, addLog]);

  // ✅ PARANDUS 5: Parandatud loadSelectionData (lisa updatePreview!)
  const loadSelectionData = useCallback(async () => {
    if (!api?.viewer) {
      console.warn("[LoadSelectionData] API pole valmis");
      return;
    }

    try {
      addLog("🔄 Andmeid laadimas...", "info");
      console.log("[LoadSelectionData] Algus...");

      // 1. Lae valitud objektid
      const selected = await api.viewer?.getSelectedObjects?.();
      console.log("[LoadSelectionData] Valitud objektid:", selected);

      if (!selected?.length) {
        setSelectedData([]);
        setAllFields([]);
        updatePreview(); // ✅ LISA see!
        addLog("ℹ️ Objekte pole valitud", "info");
        return;
      }

      // 2. Kogu omadused igale objektile
      const rows: Row[] = [];
      const fieldMap = new Map<string, PropertyField>();
      const modelNameById = new Map<string, string>();

      try {
        const proj = await api.project?.getProject?.();
        const models = proj?.models || [];
        for (const m of models) {
          if (m?.id) modelNameById.set(m.id, m.name || m.id);
        }
      } catch (e) {
        console.warn("[LoadSelectionData] Mudeli nimed ebaõnnestus", e);
      }

      const projectName = api.project?.name || "Unknown";

      for (const obj of selected) {
        try {
          const row = await flattenProps(obj, "modelId", projectName, modelNameById, api);
          rows.push(row);

          // Täida fieldMap - millised väljad saadaval
          for (const key of Object.keys(row)) {
            if (!fieldMap.has(key) && row[key]) {
              const parts = key.split(".");
              const group = parts.length > 1 ? parts[0] : "Standard";
              fieldMap.set(key, {
                key,
                label: key,
                selected: settings.selectedFields.includes(key),
                group,
                hasData: Boolean(row[key]),
              });
            }
          }
        } catch (e) {
          console.warn("[LoadSelectionData] Objekti laadimise viga:", e);
        }
      }

      // 3. Konverdi fieldMap massiiviks
      const newFields = Array.from(fieldMap.values());

      // 4. Salvesta state'sse
      setSelectedData(rows);
      setAllFields(newFields);

      // ✅ KÕIGE OLULISEM: Uuenda eelvaadet!
      updatePreview();

      addLog(
        `✅ Laaditud: ${rows.length} objekti, ${newFields.length} välja`,
        "success"
      );
      console.log("[LoadSelectionData] Õnnestus", { rows, newFields });
    } catch (err: any) {
      console.error("[LoadSelectionData] Viga:", err);
      addLog(
        `❌ Andmete laadimine ebaõnnestus: ${err.message}`,
        "error"
      );
      if (onError) onError(err.message);
    }
  }, [api, settings.selectedFields, updatePreview, addLog, onError]);

  // ✅ PARANDUS 6: Parandatud createMarkups (EEMALDA loadSelectionData kutsed!)
  const createMarkups = useCallback(async () => {
    const selectedFields = getOrderedSelectedFields();

    // ✅ Kontrolli, kas väljad on olemas
    if (selectedFields.length === 0) {
      addLog("❌ Väljad puuduvad – vali esmalt väljad", "error");
      return;
    }

    // ✅ Kontrolli, kas objektid on valitud
    if (selectedData.length === 0) {
      addLog("❌ Objektid puuduvad – vali esmalt objektid 3D vaates", "error");
      return;
    }

    setIsLoading(true);
    let successCount = 0;

    try {
      // Ehita markupit andmeid kasutades
      const markups = selectedData
        .map((row) => {
          // Kogu valitud väljad
          const values = selectedFields
            .map((f) => {
              const val = row[f.key];
              return typeof val === "string" ? val.trim() : String(val || "");
            })
            .filter((v) => v.length > 0);

          // Kui andmeid pole, jäta vahele
          if (!values.length) return null;

          // Arvuta markup positsioon (objekti keskkoht)
          const midpoint = getMidPoint(row);

          return {
            text: values.join(settings.delimiter),
            start: { ...midpoint },
            end: { ...midpoint },
            color: MARKUP_COLOR, // ✅ ÕIGE formaat!
          };
        })
        .filter(Boolean);

      // Kui ühtegi markup't ei ole, lõpeta
      if (!markups.length) {
        addLog("❌ Andmeid pole – kõik objektid olid tühjad", "error");
        return;
      }

      // 🚀 Pane markupid 3D mudelile
      const result = await api.markup?.addTextMarkup?.(markups);

      // Loe, mitu õnnestus
      successCount = Array.isArray(result)
        ? result.filter((r) => r?.id).length
        : 0;

      // ✅ Log resultat
      addLog(
        `✅ Loodud: ${successCount}/${selectedData.length} märkupit`,
        "success"
      );

      // Log markupi näide
      console.log("[CreateMarkups] Näide:", markups[0]);
    } catch (err: any) {
      console.error("[CreateMarkups] Viga:", err);
      addLog(
        `❌ Viga: ${err?.message || "Teadmata viga"}`,
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedData, settings.delimiter, api, addLog, getOrderedSelectedFields]);

  const removeAllMarkups = useCallback(async () => {
    try {
      await api.markup?.removeMarkups?.(undefined);
      addLog("🗑️ Kõik markupid kustutatud", "success");
    } catch (err: any) {
      addLog(`❌ ${err.message}`, "error");
    }
  }, [api, addLog]);

  const toggleField = useCallback(
    (key: string) => {
      setAllFields((prev) =>
        prev.map((f) =>
          f.key === key ? { ...f, selected: !f.selected } : f
        )
      );
      const sel = settings.selectedFields.includes(key)
        ? settings.selectedFields.filter((k) => k !== key)
        : [...settings.selectedFields, key];
      updateSettings({ selectedFields: sel });
    },
    [settings.selectedFields, updateSettings]
  );

  const getOrderedSelectedFields = useCallback(() => {
    const selected = allFields.filter((f) => f.selected);
    if (settings.selectedFields.length > 0) {
      return selected.sort((a, b) => settings.selectedFields.indexOf(a.key) - settings.selectedFields.indexOf(b.key));
    }
    return selected;
  }, [allFields, settings.selectedFields]);

  const moveField = useCallback(
    (key: string, dir: "up" | "down") => {
      const idx = settings.selectedFields.indexOf(key);
      if (idx < 0) return;
      const next = [...settings.selectedFields];
      if (dir === "up" && idx > 0) {
        [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      } else if (dir === "down" && idx < next.length - 1) {
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      }
      updateSettings({ selectedFields: next });
    },
    [settings.selectedFields, updateSettings]
  );

  const previewMarkup = useMemo(() => {
    const firstRow = selectedData[0];
    if (!firstRow) return "";
    const selectedFields = getOrderedSelectedFields();
    return selectedFields
      .map((f) => (firstRow[f.key] || "").toString().trim())
      .filter(Boolean)
      .join(settings.delimiter);
  }, [selectedData, settings.delimiter, getOrderedSelectedFields]);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, PropertyField[]>();
    for (const f of allFields) {
      const g = f.group || "Standard";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(f);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const order = ["Standard", "Tekla_Assembly", "Layers", "Reference"];
      return (order.indexOf(a[0]) === -1 ? 999 : order.indexOf(a[0])) -
        (order.indexOf(b[0]) === -1 ? 999 : order.indexOf(b[0]));
    });
  }, [allFields]);

  const handleDragStart = (e: any, key: string) => {
    setDraggedField(key);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedField(null);
  };

  return (
    <div style={{
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: 10,
      color: "#333",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      backgroundColor: "#fafbfc",
      minHeight: "100vh",
    }}>
      {/* HEADER */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        borderBottom: "1px solid #e0e0e0",
        paddingBottom: 8,
      }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#1976d2" }}>
          {t.markupGenerator}
        </h3>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          style={{
            padding: "4px 6px",
            fontSize: 9,
            border: "1px solid #d0d0d0",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          <option value="et">🇪🇪 Eesti</option>
          <option value="en">🇬🇧 English</option>
        </select>
      </div>

      {/* BUTTONS - PEAMINE SEKTSIOONI MUUDATUS! */}
      <div style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        {/* Uuenda nupp */}
        <button
          onClick={() => loadSelectionData()}
          disabled={isAutoRefreshing}
          title="Käsitsi andmete uuendamine"
          style={{
            flex: "1 1 100px",
            padding: "6px 8px",
            backgroundColor: isAutoRefreshing ? "#f0f0f0" : "#e3f2fd",
            color: isAutoRefreshing ? "#999" : "#0066cc",
            border: "1px solid #d0d0d0",
            borderRadius: 3,
            cursor: isAutoRefreshing ? "not-allowed" : "pointer",
            fontSize: 10,
            fontWeight: 500,
            transition: "all 0.15s",
            opacity: isAutoRefreshing ? 0.6 : 1,
          }}
        >
          {isAutoRefreshing ? "🔄..." : t.refresh}
        </button>

        {/* ✅ AUTO-REFRESH TOGGLE (UUENDUS!) */}
        <label
          title={t.autoRefreshTooltip || "Automaatne andmete uuendamine"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 8px",
            backgroundColor: autoRefreshEnabled ? "#e8f5e9" : "#fafafa",
            border: "1px solid #d0d0d0",
            borderRadius: 3,
            cursor: "pointer",
            userSelect: "none",
            fontSize: 9,
            fontWeight: 500,
            transition: "all 0.15s",
            flex: "1 1 100px",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = autoRefreshEnabled
              ? "#c8e6c9"
              : "#f0f0f0";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = autoRefreshEnabled
              ? "#e8f5e9"
              : "#fafafa";
          }}
        >
          <input
            type="checkbox"
            checked={autoRefreshEnabled}
            onChange={(e) => {
              setAutoRefreshEnabled(e.target.checked);
              addLog(
                e.target.checked
                  ? "🔄 Auto-laadmine sisse lülitatud"
                  : "⊘ Auto-laadmine välja lülitatud",
                "info"
              );
            }}
            style={{
              cursor: "pointer",
              margin: 0,
              width: 14,
              height: 14,
            }}
          />
          <span
            style={{
              color: autoRefreshEnabled ? "#2e7d32" : "#999",
            }}
          >
            {t.autoRefresh || "🔄 Auto"}
          </span>
        </label>

        {/* Loo nupp */}
        <button
          onClick={() => createMarkups()}
          disabled={isLoading || selectedData.length === 0}
          style={{
            flex: "1 1 100px",
            padding: "6px 8px",
            backgroundColor: isLoading ? "#f0f0f0" : "#fff",
            border: "1px solid #d0d0d0",
            borderRadius: 3,
            cursor: isLoading || selectedData.length === 0 ? "not-allowed" : "pointer",
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          {isLoading ? t.loading : t.create}
        </button>

        {/* Kustuta nupp */}
        <button
          onClick={() => removeAllMarkups()}
          title="Kõik markupid"
          style={{
            flex: "0 1 40px",
            padding: "6px 8px",
            backgroundColor: "#ffebee",
            border: "1px solid #d0d0d0",
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 10,
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
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
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
            {t.objectsSelected.replace("{count}", String(selectedData.length)).replace(
              "{fields}",
              String(getOrderedSelectedFields().length)
            )}
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
                {fields.map((field) => {
                  const isInOrder = settings.selectedFields.includes(field.key);
                  const isFirst = isInOrder && settings.selectedFields[0] === field.key;
                  const isLast = isInOrder && settings.selectedFields[settings.selectedFields.length - 1] === field.key;

                  return (
                    <div
                      key={field.key}
                      draggable={field.selected}
                      onDragStart={(e) => handleDragStart(e, field.key)}
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
          ))}
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

// ✅ DEFAULT EXPORT
export default MarkupCreator;
