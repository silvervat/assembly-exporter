import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlertCircle, Plus, Trash2, RefreshCw } from "lucide-react";

export interface MarkupCreatorProps {
  api: any;
  allKeys: string[];
  lastSelection: Array<{
    modelId: string;
    objectId: number;
    name?: string;
    type?: string;
  }>;
  translations: any;
  styles: any;
  onMarkupAdded: (ids: number[]) => void;
  onError: (error: string) => void;
  onRemoveMarkups: () => void;
}

interface PropertyField {
  key: string;
  label: string;
  selected: boolean;
}

// Helper to validate and normalize hex color
const normalizeColor = (color: string): string => {
  let hex = color.replace(/^#/, "").toUpperCase();
  if (hex.length === 6 && /^[0-9A-F]{6}$/.test(hex)) {
    return hex;
  }
  return "FF0000";
};

export default function MarkupCreator({
  api,
  allKeys,
  lastSelection,
  translations: t,
  styles: c,
  onMarkupAdded,
  onError,
  onRemoveMarkups,
}: MarkupCreatorProps) {
  const [fields, setFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupColor, setMarkupColor] = useState("FF0000");
  const [delimiter, setDelimiter] = useState(" | ");
  const [markupIds, setMarkupIds] = useState<number[]>([]);

  const propsCache = useRef(new Map<string, any>());
  const metadataCache = useRef(new Map<string, any>());
  const bboxCache = useRef(new Map<string, any>());

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ✅ BATCH field discovery - grouped by modelId
  useEffect(() => {
    // Ignore if already loading to prevent infinite loops
    if (isLoading) {
      console.log("Discovery already in progress, skipping...");
      return;
    }

    const discoverFields = async () => {
      requestIdRef.current += 1;
      const thisRequestId = requestIdRef.current;

      if (!lastSelection || lastSelection.length === 0) {
        setFields([]);
        return;
      }

      setIsLoading(true);
      try {
        const fieldSet = new Set<string>();

        // Group objectIds by modelId for batch requests
        const byModel = new Map<string, number[]>();
        for (const sel of lastSelection) {
          const arr = byModel.get(sel.modelId) || [];
          arr.push(sel.objectId);
          byModel.set(sel.modelId, arr);
        }

        // For each model, call getObjectProperties once (batch)
        for (const [modelId, objectIds] of byModel.entries()) {
          try {
            console.log(`Fetching properties for model ${modelId}, objects:`, objectIds);

            const propsArray = await api.viewer?.getObjectProperties?.(
              modelId,
              objectIds,
              { includeHidden: true }
            );

            if (Array.isArray(propsArray)) {
              propsArray.forEach((p: any, idx: number) => {
                const objectId = objectIds[idx];
                const cacheKey = `${modelId}:${objectId}`;
                propsCache.current.set(cacheKey, p);

                if (p?.properties && Array.isArray(p.properties)) {
                  p.properties.forEach((propSet: any) => {
                    const setName = propSet?.name || "Unknown";
                    if (Array.isArray(propSet?.properties)) {
                      propSet.properties.forEach((prop: any) => {
                        const propName = prop?.name || "Unknown";
                        const key = `${setName}.${propName}`;
                        fieldSet.add(key);
                      });
                    }
                  });
                }
              });
            }

            console.log(`Discovered ${fieldSet.size} unique fields from ${modelId}`);
          } catch (err: any) {
            console.warn("getObjectProperties batch error for model", modelId, err);
            onError?.(`Error discovering properties for model ${modelId}: ${err?.message}`);
          }
        }

        // Add standard fields and collect metadata keys
        for (const sel of lastSelection) {
          if (sel.name) fieldSet.add("Name");
          if (sel.type) fieldSet.add("Type");
          if (sel.objectId !== undefined && sel.objectId !== null) fieldSet.add("ObjectId");

          const metaCacheKey = `${sel.modelId}:${sel.objectId}`;
          if (!metadataCache.current.has(metaCacheKey)) {
            try {
              const meta = await api.viewer?.getObjectMetadata?.(sel.modelId, sel.objectId);
              if (meta) {
                metadataCache.current.set(metaCacheKey, meta);
                if (meta?.properties) {
                  Object.entries(meta.properties).forEach(([k, v]: any) => {
                    if (typeof v === "string" || typeof v === "number") {
                      fieldSet.add(`Metadata.${k}`);
                    }
                  });
                }
              }
            } catch (err) {
              console.warn("getObjectMetadata error:", err);
            }
          } else {
            const meta = metadataCache.current.get(metaCacheKey);
            if (meta?.properties) {
              Object.entries(meta.properties).forEach(([k, v]: any) => {
                if (typeof v === "string" || typeof v === "number") {
                  fieldSet.add(`Metadata.${k}`);
                }
              });
            }
          }
        }

        // Stop if a newer request has started
        if (requestIdRef.current !== thisRequestId) {
          console.log("Newer request started, discarding old results");
          return;
        }

        // Convert to PropertyField[]
        const newFields = Array.from(fieldSet)
          .sort()
          .map((key) => ({
            key,
            label: key,
            selected: ["Name", "Type", "ObjectId"].includes(key),
          }));

        if (mountedRef.current) {
          setFields(newFields);
          console.log(`✅ Discovered ${newFields.length} fields total`);
        }
      } catch (err: any) {
        console.error("discoverFields error:", err);
        onError?.(`Field discovery error: ${err?.message || "unknown"}`);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    discoverFields();
  }, [lastSelection, api]);

  const toggleField = useCallback((key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f))
    );
  }, []);

  const fetchObjectPropertiesIfNeeded = useCallback(
    async (modelId: string, objectId: number) => {
      const key = `${modelId}:${objectId}`;
      if (propsCache.current.has(key)) {
        return propsCache.current.get(key);
      }

      try {
        const propsArr = await api.viewer?.getObjectProperties?.(
          modelId,
          [objectId],
          { includeHidden: true }
        );
        const p = Array.isArray(propsArr) ? propsArr[0] : propsArr;
        propsCache.current.set(key, p);
        return p;
      } catch (err) {
        console.warn("fetchObjectPropertiesIfNeeded error:", err);
        return null;
      }
    },
    [api]
  );

  const getPropertyValue = useCallback(
    async (modelId: string, objectId: number, fieldKey: string): Promise<string> => {
      try {
        // Handle standard fields
        if (fieldKey === "Name" || fieldKey === "Type" || fieldKey === "ObjectId") {
          const sel = lastSelection.find((s) => s.modelId === modelId && s.objectId === objectId);
          if (fieldKey === "ObjectId") return String(sel?.objectId ?? "");
          return String(sel?.[fieldKey.toLowerCase()] ?? "");
        }

        // Handle Metadata fields
        if (fieldKey.startsWith("Metadata.")) {
          const metaKey = fieldKey.replace("Metadata.", "");
          const metaCacheKey = `${modelId}:${objectId}`;
          let meta = metadataCache.current.get(metaCacheKey);
          if (!meta) {
            meta = await api.viewer?.getObjectMetadata?.(modelId, objectId);
            if (meta) metadataCache.current.set(metaCacheKey, meta);
          }
          if (meta?.properties?.[metaKey]) {
            return String(meta.properties[metaKey]);
          }
          return "";
        }

        // Handle "SetName.PropertyName" — split only at first dot
        const dotIdx = fieldKey.indexOf(".");
        if (dotIdx === -1) return "";
        const setName = fieldKey.substring(0, dotIdx);
        const propName = fieldKey.substring(dotIdx + 1);

        const props = await fetchObjectPropertiesIfNeeded(modelId, objectId);
        if (props?.properties && Array.isArray(props.properties)) {
          const propSet = props.properties.find((p: any) => p?.name === setName);
          if (propSet?.properties) {
            const prop = propSet.properties.find((p: any) => p?.name === propName);
            if (prop) {
              const value = prop?.displayValue ?? prop?.value ?? "";
              return String(value);
            }
          }
        }

        return "";
      } catch (err) {
        console.warn("getPropertyValue error:", fieldKey, err);
        return "";
      }
    },
    [lastSelection, fetchObjectPropertiesIfNeeded]
  );

  const getObjectBoundingBox = useCallback(
    async (modelId: string, objectId: number) => {
      const key = `${modelId}:${objectId}`;
      if (bboxCache.current.has(key)) {
        return bboxCache.current.get(key);
      }

      try {
        const bbox = await api.viewer?.getObjectBoundingBox?.(modelId, objectId);
        if (bbox) {
          bboxCache.current.set(key, bbox);
          return bbox;
        }
      } catch (err) {
        console.warn("getObjectBoundingBox error:", err);
      }
      return null;
    },
    [api]
  );

  const createMarkups = useCallback(
    async () => {
      const selectedFields = fields.filter((f) => f.selected);

      if (selectedFields.length === 0) {
        onError("Vali vähemalt üks väli");
        return;
      }

      if (lastSelection.length === 0) {
        onError("Vali objektid 3D vaates");
        return;
      }

      setIsLoading(true);
      try {
        const markups: any[] = [];
        const createdIds: number[] = [];

        for (const selection of lastSelection) {
          try {
            const bbox = await getObjectBoundingBox(selection.modelId, selection.objectId);

            if (!bbox) {
              console.warn("No bounding box for object:", selection.objectId);
              continue;
            }

            const values: string[] = [];
            for (const field of selectedFields) {
              const value = await getPropertyValue(
                selection.modelId,
                selection.objectId,
                field.key
              );
              if (value && value.trim()) {
                values.push(value);
              }
            }

            if (values.length === 0) {
              console.warn("No values found for object:", selection.objectId);
              continue;
            }

            const text = values.join(delimiter);

            const center = {
              x: (bbox.min.x + bbox.max.x) / 2,
              y: (bbox.min.y + bbox.max.y) / 2,
              z: (bbox.min.z + bbox.max.z) / 2,
            };

            const offset = 0.5;
            const start = { ...center };
            const end = {
              x: center.x + offset,
              y: center.y + offset,
              z: center.z,
            };

            const hexColor = normalizeColor(markupColor);

            markups.push({
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
            });

            console.log("Markup prepared:", { text, color: hexColor, objectId: selection.objectId });
          } catch (err: any) {
            console.warn("Error processing object:", selection.objectId, err);
          }
        }

        if (markups.length > 0) {
          console.log(`Adding ${markups.length} markups...`);
          const result = await api.markup?.addTextMarkup?.(markups);

          if (Array.isArray(result)) {
            if (result.length > 0) {
              if (typeof result[0] === "object" && result[0]?.id) {
                createdIds.push(...result.map((m: any) => m.id).filter(Boolean));
              } else if (typeof result[0] === "number") {
                createdIds.push(...result);
              }
            }
          } else if (result?.id) {
            createdIds.push(result.id);
          }

          console.log("✅ Markups added, IDs:", createdIds);
          setMarkupIds(createdIds);
          onMarkupAdded?.(createdIds);
        } else {
          onError("Ei suutnud märgistusi luua - väljade väärtused puuduvad");
        }
      } catch (err: any) {
        console.error("createMarkups error:", err);
        onError?.(err?.message || "Tundmatu viga märgistuse loomisel");
      } finally {
        setIsLoading(false);
      }
    },
    [fields, lastSelection, delimiter, markupColor, onMarkupAdded, onError, getPropertyValue, getObjectBoundingBox]
  );

  const handleRemoveMarkups = useCallback(async () => {
    if (markupIds.length === 0) {
      onError("Pole märgistusi kustutamiseks");
      return;
    }

    try {
      console.log("Removing markups:", markupIds);
      await api.markup?.removeMarkups?.(markupIds);
      setMarkupIds([]);
      console.log("✅ Markups removed");
    } catch (err: any) {
      console.error("Error removing markups:", err);
      onError?.(err?.message || "Viga märgistuste kustutamisel");
    }
  }, [markupIds, onError, api]);

  return (
    <div style={{ padding: 20, maxWidth: 800 }}>
      <h2>🔖 Märgistuste Loomine (Auto-Discover)</h2>

      <div
        style={{
          marginTop: 20,
          border: "1px solid #ddd",
          padding: 15,
          borderRadius: 8,
        }}
      >
        <h3>Valitud objektid: {lastSelection.length}</h3>
        {lastSelection.length === 0 && (
          <div style={{ color: "#d32f2f", marginTop: 10, display: "flex", gap: 8 }}>
            <AlertCircle size={20} />
            <span>Vali objektid 3D vaates esmalt</span>
          </div>
        )}
        {lastSelection.length > 0 && (
          <ul style={{ marginTop: 10, fontSize: 13 }}>
            {lastSelection.slice(0, 3).map((s, i) => (
              <li key={i}>
                #{i + 1} · {s.name || `Object ${s.objectId}`}
              </li>
            ))}
            {lastSelection.length > 3 && <li>... ja veel {lastSelection.length - 3}</li>}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>
          Saadaolevad väljad ({fields.length})
          {isLoading && " - tuvastan..."}
        </h3>
        <div
          style={{
            maxHeight: 250,
            overflowY: "auto",
            border: "1px solid #eee",
            padding: 10,
            borderRadius: 4,
          }}
        >
          {fields.length === 0 ? (
            <p style={{ color: "#999" }}>{isLoading ? "Tuvastan väljasid..." : "Välju ei leitud. Vali objektid."}</p>
          ) : (
            fields.map((field) => (
              <label
                key={field.key}
                style={{
                  display: "block",
                  marginBottom: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  padding: 4,
                  borderRadius: 4,
                  backgroundColor: field.selected ? "#e3f2fd" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={field.selected}
                  onChange={() => toggleField(field.key)}
                  style={{ marginRight: 8 }}
                />
                {field.label}
              </label>
            ))
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 15,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: "bold", fontSize: 13 }}>Eraldaja</label>
          <input
            type="text"
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value)}
            placeholder=" | "
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4, fontSize: 12 }}
          />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: "bold", fontSize: 13 }}>Värv (hex)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="color"
              value={"#" + normalizeColor(markupColor)}
              onChange={(e) => {
                const v = e.target.value.replace(/^#/, "");
                setMarkupColor(v.toUpperCase());
              }}
              style={{ width: 50, height: 36, border: "none", borderRadius: 4, cursor: "pointer" }}
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
                fontFamily: "monospace",
                fontSize: 12,
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={createMarkups}
          disabled={isLoading || lastSelection.length === 0 || fields.filter((f) => f.selected).length === 0}
          style={{
            padding: "10px 20px",
            backgroundColor: isLoading || lastSelection.length === 0 ? "#ccc" : "#1976d2",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: isLoading || lastSelection.length === 0 ? "not-allowed" : "pointer",
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 14,
            fontWeight: "bold",
          }}
        >
          <Plus size={18} />
          {isLoading ? "Loon..." : "Loo märgistused"}
        </button>

        <button
          type="button"
          onClick={() => setFields((prev) => prev.map((f) => ({ ...f, selected: false })))}
          style={{
            padding: "10px 20px",
            backgroundColor: "#757575",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 14,
          }}
        >
          <RefreshCw size={18} />
          Tühjenda valik
        </button>

        <button
          type="button"
          onClick={handleRemoveMarkups}
          disabled={markupIds.length === 0}
          style={{
            padding: "10px 20px",
            backgroundColor: markupIds.length === 0 ? "#ccc" : "#d32f2f",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: markupIds.length === 0 ? "not-allowed" : "pointer",
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 14,
          }}
        >
          <Trash2 size={18} />
          Kustuta märgistused ({markupIds.length})
        </button>
      </div>

      <div
        style={{
          marginTop: 20,
          backgroundColor: "#f5f5f5",
          padding: 15,
          borderRadius: 4,
          fontSize: 13,
        }}
      >
        <p>
          <strong>💡 Juhis:</strong>
        </p>
        <ol>
          <li>Vali objektid 3D vaates</li>
          <li>Väljad tuvastatakse automaatselt (nagu AVASTA tabs)</li>
          <li>Vali soovitud väljad checkboxiga</li>
          <li>Seada eraldaja ja värv</li>
          <li>Klika "Loo märgistused"</li>
        </ol>
        <p style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
          💡 <strong>Tipp:</strong> Samad väljad mis näed AVASTA tabil on siin valitavad. Iga valitud välja väärtus liitakse tekstmarupiga eraldajaga.
        </p>
      </div>
    </div>
  );
}
