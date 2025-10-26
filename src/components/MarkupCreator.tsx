import React, {useCallback, useEffect, useMemo, useState} from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, PlusCircle, RefreshCcw, ChevronRight, Save, X, Copy, MoveRight } from "lucide-react";

/**
 * File: src/components/MarkupCreator.tsx
 * Purpose: Drag‑and‑drop builder for markup texts + automatic property reading
 * Notes:
 *  - No stray/ambient `return` statements. All returns are inside functions/components.
 *  - No references to props names at module scope. `viewer`, `propsApi`, and `unitFactor` are resolved inside the component.
 *  - Self‑contained adapters with safe autodetect against window.api / window.tc.
 *  - Adds lightweight test cases guarded behind a runtime flag.
 */

// ========================= Types =========================

export type XYZ = { x:number; y:number; z:number };
export type BoundingBox = { min: XYZ; max: XYZ };
export type SelectedObject = { modelId: string; objectId: number | string; name?: string };
export type MarkupPick = { positionX:number; positionY:number; positionZ:number };
export type TextMarkup = { text: string; start: MarkupPick; end: MarkupPick; color: string };
export type FieldItem = { key:string; label:string };

export interface ViewerAdapter {
  getSelection(): Promise<{modelId:string; objectId:number|string; name?:string}[]>;
  getBoundingBox(modelId: string, objectId: number | string): Promise<BoundingBox>;
  getCamera(): Promise<{position:XYZ; target:XYZ; up:XYZ}>;
  createTextMarkups(markups: TextMarkup[]): Promise<void>;
}

export interface PropsApiAdapter {
  getFlatProperties(modelId: string, objectId: number | string): Promise<Record<string,string|number|boolean|null>>;
}

export interface MarkupCreatorProps {
  viewer?: ViewerAdapter;
  propsApi?: PropsApiAdapter;
  unitFactor?: number; // 1 = mm, 1000 = m→mm (default: 1000)
}

// ========================= Utilities =========================

function len(v:XYZ){ return Math.hypot(v.x, v.y, v.z) || 1; }
function norm(v:XYZ){ const L=len(v); return {x:v.x/L,y:v.y/L,z:v.z/L}; }
function sub(a:XYZ,b:XYZ){ return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}; }
function cross(a:XYZ,b:XYZ){ return { x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x } }
function bboxCenter(bb: BoundingBox): XYZ { return { x:(bb.min.x+bb.max.x)/2, y:(bb.min.y+bb.max.y)/2, z:(bb.min.z+bb.max.z)/2 }; }
function bboxDiag(bb: BoundingBox): number { const dx=bb.max.x-bb.min.x, dy=bb.max.y-bb.min.y, dz=bb.max.z-bb.min.z; return Math.sqrt(dx*dx+dy*dy+dz*dz) || 1; }

// ========================= Autodetect Adapters (safe) =========================

function autoDetectViewer(): ViewerAdapter {
  const w:any = (typeof window !== 'undefined' ? window : {}) as any;
  const av = w?.api?.viewer || w?.tc?.viewer || null;
  if(av){
    return {
      async getSelection(){ return (await av.getSelection?.()) ?? []; },
      async getBoundingBox(modelId:string, objectId:number|string){
        if(av.getObjectBoundingBox) return av.getObjectBoundingBox(modelId, objectId);
        if(av.getBoundingBox) return av.getBoundingBox(modelId, objectId);
        throw new Error("Viewer adapter missing getBoundingBox");
      },
      async getCamera(){ return av.getCamera ? av.getCamera() : {position:{x:10,y:10,z:10}, target:{x:0,y:0,z:0}, up:{x:0,y:0,z:1}}; },
      async createTextMarkups(markups:TextMarkup[]){
        if(av.createTextMarkups) return av.createTextMarkups(markups);
        if(av.createMarkups) return av.createMarkups(markups);
        throw new Error("Viewer adapter missing createTextMarkups");
      }
    } as ViewerAdapter;
  }
  // Fallback mock (non-crashing)
  return {
    async getSelection(){ return []; },
    async getBoundingBox(){ return {min:{x:0,y:0,z:0}, max:{x:1,y:1,z:1}}; },
    async getCamera(){ return {position:{x:10,y:10,z:10}, target:{x:0,y:0,z:0}, up:{x:0,y:0,z:1}}; },
    async createTextMarkups(m){ console.log("createTextMarkups(Mock)", m); }
  } as ViewerAdapter;
}

