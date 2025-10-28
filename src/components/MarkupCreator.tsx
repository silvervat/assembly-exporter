import React, { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from "react";

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

const COMPONENT_VERSION = "8.4.0";
const BUILD_DATE = new Date().toISOString().split("T")[0];
const MARKUP_COLOR = "#FF0000";

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
    autoRefresh: "🔄 Auto",
    autoRefreshTooltip: "Laadi andmed automaatselt valiku muutumisel",
    apiNotReady: "⚠️ API pole valmis. Ootame...",
    apiError: "❌ API viga: {error}",
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
    apiNotReady: "⚠️ API not ready. Waiting...",
    apiError: "❌ API error: {error}",
  },
};

type Language = "et" | "en";

// ✅ ERROR BOUNDARY - Valdab React render errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class MarkupCreatorErrorBoundary extends React.Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    console.error("[ErrorBoundary] React render error:", error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Error caught:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 12,
          backgroundColor: "#ffebee",
          border: "1px solid #c62828",
          borderRadius: 4,
          color: "#c62828",
          fontSize: 10,
        }}>
          <strong>❌ Render Error:</strong> {this.state.error?.message}
        </div>
      );
    }

    return this.props.children;
  }
}

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

// ✅ SAFE API CALL - Valdab network errors ja API failures
async function safeApiCall<T>(
  fn: () => Promise<T>,
  defaultValue: T,
  context: string
): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    console.error(`[SafeApiCall] ${context} failed:`, err);
    // Kui 404 viga - silent fail, ei kasta exception
    if (err?.status === 404 || err?.message?.includes("404")) {
      console.warn(`[SafeApiCall] 404 resource missing in ${context}`);
      return defaultValue;
    }
    return defaultValue;
  }
}

async function getPresentationLayerString(api: any, modelId: string, runtimeId: number): Promise<string> {
  return safeApiCall(
    async () => {
      const layers = await api?.viewer?.getPresentationLayers?.(modelId, [runtimeId]);
      if (Array.isArray(layers) && layers.length > 0 && Array.isArray(layers[0])) {
        return layers[0].map((l: any) => String(l?.name || l)).join(" | ");
      }
      return "";
    },
    "",
    "getPresentationLayerString"
  );
}

