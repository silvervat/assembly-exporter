import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { WorkspaceAPI, TextMarkup, MarkupPick } from "trimble-connect-workspace-api";

interface Pset {
  key: string;
  label: string;
}

interface Props {
  api: WorkspaceAPI;
  allKeys: string[];
  lastSelection: { modelId: string; ids: number[] }[];
  translations: Record<string, string>;
  styles: Record<string, CSSProperties>;
  onMarkupAdded: (ids: number[]) => void;
  onError: (error: string) => void;
  onRemoveMarkups: () => Promise<void>;
}

const COLORS = [
  "#E53935", "#D81B60", "#8E24AA", "#5E35B1", "#3949AB", "#1E88E5",
  "#039BE5", "#00ACC1", "#00897B", "#43A047", "#7CB342", "#C0CA33",
];

export default function MarkupCreator({
  api,
  allKeys,
  lastSelection,
  translations: t,
  styles: c,
  onMarkupAdded,
  onError,
  onRemoveMarkups,
}: Props) {
  const [markupType, setMarkupType] = useState<"text" | "arrow" | "highlight">("text");
  const [markupText, setMarkupText] = useState<string>("");
  const [markupColor, setMarkupColor] = useState<string>(COLORS[0]);
  const [psetOrder, setPsetOrder] = useState<string[]>([]);
  const [dragState, setDragState] = useState<{ dragging: string | null; over: string | null }>({
    dragging: null,
    over: null,
  });
  const [viewName, setViewName] = useState<string>("");
  const [markupIds, setMarkupIds] = useState<number[]>([]); // Lisa markupIds state

  // Laadi Pset-id
  const loadPsets = useCallback(() => {
    console.log("Loading Psets, allKeys:", allKeys);
    const psets = allKeys.filter(key => 
      key.startsWith("Pset_") || 
      key.startsWith("Tekla_") || 
      key.startsWith("IfcElement") || 
      key.startsWith("ProductProduct_")
    );
    setPsetOrder(psets.length ? psets : ["No Psets found"]); // Default väärtus, kui Pset-e pole
  }, [allKeys]);

  useEffect(() => {
    loadPsets();
  }, [loadPsets]);

  // Pset väärtuse hankimine
  async function getPropertyValue(modelId: string, objectId: number, propertyName: string): Promise<string> {
    try {
      console.log(`Fetching property for modelId: ${modelId}, objectId: ${objectId}, property: ${propertyName}`);
      const [set, prop] = propertyName.split(".");
      const properties = await api.viewer.getObjectProperties(modelId, [objectId]);
      console.log("Properties fetched:", properties);
      const props = properties[0]?.properties;
      if (!props) return "";
      const propertySet = props.find(p => p.name === set);
      if (!propertySet || !propertySet.properties) return "";
      const property = propertySet.properties.find(p => p.name === prop);
      return property ? property.value.toString() : "";
    } catch (e) {
      console.error("Error fetching property:", e);
      return "";
    }
  }

  // Markuppide lisamine
  async function addMarkups() {
    try {
      await onRemoveMarkups(); // Eemalda varasemad markupid
      if (!lastSelection.length) {
        onError(t.selectObjects);
        return;
      }

      const { modelId, ids } = lastSelection[0];
      if (!ids.length) return;

      const markups: TextMarkup[] = [];
      const bBoxes = await api.viewer.getObjectBoundingBoxes(modelId, ids);
      if (!bBoxes.length) {
        onError("No bounding boxes found for selected objects.");
        return;
      }

      for (const bBox of bBoxes) {
        const midPoint = {
          x: (bBox.boundingBox.min.x + bBox.boundingBox.max.x) / 2.0,
          y: (bBox.boundingBox.min.y + bBox.boundingBox.max.y) / 2.0,
          z: (bBox.boundingBox.min.z + bBox.boundingBox.max.z) / 2.0,
        };
        const point: MarkupPick = {
          positionX: midPoint.x * 1000,
          positionY: midPoint.y * 1000,
          positionZ: midPoint.z * 1000,
        };

        let text = markupText;
        if (markupType === "text" && psetOrder.length && psetOrder[0] !== "No Psets found") {
          text = await getPropertyValue(modelId, bBox.id, psetOrder[0]) || markupText;
        }

        const markup: TextMarkup = {
          text: markupType === "text" ? text : "",
          start: point,
          end: markupType === "arrow" ? { positionX: point.positionX + 100, positionY: point.positionY, positionZ: point.positionZ } : point,
          color: markupColor,
        };
        markups.push(markup);
      }

      const newMarkupIds = (await api.markup.addTextMarkup(markups)).map(t => t.id as number);
      setMarkupIds(newMarkupIds); // Uuenda markupIds
      onMarkupAdded(newMarkupIds);
    } catch (e: any) {
      console.error("Markup addition error:", e);
      onError(e?.message || t.unknownError);
    }
  }

  // Salvesta vaatesse
  async function saveMarkupsToView() {
    try {
      if (!viewName) {
        onError("⚠️ Enter view name.");
        return;
      }
      if (!markupIds.length) {
        onError("No markups to save.");
        return;
      }
      await api.viewer.saveView({ name: viewName, markups: markupIds });
      onMarkupAdded([]); // Tühjenda markup ID-d
      setMarkupIds([]); // Tühjenda markupIds
      setViewName("");
    } catch (e: any) {
      console.error("Save view error:", e);
      onError(e?.message || t.unknownError);
    }
  }

  // Drag-and-drop loogika
  const handlePsetDragStart = (key: string) => setDragState({ ...dragState, dragging: key });
  const handlePsetDragOver = (key: string) => setDragState({ ...dragState, over: key });
  const handlePsetDrop = () => {
    if (dragState.dragging && dragState.over && dragState.dragging !== dragState.over) {
      const newOrder = [...psetOrder];
      const fromIndex = newOrder.indexOf(dragState.dragging);
      const toIndex = newOrder.indexOf(dragState.over);
      newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, dragState.dragging);
      setPsetOrder(newOrder);
    }
    setDragState({ dragging: null, over: null });
  };

  return (
    <div style={c.section}>
      <h3 style={c.heading}>{t.markupTitle}</h3>
      <div style={c.note}>{t.markupHint || "Add markups to selected objects."}</div>
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>Pset-ide järjekord</label>
        <div style={c.columnListNoscroll}>
          {psetOrder.map(key => (
            <div
              key={key}
              style={{
                ...c.columnItem,
                ...(dragState.dragging === key ? c.columnItemDragging : {}),
                ...(dragState.over === key ? c.columnItemHighlight : {}),
              }}
              draggable
              onDragStart={() => handlePsetDragStart(key)}
              onDragOver={() => handlePsetDragOver(key)}
              onDrop={handlePsetDrop}
            >
              <span style={c.dragHandle}>☰</span>
              <span style={c.ellipsis}>{key}</span>
            </div>
          ))}
        </div>
        <button style={c.btnGhost} onClick={loadPsets}>{t.refreshData}</button>
      </div>
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.markupType}</label>
        <select
          value={markupType}
          onChange={e => setMarkupType(e.target.value as any)}
          style={c.input}
        >
          <option value="text">{t.text || "Text"}</option>
          <option value="arrow">{t.arrow || "Arrow"}</option>
          <option value="highlight">{t.highlight || "Highlight"}</option>
        </select>
      </div>
      {markupType === "text" && (
        <div style={c.fieldGroup}>
          <label style={c.labelTop}>{t.markupText}</label>
          <input
            type="text"
            value={markupText}
            onChange={e => setMarkupText(e.target.value)}
            placeholder="Enter text (or first Pset will be used)"
            style={c.input}
          />
        </div>
      )}
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.markupColor}</label>
        <div style={c.colorPicker}>
          {COLORS.map(color => (
            <div
              key={color}
              style={{
                ...c.colorSwatch,
                background: color,
                ...(markupColor === color ? c.colorSwatchSelected : {}),
              }}
              onClick={() => setMarkupColor(color)}
            />
          ))}
        </div>
      </div>
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.viewNameLabel}</label>
        <input
          type="text"
          value={viewName}
          onChange={e => setViewName(e.target.value)}
          placeholder="View name..."
          style={c.input}
        />
      </div>
      <div style={c.controls}>
        <button style={c.btn} onClick={addMarkups} disabled={!lastSelection.length}>
          {t.markupTitle || "Add Markups"}
        </button>
        <button style={c.btn} onClick={saveMarkupsToView} disabled={!viewName || !markupIds.length}>
          {t.saveViewButton || "Save View"}
        </button>
      </div>
    </div>
  );
}