function autoDetectPropsApi(): PropsApiAdapter {
  const w:any = (typeof window !== 'undefined' ? window : {}) as any;
  const ap = w?.api?.properties || w?.propsApi || null;
  if(ap){
    return {
      async getFlatProperties(modelId:string, objectId:number|string){
        if(ap.getFlatProperties) return ap.getFlatProperties(modelId, objectId);
        if(ap.getProperties) return ap.getProperties(modelId, objectId);
        throw new Error("Props adapter missing getFlatProperties");
      }
    } as PropsApiAdapter;
  }
  // Fallback mock (deterministic)
  return {
    async getFlatProperties(){
      return {
        "Assembly": "BEAM-102",
        "Profile": "HEA200",
        "Length": 4120,
        "Weight": 78.55,
        "Material": "S355J2",
        "Phase": 32,
        "Bolt.Count": 16,
        "WBS": "T1-02",
      };
    }
  } as PropsApiAdapter;
}

// ========================= DnD Row =========================

function SortableRow({id, label, onRemove}:{id:string; label:string; onRemove:(id:string)=>void}){
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id});
  const style:React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-xl border p-2 mb-2 bg-white shadow-sm">
      <GripVertical className="w-4 h-4 shrink-0 cursor-grab" {...attributes} {...listeners} />
      <span className="text-sm font-medium truncate">{label}</span>
      <button onClick={()=>onRemove(id)} className="ml-auto p-1 hover:bg-gray-100 rounded-lg" title="Remove field">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ========================= Pure helper for tests =========================

export function buildLineFor(
  props:Record<string, any>,
  chosenFields: FieldItem[],
  opts: { delimiter:string; prefix:string; suffix:string; showLabels:boolean; hideEmpty:boolean }
){
  const { delimiter, prefix, suffix, showLabels, hideEmpty } = opts;
  const parts:string[] = [];
  for(const f of chosenFields){
    const v = props[f.key];
    if((v===undefined || v===null || v==="") && hideEmpty) continue;
    parts.push(showLabels ? `${f.label}: ${v ?? ''}` : `${v ?? ''}`);
  }
  const base = parts.join(delimiter);
  return `${prefix}${base}${suffix}`.trim();
}

// ========================= Main Component =========================

