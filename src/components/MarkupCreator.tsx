import React, { useState, useEffect } from "react";
import { AlertCircle, Plus, Trash2, RefreshCw } from "lucide-react";

export interface MarkupAdvancedProps {
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

export default function MarkupAdvanced({
  api,
  allKeys,
  lastSelection,
  translations: t,
  styles: c,
  onMarkupAdded,
  onError,
  onRemoveMarkups,
}: MarkupAdvancedProps) {
  const [fields, setFields] = useState<PropertyField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [markupColor, setMarkupColor] = useState("FF0000");
  const [delimiter, setDelimiter] = useState(" | ");

  // Discover available fields from selected objects
  useEffect(() => {
    const discoverFields = async () => {
      if (lastSelection.length === 0) return;

      setIsLoading(true);
      try {
        const fieldSet = new Set<string>();

        for (const selection of lastSelection) {
          try {
            const props = await api.viewer?.getObjectProperties?.(
              selection.modelId,
              [selection.objectId]
            );

            if (Array.isArray(props) && props[0]?.properties) {
              props[0].properties.forEach((propSet: any) => {
                const setName = propSet?.name || "Unknown";
                if (Array.isArray(propSet?.properties)) {
                  propSet.properties.forEach((prop: any) => {
                    const key = `${setName}.${prop?.name || "Unknown"}`;
                    fieldSet.add(key);
                  });
                }
              });
            }

            // Standard fields
            if (selection.name) fieldSet.add("Name");
            if (selection.type) fieldSet.add("Type");
          } catch (err: any) {
            console.warn("Error discovering fields:", err);
          }
        }

        const newFields = Array.from(fieldSet)
          .sort()
          .map((key) => ({
            key,
            label: key,
            selected: false,
          }));

        // Pre-select common fields
        newFields.forEach((f) => {
          if (["Name", "Type", "ObjectId"].includes(f.key)) {
            f.selected = true;
          }
        });

        setFields(newFields);
      } finally {
        setIsLoading(false);
      }
    };

    discoverFields();
  }, [lastSelection, api]);

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
      if (fieldKey === "Name" || fieldKey === "Type") {
        const sel = lastSelection.find((s) => s.objectId === objectId);
        return sel?.[fieldKey.toLowerCase()] || "";
      }

      const [setName, propName] = fieldKey.split(".");
      const props = await api.viewer?.getObjectProperties?.(modelId, [
        objectId,
      ]);

      if (Array.isArray(props) && props[0]?.properties) {
        const propSet = props[0].properties.find(
          (p: any) => p?.name === setName
        );
        if (propSet?.properties) {
          const prop = propSet.properties.find((p: any) => p?.name === propName);
          return prop?.displayValue ?? prop?.value ?? "";
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
          const bbox = await api.viewer?.getObjectBoundingBox?.(
            selection.modelId,
            selection.objectId
          );

          if (!bbox) continue;

          // Get all property values for this object
          const values: string[] = [];
          for (const field of selectedFields) {
            const value = await getPropertyValue(
              selection.modelId,
              selection.objectId,
              field.key
            );
            if (value) values.push(value);
          }

          if (values.length === 0) continue;

          const text = values.join(delimiter);

          // Calculate center point
          const center = {
            x: (bbox.min.x + bbox.max.x) / 2,
            y: (bbox.min.y + bbox.max.y) / 2,
            z: (bbox.min.z + bbox.max.z) / 2,
          };

          const offset = 0.5;
          const start = { ...center };
          const end = { x: center.x + offset, y: center.y + offset, z: center.z };

          markups.push({
            text: text,
            start: { positionX: start.x * 1000, positionY: start.y * 1000, positionZ: start.z * 1000 },
            end: { positionX: end.x * 1000, positionY: end.y * 1000, positionZ: end.z * 1000 },
            color: markupColor,
          });
        } catch (err: any) {
          console.warn("Error processing object:", err);
        }
      }

      if (markups.length > 0) {
        // Use api.markup.addTextMarkup (from Productivity Tools)
        const result = await api.markup?.addTextMarkup?.(markups);
        const ids = Array.isArray(result) ? result.map((m: any) => m.id).filter(Boolean) : [];
        onMarkupAdded(ids);
      } else {
        onError("Ei sutnud märgistusi luua");
      }
    } catch (err: any) {
      console.error("Markup error:", err);
      onError(err?.message || "Tundmatu viga");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 800 }}>
      <h2>📍 Märgistuste Loomine (Auto-Discover)</h2>

      <div style={{ marginTop: 20, border: "1px solid #ddd", padding: 15, borderRadius: 8 }}>
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
                #{i + 1} · {s.name || s.objectId}
              </li>
            ))}
            {lastSelection.length > 3 && (
              <li>... ja veel {lastSelection.length - 3}</li>
            )}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>Saadaolevad väljad ({fields.length})</h3>
        <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #eee", padding: 10, borderRadius: 4 }}>
          {fields.length === 0 ? (
            <p style={{ color: "#999" }}>Väljasid ei leitud. Vali objektid.</p>
          ) : (
            fields.map((field) => (
              <label key={field.key} style={{ display: "block", marginBottom: 8, cursor: "pointer", fontSize: 13 }}>
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

      <div style={{ marginTop: 15, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: "bold", fontSize: 13 }}>
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
          <label style={{ display: "block", marginBottom: 8, fontWeight: "bold", fontSize: 13 }}>
            Värv (hex)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="color"
              value={"#" + markupColor}
              onChange={(e) => setMarkupColor(e.target.value.substring(1))}
              style={{ width: 50, height: 36, border: "none", borderRadius: 4, cursor: "pointer" }}
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
          disabled={isLoading || lastSelection.length === 0 || fields.filter((f) => f.selected).length === 0}
          style={{
            padding: "10px 20px",
            backgroundColor:
              isLoading || lastSelection.length === 0
                ? "#ccc"
                : "#1976d2",
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

      <div style={{ marginTop: 20, backgroundColor: "#f5f5f5", padding: 15, borderRadius: 4, fontSize: 13 }}>
        <p><strong>💡 Juhis:</strong></p>
        <ul>
          <li>1. Vali objektid 3D vaates</li>
          <li>2. Väljad tuvastatakse automaatselt</li>
          <li>3. Vali soovitud väljad</li>
          <li>4. Seada eraldaja ja värv</li>
          <li>5. Klika "Loo märgistused"</li>
        </ul>
      </div>
    </div>
  );
}
