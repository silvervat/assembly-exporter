import { useEffect, useState, useCallback } from 'react';
import { WorkspaceAPI, TextMarkup, MarkupPick } from 'trimble-connect-workspace-api';
import './DragDropMarkupBuilder.css';

interface Property {
  key: string;
  value: string;
}

interface SelectedObject {
  modelId: string;
  id: number;
}

interface DragDropMarkupBuilderProps {
  api: WorkspaceAPI;
  selectedObjects: SelectedObject[];
  allKeys: string[];
  translations: Record<string, string>;
  styles: Record<string, any>;
  onError: (error: string) => void;
  onSuccess: (count: number) => void;
}

const COLORS = [
  "#E53935", "#D81B60", "#8E24AA", "#5E35B1", "#3949AB", "#1E88E5",
  "#039BE5", "#00ACC1", "#00897B", "#43A047", "#7CB342", "#C0CA33",
];

const DEFAULT_TRANSLATIONS = {
  et: {
    title: 'Markup Builder',
    availableProps: 'Saadaolevad omadused',
    selectedProps: 'Valitud omadused',
    dragHint: 'Lohistage omadused siia',
    removeButton: 'Eemalda',
    clearButton: 'Tühjenda',
    additionalText: 'Täiendav tekst:',
    separator: 'Eraldaja:',
    separatorComma: 'Koma (,)',
    separatorNewline: 'Uus rida',
    color: 'Värvus:',
    preview: 'Eelvaade:',
    applyButton: 'LISA MARKEERING',
    applying: 'Lisatakse...',
    success: 'Markeering lisatud {count} objektile',
    noObjects: 'Valige objektid otsingust',
    noProperties: 'Omadusi ei leitud',
  },
  en: {
    title: 'Markup Builder',
    availableProps: 'Available properties',
    selectedProps: 'Selected properties',
    dragHint: 'Drag properties here',
    removeButton: 'Remove',
    clearButton: 'Clear',
    additionalText: 'Additional text:',
    separator: 'Separator:',
    separatorComma: 'Comma (,)',
    separatorNewline: 'New line',
    color: 'Color:',
    preview: 'Preview:',
    applyButton: 'ADD MARKUP',
    applying: 'Adding...',
    success: 'Markup added to {count} objects',
    noObjects: 'Select objects from search',
    noProperties: 'No properties found',
  },
};

