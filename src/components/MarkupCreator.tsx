import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { WorkspaceAPI, TextMarkup, MarkupPick } from "trimble-connect-workspace-api";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

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

const COMPONENT_VERSION = "1.1.0";

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
    loading: "Laadimine...",
    saving: "Salvestamine...",
    version: "Versioon",
    successMarkupAdded: "Märgendid edukalt lisatud",
    successViewSaved: "Vaade edukalt salvestatud",
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
    successMarkupAdded: "Markups successfully added",
    successViewSaved: "View successfully saved",
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
    if (!allKeys || allKeys.length === 0) {
      toast.error(t.noPsetsFound || "No properties available");
      setPsetOrder([]);
      return;
    }
    const psets = allKeys.filter(key =>
      key.startsWith("Pset_") ||
      key.startsWith("Tekla_") ||
      key.startsWith("IfcElement") ||
      key.startsWith("ProductProduct_")
    );
    setPsetOrder(psets.length > 0 ? psets : []);
    if (psets.length === 0) {
      toast.warn(t.noPsetsFound || "No valid properties found");
    }
    console.log("Loaded psets:", psets);
  }, [allKeys, t]);

  useEffect(() => {
    loadPsets();
  }, [loadPsets]);

  // Pset väärtuse hankimine
  const getPropertyValue = useCallback(
    async (modelId: string, objectId: number, propertyName: string): Promise<string> => {
      try {
        console.log(`Fetching property - modelId: ${modelId}, objectId: ${objectId}, property: ${propertyName}`);
        const [set, prop] = propertyName.split(".");
        if (!set || !prop) {
          console.warn(`Invalid property format: ${propertyName}`);
          return "";
        }

        const properties = await api.viewer.getObjectProperties(modelId, [objectId], { includeHidden: true });
        console.log("Properties fetched:", properties);

        const value = properties?.[0]?.properties
          ?.find(p => p.name === set)
          ?.properties?.find(p => p.name === prop)
          ?.value?.toString() || "";

        if (!value) {
          console.warn(`Property ${propertyName} not found for object ${objectId}`);
          toast.warn(`Omadust ${propertyName} ei leitud objektile ${objectId}`);
        }
        return value;
      } catch (e) {
        console.error("Error fetching property:", e);
        toast.error(t.unknownError || "Failed to fetch property");
        return "";
      }
    },
    [api.viewer, t]
  );

  // Loo märgend
  const createMarkup = useCallback(
    async (
      modelId: string,
      bBox: { id: number; boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } },
      markupType: string,
      markupText: string,
      markupColor: string,
      psetOrder: string[]
    ): Promise<TextMarkup | null> => {
      if (!bBox.boundingBox || !bBox.boundingBox.min || !bBox.boundingBox.max) {
        console.warn(`Invalid bounding box for object ${bBox.id}`);
        return null;
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
        text = await getPropertyValue(modelId, bBox.id, psetOrder[0]) || markupText || "";
      }

      return {
        text: markupType === "text" ? text : "",
        start: point,
        end: markupType === "arrow" ? { ...point, positionX: point.positionX + 100 } : point,
        color: markupColor,
      };
    },
    [getPropertyValue]
  );

  // Märgendite lisamine
  const addMarkups = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await onRemoveMarkups();
      if (!lastSelection.length) {
        toast.error(t.selectObjects);
        onError(t.selectObjects);
        return;
      }

      const { modelId, ids } = lastSelection[0];
      if (!modelId || !ids.length) {
        toast.error("Invalid selection data");
        onError("Invalid selection data");
        return;
      }

      const bBoxes = await api.viewer.getObjectBoundingBoxes(modelId, ids);
      if (!bBoxes || bBoxes.length === 0) {
        toast.error(t.unknownError);
        onError(t.unknownError);
        return;
      }

      const markups = (await Promise.all(
        bBoxes.map(bBox => createMarkup(modelId, bBox, markupType, markupText, markupColor, psetOrder))
      )).filter((m): m is TextMarkup => m !== null);

      if (markups.length === 0) {
        toast.error("No valid markups to add");
        onError("No valid markups to add");
        return;
      }

      const result = await api.markup.addTextMarkup(markups);
      const newMarkupIds = result
        .map(m => m.id)
        .filter((id): id is number => id !== null && id !== undefined);

      if (newMarkupIds.length === 0) {
        toast.error("Failed to extract markup IDs");
        onError("Failed to extract markup IDs");
        return;
      }

      setMarkupIds(newMarkupIds);
      onMarkupAdded(newMarkupIds);
      toast.success(t.successMarkupAdded || "Markups successfully added");
    } catch (e: any) {
      toast.error(e?.message || t.unknownError);
      onError(e?.message || t.unknownError);
    } finally {
      setIsLoading(false);
    }
  }, [api, lastSelection, markupType, markupText, markupColor, psetOrder, createMarkup, onMarkupAdded, onError, onRemoveMarkups, isLoading, t]);

  // Salvesta vaatesse
  const saveMarkupsToView = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (!viewName.trim()) {
        toast.error(t.viewNameRequired);
        onError(t.viewNameRequired);
        return;
      }
      if (!markupIds.length) {
        toast.error(t.noMarkupsToSave);
        onError(t.noMarkupsToSave);
        return;
      }

      await api.viewer.saveView({ name: viewName.trim(), markups: markupIds });
      setMarkupIds([]);
      setViewName("");
      onMarkupAdded([]);
      toast.success(t.successViewSaved || "View successfully saved");
    } catch (e: any) {
      toast.error(e?.message || t.unknownError);
      onError(e?.message || t.unknownError);
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
      <ToastContainer position="top-right" autoClose={3000} />
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
                  if (dragState.dragging !== key) {
                    handlePsetDragOver(key);
                  }
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
        <button style={c.btnGhost} onClick={loadPsets} disabled={isLoading}>
          {isLoading ? (
            <span>Loading...</span>
          ) : (
            t.refreshData || "Refresh"
          )}
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
          {isLoading ? (
            <span>{t.loading || "Loading..."}</span>
          ) : (
            t.markupTitle || "Add Markups"
          )}
        </button>
        <button
          style={c.btn}
          onClick={saveMarkupsToView}
          disabled={!viewName.trim() || !markupIds.length || isSaving}
        >
          {isSaving ? (
            <span>{t.saving || "Saving..."}</span>
          ) : (
            "Save View"
          )}
        </button>
      </div>

      {/* Versioon jaluses */}
      <div style={{ marginTop: '16px', fontSize: '11px', opacity: 0.6, textAlign: 'center', borderTop: '1px solid #e0e0e0', paddingTop: '8px' }}>
        {t.version || "Version"} {COMPONENT_VERSION}
      </div>
    </div>
  );
}
