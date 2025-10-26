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

interface ObjectProperties {
  name: string;
  properties?: Array<{
    name: string;
    value: any;
  }>;
}

interface DragDropMarkupBuilderProps {
  api: WorkspaceAPI;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
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
    separatorSemicolon: 'Semikoolon (;)',
    separatorPipe: 'Riba (|)',
    color: 'Värvus:',
    preview: 'Eelvaade:',
    applyButton: 'LISA MARKEERING VALITUD OBJEKTIDELE',
    applying: 'Lisatakse...',
    success: 'Markeering lisatud {count} objektile',
    noObjects: 'Valige objektid 3D mudelis',
    noProperties: 'Omadusi ei leitud',
    loading: 'Laadimise...',
    selectObjects: 'Valige objektid enne markup'i lisaamist',
    info: 'Iga objektile kuvatakse tema omaduste kombinatsioon',
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
    separatorSemicolon: 'Semicolon (;)',
    separatorPipe: 'Pipe (|)',
    color: 'Color:',
    preview: 'Preview:',
    applyButton: 'ADD MARKUP TO SELECTED OBJECTS',
    applying: 'Adding...',
    success: 'Markup added to {count} objects',
    noObjects: 'Select objects in 3D model',
    noProperties: 'No properties found',
    loading: 'Loading...',
    selectObjects: 'Select objects before adding markup',
    info: 'Each object will show its own property values',
  },
};