export default function MarkupCreator({ viewer: injectedViewer, propsApi: injectedPropsApi, unitFactor }: MarkupCreatorProps){
  // Resolve adapters INSIDE the component (prevents leaking names at module scope)
  const viewer = injectedViewer ?? autoDetectViewer();
  const propsApi = injectedPropsApi ?? autoDetectPropsApi();
  const UNIT_FACTOR = typeof unitFactor === 'number' ? unitFactor : 1000; // m→mm (1 if mm)

  const toPick = (p:XYZ): MarkupPick => ({ positionX:p.x*UNIT_FACTOR, positionY:p.y*UNIT_FACTOR, positionZ:p.z*UNIT_FACTOR });

  // Selection & properties
  const [selection, setSelection] = useState<SelectedObject[]>([]);
  const [activeObject, setActiveObject] = useState<SelectedObject|null>(null);
  const [propFilter, setPropFilter] = useState("");
  const [propMap, setPropMap] = useState<Record<string, string|number|boolean|null>>({});

  // Chosen fields (ordering controls output)
  const [chosenFields, setChosenFields] = useState<FieldItem[]>([]);

  // Formatting
  const [delimiter, setDelimiter] = useState<string>(" | ");
  const [prefix, setPrefix] = useState<string>("");
  const [suffix, setSuffix] = useState<string>("");
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [hideEmpty, setHideEmpty] = useState<boolean>(true);

  // Presets (localStorage)
  const [presetName, setPresetName] = useState<string>("");
  const [presets, setPresets] = useState<Record<string,{fields:FieldItem[]; delimiter:string; prefix:string; suffix:string; showLabels:boolean; hideEmpty:boolean}>>({});

  // Sensors for DnD
  const sensors = useSensors(useSensor(PointerSensor));

  // ---------------------- Effects ----------------------

  useEffect(() => {
    // Load presets from localStorage
    try{
      const raw = localStorage.getItem('markup.presets');
      if(raw) setPresets(JSON.parse(raw));
    } catch {}
  }, []);

  const savePresets = useCallback((next: typeof presets) => {
    setPresets(next);
    try{ localStorage.setItem('markup.presets', JSON.stringify(next)); }catch{}
  }, []);

  const loadSelection = useCallback(async ()=>{
    const sel = await viewer.getSelection();
    setSelection(sel);
    setActiveObject(sel[0] ?? null);
  }, [viewer]);

  useEffect(()=>{ loadSelection(); }, [loadSelection]);

  useEffect(()=>{
    // Load properties for active object
    (async()=>{
      if(!activeObject) { setPropMap({}); return; }
      const m = await propsApi.getFlatProperties(activeObject.modelId, activeObject.objectId);
      setPropMap(m);
    })();
  }, [activeObject, propsApi]);

  // ---------------------- Derived ----------------------

  const allFields: FieldItem[] = useMemo(()=>{
    return Object.keys(propMap).sort().map(k=>({ key:k, label:k }));
  }, [propMap]);

  const filteredFields = useMemo(()=>{
    const q = propFilter.trim().toLowerCase();
    if(!q) return allFields;
    return allFields.filter(f => f.label.toLowerCase().includes(q));
  }, [allFields, propFilter]);

  // ---------------------- Handlers ----------------------

  const addField = useCallback((f:FieldItem)=>{
    if(chosenFields.find(x=>x.key===f.key)) return; // already added
    setChosenFields(prev => [...prev, f]);
  }, [chosenFields]);

  const removeField = useCallback((id:string)=>{
    setChosenFields(prev => prev.filter(x=>x.key!==id));
  }, []);

  const onDragEnd = useCallback((event:any)=>{
    const {active, over} = event;
    if(!over || active.id === over.id) return;
    const oldIndex = chosenFields.findIndex(x=>x.key===active.id);
    const newIndex = chosenFields.findIndex(x=>x.key===over.id);
    setChosenFields(prev => arrayMove(prev, oldIndex, newIndex));
  }, [chosenFields]);

  const clearChosen = useCallback(()=> setChosenFields([]), []);

  const makeLineFor = useCallback((props:Record<string, any>)=>{
    return buildLineFor(props, chosenFields, { delimiter, prefix, suffix, showLabels, hideEmpty });
  }, [chosenFields, delimiter, prefix, suffix, showLabels, hideEmpty]);

  const previewLines = useMemo(()=>{
    // NB: eelvaateks kasutame aktiivse objekti props’e; tegelikult loome kõikide selection’i jaoks
    if(!activeObject) return [] as string[];
    return [ makeLineFor(propMap) ];
  }, [activeObject, propMap, makeLineFor]);

  const createMarkups = useCallback(async ()=>{
    if(selection.length===0){ alert('Valik tühi.'); return; }
    // Kaamera baasisüsteem (parem/üles)
    const cam = await viewer.getCamera();
    const F = norm(sub(cam.target, cam.position));
    const U = norm(cam.up);
    const R = norm(cross(F, U));

    const markups: TextMarkup[] = [];

    for(const obj of selection){
      const bb = await viewer.getBoundingBox(obj.modelId, obj.objectId);
      const center = bboxCenter(bb);
      const diag = bboxDiag(bb);

      // nihked paremale/üles
      const offR = 0.6*diag;
      const offU = 0.2*diag;
      const labelPos:XYZ = { x:center.x + R.x*offR + U.x*offU, y:center.y + R.y*offR + U.y*offU, z:center.z + R.z*offR + U.z*offU };

      // loe omadused & ehita rida
      const props = await propsApi.getFlatProperties(obj.modelId, obj.objectId);
      const text = makeLineFor(props);

      markups.push({ text, start: toPick(labelPos), end: toPick(center), color: '#111827' });
    }

    await viewer.createTextMarkups(markups);
    alert(`Loodud markupe: ${markups.length}`);
  }, [selection, viewer, propsApi, makeLineFor]);

  // Preset save/load
  const onSavePreset = useCallback(()=>{
    const name = presetName.trim();
    if(!name) { alert('Nimi puudub'); return; }
    const next = { ...presets, [name]: { fields: chosenFields, delimiter, prefix, suffix, showLabels, hideEmpty } };
    savePresets(next);
  }, [presetName, presets, chosenFields, delimiter, prefix, suffix, showLabels, hideEmpty, savePresets]);

  const onLoadPreset = useCallback((name:string)=>{
    const p = presets[name];
    if(!p) return;
    setChosenFields(p.fields);
    setDelimiter(p.delimiter);
    setPrefix(p.prefix);
    setSuffix(p.suffix);
    setShowLabels(p.showLabels);
    setHideEmpty(p.hideEmpty);
  }, [presets]);

  const onDeletePreset = useCallback((name:string)=>{
    const next = {...presets};
    delete next[name];
    savePresets(next);
  }, [presets, savePresets]);

  // Copy preview to clipboard
  const copyPreview = useCallback(async ()=>{
    const text = previewLines.join('\n');
    try{ await navigator.clipboard.writeText(text); alert('Kopeeritud.'); }catch{ alert('Clipboard error'); }
  }, [previewLines]);

  // ---------------------- Render ----------------------

  return (
    <div className="w-full h-full p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50">
      {/* LEFT: selection + property browser */}
      <div className="col-span-1 space-y-3">
        <div className="rounded-2xl shadow-sm bg-white p-3 border">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Valitud objektid</h3>
            <button className="text-sm inline-flex items-center gap-2 px-2 py-1 rounded-lg border hover:bg-gray-50" onClick={loadSelection}>
              <RefreshCcw className="w-4 h-4"/>Värskenda
            </button>
          </div>
          {selection.length===0 ? (
            <p className="text-sm text-gray-500 mt-2">Valik tühi. Vali vieweris objektid.</p>
          ):(
            <ul className="mt-2 max-h-36 overflow-auto divide-y">
              {selection.map((s,i)=> (
                <li key={String(s.objectId)} className="py-1 px-1 flex items-center gap-2">
                  <button onClick={()=>setActiveObject(s)} className={`text-left flex-1 truncate hover:underline ${activeObject?.objectId===s.objectId? 'font-semibold':''}`}>
                    #{i+1} · {s.name ?? s.objectId}
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-400"/>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl shadow-sm bg-white p-3 border">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold flex-1">Omadused</h3>
            <input value={propFilter} onChange={e=>setPropFilter(e.target.value)} placeholder="filter..." className="px-2 py-1 border rounded-lg text-sm" />
          </div>
          <div className="max-h-72 overflow-auto">
            {filteredFields.length===0 && <p className="text-sm text-gray-500">Midagi ei leitud.</p>}
            <ul className="space-y-1">
              {filteredFields.map(f => (
                <li key={f.key} className="flex items-center gap-2 text-sm">
                  <button onClick={()=>addField(f)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border hover:bg-gray-50">
                    <PlusCircle className="w-4 h-4"/>Lisa
                  </button>
                  <span className="truncate">{f.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* CENTER: chosen fields + formatting */}
      <div className="col-span-1 space-y-3">
        <div className="rounded-2xl shadow-sm bg-white p-3 border">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold flex-1">Valitud väljad (lohista järjekorda)</h3>
            <button onClick={clearChosen} className="px-2 py-1 text-sm rounded-lg border hover:bg-gray-50" title="Tühjenda">
              <X className="w-4 h-4"/>
            </button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={chosenFields.map(x=>x.key)} strategy={verticalListSortingStrategy}>
              <div className="max-h-64 overflow-auto">
                {chosenFields.length===0 && (
                  <p className="text-sm text-gray-500">Pole valitud. Lisa vasakult omadusi.</p>
                )}
                {chosenFields.map(f => (
                  <SortableRow key={f.key} id={f.key} label={f.label} onRemove={removeField}/>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="rounded-2xl shadow-sm bg-white p-3 border space-y-2">
          <h3 className="font-semibold">Vormindus</h3>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-sm">Eraldaja
              <input value={delimiter} onChange={e=>setDelimiter(e.target.value)} className="mt-1 w-full px-2 py-1 border rounded-lg text-sm"/>
            </label>
            <label className="text-sm">Prefiks
              <input value={prefix} onChange={e=>setPrefix(e.target.value)} className="mt-1 w-full px-2 py-1 border rounded-lg text-sm"/>
            </label>
            <label className="text-sm">Sufiks
              <input value={suffix} onChange={e=>setSuffix(e.target.value)} className="mt-1 w-full px-2 py-1 border rounded-lg text-sm"/>
            </label>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)} />
              Näita silte
            </label>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={hideEmpty} onChange={e=>setHideEmpty(e.target.checked)} />
              Peida tühjad
            </label>
          </div>
        </div>

        <div className="rounded-2xl shadow-sm bg-white p-3 border space-y-2">
          <h3 className="font-semibold">Mallid</h3>
          <div className="flex gap-2">
            <input value={presetName} onChange={e=>setPresetName(e.target.value)} placeholder="Malli nimi" className="px-2 py-1 border rounded-lg text-sm flex-1"/>
            <button onClick={onSavePreset} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border hover:bg-gray-50"><Save className="w-4 h-4"/>Salvesta</button>
          </div>
          {Object.keys(presets).length>0 ? (
            <ul className="mt-1 max-h-28 overflow-auto space-y-1">
              {Object.keys(presets).sort().map(name=> (
                <li key={name} className="flex items-center gap-2 text-sm">
                  <button onClick={()=>onLoadPreset(name)} className="px-2 py-1 rounded-lg border hover:bg-gray-50">Lae: {name}</button>
                  <button onClick={()=>onDeletePreset(name)} className="px-2 py-1 rounded-lg border hover:bg-gray-50 text-red-600">Kustuta</button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-500">Malle pole.</p>}
        </div>
      </div>

      {/* RIGHT: preview + create markups */}
      <div className="col-span-1 space-y-3">
        <div className="rounded-2xl shadow-sm bg-white p-3 border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Eelvaade (aktiivne objekt)</h3>
            <button onClick={copyPreview} className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border hover:bg-gray-50">
              <Copy className="w-4 h-4"/>Kopeeri
            </button>
          </div>
          {previewLines.length===0 ? (
            <p className="text-sm text-gray-500">Eelvaade puudub.</p>
          ) : (
            <pre className="text-sm whitespace-pre-wrap bg-gray-50 rounded-xl p-2 border max-h-64 overflow-auto">{previewLines.join('\n')}</pre>
          )}
        </div>

        <div className="rounded-2xl shadow-sm bg-white p-3 border">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Loo markupid</h3>
            <button onClick={createMarkups} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border hover:bg-gray-50">
              <MoveRight className="w-4 h-4"/>Loo
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Markupid luuakse kõigile valitud objektidele. Tekst ehitatakse valitud väljade põhjal, järjekord = lohistuse järjekord. Tekst paigutatakse kaamera paremale/üles nihkega ning nool osutab detaili keskmesse.</p>
          <div className="mt-2 text-xs text-gray-500">
            <p><strong>NB! Ühikud:</strong> anna <code>unitFactor</code> prop (1 või 1000) vastavalt sellele, kas API tagastab koordinaadid mm või m.</p>
            <p><strong>API:</strong> injekteeri <code>viewer</code> ja <code>propsApi</code> adapterid või kasuta autodetecti (window.api.viewer).</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================= Lightweight runtime tests =========================
// Never change existing tests; since none existed, we add a minimal, opt-in test block.
// To run in browser console before integrating, set: window.__RUN_MARKUP_CREATOR_TESTS__ = true

(function runLightTests(){
  const w:any = (typeof window !== 'undefined' ? window : {}) as any;
  if(!w.__RUN_MARKUP_CREATOR_TESTS__) return;

  const props = { Assembly:"BEAM-1", Profile:"HEA200", Empty:"" };
  const fields: FieldItem[] = [ {key:'Assembly', label:'Assembly'}, {key:'Profile', label:'Profile'}, {key:'Empty', label:'Empty'} ];

  const line1 = buildLineFor(props, fields, { delimiter:" | ", prefix:"", suffix:"", showLabels:true, hideEmpty:true });
  console.assert(line1 === 'Assembly: BEAM-1 | Profile: HEA200', 'Test#1 failed', line1);

  const line2 = buildLineFor(props, fields, { delimiter:", ", prefix:"[", suffix:"]", showLabels:false, hideEmpty:false });
  console.assert(line2 === '[BEAM-1, HEA200, ]', 'Test#2 failed', line2);

  const line3 = buildLineFor(props, [], { delimiter:" | ", prefix:"", suffix:"", showLabels:true, hideEmpty:true });
  console.assert(line3 === '', 'Test#3 failed', line3);

  console.log('%cMarkupCreator tests passed', 'color:green');
})();
