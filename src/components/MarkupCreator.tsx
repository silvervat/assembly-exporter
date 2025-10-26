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
  allKeys: initialAllKeys,
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
  const [markupIds, setMarkupIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [allKeys, setAllKeys] = useState<string[]>(initialAllKeys);

  // Laadi Pset-id sarnaselt "Avasta" loogikaga
  const loadPsets = useCallback(async () => {
    console.log("Loading Psets, lastSelection:", lastSelection, "allKeys:", allKeys);
    if (!lastSelection.length || !lastSelection[0].ids.length) {
      setPsetOrder([]);
      setAllKeys([]);
      return;
    }
    const { modelId, ids } = lastSelection[0];
    try {
      setIsLoading(true);
      const properties = await api.viewer.getObjectProperties(modelId, ids, { includeHidden: true });
      const newKeys = properties.flatMap(prop => 
        prop.properties?.flatMap(p => 
          p.properties?.map(pp => `${p.name}.${pp.name}`) || []
        ) || []
      ).filter(key => 
        key.startsWith("Pset_") || 
        key.startsWith("Tekla_") || 
        key.startsWith("IfcElement") || 
        key.startsWith("ProductProduct_")
      );
      const uniqueKeys = [...new Set([...allKeys, ...newKeys])];
      setAllKeys(uniqueKeys);
      const filteredPsets = uniqueKeys.length > 0 ? uniqueKeys : [];
      setPsetOrder(filteredPsets);
      console.log("Loaded psets:", filteredPsets);
      if (filteredPsets.length === 0) {
        onError(t.noPsetsFound || "No Psets found in the selected data.");
      }
    } catch (e) {
      console.error("Error loading Psets:", e);
      onError(t.unknownError || "Failed to load Psets");
    } finally {
      setIsLoading(false);
    }
  }, [lastSelection, allKeys, api.viewer, onError, t]);

  useEffect(() => {
    loadPsets();
  }, [loadPsets]);

  // Pset väärtuse hankimine sarnaselt "Avasta" loogikaga
  const getPropertyValue = useCallback(async (
    modelId: string,
    objectId: number,
    propertyName: string
  ): Promise<string> => {
    try {
      console.log(`Fetching property - modelId: ${modelId}, objectId: ${objectId}, property: ${propertyName}`);
      const [set, prop] = propertyName.split(".");
      if (!set || !prop) {
        console.warn(`Invalid property format: ${propertyName}`);
        return "";
      }
      const properties = await api.viewer.getObjectProperties(modelId, [objectId], { includeHidden: true });
      console.log("Properties fetched:", properties);
      if (!properties || properties.length === 0) {
        console.warn(`No properties found for object ${objectId}`);
        return "";
      }
      const objectProps = properties[0]?.properties;
      if (!objectProps || !Array.isArray(objectProps)) {
        console.warn(`Invalid properties structure for object ${objectId}`);
        return "";
      }
      const propertySet = objectProps.find(p => p.name === set);
      if (!propertySet) {
        console.warn(`PropertySet "${set}" not found for object ${objectId}`);
        return "";
      }
      if (!propertySet.properties || !Array.isArray(propertySet.properties)) {
        console.warn(`Invalid properties array in PropertySet "${set}"`);
        return "";
      }
      const property = propertySet.properties.find(p => p.name === prop);
      if (!property) {
        console.warn(`Property "${prop}" not found in PropertySet "${set}"`);
        return "";
      }
      const value = property.value?.toString() || "";
      console.log(`Property value retrieved: ${value}`);
      return value;
    } catch (e) {
      console.error("Error fetching property:", e);
      return "";
    }
  }, [api.viewer]);

  // Markuppide lisamine
  const addMarkups = useCallback(async () => {
    if (isLoading) return;
    try {
      setIsLoading(true);
      await onRemoveMarkups();
      if (!lastSelection.length) {
        onError(t.selectObjects || "Please select objects first");
        return;
      }
      const { modelId, ids } = lastSelection[0];
      if (!modelId || !ids.length) {
        onError("Invalid selection data");
        return;
      }
      const bBoxes = await api.viewer.getObjectBoundingBoxes(modelId, ids);
      if (!bBoxes || bBoxes.length === 0) {
        onError(t.noBoundingBoxes || "No bounding boxes found for selected objects");
        return;
      }
      const markups: TextMarkup[] = [];
      for (const bBox of bBoxes) {
        if (!bBox.boundingBox || !bBox.boundingBox.min || !bBox.boundingBox.max) {
          console.warn(`Invalid bounding box for object ${bBox.id}`);
          continue;
        }
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
        if (markupType === "text" && psetOrder.length > 0) {
          const propertyValue = await getPropertyValue(modelId, bBox.id, psetOrder[0]);
          text = propertyValue || markupText || "";
        }
        const markup: TextMarkup = {
          text: markupType === "text" ? text : "",
          start: point,
          end: markupType === "arrow"
            ? { positionX: point.positionX + 100, positionY: point.positionY, positionZ: point.positionZ }
            : point,
          color: markupColor,
        };
        markups.push(markup);
      }
      if (markups.length === 0) {
        onError("No valid markups to add");
        return;
      }
      console.log(`Adding ${markups.length} markups...`);
      const result = await api.markup.addTextMarkup(markups);
      if (!result || result.length === 0) {
        onError("Failed to add markups - no result returned");
        return;
      }
      const newMarkupIds = result
        .map(m => m.id)
        .filter((id): id is number => id !== null && id !== undefined);
      if (newMarkupIds.length === 0) {
        onError("Failed to extract markup IDs from result");
        return;
      }
      setMarkupIds(newMarkupIds);
      onMarkupAdded(newMarkupIds);
      console.log(`Successfully added ${newMarkupIds.length} markups`);
    } catch (e: any) {
      console.error("Markup addition error:", e);
      onError(e?.message || t.unknownError || "Failed to add markups");
    } finally {
      setIsLoading(false);
    }
  }, [api, lastSelection, markupType, markupText, markupColor, psetOrder, getPropertyValue, onMarkupAdded, onError, onRemoveMarkups, isLoading, t]);

  // Salvesta vaatesse
  const saveMarkupsToView = useCallback(async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      if (!viewName.trim()) {
        onError(t.viewNameRequired || "Please enter a view name");
        return;
      }
      if (!markupIds.length) {
        onError(t.noMarkupsToSave || "No markups to save");
        return;
      }
      console.log(`Saving view "${viewName}" with ${markupIds.length} markups...`);
      await api.viewer.saveView({ name: viewName.trim(), markups: markupIds });
      setMarkupIds([]);
      setViewName("");
      onMarkupAdded([]);
      console.log("View saved successfully");
    } catch (e: any) {
      console.error("Save view error:", e);
      onError(e?.message || t.unknownError || "Failed to save view");
    } finally {
      setIsSaving(false);
    }
  }, [api.viewer, viewName, markupIds, onMarkupAdded, onError, isSaving, t]);

  // Drag-and-drop loogika
  const handlePsetDragStart = useCallback((key: string) => {
    setDragState(prev => ({ ...prev, dragging: key }));
  }, []);

  const handlePsetDragOver = useCallback((key: string) => {
    setDragState(prev => ({ ...prev, over: key }));
  }, []);

  const handlePsetDrop = useCallback(() => {
    setDragState(prev => {
      if (prev.dragging && prev.over && prev.dragging !== prev.over) {
        const newOrder = [...psetOrder];
        const fromIndex = newOrder.indexOf(prev.dragging);
        const toIndex = newOrder.indexOf(prev.over);
        if (fromIndex !== -1 && toIndex !== -1) {
          newOrder.splice(fromIndex, 1);
          newOrder.splice(toIndex, 0, prev.dragging);
          setPsetOrder(newOrder);
        }
      }
      return { dragging: null, over: null };
    });
  }, [psetOrder]);

  const handleDragEnd = useCallback(() => {
    setDragState({ dragging: null, over: null });
  }, []);

  return (
    <div style={c.section}>
      <h3 style={c.heading}>{t.markupTitle || "Add Markups"}</h3>
      <div style={{ ...c.small, marginBottom: 8 }}>Markup laiendus v1.001</div> {/* Versiooninumber lisatud */}
      <div style={c.note}>{t.markupHint || "Add markups to selected objects."}</div>
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.psetOrder || "Pset Order"}</label>
        <div style={c.columnListNoscroll}>
          {psetOrder.length > 0 ? (
            psetOrder.map(key => (
              <div
                key={key}
                style={{
                  ...c.columnItem,
                  ...(dragState.dragging === key ? c.columnItemDragging : {}),
                  ...(dragState.over === key ? c.columnItemHighlight : {}),
                }}
                draggable
                onDragStart={() => handlePsetDragStart(key)}
                onDragOver={e => {
                  e.preventDefault();
                  handlePsetDragOver(key);
                }}
                onDrop={handlePsetDrop}
                onDragEnd={handleDragEnd}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === "Enter" && dragState.dragging === key) handlePsetDrop();
                }}
                aria-label={`Drag ${key}`}
              >
                <span style={c.dragHandle}>☰</span>
                <span style={c.ellipsis}>{key}</span>
              </div>
            ))
          ) : (
            <div style={{ ...c.columnItem, opacity: 0.5 }} aria-live="polite">
              {t.noPsetsFound || "No Psets found"}
            </div>
          )}
        </div>
        <button
          style={c.btnGhost}
          onClick={loadPsets}
          disabled={isLoading}
          aria-label={t.refreshData || "Refresh Psets"}
        >
          {t.refreshData || "Refresh"}
        </button>
      </div>
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.markupType || "Markup Type"}</label>
        <select
          value={markupType}
          onChange={e => setMarkupType(e.target.value as "text" | "arrow" | "highlight")}
          style={c.input}
          disabled={isLoading}
          aria-label={t.markupType || "Markup Type"}
        >
          <option value="text">{t.text || "Text"}</option>
          <option value="arrow">{t.arrow || "Arrow"}</option>
          <option value="highlight">{t.highlight || "Highlight"}</option>
        </select>
      </div>
      {markupType === "text" && (
        <div style={c.fieldGroup}>
          <label style={c.labelTop}>{t.markupText || "Markup Text"}</label>
          <input
            type="text"
            value={markupText}
            onChange={e => setMarkupText(e.target.value)}
            placeholder={t.markupTextPlaceholder || "Enter text (or first Pset will be used)"}
            style={c.input}
            disabled={isLoading}
            aria-label={t.markupText || "Markup Text"}
          />
        </div>
      )}
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.markupColor || "Color"}</label>
        <div style={c.colorPicker}>
          {COLORS.map(color => (
            <div
              key={color}
              style={{
                ...c.colorSwatch,
                background: color,
                ...(markupColor === color ? c.colorSwatchSelected : {}),
              }}
              onClick={() => !isLoading && setMarkupColor(color)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if ((e.key === "Enter" || e.key === " ") && !isLoading) setMarkupColor(color);
              }}
              aria-label={`Select color ${color}`}
            />
          ))}
        </div>
      </div>
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.viewNameLabel || "View Name"}</label>
        <input
          type="text"
          value={viewName}
          onChange={e => setViewName(e.target.value)}
          placeholder={t.viewNamePlaceholder || "View name..."}
          style={c.input}
          disabled={isSaving}
          aria-label={t.viewNameLabel || "View Name"}
        />
      </div>
      <div style={c.controls}>
        <button
          style={c.btn}
          onClick={addMarkups}
          disabled={!lastSelection.length || isLoading}
          aria-label={t.markupTitle || "Add Markups"}
        >
          {isLoading ? (t.loading || "Loading...") : (t.markupTitle || "Add Markups")}
        </button>
        <button
          style={c.btn}
          onClick={saveMarkupsToView}
          disabled={!viewName.trim() || !markupIds.length || isSaving}
          aria-label={t.saveViewButton || "Save View"}
        >
          {isSaving ? (t.saving || "Saving...") : (t.saveViewButton || "Save View")}
        </button>
      </div>
    </div>
  );
}
