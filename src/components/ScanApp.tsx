import React, { useMemo, useRef, useState, useEffect } from "react";

type Row = Record<string, string> & {
  _confidence?: number;
  _warning?: string;
  _foundInModel?: boolean | null;
  _modelQuantity?: number;
  _objectId?: number;
  modelId?: string;
};

type Props = {
  api: any;
  settings?: {
    ocrWebhookUrl?: string;
    ocrSecret?: string;
    ocrPrompt?: string;
    language?: "et" | "en";
  };
  onConfirm?: (marks: string[], rows: Row[], markKey: string, qtyKey: string) => void;
  translations?: any;
  styles?: any;
};

const LOCAL_STORAGE_KEY = "scanAppState";

export default function ScanApp({ api, settings, onConfirm, translations, styles: parentStyles }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [rawText, setRawText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [markKey, setMarkKey] = useState<string>("");
  const [qtyKey, setQtyKey] = useState<string>("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [searchingModel, setSearchingModel] = useState(false);
  const [targetColumns, setTargetColumns] = useState("Component, Pcs");
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [totalScannedRows, setTotalScannedRows] = useState(0);
  const [modelObjects, setModelObjects] = useState<any[]>([]);
  const [apiKey, setApiKey] = useState(localStorage.getItem('openai_api_key') || '');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [additionalPrompt, setAdditionalPrompt] = useState(localStorage.getItem('ocrAdditionalPrompt') || '');
  const [showViewSave, setShowViewSave] = useState(false);
  const [viewName, setViewName] = useState("");
  const [showImageModal, setShowImageModal] = useState(false);
  const [ocrFeedback, setOcrFeedback] = useState("");
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyIncludeHeaders, setCopyIncludeHeaders] = useState(true);
  const [copyColumns, setCopyColumns] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const t = translations || {};
  const c = parentStyles || {};

  useEffect(() => {
    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedState) {
      const parsed = JSON.parse(savedState);
      setRawText(parsed.rawText || "");
      setHeaders(parsed.headers || []);
      setRows(parsed.rows || []);
      setMarkKey(parsed.markKey || "");
      setQtyKey(parsed.qtyKey || "");
      setSelectedColumns(parsed.selectedColumns || []);
      setImagePreview(parsed.imagePreview || "");
      setTargetColumns(parsed.targetColumns || "Component, Pcs");
      setTotalScannedRows(parsed.totalScannedRows || 0);
      setModelObjects(parsed.modelObjects || []);
    }
  }, []);

  useEffect(() => {
    const state = {
      rawText,
      headers,
      rows,
      markKey,
      qtyKey,
      selectedColumns,
      imagePreview,
      targetColumns,
      totalScannedRows,
      modelObjects,
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  }, [rawText, headers, rows, markKey, qtyKey, selectedColumns, imagePreview, targetColumns, totalScannedRows, modelObjects]);

  useEffect(() => {
    localStorage.setItem('ocrAdditionalPrompt', additionalPrompt);
  }, [additionalPrompt]);

  async function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || "");
        const comma = s.indexOf(",");
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      r.onerror = reject;
      r.readAsDataURL(f);
    });
  }

  async function handleFileSelect(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    const file = fileList[0];
    setFiles([file]);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string || "");
      };
      reader.readAsDataURL(file);
    }
  }

  async function runGptOcr(imageBase64: string): Promise<string> {
    if (!apiKey) {
      throw new Error("❌ Sisesta OpenAI API võti!");
    }

    const columns = targetColumns.trim();
    const columnInstruction = columns
      ? `Väljavõtte AINULT need veerud täpselt selles järjekorras: ${columns}. Kui veerunimed ei ole pildil nähtavad, kasuta veeru positsioone (1. veerg vasakult = ${columns.split(',')[0]?.trim() || '1'}, 2. veerg = ${columns.split(',')[1]?.trim() || '2'}, jne).`
      : "Väljavõtte kõik nähtavad veerud.";

    const prompt = `Sa oled ekspert logistika transpordilehtede ja tootmisnimekirjade lugemises. Ole väga täpne tähtede ja numbrite eristamisel (nt "T" ja "5" on erinevad, "TS" ei ole "T5"). Numbrid on kogused, loe neid täpselt, ära muuda neid.
${columnInstruction}
Tagasta andmed TSV (tab-separated values) formaadis, kus esimene rida on päised.
Kasuta veergude eraldamiseks AINULT TAB-märki (\t). Ära kasuta tühikuid ega muid eraldajaid.
Hoia TÄPNE ALGINE JÄRJEKORD ridadest nagu nad pildil on (ülalt alla).
Kui sa ei suuda lahtrit selgelt lugeda, pane sinna "???".
Ära jäta ühtegi rida vahele.
Ära lisa lisaridu.
${additionalPrompt || ""}
${settings?.ocrPrompt || ""}
Ära lisa mingit teksti ega selgitust, ära kasuta Markdowni formaati ega koodiblokke - ainult puhas TSV tabel!`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${files[0]?.type || "image/jpeg"};base64,${imageBase64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
        })
      });

      if (!response.ok) {
        throw new Error(`API viga: ${response.status}`);
      }
      const data = await response.json();
      const text = data.choices[0]?.message?.content || "";
      let cleanedText = text.trim();
      cleanedText = cleanedText.replace(/^```(?:tsv|csv|plaintext)?\s*\n?/, '').replace(/\n?```$/, '');
      return cleanedText;
    } catch (error: any) {
      throw new Error(`OpenAI API viga: ${error.message}`);
    }
  }

  async function getOcrFeedback(text: string): Promise<string> {
    if (!apiKey) return "";
    const prompt = `Analüüsi seda OCR tulemust (TSV formaat): ${text}
Hinda:
1. Kas dokument oli hästi loetav? (nt pilt kvaliteet, font, skaneerimine)
2. Kas said kõigist ridadest ilusti aru? Kui mitte, millised probleemid?
3. Kas soovitad uuesti scanida lisajuhistega (nt parem valgustus, täpsem prompt)?
Anna lühike kokkuvõte eesti keeles.`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 300,
        })
      });

      if (!response.ok) return "";
      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    } catch {
      return "";
    }
  }

  async function runOcr() {
    try {
      setMsg("");
      setBusy(true);
      if (!files.length) {
        if (!rawText.trim()) {
          setMsg("❌ Pole faile ega teksti.");
        } else {
          setMsg("✓ Tekst on kleebitud. Vajuta 'Parsi tabelisse'.");
        }
        return;
      }
      if (!targetColumns.trim()) {
        setMsg("❌ Määra esmalt veerud!");
        return;
      }
      setMsg("🔍 OCR töötab...");
      const base64 = await fileToBase64(files[0]);
      const text = await runGptOcr(base64);
      setRawText(text);
      const feedback = await getOcrFeedback(text);
      setOcrFeedback(feedback);
      setMsg(`✅ OCR valmis! Vajuta 'Parsi tabelisse'.\n\nTagasiside: ${feedback}`);
    } catch (e: any) {
      setMsg("❌ Viga: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  function parseTextToTable(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    setTotalScannedRows(lines.length - 1);
    if (lines.length === 0) {
      setHeaders([]);
      setRows([]);
      setMsg("❌ Tühjus.");
      return;
    }
    let headerIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const cols = lines[i].split(/\s+|\t/).filter(Boolean);
      const hasKeywords = /\b(component|mark|qty|pcs|kogus|profile|length|weight|komponent)\b/i.test(lines[i]) ? 3 : 0;
      const score = cols.length + hasKeywords;
      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
      }
    }
    const rawHeaders = lines[headerIdx]
      .split(/\s+|\t/)
      .map((s) => cleanHeader(s))
      .filter(Boolean);
    const normalizedHeaders = rawHeaders.length > 0
      ? rawHeaders
      : lines[0].split(/\s+|\t/).map((_, i) => "Col" + (i + 1));
    const outRows: Row[] = [];
    let warnings = 0;
    for (let i = 0; i < lines.length; i++) {
      if (i === headerIdx) continue;
      const cols = lines[i].split(/\s+|\t/);
      if (cols.length < 2) {
        warnings++;
        continue;
      }
      const r: Row = {};
      let hasData = false;
      let hasWarning = false;
      for (let c = 0; c < Math.min(cols.length, normalizedHeaders.length); c++) {
        const val = cols[c].trim();
        r[normalizedHeaders[c]] = val;
        if (val) hasData = true;
        if (val === "???") hasWarning = true;
      }
      if (hasWarning) {
        r._warning = "⚠️ OCR ei suutnud lugeda";
        r._confidence = 0.5;
      } else if (cols.length < normalizedHeaders.length) {
        r._warning = "⚠️ Puudulikud veerud";
        r._confidence = 0.6;
      } else if (!hasData) {
        r._warning = "⚠️ Tühi rida";
        r._confidence = 0.3;
      } else {
        r._confidence = 0.95;
      }
      outRows.push(r);
    }
    setHeaders(normalizedHeaders);
    setRows(outRows);
    const lower = normalizedHeaders.map((h) => h.toLowerCase());
    const markIdx = lower.findIndex((h) => /\b(mark|component|item|part|komponent)\b/.test(h));
    const qtyIdx = lower.findIndex((h) => /\b(qty|pcs|kogus|tk|amount)\b/.test(h));
    setMarkKey(normalizedHeaders[markIdx >= 0 ? markIdx : 0] || "");
    setQtyKey(normalizedHeaders[qtyIdx >= 0 ? qtyIdx : normalizedHeaders.length - 1] || "");
    setSelectedColumns([...normalizedHeaders]);
    const warnMsg = warnings > 0 ? ` ⚠️ ${warnings} rida jäeti vahele.` : "";
    const ocrWarnings = outRows.filter(r => r._warning?.includes("ei suutnud")).length;
    const ocrWarnMsg = ocrWarnings > 0 ? ` ⚠️ ${ocrWarnings} lahtrit ???` : "";
    const rowCountMsg = totalScannedRows > 0
      ? ` 📊 Skaneerisin ${totalScannedRows} rida, parsisin ${outRows.length}.`
      : "";
    setMsg(`✓ Tabel valmis: ${outRows.length} rida.${warnMsg}${ocrWarnMsg}${rowCountMsg}`);
  }
  function cleanHeader(s: string) {
    const x = s.replace(/\s+/g, " ").trim();
    if (!x) return "";
    const m = x
      .replace(/No\./i, "No")
      .replace(/Amount/i, "Qty")
      .replace(/Pieces/i, "Pcs")
      .replace(/Quantity/i, "Qty");
    return m.replace(/[^\w\s.-]/g, "").trim();
  }
  function changeCell(rIdx: number, key: string, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[rIdx] = { ...next[rIdx], [key]: value };
      if (value && value !== "???" && next[rIdx]._warning?.includes("ei suutnud")) {
        delete next[rIdx]._warning;
        next[rIdx]._confidence = 0.95;
      }
      return next;
    });
  }
  function addRow() {
    const base: Row = { _confidence: 1.0 };
    headers.forEach(h => base[h] = "");
    setRows((prev) => [...prev, base]);
  }
  function removeRow(rIdx: number) {
    setRows((prev) => prev.filter((_, i) => i !== rIdx));
  }
  function toggleColumn(col: string) {
    setSelectedColumns(prev =>
      prev.includes(col)
        ? prev.filter(c => c !== col)
        : [...prev, col]
    );
  }
  function findAndReplace() {
    if (!findText.trim()) {
      setMsg("❌ Sisesta otsitav tekst!");
      return;
    }
    let replacedCount = 0;
    setRows((prev) => {
      return prev.map(r => {
        const newRow = { ...r };
        Object.keys(newRow).forEach(key => {
          if (key.startsWith('_')) return;
          const val = String(newRow[key] || "");
          if (val.includes(findText)) {
            newRow[key] = val.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText);
            replacedCount++;
          }
        });
        return newRow;
      });
    });
    setRawText(rawText.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText));
    setMsg(`✓ Asendatud ${replacedCount} kohta.`);
    setShowFindReplace(false);
  }
  async function searchInModel() {
    if (!markKey || !rows.length) {
      setMsg("❌ Parsi esmalt tabel!");
      return;
    }
    try {
      setSearchingModel(true);
      setMsg("🔍 Otsin mudelist...");
      const viewer = api?.viewer;
      const marks = rows.map(r => String(r[markKey] || "").trim()).filter(Boolean);
      const uniqueMarks = [...new Set(marks)];
    
      const mos = await viewer?.getObjects();
      if (!Array.isArray(mos)) {
        setMsg("❌ API viga");
        setSearchingModel(false);
        return;
      }
      const foundMarks = new Map<string, number>();
      const foundObjects: any[] = [];
      for (const mo of mos) {
        const modelId = String(mo.modelId);
        const objectRuntimeIds = (mo.objects || []).map((o: any) => Number(o?.id)).filter((n: number) => Number.isFinite(n));
      
        try {
          const fullProperties = await api.viewer.getObjectProperties(modelId, objectRuntimeIds);
        
          for (const obj of fullProperties) {
            const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
            for (const set of props) {
              for (const p of set?.properties ?? []) {
                if (/tekla_assembly.assemblycast_unit_mark/i.test(String(p?.name))) {
                  const val = String(p?.value || p?.displayValue || "").trim();
                  if (uniqueMarks.some(m => m.toLowerCase() === val.toLowerCase())) {
                    const count = foundMarks.get(val) || 0;
                    foundMarks.set(val, count + 1);
                    foundObjects.push({ modelId, objectId: obj.id, mark: val });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn(`Model ${modelId} error:`, e);
        }
      }
      setModelObjects(foundObjects);
      const updatedRows = rows.map(r => {
        const mark = String(r[markKey] || "").trim();
        const modelCount = foundMarks.get(mark) || 0;
        const found = modelCount > 0;
      
        const sheetQty = qtyKey ? parseInt(String(r[qtyKey] || "0")) || 0 : 0;
      
        let warning = r._warning || "";
        if (found && qtyKey && modelCount !== sheetQty) {
          warning = `⚠️ Kogus ei vasta: mudel ${modelCount}, saateleht ${sheetQty}`;
        }
      
        const object = foundObjects.find(obj => obj.mark.toLowerCase() === mark.toLowerCase());
        return {
          ...r,
          _foundInModel: found,
          _modelQuantity: modelCount,
          _warning: warning || undefined,
          modelId: object?.modelId,
          _objectId: object?.objectId
        };
      });
      setRows(updatedRows);
      if (foundObjects.length > 0) {
        setSelectedColumns(prev => [...new Set([...prev, "_modelQuantity"])]);
      }
      const foundCount = updatedRows.filter(r => r._foundInModel === true).length;
      const notFoundCount = updatedRows.filter(r => r._foundInModel === false).length;
      const qtyMismatch = updatedRows.filter(r => r._warning?.includes("ei vasta")).length;
      let resultMsg = `✓ ${foundCount} ✅ leitud, ${notFoundCount} ❌ ei leitud.`;
      if (qtyMismatch > 0) {
        resultMsg += ` ⚠️ ${qtyMismatch} koguste erinevus!`;
      }
      setMsg(resultMsg);
    } catch (e: any) {
      setMsg("❌ Viga: " + (e?.message || String(e)));
    } finally {
      setSearchingModel(false);
    }
  }
  async function selectInModel() {
    if (!modelObjects.length) {
      setMsg("❌ Tee esmalt otsing mudelist!");
      return;
    }
    try {
      const viewer = api?.viewer;
    
      const byModel = new Map<string, number[]>();
      for (const obj of modelObjects) {
        const ids = byModel.get(obj.modelId) || [];
        ids.push(obj.objectId);
        byModel.set(obj.modelId, ids);
      }
      for (const [modelId, ids] of byModel.entries()) {
        await viewer?.selectObjects(modelId, ids, true);
      }
      setMsg(`✓ Selectitud ${modelObjects.length} objekti mudelist.`);
    } catch (e: any) {
      setMsg("❌ Selectimine ebaõnnestus: " + (e?.message || String(e)));
    }
  }
  async function zoomToRow(modelId: string | undefined, objectId: number | undefined) {
    if (!modelId || !objectId) return;
    try {
      const viewer = api?.viewer;
      await viewer?.selectObjects(modelId, [objectId], true);
      await viewer?.setCamera?.({ modelObjectIds: [{ modelId, objectRuntimeIds: [objectId] }] }, { animationTime: 500 });
    } catch (e: any) {
      setMsg("❌ Zoom ebaõnnestus: " + (e?.message || String(e)));
    }
  }
  function exportToCSV() {
    if (!rows.length) return;
  
    const csvHeaders = selectedColumns.join(",");
    const csvRows = rows.map(r =>
      selectedColumns.map(col => {
        const val = String(r[col] || "");
        return val.includes(",") ? `"${val}"` : val;
      }).join(",")
    );
  
    const csv = [csvHeaders, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  
    setMsg("✓ Eksporditud CSV-sse.");
  }
  function copyToClipboard() {
    if (!rows.length) return;
    const csvHeaders = copyIncludeHeaders ? copyColumns.join("\t") + '\n' : '';
    const csvRows = rows.map(r =>
      copyColumns.map(col => String(r[col] || "")).join("\t")
    ).join("\n");
    const text = csvHeaders + csvRows;
    navigator.clipboard.writeText(text);
    setMsg("✅ Kopeeritud lõikelauale.");
    setShowCopyModal(false);
  }
  const totalRows = rows.length;
  const warningRows = rows.filter(r => r._warning).length;
  const notFoundRows = rows.filter(r => r._foundInModel === false).length;
  const foundRows = rows.filter(r => r._foundInModel === true).length;
  const qtyMismatchRows = rows.filter(r => r._warning?.includes("ei vasta")).length;
  const displayColumns = useMemo(() => {
    return selectedColumns.length > 0 ? selectedColumns : headers;
  }, [selectedColumns, headers]);
  const previewMarks = useMemo(() => {
    const marks: string[] = [];
    if (!markKey || !qtyKey) return marks;
    for (const r of rows) {
      const mark = String(r[markKey] || "").trim();
      if (!mark) continue;
      const qtyRaw = String(r[qtyKey] || "").replace(",", ".").trim();
      const qty = Math.max(1, Math.floor(Number(qtyRaw) || 0));
      for (let i = 0; i < qty; i++) marks.push(mark);
    }
    return marks;
  }, [rows, markKey, qtyKey]);
  const totalSheetQty = useMemo(() => {
    if (!qtyKey) return 0;
    return rows.reduce((sum, r) => {
      const qty = parseInt(String(r[qtyKey] || "0")) || 0;
      return sum + qty;
    }, 0);
  }, [rows, qtyKey]);
  const totalModelQty = useMemo(() => {
    return rows.reduce((sum, r) => sum + (r._modelQuantity || 0), 0);
  }, [rows]);
  function onConfirmClick() {
    if (!rows.length) {
      setMsg("❌ Tabel on tühi.");
      return;
    }
    if (!markKey || !qtyKey) {
      setMsg("❌ Vali Mark ja Kogus veerud.");
      return;
    }
    if (warningRows > 0) {
      const confirmed = window.confirm(`⚠️ ${warningRows} hoiatust. Jätka ikkagi?`);
      if (!confirmed) return;
    }
    if (notFoundRows > 0) {
      const confirmed = window.confirm(`⚠️ ${notFoundRows} ei leitud mudelist! Jätka ikkagi?`);
      if (!confirmed) return;
    }
  
    if (onConfirm) {
      onConfirm(previewMarks, rows, markKey, qtyKey);
    }
    setMsg("✅ Kinnitatud: " + previewMarks.length + " kirjet.");
  }
  function loadSampleData() {
    const sample = `Component\tPcs
T5.11.MG2001\t2
T5.11.MG2002\t8
T5.11.MG2003\t1
T5.11.MG2004\t2
T5.11.MG2005\t2`;
    setRawText(sample);
    setTargetColumns("Component, Pcs");
    setMsg("📋 Näidis laaditud.");
  }
  const initSaveView = () => {
    if (!modelObjects.length) return;
    selectInModel();
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const defaultName = `scan ${dd}.${mm}.${yy}.${hh}.${min}`;
    setViewName(defaultName);
    setShowViewSave(true);
  };
  const saveView = async () => {
    if (!modelObjects.length || !viewName.trim()) return;
    try {
      const modelObjectIds = modelObjects.map(obj => ({ modelId: obj.modelId, objectRuntimeIds: [obj.objectId] }));
      await api.view.createView({ name: viewName, modelObjectIds });
      setMsg(`✓ Vaade salvestatud: ${viewName}`);
      setShowViewSave(false);
    } catch (e: any) {
      setMsg("❌ Viga vaate salvestamisel: " + (e?.message || "tundmatu viga"));
    }
  };
  const cancelSaveView = () => {
    setShowViewSave(false);
    setViewName("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <button
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          padding: "4px 8px",
          background: "#f3f4f6",
          color: "#6b7280",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          zIndex: 1000
        }}
        onClick={() => setShowApiKeyModal(true)}
      >
        ⚙️
      </button>
      {showApiKeyModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 8,
            padding: 20,
            maxWidth: 400,
            width: "90%",
            boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>🔑 Sisesta OpenAI API võti</h3>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => {
                  localStorage.setItem('openai_api_key', apiKey);
                  setShowApiKeyModal(false);
                  setMsg("✅ API võti salvestatud.");
                }}
                style={{ flex: 1, padding: "8px", background: "#10b981", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                Salvesta
              </button>
              <button
                onClick={() => setShowApiKeyModal(false)}
                style={{ flex: 1, padding: "8px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📁 Fail</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelect(e.target.files)}
              style={{ fontSize: 12, width: "100%" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📷 Pildista</label>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileSelect(e.target.files)}
              style={{ display: "none" }}
            />
            <button
              style={{ width: "100%", padding: "6px 12px", background: "#eee", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
              onClick={() => cameraInputRef.current?.click()}
            >
              📷 Kaamera
            </button>
          </div>
        </div>
        {imagePreview && (
          <div>
            <img
              src={imagePreview}
              alt="Preview"
              style={{ maxWidth: "100%", maxHeight: 150, borderRadius: 6, border: "1px solid #e5e7eb" }}
            />
            <button
              style={{ marginTop: 4, padding: "4px 8px", background: "#aaa", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
              onClick={() => setShowImageModal(true)}
            >
              🔍 Suurenda / Laadi alla
            </button>
          </div>
        )}
        {showImageModal && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }} onClick={() => setShowImageModal(false)}>
            <img src={imagePreview} alt="Large preview" style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 8 }} />
            <a
              href={imagePreview}
              download="scan_image.jpg"
              style={{ position: "absolute", bottom: 20, color: "#fff", background: "#aaa", padding: "8px 16px", borderRadius: 6 }}
            >
              Laadi alla
            </a>
          </div>
        )}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Veerud</label>
          <input
            value={targetColumns}
            onChange={(e) => setTargetColumns(e.target.value)}
            placeholder="Component, Pcs, Profile, Length..."
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 13 }}
          />
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
            Sisesta koma eraldatult või numbritena: '1, 2, 3'
          </div>
        </div>
      
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Lisa OCR juhised</label>
          <textarea
            value={additionalPrompt}
            onChange={(e) => setAdditionalPrompt(e.target.value)}
            placeholder="nt: 'Loe täpselt T ja 5 erinevusega, numbrid on kogused.'"
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 13, fontFamily: "monospace", height: 60 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Või kleebi tekst</label>
          <textarea
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 13, fontFamily: "monospace", height: 100 }}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Tekst..."
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            style={{ padding: "6px 12px", background: "#333", color: "#fff", border: "1px solid #333", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            disabled={busy}
            onClick={runOcr}
          >
            {busy ? "⏳ OCR..." : "🔍 OCR"}
          </button>
        
          <button
            style={{ padding: "6px 12px", background: "#eee", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
            onClick={loadSampleData}
          >
            📋 Näidis
          </button>
        
          <button
            style={{ padding: "6px 12px", background: "#eee", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
            onClick={() => {
              if (!rawText.trim()) {
                setMsg("❌ Pole teksti.");
                return;
              }
              parseTextToTable(rawText);
            }}
          >
            ⚡ Parsi
          </button>
        
          <button
            style={{ padding: "6px 12px", background: "#eee", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
            onClick={() => {
              setRawText("");
              setRows([]);
              setHeaders([]);
              setFiles([]);
              setImagePreview("");
              setModelObjects([]);
              if (fileInputRef.current) fileInputRef.current.value = "";
              if (cameraInputRef.current) cameraInputRef.current.value = "";
              setMsg("🗑️ Tühjendatud.");
            }}
          >
            🗑️ Tühjenda
          </button>
        </div>
        {!apiKey && (
          <div style={{
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 13,
            background: "#ffebee",
            border: "1px solid #ef9a9a",
            marginTop: 8
          }}>
            ⚠️ API võti puudub! OCR ei tööta ilma võtmeta. Vajuta paremas ülanurgas ⚙️ nupule ja sisesta võti.<br/>
            <strong>Juhend võtme saamiseks:</strong><br/>
            1. Mine <a href="https://platform.openai.com/signup" target="_blank" rel="noopener noreferrer">platform.openai.com/signup</a> ja registreeru/looge konto (kui pole veel).<br/>
            2. Logi sisse ja mine vasakul menüüs "API keys" sektsiooni.<br/>
            3. Vajuta "Create new secret key", anna sellele nimi ja kopeeri võti (sk-... formaadis).<br/>
            4. Kleebi see siia modaalaknasse ja salvesta.
          </div>
        )}
        {msg && (
          <div style={{
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 13,
            ...(msg.includes("❌") ? { background: "#ffebee", border: "1px solid #ef9a9a" } :
                msg.includes("✅") || msg.includes("✓") ? { background: "#e8f5e9", border: "1px solid #a5d6a7" } :
                { background: "#f9fafb", border: "1px solid #e5e7eb" })
          }}>
            {msg}
          </div>
        )}
      </div>
      {/* Find & Replace Modal */}
      {showFindReplace && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 8,
            padding: 20,
            maxWidth: 400,
            width: "90%",
            boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>🔄 Otsi ja asenda</h3>
          
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Otsi</label>
              <input
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="nt: ."
                style={{ width: "100%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 13 }}
              />
            </div>
          
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Asenda</label>
              <input
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="nt: -"
                style={{ width: "100%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 13 }}
              />
            </div>
          
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={findAndReplace}
                style={{ flex: 1, padding: "8px", background: "#333", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                ✓ Asenda
              </button>
              <button
                onClick={() => setShowFindReplace(false)}
                style={{ flex: 1, padding: "8px", background: "#eee", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Tabel */}
      {rows.length > 0 && (
        <div style={{ border: "1px solid #edf0f4", borderRadius: 8, padding: 12, background: "#fafbfc" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Mark veerg</div>
              <select
                value={markKey}
                onChange={(e) => setMarkKey(e.target.value)}
                style={{ padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4, fontSize: 12 }}
              >
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Kogus veerg</div>
              <select
                value={qtyKey}
                onChange={(e) => setQtyKey(e.target.value)}
                style={{ padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4, fontSize: 12 }}
              >
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                style={{ padding: "6px 12px", background: "#333", color: "#fff", border: "1px solid #333", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }}
                disabled={searchingModel}
                onClick={searchInModel}
              >
                {searchingModel ? "🔍..." : "🔍 Otsi mudelist"}
              </button>
            
              <button
                style={{ padding: "6px 12px", background: "#555", color: "#fff", border: "1px solid #555", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }}
                disabled={!modelObjects.length}
                onClick={selectInModel}
              >
                🎯 Selecti mudelist
              </button>
            
              <button
                style={{ padding: "6px 12px", background: "#777", color: "#fff", border: "1px solid #777", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }}
                onClick={() => setShowFindReplace(true)}
              >
                🔄 Otsi/Asenda
              </button>
            
              <button
                style={{ padding: "6px 12px", background: "#aaa", color: "#fff", border: "1px solid #aaa", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                onClick={exportToCSV}
              >
                📥 CSV
              </button>
              <button
                style={{ padding: "6px 12px", background: "#aaa", color: "#fff", border: "1px solid #aaa", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                onClick={() => setShowCopyModal(true)}
              >
                📋 Kopeeri lõikelauale
              </button>
              <button
                style={{ padding: "6px 12px", background: "#333", color: "#fff", border: "1px solid #333", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                onClick={initSaveView}
                disabled={!modelObjects.length}
              >
                Salvesta vaatesse
              </button>
            </div>
          </div>
          {/* Column selector */}
          <div style={{ marginBottom: 12, padding: 8, background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, opacity: 0.7 }}>Näidatavad veerud:</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {headers.map((h) => (
                <label key={h} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(h)}
                    onChange={() => toggleColumn(h)}
                  />
                  <span>{h}</span>
                </label>
              ))}
            </div>
          </div>
          {/* Statistics */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 8,
            marginBottom: 12
          }}>
            <div style={{ padding: 8, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: "#1e40af" }}>📊 Ridu kokku</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1e40af" }}>{totalRows}</div>
            </div>
          
            {foundRows > 0 && (
              <div style={{ padding: 8, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: "#15803d" }}>✅ Leitud</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d" }}>{foundRows}</div>
              </div>
            )}
          
            {notFoundRows > 0 && (
              <div style={{ padding: 8, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: "#c2410c" }}>❌ Ei leitud</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#c2410c" }}>{notFoundRows}</div>
              </div>
            )}
          
            {warningRows > 0 && (
              <div style={{ padding: 8, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: "#dc2626" }}>⚠️ Hoiatused</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626" }}>{warningRows}</div>
              </div>
            )}
          
            {qtyKey && totalSheetQty > 0 && (
              <div style={{ padding: 8, background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: "#92400e" }}>📋 Saateleht</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#92400e" }}>{totalSheetQty} tk</div>
              </div>
            )}
          
            {totalModelQty > 0 && (
              <div style={{ padding: 8, background: "#f3e8ff", border: "1px solid #d8b4fe", borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: "#6b21a8" }}>🏗️ Mudel</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#6b21a8" }}>{totalModelQty} tk</div>
              </div>
            )}
          
            {qtyMismatchRows > 0 && (
              <div style={{ padding: 8, background: "#ffedd5", border: "1px solid #fdba74", borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: "#ea580c" }}>⚠️ Erinevused</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#ea580c" }}>{qtyMismatchRows}</div>
              </div>
            )}
          </div>
          <div style={{ overflow: "auto", maxHeight: 400, border: "1px solid #e5e7eb", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb", padding: "6px", background: "#f9fafb", position: "sticky", top: 0, zIndex: 10 }}>#</th>
                  <th style={{ textAlign: "center", borderBottom: "2px solid #e5e7eb", padding: "6px", background: "#f9fafb", position: "sticky", top: 0, width: 40, zIndex: 10 }}>✓</th>
                  {displayColumns.map((key) => (
                    <th key={key} style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb", padding: "6px", background: "#f9fafb", position: "sticky", top: 0, zIndex: 10 }}>
                      {key}
                      {key === markKey && " 🔖"}
                      {key === qtyKey && " 🔢"}
                      {key === "_modelQuantity" && " (Kogus mudelis)"}
                    </th>
                  ))}
                  <th style={{ textAlign: "center", borderBottom: "2px solid #e5e7eb", padding: "6px", background: "#f9fafb", position: "sticky", top: 0, width: 100, zIndex: 10 }}>-</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const hasWarning = !!r._warning;
                  const notFound = r._foundInModel === false;
                  const found = r._foundInModel === true;
                  const qtyMismatch = r._warning?.includes("ei vasta");
                  const rowBg = hasWarning ? "#fef2f2" : notFound ? "#fff7ed" : found ? "#f0fdf4" : (idx % 2 === 0 ? "#fff" : "#fafafa");
                
                  return (
                    <tr key={idx} style={{ background: rowBg }}>
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6", textAlign: "center", opacity: 0.5, fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6", textAlign: "center", fontSize: 14 }} title={r._warning}>
                        {hasWarning ? "⚠️" : notFound ? "❌" : found ? "✅" : ""}
                      </td>
                      {displayColumns.map((key) => (
                        <td key={key} style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                          <input
                            value={r[key] || ""}
                            onChange={(e) => changeCell(idx, key, e.target.value)}
                            style={{
                              width: "100%",
                              padding: "4px 6px",
                              border: (r[key] === "???" ? "2px solid #f59e0b" : "1px solid #e5e7eb"),
                              borderRadius: 4,
                              fontSize: 12,
                              outline: "none",
                              background: r[key] === "???" ? "#fffbeb" : "transparent"
                            }}
                            placeholder={r[key] === "???" ? "???" : ""}
                            title={key === markKey && r._modelQuantity ? `Mudel: ${r._modelQuantity} tk` : ""}
                          />
                        </td>
                      ))}
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6", textAlign: "center" }}>
                        <button
                          onClick={() => removeRow(idx)}
                          style={{ padding: "2px 6px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 4, cursor: "pointer", fontSize: 11 }}
                        >
                          ❌
                        </button>
                        {r._foundInModel && r.modelId && r._objectId && (
                          <button
                            onClick={() => zoomToRow(r.modelId, r._objectId)}
                            style={{ padding: "2px 6px", background: "#e7f3ff", border: "1px solid #1E88E5", borderRadius: 4, cursor: "pointer", fontSize: 11, marginLeft: 4 }}
                          >
                            🔍
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            <button
              style={{ padding: "6px 12px", background: "transparent", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              onClick={addRow}
            >
              ➕ Lisa rida
            </button>
            <div style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>
              Otsingusse: <strong>{previewMarks.length}</strong> kirjet
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              style={{
                width: "100%",
                padding: "12px",
                background: (warningRows > 0 || notFoundRows > 0) ? "#d1d5db" : "#333",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: (warningRows > 0 || notFoundRows > 0) ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 600
              }}
              onClick={onConfirmClick}
            >
              ✅ Kinnita ja kasuta ({previewMarks.length})
            </button>
            {(warningRows > 0 || notFoundRows > 0) && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#dc2626", textAlign: "center" }}>
                ⚠️ Parandamist vajavad read - vajuta ikkagi kinnitamiseks
              </div>
            )}
          </div>
        </div>
      )}
      {showViewSave && (
        <div style={{ marginTop: 8, padding: 6, border: "1px solid #ccc", borderRadius: 6, background: "#f0f0f0" }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Vaate nimi:</label>
          <input type="text" value={viewName} onChange={e => setViewName(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 13 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={saveView}
              style={{ flex: 1, padding: "8px", background: "#333", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              disabled={!viewName.trim()}
            >
              Salvesta vaade
            </button>
            <button
              onClick={cancelSaveView}
              style={{ flex: 1, padding: "8px", background: "#eee", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
            >
              Tühista
            </button>
          </div>
        </div>
      )}
      {showCopyModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 8,
            padding: 20,
            maxWidth: 400,
            width: "90%",
            boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>📋 Kopeeri lõikelauale</h3>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={copyIncludeHeaders}
                onChange={(e) => setCopyIncludeHeaders(e.target.checked)}
              />
              <span>Kaasa päised</span>
            </label>
            <div style={{ marginTop: 8 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Veerud</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {headers.map((h) => (
                  <label key={h} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={copyColumns.includes(h)}
                      onChange={() => setCopyColumns(prev => prev.includes(h) ? prev.filter(c => c !== h) : [...prev, h])}
                    />
                    <span>{h}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={copyToClipboard}
                style={{ flex: 1, padding: "8px", background: "#333", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                Kopeeri
              </button>
              <button
                onClick={() => setShowCopyModal(false)}
                style={{ flex: 1, padding: "8px", background: "#eee", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
