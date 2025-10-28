import React, { useState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";

export interface MarkupSimpleProps {
  api: any;
  allKeys: string[];
  lastSelection: any[];
  translations: any;
  styles: any;
  onMarkupAdded: (ids: number[]) => void;
  onError: (error: string) => void;
  onRemoveMarkups: () => void;
}

export default function MarkupSimple({
  api,
  allKeys,
  lastSelection,
  translations: t,
  styles: c,
  onMarkupAdded,
  onError,
  onRemoveMarkups,
}: MarkupSimpleProps) {
  const [markupText, setMarkupText] = useState("");
  const [markupColor, setMarkupColor] = useState("FFFFFF");
  const [isLoading, setIsLoading] = useState(false);

  const createMarkups = async () => {
    if (!markupText.trim()) {
      onError("Sisesta märgistuse tekst");
      return;
    }

    if (lastSelection.length === 0) {
      onError("Vali objektid 3D vaates");
      return;
    }

    setIsLoading(true);
    try {
      const markupIds: number[] = [];
      
      for (const selection of lastSelection) {
        const markupData = {
          modelId: selection.modelId,
          objectIds: [selection.objectId],
          text: markupText,
          backgroundColor: markupColor,
        };

        const result = await api.markup?.createMarkup?.(markupData);
        if (result?.id) {
          markupIds.push(result.id);
        }
      }

      if (markupIds.length > 0) {
        onMarkupAdded(markupIds);
        setMarkupText("");
      } else {
        onError("Ei sutnud märgistusi luua");
      }
    } catch (err: any) {
      onError(err?.message || "Tundmatu viga");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 600 }}>
      <h2>📍 Märgistuste Loomine</h2>

      <div style={{ marginTop: 20, border: "1px solid #ddd", padding: 15, borderRadius: 8 }}>
        <h3>Valitud objektid: {lastSelection.length}</h3>
        {lastSelection.length === 0 && (
          <div style={{ color: "#d32f2f", marginTop: 10, display: "flex", gap: 8 }}>
            <AlertCircle size={20} />
            <span>Vali objektid 3D vaates esmalt</span>
          </div>
        )}
        {lastSelection.length > 0 && (
          <ul style={{ marginTop: 10 }}>
            {lastSelection.slice(0, 5).map((s, i) => (
              <li key={i}>#{i + 1} · {s.name || s.objectId}</li>
            ))}
            {lastSelection.length > 5 && <li>... ja veel {lastSelection.length - 5}</li>}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>
          Märgistuse tekst
        </label>
        <textarea
          value={markupText}
          onChange={(e) => setMarkupText(e.target.value)}
          placeholder="Sisesta märgistuse tekst..."
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 4,
            minHeight: 80,
            fontFamily: "monospace",
          }}
        />
      </div>

      <div style={{ marginTop: 15 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>
          Värv (hex)
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="color"
            value={"#" + markupColor}
            onChange={(e) => setMarkupColor(e.target.value.substring(1))}
            style={{ width: 60, height: 40, border: "none", borderRadius: 4, cursor: "pointer" }}
          />
          <input
            type="text"
            value={markupColor}
            onChange={(e) => setMarkupColor(e.target.value)}
            placeholder="FFFFFF"
            style={{
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 4,
              flex: 1,
              fontFamily: "monospace",
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        <button
          onClick={createMarkups}
          disabled={isLoading || lastSelection.length === 0}
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
            fontWeight: "bold",
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
          <li>2. Sisesta märgistuse tekst</li>
          <li>3. Vali värv</li>
          <li>4. Klika "Loo märgistused"</li>
        </ul>
      </div>
    </div>
  );
}