export default function DragDropMarkupBuilder({
  api,
  selectedObjects,
  allKeys,
  translations = DEFAULT_TRANSLATIONS.et,
  styles,
  onError,
  onSuccess,
}: DragDropMarkupBuilderProps) {
  const t = translations;
  
  // State
  const [availableProps, setAvailableProps] = useState<Property[]>([]);
  const [selectedProps, setSelectedProps] = useState<Property[]>([]);
  const [additionalText, setAdditionalText] = useState('');
  const [separator, setSeparator] = useState(',');
  const [markupColor, setMarkupColor] = useState(COLORS[0]);
  const [isApplying, setIsApplying] = useState(false);
  const [dragState, setDragState] = useState<{ dragging: Property | null; over: number | null }>({
    dragging: null,
    over: null,
  });
  const [loading, setLoading] = useState(false);

  // Laadi saadaolevad omadused valitud objektidest
  useEffect(() => {
    const loadProperties = async () => {
      if (selectedObjects.length === 0) {
        setAvailableProps([]);
        return;
      }

      try {
        setLoading(true);
        const props: Property[] = [];
        const seenKeys = new Set<string>();

        for (const obj of selectedObjects) {
          try {
            // Hankida objekti omadused koos peidetutega
            const properties = await api.viewer.getObjectProperties(obj.modelId, [obj.id], {
              includeHidden: true,
            });

            if (!properties || properties.length === 0) continue;

            const objectProps = properties[0]?.properties;
            if (!objectProps || !Array.isArray(objectProps)) continue;

            // Itereerida kõik property setid
            objectProps.forEach((propSet: any) => {
              if (!propSet.properties || !Array.isArray(propSet.properties)) return;

              propSet.properties.forEach((prop: any) => {
                const key = `${propSet.name}.${prop.name}`;
                const value = prop.value?.toString() || '';

                if (!seenKeys.has(key) && value) {
                  props.push({ key, value });
                  seenKeys.add(key);
                }
              });
            });
          } catch (e) {
            console.error(`Error loading properties for object ${obj.id}:`, e);
          }
        }

        console.log(`Loaded ${props.length} available properties`);
        setAvailableProps(props);
      } catch (e) {
        console.error('Error loading properties:', e);
        onError('Failed to load properties');
      } finally {
        setLoading(false);
      }
    };

    loadProperties();
  }, [selectedObjects, api]);

  // Drag start - valitud property lohistamine
  const handleDragStart = useCallback((prop: Property) => {
    setDragState({ dragging: prop, over: null });
  }, []);

  // Drag over - teisele kohale lohistamine
  const handleDragOver = useCallback((index: number) => {
    setDragState(prev => ({ ...prev, over: index }));
  }, []);

  // Drop - property lisamine valitud nimekirja
  const handleDropToSelected = useCallback(() => {
    if (dragState.dragging && !selectedProps.find(p => p.key === dragState.dragging!.key)) {
      setSelectedProps([...selectedProps, dragState.dragging]);
    }
    setDragState({ dragging: null, over: null });
  }, [dragState, selectedProps]);

  // Drop - sorteerimine valitud nimekirjas
  const handleDropInSelected = useCallback((targetIndex: number) => {
    if (dragState.dragging && dragState.over !== null) {
      const dragIndex = selectedProps.findIndex(p => p.key === dragState.dragging!.key);
      if (dragIndex !== -1) {
        const newProps = [...selectedProps];
        newProps.splice(dragIndex, 1);
        newProps.splice(targetIndex, 0, dragState.dragging);
        setSelectedProps(newProps);
      }
    }
    setDragState({ dragging: null, over: null });
  }, [dragState, selectedProps]);

  // Eemalda property
  const removeProperty = useCallback((key: string) => {
    setSelectedProps(prev => prev.filter(p => p.key !== key));
  }, []);

  // Tühjenda valitud
  const clearSelected = useCallback(() => {
    setSelectedProps([]);
  }, []);

  // Genereerida teksti eelvaadet
  const generateMarkupText = useCallback((): string => {
    const parts = selectedProps.map(p => p.value);
    if (additionalText) parts.unshift(additionalText);
    
    if (separator === 'newline') {
      return parts.join('\n');
    } else {
      return parts.join(` ${separator} `);
    }
  }, [selectedProps, additionalText, separator]);

  // Rakenda markup valitud objektidele
  const applyMarkup = useCallback(async () => {
    if (isApplying) return;

    try {
      if (selectedObjects.length === 0) {
        onError(t.noObjects || 'Select objects first');
        return;
      }

      if (selectedProps.length === 0) {
        onError('Select properties to apply');
        return;
      }

      setIsApplying(true);
      const markupText = generateMarkupText();

      // Gruppeerida objektid modelite järgi
      const objectsByModel: Record<string, number[]> = {};
      selectedObjects.forEach(obj => {
        if (!objectsByModel[obj.modelId]) {
          objectsByModel[obj.modelId] = [];
        }
        objectsByModel[obj.modelId].push(obj.id);
      });

      let totalMarkupsAdded = 0;

      for (const [modelId, ids] of Object.entries(objectsByModel)) {
        try {
          // Hankida bounding boxes
          const bBoxes = await api.viewer.getObjectBoundingBoxes(modelId, ids);
          if (!bBoxes || bBoxes.length === 0) {
            console.warn(`No bounding boxes for model ${modelId}`);
            continue;
          }

          const markups: TextMarkup[] = [];

          for (const bBox of bBoxes) {
            if (!bBox.boundingBox || !bBox.boundingBox.min || !bBox.boundingBox.max) {
              console.warn(`Invalid bounding box for object ${bBox.id}`);
              continue;
            }

            // Arvutada keskpunkt
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

            const markup: TextMarkup = {
              text: markupText,
              start: point,
              end: point,
              color: markupColor,
            };

            markups.push(markup);
          }

          if (markups.length > 0) {
            const result = await api.markup.addTextMarkup(markups);
            const addedCount = result?.filter(m => m.id).length || 0;
            totalMarkupsAdded += addedCount;
            console.log(`Added ${addedCount} markups to model ${modelId}`);
          }
        } catch (e) {
          console.error(`Error applying markups to model ${modelId}:`, e);
        }
      }

      if (totalMarkupsAdded > 0) {
        onSuccess(totalMarkupsAdded);
      } else {
        onError('Failed to add markups');
      }
    } catch (e: any) {
      console.error('Error applying markup:', e);
      onError(e?.message || 'Error adding markup');
    } finally {
      setIsApplying(false);
    }
  }, [selectedObjects, selectedProps, generateMarkupText, markupColor, isApplying, onError, onSuccess, t]);

  return (
    <div style={styles.section || {}}>
      <h3 style={styles.heading || {}}>{t.title || 'Markup Builder'}</h3>

      {/* Saadaolevad omadused */}
      <div style={styles.fieldGroup || {}}>
        <label style={styles.labelTop || {}}>{t.availableProps || 'Available'}</label>
        <div style={{ ...styles.columnListNoscroll, minHeight: '150px', border: '1px solid #ccc' }}>
          {loading ? (
            <div style={{ padding: '10px', textAlign: 'center', opacity: 0.7 }}>
              Loading properties...
            </div>
          ) : availableProps.length > 0 ? (
            availableProps.map(prop => (
              <div
                key={prop.key}
                draggable
                onDragStart={() => handleDragStart(prop)}
                style={{
                  ...styles.columnItem,
                  cursor: 'grab',
                  opacity: selectedProps.find(p => p.key === prop.key) ? 0.5 : 1,
                }}
                title={`${prop.key}: ${prop.value}`}
              >
                <span style={styles.dragHandle || {}}>☰</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {prop.key}
                  </div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {prop.value}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '10px', textAlign: 'center', opacity: 0.5 }}>
              {t.noProperties || 'No properties'}
            </div>
          )}
        </div>
      </div>

      {/* Valitud omadused - lohistamisel sorteerida */}
      <div style={styles.fieldGroup || {}}>
        <label style={styles.labelTop || {}}>{t.selectedProps || 'Selected'}</label>
        <div
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={handleDropToSelected}
          style={{
            ...styles.columnListNoscroll,
            minHeight: '150px',
            border: '2px dashed #999',
            backgroundColor: dragState.dragging ? '#f5f5f5' : 'transparent',
          }}
        >
          {selectedProps.length > 0 ? (
            selectedProps.map((prop, index) => (
              <div
                key={prop.key}
                onDragOver={() => handleDragOver(index)}
                onDrop={() => handleDropInSelected(index)}
                style={{
                  ...styles.columnItem,
                  backgroundColor: dragState.over === index ? '#e0e0e0' : 'transparent',
                  borderTop: dragState.over === index ? '2px solid #1E88E5' : 'none',
                }}
              >
                <span style={styles.dragHandle || {}}>☰</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {prop.key}
                  </div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {prop.value}
                  </div>
                </div>
                <button
                  onClick={() => removeProperty(prop.key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#d32f2f',
                    cursor: 'pointer',
                    fontSize: '1.2em',
                    padding: '0 5px',
                  }}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))
          ) : (
            <div style={{ padding: '10px', textAlign: 'center', opacity: 0.5 }}>
              {t.dragHint || 'Drag properties here'}
            </div>
          )}
        </div>
        {selectedProps.length > 0 && (
          <button
            style={styles.btnGhost || { marginTop: '8px', padding: '6px 12px', cursor: 'pointer' }}
            onClick={clearSelected}
          >
            {t.clearButton || 'Clear'}
          </button>
        )}
      </div>

      {/* Seadistused */}
      <div style={styles.fieldGroup || {}}>
        <label style={styles.labelTop || {}}>{t.additionalText || 'Additional text'}</label>
        <input
          type="text"
          value={additionalText}
          onChange={e => setAdditionalText(e.target.value)}
          placeholder={t.additionalPlaceholder || 'Optional...'}
          style={styles.input || {}}
          disabled={isApplying}
        />
      </div>

      <div style={styles.fieldGroup || {}}>
        <label style={styles.labelTop || {}}>{t.separator || 'Separator'}</label>
        <select
          value={separator}
          onChange={e => setSeparator(e.target.value)}
          style={styles.input || {}}
          disabled={isApplying}
        >
          <option value=",">{t.separatorComma || 'Comma'}</option>
          <option value=";">{t.separatorSemicolon || 'Semicolon'}</option>
          <option value="|">{t.separatorPipe || 'Pipe'}</option>
          <option value="newline">{t.separatorNewline || 'New line'}</option>
        </select>
      </div>

      <div style={styles.fieldGroup || {}}>
        <label style={styles.labelTop || {}}>{t.color || 'Color'}</label>
        <div style={styles.colorPicker || { display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {COLORS.map(color => (
            <div
              key={color}
              onClick={() => !isApplying && setMarkupColor(color)}
              style={{
                ...styles.colorSwatch,
                width: '30px',
                height: '30px',
                borderRadius: '4px',
                backgroundColor: color,
                cursor: isApplying ? 'not-allowed' : 'pointer',
                border: markupColor === color ? '3px solid #000' : '1px solid #ccc',
              }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Eelvaade */}
      {selectedProps.length > 0 && (
        <div style={styles.fieldGroup || {}}>
          <label style={styles.labelTop || {}}>{t.preview || 'Preview'}</label>
          <div
            style={{
              padding: '12px',
              backgroundColor: markupColor + '20',
              border: `2px solid ${markupColor}`,
              borderRadius: '4px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '120px',
              overflow: 'auto',
            }}
          >
            {generateMarkupText() || '(empty)'}
          </div>
        </div>
      )}

      {/* Rakenda nupp */}
      <div style={styles.controls || { marginTop: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={applyMarkup}
          disabled={isApplying || selectedObjects.length === 0 || selectedProps.length === 0}
          style={{
            ...styles.btn,
            flex: 1,
            opacity: isApplying || selectedObjects.length === 0 || selectedProps.length === 0 ? 0.6 : 1,
            cursor: isApplying || selectedObjects.length === 0 || selectedProps.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {isApplying ? (t.applying || 'Adding...') : (t.applyButton || 'ADD MARKUP')}
        </button>
      </div>

      {/* Info */}
      <div style={{ marginTop: '16px', fontSize: '0.9em', opacity: 0.7 }}>
        <div>Selected: {selectedProps.length} properties</div>
        <div>Objects: {selectedObjects.length}</div>
      </div>
    </div>
  );
}