export default function DragDropMarkupBuilder({
  api,
  onError = (msg: string) => console.error(msg),
  onSuccess = (msg: string) => console.log(msg),
}: DragDropMarkupBuilderProps) {
  // Language detection
  const language = (navigator.language?.startsWith('et') ? 'et' : 'en') as 'et' | 'en';
  const t = DEFAULT_TRANSLATIONS[language];

  // State
  const [availableProps, setAvailableProps] = useState<Property[]>([]);
  const [selectedProps, setSelectedProps] = useState<Property[]>([]);
  const [additionalText, setAdditionalText] = useState('');
  const [separator, setSeparator] = useState(',');
  const [markupColor, setMarkupColor] = useState(COLORS[0]);
  const [isApplying, setIsApplying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [dragState, setDragState] = useState<{ dragging: Property | null; over: number | null }>({
    dragging: null,
    over: null,
  });

  // Laadi saadaolevad omadused valitud objektidest
  useEffect(() => {
    const loadProperties = async () => {
      try {
        setLoading(true);

        // Hankida valitud objektid
        const selection = await api.viewer.getSelection();
        if (!selection || selection.length === 0) {
          setAvailableProps([]);
          setSelectedCount(0);
          return;
        }

        const firstSelection = selection[0];
        if (!firstSelection.objectRuntimeIds || firstSelection.objectRuntimeIds.length === 0) {
          setAvailableProps([]);
          setSelectedCount(0);
          return;
        }

        setSelectedCount(firstSelection.objectRuntimeIds.length);

        const props: Property[] = [];
        const seenKeys = new Set<string>();

        console.log(
          `Loading properties from ${firstSelection.objectRuntimeIds.length} objects in model ${firstSelection.modelId}`
        );

        // Hankida omadused kõigist valitud objektidest
        const objectProperties = await api.viewer.getObjectProperties(
          firstSelection.modelId,
          firstSelection.objectRuntimeIds,
          { includeHidden: true }
        );

        if (!objectProperties || objectProperties.length === 0) {
          console.warn('No properties returned');
          setAvailableProps([]);
          return;
        }

        // Itereerida kõik objektid ja hankida unikaalse properties
        objectProperties.forEach((obj: any) => {
          if (!obj.properties || !Array.isArray(obj.properties)) return;

          obj.properties.forEach((propSet: ObjectProperties) => {
            if (!propSet.properties || !Array.isArray(propSet.properties)) return;

            propSet.properties.forEach((prop: any) => {
              const key = `${propSet.name}.${prop.name}`;
              const value = prop.value?.toString() || '';

              // Lisada ainult unikaalse key'dega properties
              if (!seenKeys.has(key) && value && value.trim().length > 0) {
                props.push({ key, value });
                seenKeys.add(key);
              }
            });
          });
        });

        console.log(`Loaded ${props.length} available properties from ${firstSelection.objectRuntimeIds.length} objects`);
        setAvailableProps(props);
      } catch (e) {
        console.error('Error loading properties:', e);
        onError('Failed to load properties');
        setAvailableProps([]);
      } finally {
        setLoading(false);
      }
    };

    loadProperties();

    // Kuulata selection muutuseid
    const interval = setInterval(loadProperties, 2000);
    return () => clearInterval(interval);
  }, [api, onError]);

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
  const generateMarkupText = useCallback((props: Property[]): string => {
    const parts = props.map(p => p.value);
    if (additionalText.trim()) parts.unshift(additionalText.trim());

    if (separator === 'newline') {
      return parts.join('\n');
    } else {
      return parts.join(` ${separator} `);
    }
  }, [additionalText, separator]);

  // Rakenda markup valitud objektidele
  const applyMarkup = useCallback(async () => {
    if (isApplying) return;

    try {
      if (selectedProps.length === 0) {
        onError(t.selectObjects);
        return;
      }

      setIsApplying(true);

      // Hankida valitud objektid
      const selection = await api.viewer.getSelection();
      if (!selection || selection.length === 0) {
        onError(t.noObjects);
        return;
      }

      const firstSelection = selection[0];
      if (!firstSelection.objectRuntimeIds || firstSelection.objectRuntimeIds.length === 0) {
        onError(t.noObjects);
        return;
      }

      const modelId = firstSelection.modelId;
      const objectIds = firstSelection.objectRuntimeIds;

      console.log(`Applying markup to ${objectIds.length} objects`);

      // Hankida bounding boxes
      const bBoxes = await api.viewer.getObjectBoundingBoxes(modelId, objectIds);
      if (!bBoxes || bBoxes.length === 0) {
        onError('No bounding boxes found');
        return;
      }

      // Hankida omadused kõigist objektidest
      const objectProperties = await api.viewer.getObjectProperties(modelId, objectIds, {
        includeHidden: true,
      });

      if (!objectProperties || objectProperties.length === 0) {
        onError('Could not retrieve object properties');
        return;
      }

      const markups: TextMarkup[] = [];

      // Iga bounding box'i jaoks (iga objekt)
      for (let i = 0; i < bBoxes.length; i++) {
        const bBox = bBoxes[i];

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

        // Hankida selle konkreetse objekti omadused
        const objProps = objectProperties[i];
        if (!objProps || !objProps.properties) {
          console.warn(`No properties for object ${bBox.id}`);
          continue;
        }

        // Ehitada tekstis valitud omaduste baasil selle objekti jaoks
        const propsForThisObject: Property[] = [];
        selectedProps.forEach(selectedProp => {
          // Lahutada property name'i - "Pset_Dimensions.Height"
          const [psetName, propName] = selectedProp.key.split('.');

          // Leida selle objekti psetist proper value
          const propertySet = objProps.properties.find((ps: any) => ps.name === psetName);
          if (propertySet && propertySet.properties) {
            const property = propertySet.properties.find((p: any) => p.name === propName);
            if (property) {
              const value = property.value?.toString() || '';
              if (value && value.trim().length > 0) {
                propsForThisObject.push({ key: selectedProp.key, value });
              }
            }
          }
        });

        // Genereerida teksti selle objekti omaduste baasil
        const markupText = generateMarkupText(propsForThisObject);

        if (markupText.trim().length === 0) {
          console.warn(`No properties found for object ${bBox.id}`);
          continue;
        }

        const markup: TextMarkup = {
          text: markupText,
          start: point,
          end: point,
          color: markupColor,
        };

        markups.push(markup);
      }

      if (markups.length === 0) {
        onError('No valid markups to add');
        return;
      }

      console.log(`Adding ${markups.length} markups...`);
      const result = await api.markup.addTextMarkup(markups);

      if (!result || result.length === 0) {
        onError('Failed to add markups');
        return;
      }

      const successMessage = t.success.replace('{count}', markups.length.toString());
      onSuccess(successMessage);
      console.log(successMessage);
    } catch (e: any) {
      console.error('Error applying markup:', e);
      onError(e?.message || 'Error adding markup');
    } finally {
      setIsApplying(false);
    }
  }, [selectedProps, generateMarkupText, markupColor, isApplying, api, onError, onSuccess, t]);

  return (
    <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600 }}>
        {t.title}
      </h3>

      <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '16px', padding: '8px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
        ℹ️ {t.info}
      </div>

      {/* Saadaolevad omadused */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '13px' }}>
          {t.availableProps} ({availableProps.length})
        </label>
        <div
          style={{
            minHeight: '120px',
            maxHeight: '200px',
            overflow: 'auto',
            border: '1px solid #ddd',
            borderRadius: '4px',
            backgroundColor: '#fff',
          }}
        >
          {loading ? (
            <div style={{ padding: '12px', textAlign: 'center', opacity: 0.6 }}>
              {t.loading}
            </div>
          ) : availableProps.length > 0 ? (
            availableProps.map(prop => (
              <div
                key={prop.key}
                draggable
                onDragStart={() => handleDragStart(prop)}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #eee',
                  cursor: 'grab',
                  backgroundColor:
                    selectedProps.find(p => p.key === prop.key) ? '#f0f0f0' : 'transparent',
                  transition: 'background-color 0.2s',
                  fontSize: '13px',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#f9f9f9';
                }}
                onMouseLeave={e => {
                  const isSelected = selectedProps.find(p => p.key === prop.key);
                  (e.currentTarget as HTMLElement).style.backgroundColor = isSelected
                    ? '#f0f0f0'
                    : 'transparent';
                }}
                title={`${prop.key}: ${prop.value}`}
              >
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {prop.key}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {prop.value}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '12px', textAlign: 'center', opacity: 0.5, fontSize: '12px' }}>
              {t.noProperties}
            </div>
          )}
        </div>
      </div>

      {/* Valitud omadused - lohistamisel sorteerida */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '13px' }}>
          {t.selectedProps} ({selectedProps.length})
        </label>
        <div
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={handleDropToSelected}
          style={{
            minHeight: '120px',
            maxHeight: '200px',
            overflow: 'auto',
            border: '2px dashed #999',
            borderRadius: '4px',
            backgroundColor: dragState.dragging ? '#f5f5f5' : '#fafafa',
            padding: selectedProps.length === 0 ? '12px' : '0',
            transition: 'background-color 0.2s',
          }}
        >
          {selectedProps.length > 0 ? (
            selectedProps.map((prop, index) => (
              <div
                key={prop.key}
                onDragOver={() => handleDragOver(index)}
                onDrop={() => handleDropInSelected(index)}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #e0e0e0',
                  backgroundColor: dragState.over === index ? '#e0e0e0' : 'transparent',
                  borderTop: dragState.over === index ? '2px solid #1E88E5' : 'none',
                  paddingTop: dragState.over === index ? '8px' : '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                }}
              >
                <span style={{ cursor: 'grab', color: '#999', userSelect: 'none' }}>☰</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {prop.key}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      opacity: 0.6,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
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
                    fontSize: '16px',
                    padding: '0 4px',
                    flexShrink: 0,
                  }}
                  title={t.removeButton}
                >
                  ✕
                </button>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', opacity: 0.5, fontSize: '12px' }}>
              {t.dragHint}
            </div>
          )}
        </div>
        {selectedProps.length > 0 && (
          <button
            onClick={clearSelected}
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              backgroundColor: '#fff',
              border: '1px solid #ddd',
              borderRadius: '4px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f5f5';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#fff';
            }}
          >
            {t.clearButton}
          </button>
        )}
      </div>

      {/* Seadistused */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px' }}>
          {t.additionalText}
        </label>
        <input
          type="text"
          value={additionalText}
          onChange={e => setAdditionalText(e.target.value)}
          placeholder="Optional..."
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '12px',
            boxSizing: 'border-box',
            disabled: isApplying,
          }}
          disabled={isApplying}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px' }}>
          {t.separator}
        </label>
        <select
          value={separator}
          onChange={e => setSeparator(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '12px',
            boxSizing: 'border-box',
          }}
          disabled={isApplying}
        >
          <option value=",">{t.separatorComma}</option>
          <option value=";">{t.separatorSemicolon}</option>
          <option value="|">{t.separatorPipe}</option>
          <option value="newline">{t.separatorNewline}</option>
        </select>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '13px' }}>
          {t.color}
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {COLORS.map(color => (
            <div
              key={color}
              onClick={() => !isApplying && setMarkupColor(color)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '4px',
                backgroundColor: color,
                cursor: isApplying ? 'not-allowed' : 'pointer',
                border: markupColor === color ? '3px solid #000' : '2px solid #ccc',
                transition: 'border 0.2s',
              }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Eelvaade */}
      {selectedProps.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '13px' }}>
            {t.preview}
          </label>
          <div
            style={{
              padding: '12px',
              backgroundColor: markupColor + '15',
              border: `2px solid ${markupColor}`,
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '100px',
              overflow: 'auto',
              color: '#333',
            }}
          >
            {generateMarkupText(selectedProps) || '(empty)'}
          </div>
        </div>
      )}

      {/* Rakenda nupp */}
      <div>
        <button
          onClick={applyMarkup}
          disabled={isApplying || selectedCount === 0 || selectedProps.length === 0}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '13px',
            fontWeight: 600,
            backgroundColor: isApplying || selectedCount === 0 || selectedProps.length === 0 ? '#ccc' : '#1E88E5',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isApplying || selectedCount === 0 || selectedProps.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={e => {
            if (!(isApplying || selectedCount === 0 || selectedProps.length === 0)) {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#1565C0';
            }
          }}
          onMouseLeave={e => {
            if (!(isApplying || selectedCount === 0 || selectedProps.length === 0)) {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#1E88E5';
            }
          }}
        >
          {isApplying ? t.applying : t.applyButton}
        </button>
      </div>

      {/* Info */}
      <div style={{ marginTop: '12px', fontSize: '11px', opacity: 0.6, display: 'flex', gap: '16px' }}>
        <div>📋 Selected: {selectedProps.length} properties</div>
        <div>🎯 Objects: {selectedCount}</div>
      </div>
    </div>
  );
}
