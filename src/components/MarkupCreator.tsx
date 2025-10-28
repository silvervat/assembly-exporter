import React, { useState, useEffect } from "react";
import { AlertCircle, Plus, Trash2, RefreshCw } from "lucide-react";

export interface MarkupCreatorProps {
  api: any;
  allKeys: string[];
  lastSelection: any[];
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

  // ✅ FIXED: Discover available fields from selected objects - MATCHING AVASTA TAB LOGIC
  useEffect(() => {
    const discoverFields = async () => {
      if (lastSelection.length === 0) {
        setFields([]);
        return;
      }

      setIsLoading(true);
      try {
        const fieldSet = new Set<string>();
        const keyCounts: Record<string, number> = {};

        // Loop through all selected objects
        for (const selection of lastSelection) {
          try {
            // ✅ CRITICAL: Use includeHidden: true to get ALL properties (like AVASTA does)
            const props = await api.viewer?.getObjectProperties?.(
              selection.modelId,
              [selection.objectId],
              { includeHidden: true }
            );

            console.log("Properties discovered:", props);

            if (Array.isArray(props) && props[0]?.properties) {
              // Flatten property sets like AVASTA does: "SetName" + "PropertyName" = "SetName.PropertyName"
              props[0].properties.forEach((propSet: any) => {
                const setName = propSet?.name || "Unknown";
                if (Array.isArray(propSet?.properties)) {
                  propSet.properties.forEach((prop: any) => {
                    const propName = prop?.name || "Unknown";
                    const key = `${setName}.${propName}`;
                    fieldSet.add(key);
                    keyCounts[key] = (keyCounts[key] || 0) + 1;
                  });
                }
              });
            }

            // Add standard fields
            if (selection.name) fieldSet.add("Name");
            if (selection.type) fieldSet.add("Type");
            if (selection.objectId) fieldSet.add("ObjectId");
            
            // Try to get metadata for additional context
            try {
              const metadata = await api.viewer?.getObjectMetadata?.(
                selection.modelId,
                selection.objectId
              );
              if (metadata?.properties) {
                Object.entries(metadata.properties).forEach(([key, value]: any) => {
                  if (typeof value === "string" || typeof value === "number") {
                    fieldSet.add(`Metadata.${key}`);
                  }
                });
              }
            } catch (err) {
              // Metadata not available, continue
            }

          } catch (err: any) {
            console.warn("Error discovering fields for object:", err);
          }
        }

        // Convert set to sorted array of PropertyField objects
        const newFields = Array.from(fieldSet)
          .sort()
          .map((key) => ({
            key,
            label: key,
            selected: false,
          }));

        // Pre-select common fields for user convenience
        newFields.forEach((f) => {
          if (["Name", "Type", "ObjectId"].includes(f.key)) {
            f.selected = true;
          }
        });

        console.log("Discovered fields:", newFields.length, newFields);
        setFields(newFields);
      } catch (err: any) {
        console.error("Error in discoverFields:", err);
        onError(`Field discovery error: ${err?.message || "unknown"}`);
      } finally {
        setIsLoading(false);
      }
    };

    discoverFields();
  }, [lastSelection, api, onError]);

