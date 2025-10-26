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

const COMPONENT_VERSION = "1.0.0";

const COLORS = [
  "#E53935", "#D81B60", "#8E24AA", "#5E35B1", "#3949AB", "#1E88E5",
  "#039BE5", "#00ACC1", "#00897B", "#43A047", "#7CB342", "#C0CA33",
];

const DEFAULT_TRANSLATIONS = {
  et: {
    markupTitle: "Markupi Builder",
    markupHint: "Lohistage omadused valitud objektide märkimiseks",
    psetOrder: "Valitud omadused",
    noPsetsFound: "Omadusi ei leitud",
    refreshData: "Värskenda",
    markupType: "Märkupi tüüp",
    markupText: "Märkupi tekst",
    markupTextPlaceholder: "Sisestage tekst või kasutatakse esimest omadust",
    markupColor: "Värvus",
    viewNameLabel: "Vaate nimi",
    viewNamePlaceholder: "Vaate nimi...",
    viewNameRequired: "Palun sisestage vaate nimi",
    noMarkupsToSave: "Pole märkupeid, mida salvestada",
    selectObjects: "Palun valige objektid",
    unknownError: "Teadmatu viga",
    loading: "Laadimise...",
    saving: "Salvestamine...",
    version: "Versioon",
  },
  en: {
    markupTitle: "Markup Builder",
    markupHint: "Drag properties to mark selected objects",
    psetOrder: "Selected properties",
    noPsetsFound: "No properties found",
    refreshData: "Refresh",
    markupType: "Markup type",
    markupText: "Markup text",
    markupTextPlaceholder: "Enter text or first property will be used",
    markupColor: "Color",
    viewNameLabel: "View name",
    viewNamePlaceholder: "View name...",
    viewNameRequired: "Please enter a view name",
    noMarkupsToSave: "No markups to save",
    selectObjects: "Please select objects",
    unknownError: "Unknown error",
    loading: "Loading...",
    saving: "Saving...",
    version: "Version",
  },
};

export default function MarkupCreator({
  api,
  allKeys,
  lastSelection,
  translations: t = DEFAULT_TRANSLATIONS.et,
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

  // Laadi Pset-id
  const loadPsets = useCallback(() => {
    console.log("Loading Psets, allKeys:", allKeys);
    const psets = allKeys.filter(key =>
      key.startsWith("Pset_") ||
      key.startsWith("Tekla_") ||
      key.startsWith("IfcElement") ||
      key.startsWith("ProductProduct_")
    );
    const filteredPsets = psets.length > 0 ? psets : [];
    setPsetOrder(filteredPsets);
    console.log("Loaded psets:", filteredPsets);
  }, [allKeys]);

  useEffect(() => {
    loadPsets();
  }, [loadPsets]);

  // Pset väärtuse hankimine - parandustega
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

  // Markuppide lisamine - parandustega
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
        onError(t.unknownError || "No bounding boxes found for selected objects");
        return;
      }

      const markups: TextMarkup[] = [];

      for (const bBox of bBoxes) {
        // Kontrolli, et bBox.boundingBox on kehtiv
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

        // Hankida teksti esimesest Pset-ist kui on valitud
        if (markupType === "text" && psetOrder.length > 0) {
          const propertyValue = await getPropertyValue(modelId, bBox.id, psetOrder[0]);
          text = propertyValue || markupText || "";
        }

        // Loomine markup objekti
        const markup: TextMarkup = {
          text: markupType === "text" ? text : "",
          start: point,
          end: markupType === "arrow"
            ? {
              positionX: point.positionX + 100,
              positionY: point.positionY,
              positionZ: point.positionZ
            }
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

  // Salvesta vaatesse - parandustega
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

      // Puuduta state pärast salvestamist
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

  // Drag-and-drop loogika - parandustega
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
      <h3 style={c.heading}>{t.markupTitle || "Markup Builder"}</h3>
      <div style={c.note}>{t.markupHint || "Add markups to selected objects."}</div>

      {/* Pset-ide järjekord */}
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.psetOrder || "Selected properties"}</label>
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
              >
                <span style={c.dragHandle}>☰</span>
                <span style={c.ellipsis}>{key}</span>
              </div>
            ))
          ) : (
            <div style={{ ...c.columnItem, opacity: 0.5 }}>
              {t.noPsetsFound || "No properties found"}
            </div>
          )}
        </div>
        <button
          style={c.btnGhost}
          onClick={loadPsets}
          disabled={isLoading}
        >
          {t.refreshData || "Refresh"}
        </button>
      </div>

      {/* Markup tekst */}
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.markupText || "Markup Text"}</label>
        <input
          type="text"
          value={markupText}
          onChange={e => setMarkupText(e.target.value)}
          placeholder={t.markupTextPlaceholder || "Enter text or first property will be used"}
          style={c.input}
          disabled={isLoading}
        />
      </div>

      {/* Markup värv */}
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
                if ((e.key === "Enter" || e.key === " ") && !isLoading) {
                  setMarkupColor(color);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Vaate nimi */}
      <div style={c.fieldGroup}>
        <label style={c.labelTop}>{t.viewNameLabel || "View Name"}</label>
        <input
          type="text"
          value={viewName}
          onChange={e => setViewName(e.target.value)}
          placeholder={t.viewNamePlaceholder || "View name..."}
          style={c.input}
          disabled={isSaving}
        />
      </div>

      {/* Nupud */}
      <div style={c.controls}>
        <button
          style={c.btn}
          onClick={addMarkups}
          disabled={!lastSelection.length || isLoading}
        >
          {isLoading ? (t.loading || "Loading...") : (t.markupTitle || "Add Markups")}
        </button>
        <button
          style={c.btn}
          onClick={saveMarkupsToView}
          disabled={!viewName.trim() || !markupIds.length || isSaving}
        >
          {isSaving ? (t.saving || "Saving...") : ("Save View")}
        </button>
      </div>

      {/* Versioon jaluses */}
      <div style={{ marginTop: '16px', fontSize: '11px', opacity: 0.6, textAlign: 'center', borderTop: '1px solid #e0e0e0', paddingTop: '8px' }}>
        {t.version || "Version"} {COMPONENT_VERSION}
      </div>
    </div>
  );
}