async function getReferenceObjectInfo(api: any, modelId: string, runtimeId: number) {
  const result = { fileName: "", fileFormat: "", commonType: "", guidIfc: "", guidMs: "" };
  
  return safeApiCall(
    async () => {
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
      return result;
    },
    result,
    "getReferenceObjectInfo"
  );
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
    try {
      const g = sanitizeKey(group);
      const n = sanitizeKey(name);
      const baseKey = g ? `${g}.${n}` : n;
      let key = baseKey;
      let count = keyCounts.get(baseKey) || 0;
      if (count > 0) key = `${baseKey}_${count}`;
      keyCounts.set(baseKey, count + 1);
      propMap.set(key, String(val ?? ""));
    } catch (err) {
      console.warn("[push] error:", err);
    }
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

// ✅ API AVAILABILITY CHECK - Valdab API initialization errors
function useApiAvailability(api: any) {
  const [apiReady, setApiReady] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) {
      setApiReady(false);
      setApiError("API pole määratud");
      return;
    }

    // ✅ Kontrollime, kas kõik vajalikud methods on olemas
    const requiredMethods = [
      "api.viewer",
      "api.viewer.getSelectedObjects",
      "api.viewer.getObjectProperties",
      "api.markup.addTextMarkup",
    ];

    try {
      let allPresent = true;

      if (!api?.viewer) {
        allPresent = false;
        console.warn("[useApiAvailability] api.viewer puudub");
      }

      if (!api?.viewer?.getSelectedObjects) {
        allPresent = false;
        console.warn("[useApiAvailability] api.viewer.getSelectedObjects puudub");
      }

      if (!api?.viewer?.getObjectProperties) {
        allPresent = false;
        console.warn("[useApiAvailability] api.viewer.getObjectProperties puudub");
      }

      if (!api?.markup?.addTextMarkup) {
        allPresent = false;
        console.warn("[useApiAvailability] api.markup.addTextMarkup puudub");
      }

      if (allPresent) {
        setApiReady(true);
        setApiError(null);
      } else {
        setApiReady(false);
        setApiError("Mõned API methods puuduvad");
      }
    } catch (err: any) {
      console.error("[useApiAvailability] Error checking API:", err);
      setApiReady(false);
      setApiError(err.message);
    }
  }, [api]);

  return { apiReady, apiError };
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
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [lastSelectionTime, setLastSelectionTime] = useState(0);

  // ✅ API AVAILABILITY CHECK
  const { apiReady, apiError } = useApiAvailability(api);

  const t = useMemo(() => translations[language], [language]);

  const addLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    try {
      const now = new Date();
      const timestamp = now.toLocaleTimeString("et-EE");
      console.log(`[${timestamp}] [${level}] ${message}`);
      setLogs((prev) => {
        const next = [...prev, { timestamp, level, message }];
        return next.slice(-50);
      });
    } catch (err) {
      console.error("[addLog] error:", err);
    }
  }, []);

  const updatePreview = useCallback(() => {
    // Update preview logic
  }, []);

  // ✅ AUTO-REFRESH WITH BETTER ERROR HANDLING
  useEffect(() => {
    if (!apiReady) {
      console.warn("[AutoRefresh] API pole valmis");
      return;
    }

    if (!api?.viewer) {
      console.warn("[AutoRefresh] api.viewer pole olemas");
      return;
    }

    if (!autoRefreshEnabled) {
      console.log("[AutoRefresh] Välja lülitatud");
      return;
    }

    console.log("[AutoRefresh] Listener registreerimine...");

    const handleSelectionChanged = async (eventName: string, eventData: any) => {
      try {
        console.log("[SelectionChanged Event]", { eventName, eventData });

        const now = Date.now();
        const timeSinceLastLoad = now - lastSelectionTime;

        if (timeSinceLastLoad < 200) {
          console.log(`[SelectionChanged] Debounced (${timeSinceLastLoad}ms < 200ms)`);
          return;
        }

        console.log(`[SelectionChanged] Laadima (${timeSinceLastLoad}ms)`);
        setLastSelectionTime(now);

        setIsAutoRefreshing(true);
        try {
          await loadSelectionData();
          addLog(`🔄 Automaatselt uuendatud`, "info");
        } catch (err: any) {
          console.error("[AutoRefresh] Load error:", err);
          addLog(`⚠️ Auto-laadimise viga: ${err.message}`, "warn");
        } finally {
          setIsAutoRefreshing(false);
        }
      } catch (err: any) {
        console.error("[handleSelectionChanged] Outer error:", err);
      }
    };

    let unsubscribe: any = null;

    try {
      // ✅ SAFE LISTENER REGISTRATION
      if (typeof api.viewer.on === "function") {
        unsubscribe = api.viewer.on("Viewer.SelectionChanged", handleSelectionChanged);
      } else {
        console.warn("[AutoRefresh] api.viewer.on pole function");
      }
    } catch (err: any) {
      console.error("[AutoRefresh] Listener registration error:", err);
      addLog(`❌ Event listener registreerimise viga: ${err.message}`, "error");
    }

    console.log("[AutoRefresh] Listener registreeritud");

    return () => {
      try {
        console.log("[AutoRefresh] Listener eemaldatakse");
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      } catch (err: any) {
        console.error("[AutoRefresh] Cleanup error:", err);
      }
    };
  }, [api, apiReady, autoRefreshEnabled, lastSelectionTime, loadSelectionData, addLog]);

  // ✅ SAFE SELECTION DATA LOADING
  const loadSelectionData = useCallback(async () => {
    if (!apiReady) {
      console.warn("[LoadSelectionData] API pole valmis");
      addLog("⚠️ API pole valmis", "warn");
      return;
    }

    if (!api?.viewer?.getSelectedObjects) {
      console.warn("[LoadSelectionData] getSelectedObjects pole olemas");
      addLog("❌ API method puudub", "error");
      return;
    }

    try {
      addLog("🔄 Andmeid laadimas...", "info");
      console.log("[LoadSelectionData] Algus...");

      const selected = await safeApiCall(
        () => api.viewer.getSelectedObjects(),
        [],
        "getSelectedObjects"
      );

      console.log("[LoadSelectionData] Valitud objektid:", selected);

      if (!selected?.length) {
        setSelectedData([]);
        setAllFields([]);
        updatePreview();
        addLog("ℹ️ Objekte pole valitud", "info");
        return;
      }

      const rows: Row[] = [];
      const fieldMap = new Map<string, PropertyField>();
      const modelNameById = new Map<string, string>();

      try {
        const proj = await safeApiCall(
          () => api.project?.getProject?.(),
          null,
          "getProject"
        );

        if (proj?.models) {
          for (const m of proj.models) {
            if (m?.id) modelNameById.set(m.id, m.name || m.id);
          }
        }
      } catch (e) {
        console.warn("[LoadSelectionData] Project fetch failed", e);
      }

      const projectName = api.project?.name || "Unknown";

      for (const obj of selected) {
        try {
          const row = await flattenProps(obj, "modelId", projectName, modelNameById, api);
          rows.push(row);

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
          console.warn("[LoadSelectionData] Object processing error:", e);
        }
      }

      const newFields = Array.from(fieldMap.values());

      setSelectedData(rows);
      setAllFields(newFields);
      updatePreview();

      addLog(
        `✅ Laaditud: ${rows.length} objekti, ${newFields.length} välja`,
        "success"
      );
      console.log("[LoadSelectionData] Success", { rows, newFields });
    } catch (err: any) {
      console.error("[LoadSelectionData] Fatal error:", err);
      addLog(
        `❌ Andmete laadimine ebaõnnestus: ${err.message}`,
        "error"
      );
      if (onError) onError(err.message);
    }
  }, [api, apiReady, settings.selectedFields, updatePreview, addLog, onError]);

  // ✅ SAFE MARKUP CREATION
  const createMarkups = useCallback(async () => {
    if (!apiReady) {
      addLog("❌ API pole valmis", "error");
      return;
    }

    if (!api?.markup?.addTextMarkup) {
      addLog("❌ Markup API puudub", "error");
      return;
    }

    const selectedFields = getOrderedSelectedFields();

    if (selectedFields.length === 0) {
      addLog("❌ Väljad puuduvad – vali esmalt väljad", "error");
      return;
    }

    if (selectedData.length === 0) {
      addLog("❌ Objektid puuduvad – vali esmalt objektid 3D vaates", "error");
      return;
    }

    setIsLoading(true);

    try {
      const markups = selectedData
        .map((row) => {
          try {
            const values = selectedFields
              .map((f) => {
                const val = row[f.key];
                return typeof val === "string" ? val.trim() : String(val || "");
              })
              .filter((v) => v.length > 0);

            if (!values.length) return null;

            const midpoint = getMidPoint(row);

            return {
              text: values.join(settings.delimiter),
              start: { ...midpoint },
              end: { ...midpoint },
              color: MARKUP_COLOR,
            };
          } catch (err) {
            console.warn("[createMarkups] Markup building error:", err);
            return null;
          }
        })
        .filter(Boolean);

      if (!markups.length) {
        addLog("❌ Andmeid pole – kõik objektid olid tühjad", "error");
        return;
      }

      const result = await safeApiCall(
        () => api.markup.addTextMarkup(markups),
        [],
        "addTextMarkup"
      );

      const successCount = Array.isArray(result)
        ? result.filter((r) => r?.id).length
        : 0;

      addLog(
        `✅ Loodud: ${successCount}/${selectedData.length} märkupit`,
        "success"
      );

      console.log("[CreateMarkups] Success", { successCount, markups });
    } catch (err: any) {
      console.error("[CreateMarkups] Error:", err);
      addLog(
        `❌ Viga: ${err?.message || "Teadmata viga"}`,
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedData, settings.delimiter, api, apiReady, addLog, getOrderedSelectedFields]);

  const removeAllMarkups = useCallback(async () => {
    if (!apiReady) {
      addLog("❌ API pole valmis", "error");
      return;
    }

    try {
      await safeApiCall(
        () => api.markup?.removeMarkups?.(undefined),
        undefined,
        "removeMarkups"
      );
      addLog("🗑️ Kõik markupid kustutatud", "success");
    } catch (err: any) {
      addLog(`❌ ${err.message}`, "error");
    }
  }, [api, apiReady, addLog]);

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

  // ✅ SHOW API STATUS
  if (!apiReady && apiError) {
    return (
      <div style={{
        padding: 12,
        backgroundColor: "#fff3e0",
        border: "1px solid #f57c00",
        borderRadius: 4,
        color: "#f57c00",
        fontSize: 10,
      }}>
        <strong>⚠️ {t.apiNotReady}</strong>
        <div style={{ marginTop: 4, fontSize: 9, color: "#666" }}>
          {apiError}
        </div>
      </div>
    );
  }

  return (
    <MarkupCreatorErrorBoundary>
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

        {/* API STATUS */}
        {apiError && (
          <div style={{
            backgroundColor: "#fff3e0",
            border: "1px solid #f57c00",
            padding: 6,
            borderRadius: 3,
            fontSize: 9,
            color: "#f57c00",
          }}>
            ⚠️ {apiError}
          </div>
        )}

        {/* BUTTONS */}
        <div style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <button
            onClick={() => loadSelectionData()}
            disabled={isAutoRefreshing || !apiReady}
            style={{
              flex: "1 1 100px",
              padding: "6px 8px",
              backgroundColor: isAutoRefreshing ? "#f0f0f0" : "#e3f2fd",
              color: isAutoRefreshing ? "#999" : "#0066cc",
              border: "1px solid #d0d0d0",
              borderRadius: 3,
              cursor: isAutoRefreshing || !apiReady ? "not-allowed" : "pointer",
              fontSize: 10,
              fontWeight: 500,
              transition: "all 0.15s",
              opacity: isAutoRefreshing || !apiReady ? 0.6 : 1,
            }}
          >
            {isAutoRefreshing ? "🔄..." : t.refresh}
          </button>

          <label
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
              disabled={!apiReady}
            />
            <span style={{ color: autoRefreshEnabled ? "#2e7d32" : "#999" }}>
              {t.autoRefresh}
            </span>
          </label>

          <button
            onClick={() => createMarkups()}
            disabled={isLoading || selectedData.length === 0 || !apiReady}
            style={{
              flex: "1 1 100px",
              padding: "6px 8px",
              backgroundColor: isLoading ? "#f0f0f0" : "#fff",
              border: "1px solid #d0d0d0",
              borderRadius: 3,
              cursor: isLoading || selectedData.length === 0 || !apiReady ? "not-allowed" : "pointer",
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            {isLoading ? t.loading : t.create}
          </button>

          <button
            onClick={() => removeAllMarkups()}
            disabled={!apiReady}
            style={{
              flex: "0 1 40px",
              padding: "6px 8px",
              backgroundColor: "#ffebee",
              border: "1px solid #d0d0d0",
              borderRadius: 3,
              cursor: !apiReady ? "not-allowed" : "pointer",
              fontSize: 10,
              opacity: !apiReady ? 0.6 : 1,
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
                        }}>
                          {field.label}
                        </span>

                        <div style={{ display: "flex", gap: 2, visibility: isInOrder ? "visible" : "hidden" }}>
                          {!isFirst && (
                            <button
                              onClick={() => moveField(field.key, "up")}
                              style={{
                                padding: "3px 5px",
                                fontSize: 9,
                                backgroundColor: "#f0f0f0",
                                border: "1px solid #d0d0d0",
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
                              style={{
                                padding: "3px 5px",
                                fontSize: 9,
                                backgroundColor: "#f0f0f0",
                                border: "1px solid #d0d0d0",
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
            ))}
          </div>
        </div>

        {/* FOOTER WITH SETTINGS */}
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
    </MarkupCreatorErrorBoundary>
  );
}

// ✅ DEFAULT EXPORT
export default MarkupCreator;