  const toggleField = (key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f))
    );
  };

  const getPropertyValue = async (
    modelId: string,
    objectId: number,
    fieldKey: string
  ): Promise<string> => {
    try {
      // Handle standard fields first
      if (fieldKey === "Name" || fieldKey === "Type" || fieldKey === "ObjectId") {
        const sel = lastSelection.find((s) => s.objectId === objectId);
        if (fieldKey === "ObjectId") return String(sel?.objectId || "");
        return sel?.[fieldKey.toLowerCase()] || "";
      }

      // Handle Metadata fields
      if (fieldKey.startsWith("Metadata.")) {
        const metaKey = fieldKey.replace("Metadata.", "");
        try {
          const metadata = await api.viewer?.getObjectMetadata?.(modelId, objectId);
          if (metadata?.properties?.[metaKey]) {
            return String(metadata.properties[metaKey]);
          }
        } catch (err) {
          console.warn("Error getting metadata:", err);
        }
        return "";
      }

      // Handle property set fields: "SetName.PropertyName"
      const [setName, propName] = fieldKey.split(".");
      if (!setName || !propName) return "";

      // ✅ CRITICAL: Use includeHidden: true to match discovery
      const props = await api.viewer?.getObjectProperties?.(
        modelId,
        [objectId],
        { includeHidden: true }
      );

      if (Array.isArray(props) && props[0]?.properties) {
        const propSet = props[0].properties.find(
          (p: any) => p?.name === setName
        );
        if (propSet?.properties) {
          const prop = propSet.properties.find((p: any) => p?.name === propName);
          if (prop) {
            // Prefer displayValue, fallback to value
            const value = prop?.displayValue ?? prop?.value ?? "";
            return String(value);
          }
        }
      }

      return "";
    } catch (err) {
      console.warn("Error getting property value:", err);
      return "";
    }
  };

  const createMarkups = async () => {
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

      for (const selection of lastSelection) {
        try {
          // Get bounding box for markup positioning
          const bbox = await api.viewer?.getObjectBoundingBox?.(
            selection.modelId,
            selection.objectId
          );

          if (!bbox) {
            console.warn("No bounding box for object:", selection.objectId);
            continue;
          }

          // Collect all selected field values for this object
          const values: string[] = [];
          for (const field of selectedFields) {
            try {
              const value = await getPropertyValue(
                selection.modelId,
                selection.objectId,
                field.key
              );
              if (value && value.trim()) {
                values.push(value);
              }
            } catch (err) {
              console.warn("Error getting field value:", field.key, err);
            }
          }

          if (values.length === 0) {
            console.warn("No values found for object:", selection.objectId);
            continue;
          }

          // Join values with delimiter
          const text = values.join(delimiter);

          // Calculate markup position at object center
          const center = {
            x: (bbox.min.x + bbox.max.x) / 2,
            y: (bbox.min.y + bbox.max.y) / 2,
            z: (bbox.min.z + bbox.max.z) / 2,
          };

          // Small offset for better visibility
          const offset = 0.5;
          const start = { ...center };
          const end = {
            x: center.x + offset,
            y: center.y + offset,
            z: center.z,
          };

          // Create markup object for Productivity Tools API
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
            color: markupColor,
          });

          console.log("Markup created:", {
            text,
            color: markupColor,
          });
        } catch (err: any) {
          console.warn("Error processing object:", selection.objectId, err);
        }
      }

      if (markups.length > 0) {
        console.log("Adding markups:", markups.length);
        // Use Productivity Tools API to add markups
        const result = await api.markup?.addTextMarkup?.(markups);
        const ids = Array.isArray(result)
          ? result.map((m: any) => m.id).filter(Boolean)
          : [];
        console.log("Markups added, IDs:", ids);
        onMarkupAdded(ids);
      } else {
        onError("Ei suutnud märgistusi luua - väljade väärtused puuduvad");
      }
    } catch (err: any) {
      console.error("Markup creation error:", err);
      onError(err?.message || "Tundmatu viga märgistuse loomisel");
    } finally {
      setIsLoading(false);
    }
  };

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
            {lastSelection.length > 3 && (
              <li>... ja veel {lastSelection.length - 3}</li>
            )}
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
            <p style={{ color: "#999" }}>
              {isLoading ? "Tuvastan väljasid..." : "Välju ei leitud. Vali objektid."}
            </p>
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
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontWeight: "bold",
              fontSize: 13,
            }}
          >
            Eraldaja
          </label>
          <input
            type="text"
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value)}
            placeholder=" | "
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 12,
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontWeight: "bold",
              fontSize: 13,
            }}
          >
            Värv (hex)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="color"
              value={"#" + markupColor}
              onChange={(e) => setMarkupColor(e.target.value.substring(1))}
              style={{
                width: 50,
                height: 36,
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            />
            <input
              type="text"
              value={markupColor}
              onChange={(e) => setMarkupColor(e.target.value.toUpperCase())}
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
          onClick={createMarkups}
          disabled={
            isLoading ||
            lastSelection.length === 0 ||
            fields.filter((f) => f.selected).length === 0
          }
          style={{
            padding: "10px 20px",
            backgroundColor:
              isLoading || lastSelection.length === 0 ? "#ccc" : "#1976d2",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor:
              isLoading || lastSelection.length === 0
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
          {isLoading ? "Loon..." : "Loo märgistused"}
        </button>
        <button
          onClick={() => {
            setFields((prev) => prev.map((f) => ({ ...f, selected: false })));
          }}
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
          onClick={onRemoveMarkups}
          style={{
            padding: "10px 20px",
            backgroundColor: "#d32f2f",
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
          <Trash2 size={18} />
          Kustuta märgistused
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
          💡 <strong>Tipp:</strong> Samad väljad mis näed AVASTA tabil on siin
          valitavad. Iga valitud välja väärtus liitakse tekstmarupiga
          eraldajaga.
        </p>
      </div>
    </div>
  );
}
