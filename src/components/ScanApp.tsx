import React, { useMemo, useRef, useState } from "react";

type Row = Record<string, string> & { 
  _confidence?: number; 
  _warning?: string;
  _foundInModel?: boolean | null;
};

type Props = {
  api: any;
  settings?: {
    ocrWebhookUrl: string;
    ocrSecret: string;
    ocrPrompt: string;
    language: "et" | "en";
  };
  onConfirm?: (marks: string[], rows: Row[], markKey: string, qtyKey: string) => void;
  translations?: any;
  styles?: any;
};

export default function ScanApp({ api, settings, onConfirm, translations, styles: parentStyles }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [rawText, setRawText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [markKey, setMarkKey] = useState<string>("");
  const [qtyKey, setQtyKey] = useState<string>("");
  const [extraKey, setExtraKey] = useState<string>("");
  const [showExtraColumn, setShowExtraColumn] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [searchingModel, setSearchingModel] = useState(false);
  const [targetColumns, setTargetColumns] = useState("Mark, Qty, Profile");
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const t = translations || {};
  const c = parentStyles || {};

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
    if (!settings?.ocrWebhookUrl) throw new Error("OCR webhook URL pole seadistatud!");

    const columns = targetColumns.trim();
    const columnInstruction = columns 
      ? `Extract ONLY these columns in this exact order: ${columns}. If column names are not visible in the image, use column positions (1st column from left = ${columns.split(',')[0]?.trim() || '1'}, 2nd column = ${columns.split(',')[1]?.trim() || '2'}, etc).`
      : "Extract all visible columns.";

    const basePrompt = `You are an expert at reading logistics transport sheets and fabrication lists.

${columnInstruction}

Return data as TSV (tab-separated values) format with headers in the first row.
Keep the EXACT ORIGINAL ORDER of rows as they appear in the image (top to bottom).
If you cannot read a cell clearly, put "???" there.
Do not skip any rows.
Do not add extra rows.

${settings.ocrPrompt || ""}`;

    const response = await fetch(settings.ocrWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: settings.ocrSecret,
        file: {
          name: files[0]?.name || "image.jpg",
          type: files[0]?.type || "image/jpeg",
          data: imageBase64
        },
        prompt: basePrompt
      })
    });

    if (!response.ok) throw new Error(`Webhook viga: ${response.status}`);

    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "OCR ebaõnnestus");
    
    return data.text || "";
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

      if (!settings?.ocrWebhookUrl || !settings?.ocrSecret) {
        setMsg("❌ OCR webhook URL või secret puudub. Lisa need seadetes!");
        return;
      }

      if (!targetColumns.trim()) {
        setMsg("❌ Määra esmalt veerud!");
        return;
      }

      setMsg(t.usingOcr || "🔍 OCR...");
      const base64 = await fileToBase64(files[0]);
      const text = await runGptOcr(base64);
      
      setRawText(text);
      setMsg("✅ OCR valmis! Vajuta 'Parsi tabelisse'.");
    } catch (e: any) {
      setMsg("❌ Viga: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  function parseTextToTable(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((s) => s.replace(/\t+/g, "  ").trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setHeaders([]);
      setRows([]);
      setMsg("❌ Tühjus.");
      return;
    }

    let headerIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const cols = lines[i].split(/\s{2,}|\t/).filter(Boolean);
      const hasKeywords = /\b(component|mark|qty|pcs|kogus|profile|length|weight|komponent)\b/i.test(lines[i]) ? 3 : 0;
      const score = cols.length + hasKeywords;
      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
      }
    }

    const rawHeaders = lines[headerIdx]
      .split(/\s{2,}|\t/)
      .map((s) => cleanHeader(s))
      .filter(Boolean);

    const normalizedHeaders = rawHeaders.length > 0
      ? rawHeaders
      : lines[0].split(/\s{2,}|\t/).map((_, i) => "Col" + (i + 1));

    const outRows: Row[] = [];
    let warnings = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (i === headerIdx) continue;
      const cols = lines[i].split(/\s{2,}|\t/);
      
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
    const extraIdx = normalizedHeaders.findIndex((_, idx) => 
      idx !== (markIdx >= 0 ? markIdx : 0) && 
      idx !== (qtyIdx >= 0 ? qtyIdx : normalizedHeaders.length - 1)
    );

    setMarkKey(normalizedHeaders[markIdx >= 0 ? markIdx : 0] || "");
    setQtyKey(normalizedHeaders[qtyIdx >= 0 ? qtyIdx : normalizedHeaders.length - 1] || "");
    setExtraKey(normalizedHeaders[extraIdx >= 0 ? extraIdx : Math.min(2, normalizedHeaders.length - 1)] || "");
    
    const warnMsg = warnings > 0 ? ` ⚠️ ${warnings} rida jäeti vahele.` : "";
    const ocrWarnings = outRows.filter(r => r._warning?.includes("ei suutnud")).length;
    const ocrWarnMsg = ocrWarnings > 0 ? ` ⚠️ ${ocrWarnings} lahtrit ???` : "";
    setMsg(`✓ Tabel valmis: ${outRows.length} rida.${warnMsg}${ocrWarnMsg}`);
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
    base[markKey] = "";
    base[qtyKey] = "";
    if (showExtraColumn && extraKey) base[extraKey] = "";
    setRows((prev) => [...prev, base]);
  }

  function removeRow(rIdx: number) {
    setRows((prev) => prev.filter((_, i) => i !== rIdx));
  }

  async function searchInModel() {
    if (!markKey || !rows.length) {
      setMsg("❌ Parsi esmalt tabel!");
      return;
    }

    try {
      setSearchingModel(true);
      setMsg("🔍 Otsin mudelist...");

      // Kasuta Trimble API-d
      const viewer = api?.viewer;
      const marks = rows.map(r => String(r[markKey] || "").trim()).filter(Boolean);
      const uniqueMarks = [...new Set(marks)];
      
      const mos = await viewer?.getObjects();
      if (!Array.isArray(mos)) {
        setMsg("❌ API viga");
        setSearchingModel(false);
        return;
      }

      const foundMarks = new Set<string>();

      for (const mo of mos) {
        const modelId = String(mo.modelId);
        const objectRuntimeIds = (mo.objects || []).map((o: any) => Number(o?.id)).filter((n: number) => Number.isFinite(n));
        
        try {
          const fullProperties = await api.viewer.getObjectProperties(modelId, objectRuntimeIds);
          
          for (const obj of fullProperties) {
            const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
            for (const set of props) {
              for (const p of set?.properties ?? []) {
                if (/assembly[\/\s]?cast[_\s]?unit[_\s]?mark|^mark$|block/i.test(String(p?.name))) {
                  const val = String(p?.value || p?.displayValue || "").trim();
                  if (uniqueMarks.some(m => m.toLowerCase() === val.toLowerCase())) {
                    foundMarks.add(val);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn(`Model ${modelId} error:`, e);
        }
      }

      const updatedRows = rows.map(r => {
        const mark = String(r[markKey] || "").trim();
        const found = Array.from(foundMarks).some(fm => fm.toLowerCase() === mark.toLowerCase());
        return { ...r, _foundInModel: found };
      });

      setRows(updatedRows);

      const foundCount = updatedRows.filter(r => r._foundInModel === true).length;
      const notFoundCount = updatedRows.filter(r => r._foundInModel === false).length;

      setMsg(`✓ ${foundCount} ✅ leitud, ${notFoundCount} ❌ ei leitud.`);
    } catch (e: any) {
      setMsg("❌ Viga: " + (e?.message || String(e)));
    } finally {
      setSearchingModel(false);
    }
  }

  const totalRows = rows.length;
  const warningRows = rows.filter(r => r._warning).length;
  const notFoundRows = rows.filter(r => r._foundInModel === false).length;

  const displayColumns = useMemo(() => {
    const cols = [markKey, qtyKey];
    if (showExtraColumn && extraKey && extraKey !== markKey && extraKey !== qtyKey) {
      cols.push(extraKey);
    }
    return cols.filter(Boolean);
  }, [markKey, qtyKey, extraKey, showExtraColumn]);

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
      setMsg(`⚠️ ${warningRows} hoiatust. Paranda!`);
      return;
    }
    if (notFoundRows > 0) {
      setMsg(`⚠️ ${notFoundRows} ei leitud mudelist!`);
      return;
    }
    
    if (onConfirm) {
      onConfirm(previewMarks, rows, markKey, qtyKey);
    }
    setMsg("✅ Kinnitatud: " + previewMarks.length + " kirjet.");
  }

  function loadSampleData() {
    const sample = `Mark\tQty\tProfile
B-101\t3\tHEA 200
C-205\t2\tHEB 300
PL-42\t5\tFL 10x200
BR-88\t4\tL 100x100x10`;
    setRawText(sample);
    setTargetColumns("Mark, Qty, Profile");
    setMsg("📋 Näidis laaditud.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Sisend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={c.labelTop}>📁 {t.uploadFiles || "Fail"}</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => handleFileSelect(e.target.files)}
              style={{ fontSize: 12, width: "100%" }}
            />
          </div>
          
          <div>
            <label style={c.labelTop}>📷 Pildista</label>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileSelect(e.target.files)}
              style={{ display: "none" }}
            />
            <button 
              style={{...c.btn, width: "100%", background: "#d1fae5", borderColor: "#10b981"}}
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
          </div>
        )}

        <div>
          <label style={c.labelTop}>{t.targetColumns || "Veerud"}</label>
          <input
            value={targetColumns}
            onChange={(e) => setTargetColumns(e.target.value)}
            placeholder="Mark, Qty, Profile"
            style={c.input}
          />
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
            {t.targetColumnsHint || "Kui veeru nimesid pole, kasuta numbreid: '1, 2, 3'"}
          </div>
        </div>
        
        <div>
          <label style={c.labelTop}>{t.orPasteText || "Või kleebi tekst"}</label>
          <textarea
            style={{...c.textarea, height: 100}}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={t.pasteHint || "Tekst..."}
          />
        </div>

        <div style={c.controls}>
          <button 
            style={{...c.btn, background: "#10b981", color: "#fff", borderColor: "#10b981"}} 
            disabled={busy} 
            onClick={runOcr}
          >
            {busy ? "⏳" : t.runOcr || "🔍 OCR"}
          </button>
          
          <button style={c.btnGhost} onClick={loadSampleData}>📋 Näidis</button>
          
          <button
            style={c.btn}
            onClick={() => {
              if (!rawText.trim()) {
                setMsg("❌ Pole teksti.");
                return;
              }
              parseTextToTable(rawText);
            }}
          >
            {t.parseToTable || "⚡ Parsi"}
          </button>
          
          <button
            style={c.btnGhost}
            onClick={() => {
              setRawText("");
              setRows([]);
              setHeaders([]);
              setFiles([]);
              setImagePreview("");
              if (fileInputRef.current) fileInputRef.current.value = "";
              if (cameraInputRef.current) cameraInputRef.current.value = "";
              setMsg("🗑️ Tühjendatud.");
            }}
          >
            🗑️
          </button>
        </div>

        {msg && (
          <div style={{ ...c.note, ...(msg.includes("❌") ? { background: "#ffebee", borderColor: "#ef9a9a" } : msg.includes("✅") || msg.includes("✓") ? { background: "#e8f5e9", borderColor: "#a5d6a7" } : {}) }}>
            {msg}
          </div>
        )}
      </div>

      {/* Tabel */}
      {rows.length > 0 && (
        <div style={{ border: "1px solid #edf0f4", borderRadius: 8, padding: 12, background: "#fafbfc" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{t.markColumn || "Mark"}</div>
              <select value={markKey} onChange={(e) => setMarkKey(e.target.value)} style={{ ...c.input, width: 120, padding: "4px 6px" }}>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            
            <div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{t.qtyColumn || "Kogus"}</div>
              <select value={qtyKey} onChange={(e) => setQtyKey(e.target.value)} style={{ ...c.input, width: 120, padding: "4px 6px" }}>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={showExtraColumn} onChange={(e) => setShowExtraColumn(e.target.checked)} />
              3. veerg
            </label>
            {showExtraColumn && (
              <select value={extraKey} onChange={(e) => setExtraKey(e.target.value)} style={{ ...c.input, width: 120, padding: "4px 6px" }}>
                {headers.filter(h => h !== markKey && h !== qtyKey).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            )}
            
            <button 
              style={{...c.btn, background: "#7c3aed", color: "#fff", borderColor: "#7c3aed", marginLeft: "auto"}}
              disabled={searchingModel}
              onClick={searchInModel}
            >
              {searchingModel ? "🔍..." : "🔍 Otsi mudelist"}
            </button>
          </div>

          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
            Ridu: {totalRows}
            {warningRows > 0 && ` ⚠️ ${warningRows}`}
            {notFoundRows > 0 && ` ❌ ${notFoundRows}`}
          </div>

          <div style={{ overflow: "auto", maxHeight: 400, border: "1px solid #e5e7eb", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb", padding: "6px", background: "#f9fafb", position: "sticky", top: 0 }}>#</th>
                  <th style={{ textAlign: "center", borderBottom: "2px solid #e5e7eb", padding: "6px", background: "#f9fafb", position: "sticky", top: 0, width: 40 }}>✓</th>
                  {displayColumns.map((key) => <th key={key} style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb", padding: "6px", background: "#f9fafb", position: "sticky", top: 0 }}>{key}</th>)}
                  <th style={{ textAlign: "center", borderBottom: "2px solid #e5e7eb", padding: "6px", background: "#f9fafb", position: "sticky", top: 0, width: 60 }}>-</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const hasWarning = !!r._warning;
                  const notFound = r._foundInModel === false;
                  const found = r._foundInModel === true;
                  const rowBg = hasWarning ? "#fef2f2" : notFound ? "#fff7ed" : found ? "#f0fdf4" : (idx % 2 === 0 ? "#fff" : "#fafafa");
                  
                  return (
                    <tr key={idx} style={{ background: rowBg }}>
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6", textAlign: "center", opacity: 0.5, fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6", textAlign: "center", fontSize: 14 }}>
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
                          />
                        </td>
                      ))}
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6", textAlign: "center" }}>
                        <button
                          onClick={() => removeRow(idx)}
                          style={{ ...c.mini, background: "#fef2f2", borderColor: "#fca5a5" }}
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            <button style={c.btnGhost} onClick={addRow}>➕ Lisa</button>
            <div style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>
              Otsingusse: <strong>{previewMarks.length}</strong>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <button 
              style={{...c.btnPrimary, width: "100%"}} 
              onClick={onConfirmClick}
              disabled={warningRows > 0 || notFoundRows > 0}
            >
              {t.confirmAndSearch || `✅ Kinnita (${previewMarks.length})`}
            </button>
            {(warningRows > 0 || notFoundRows > 0) && (
              <div style={{ marginTop: 4, fontSize: 11, color: "#dc2626" }}>
                ⚠️ Paranda punased/oranžid!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
