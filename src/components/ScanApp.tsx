import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
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
const DEBOUNCE_SAVE_MS = 500;
const COLORS = {
  primary: "#0a3a67",
  primaryHover: "#083254",
  secondary: "#1E88E5",
  accent: "#4F46E5",
  background: "#F8FAFC",
  backgroundLight: "#FFFFFF",
  surface: "#F1F5F9",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  text: "#1E293B",
  textLight: "#64748B",
  textMuted: "#94A3B8",
  success: "#10B981",
  successLight: "#D1FAE5",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  error: "#EF4444",
  errorLight: "#FEE2E2",
  info: "#3B82F6",
  infoLight: "#DBEAFE",
  white: "#FFFFFF",
};
const Tooltip: React.FC<{ children: React.ReactNode; text: string }> = ({ children, text }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
        {children}
      </div>
      {show && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 12px",
            background: COLORS.text,
            color: COLORS.white,
            fontSize: 11,
            borderRadius: 6,
            whiteSpace: "nowrap",
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            pointerEvents: "none",
          }}
        >
          {text}
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: `5px solid ${COLORS.text}`,
            }}
          />
        </div>
      )}
    </div>
  );
};
const IconButton: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  tooltip: string;
  icon: string;
  variant?: "primary" | "secondary" | "success" | "danger" | "warning" | "info";
  size?: "small" | "medium";
}> = ({ onClick, disabled, tooltip, icon, variant = "secondary", size = "medium" }) => {
  const variants = {
    primary: { bg: COLORS.primary, hover: COLORS.primaryHover, text: COLORS.white },
    secondary: { bg: COLORS.surface, hover: COLORS.border, text: COLORS.text },
    success: { bg: COLORS.successLight, hover: "#BBF7D0", text: COLORS.success },
    danger: { bg: COLORS.errorLight, hover: "#FECACA", text: COLORS.error },
    warning: { bg: COLORS.warningLight, hover: "#FDE68A", text: COLORS.warning },
    info: { bg: COLORS.infoLight, hover: "#BFDBFE", text: COLORS.info },
  };
  const style = variants[variant];
  const padding = size === "small" ? "4px 6px" : "8px 10px";
  const fontSize = size === "small" ? 13 : 16;
 
  return (
    <Tooltip text={tooltip}>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          padding,
          background: disabled ? COLORS.surface : style.bg,
          color: disabled ? COLORS.textMuted : style.text,
          border: "none",
          borderRadius: 6,
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          opacity: disabled ? 0.5 : 1,
          minWidth: size === "small" ? 28 : 34,
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.background = style.hover;
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.background = style.bg;
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
          }
        }}
      >
        {icon}
      </button>
    </Tooltip>
  );
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
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [searchingModel, setSearchingModel] = useState(false);
  const [targetColumns, setTargetColumns] = useState("Component, Pcs");
  const [tempColumn, setTempColumn] = useState("");
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
  const [rowCountWarning, setRowCountWarning] = useState("");
  const [showSearchScopeModal, setShowSearchScopeModal] = useState(false);
  const [showOcrPromptModal, setShowOcrPromptModal] = useState(false);
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<"csv" | "excel">("csv");
  const [exportIncludeHeaders, setExportIncludeHeaders] = useState(true);
  const [exportColumns, setExportColumns] = useState<string[]>([]);
  const [additionalExportFields, setAdditionalExportFields] = useState<string[]>([]);
  const [searchScope, setSearchScope] = useState("scopeAll");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [movedRowIdx, setMovedRowIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const t = translations || {};
  const c = parentStyles || {};
  useEffect(() => {
    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedState) {
      try {
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
      } catch (e) {
        console.error("Failed to parse saved state:", e);
      }
    }
  }, []);
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
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
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.error("Failed to save state:", e);
      }
    }, DEBOUNCE_SAVE_MS);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [rawText, headers, rows, markKey, qtyKey, selectedColumns, imagePreview, targetColumns, totalScannedRows, modelObjects]);
  useEffect(() => {
    try {
      localStorage.setItem('ocrAdditionalPrompt', additionalPrompt);
    } catch (e) {
      console.error("Failed to save additional prompt:", e);
    }
  }, [additionalPrompt]);
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === 'file') {
            const file = items[i].getAsFile();
            if (file && file.type.startsWith('image/')) {
              setFiles([file]);
              const reader = new FileReader();
              reader.onload = (ev) => {
                setImagePreview(ev.target?.result as string || "");
              };
              reader.readAsDataURL(file);
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);
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
    if (!file.type.startsWith('image/')) return;
    setFiles([file]);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string || "");
    };
    reader.readAsDataURL(file);
  }
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const fileList = e.dataTransfer.files;
    handleFileSelect(fileList);
  };
  async function runGptOcr(imageBase64: string): Promise<string> {
    if (!apiKey) {
      throw new Error("⛔ Sisesta OpenAI API võti!");
    }
    const columns = targetColumns.trim();
    const columnList = columns ? columns.split(',').map(c => c.trim()).concat('Notes') : [];
    const columnInstruction = columns
      ? `Väljavõtte AINULT need veerud täpselt selles järjekorras: ${columnList.join(', ')}. Kui veerunimed ei ole pildil nähtavad, kasuta veeru positsioone (1. veerg vasakult = ${columnList[0] || '1'}, jne).`
      : "Väljavõtte kõik nähtavad veerud, lisa Notes veerg lõppu.";
    const prompt = `Sa oled ekspert logistika transpordilehtede ja tootmisnimekirjade lugemises. Ole väga täpne tähtede ja numbrite eristamisel (nt "T" ja "5" on erinevad, "TS" ei ole "T5"). Numbrid on kogused, loe neid täpselt, ära muuda neid.
${columnInstruction}
Lisa alati veerg "Notes" lõppu, kuhu pane olulist infot: kui midagi on pastakaga lisatud, kahtlane või arusaamatu (nt "Pastakaga kriipsutatud", "Kahtlane number: võimalik 1 või 7", "Lisamärge: X").
Hoia TÄPNE ALGINE JÄRJEKORD ridadest nagu nad pildil on (ülalt alla).
Kui sa ei suuda lahtrit selgelt lugeda, pane sinna "???" ja lisa Notes'i selgitus.
Ära jäta ühtegi rida vahele.
Ära lisa lisaridu.
${additionalPrompt || ""}
${settings?.ocrPrompt || ""}
Tagasta andmed TSV (tab-separated values) formaadis, kus esimene rida on päised.
Kasuta veergude eraldamiseks AINULT TAB-märki (\t). Read eralda \n-ga, iga rida oma real.
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
  async function verifyRowCount(text: string): Promise<string> {
    if (!apiKey) return "";
    const prompt = `Analüüsi seda TSV teksti: ${text}
Loenda read (välja arvatud päis). Kui on ekstra ridu või puuduvad read, anna hoiatus. Tagasta: "OK, ridu: X" või "Hoiatus: ekstra Y rida".`;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        })
      });
      if (!response.ok) return "Kontroll ebaõnnestus.";
      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    } catch {
      return "Kontroll ebaõnnestus.";
    }
  }
  async function getOcrFeedback(text: string): Promise<string> {
    if (!apiKey) return "";
    const prompt = `Analüüsi seda OCR tulemust (TSV formaat): ${text}
Koonda ainult oluline info konkreetse skanni kohta. Hinda lühidalt:
- Dokumendi loetavus (kvaliteet, font).
- Lugemisraskused ja probleemid ridades/lahtrites.
- Soovitused uuesti skannimiseks (nt parem valgustus).
Vorminda vastus bulletitega eesti keeles, hoia lühike ja selge.`;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
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
          setMsg("⛔ Pole faile ega teksti.");
        } else {
          setMsg("✓ Tekst on kleebitud. Vajuta 'Parsi tabelisse'.");
        }
        return;
      }
      if (!targetColumns.trim()) {
        setMsg("⛔ Määra esmalt veerud!");
        return;
      }
      setMsg("🔍 OCR töötab...");
      const base64 = await fileToBase64(files[0]);
      const text = await runGptOcr(base64);
      const rowCheck = await verifyRowCount(text);
      setRowCountWarning(rowCheck);
      setRawText(text);
      const feedback = await getOcrFeedback(text);
      setOcrFeedback(feedback);
      setMsg(`✅ OCR valmis! ${rowCheck}\n\nTagasiside:\n${feedback}`);
    } catch (e: any) {
      setMsg("⛔ Viga: " + (e?.message || String(e)));
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
      setMsg("⛔ Tühjus.");
      return;
    }
    let headerIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const cols = lines[i].split('\t').filter(Boolean);
      const hasKeywords = /\b(component|mark|qty|pcs|kogus|profile|length|weight|komponent)\b/i.test(lines[i]) ? 3 : 0;
      const score = cols.length + hasKeywords;
      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
      }
    }
    const rawHeaders = lines[headerIdx]
      .split('\t')
      .map((s) => cleanHeader(s))
      .filter(Boolean);
    const normalizedHeaders = rawHeaders.length > 0
      ? rawHeaders
      : lines[0].split('\t').map((_, i) => "Col" + (i + 1));
    const outRows: Row[] = [];
    let warnings = 0;
    for (let i = 0; i < lines.length; i++) {
      if (i === headerIdx) continue;
      let cols = lines[i].split('\t');
      while (cols.length < normalizedHeaders.length) {
        cols.push('');
      }
      if (cols.length > normalizedHeaders.length) {
        cols = cols.slice(0, normalizedHeaders.length);
      }
      if (cols.length < 2) {
        warnings++;
        continue;
      }
      const r: Row = {};
      let hasData = false;
      let hasWarning = false;
      for (let c = 0; c < normalizedHeaders.length; c++) {
        const val = (cols[c] || '').trim();
        r[normalizedHeaders[c]] = val;
        if (val) hasData = true;
        if (val === "???") hasWarning = true;
      }
      if (hasWarning) {
        r._warning = "⚠️ OCR ei suutnud lugeda";
        r._confidence = 0.5;
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
  function moveRow(oldIdx: number, newIdx: number) {
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(oldIdx, 1);
      next.splice(newIdx, 0, moved);
      return next;
    });
    setMovedRowIdx(newIdx);
    setTimeout(() => setMovedRowIdx(null), 1000);
  }
  function moveRowUp(rIdx: number) {
    if (rIdx === 0) return;
    moveRow(rIdx, rIdx - 1);
  }
  function moveRowDown(rIdx: number) {
    if (rIdx === rows.length - 1) return;
    moveRow(rIdx, rIdx + 1);
  }
  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.setData("text/plain", idx.toString());
  }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
  }
  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveRow(dragIdx, idx);
    }
    setDragIdx(null);
  }
  function addColumn() {
    if (!newColumnName.trim()) return;
    setHeaders((prev) => [...prev, newColumnName]);
    setRows((prev) => prev.map(r => ({ ...r, [newColumnName]: "" })));
    setSelectedColumns((prev) => [...prev, newColumnName]);
    setNewColumnName("");
  }
  function removeColumn(col: string) {
    if (col === markKey || col === qtyKey) {
      setMsg("⛔ Mark ja Kogus veergu ei saa kustutada!");
      return;
    }
    setHeaders(prev => prev.filter(h => h !== col));
    setSelectedColumns(prev => prev.filter(h => h !== col));
    setRows(prev => prev.map(r => {
      const newR = { ...r };
      delete newR[col];
      return newR;
    }));
  }
  function reorderColumns(newOrder: string[]) {
    setHeaders(newOrder);
    setSelectedColumns(newOrder.filter(c => selectedColumns.includes(c)));
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
      setMsg("⛔ Sisesta otsitav tekst!");
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
    if (searchingModel) {
      console.log("Search already in progress, skipping...");
      return;
    }
    if (!markKey || !rows.length) {
      setMsg("⛔ Parsi esmalt tabel!");
      return;
    }
    try {
      setSearchingModel(true);
      setMsg("🔍 Otsin mudelist...");
      const viewer = api?.viewer;
      const marks = rows.map(r => String(r[markKey] || "").trim()).filter(Boolean);
      const uniqueMarks = [...new Set(marks)];
      let mos;
      if (searchScope === "scopeSelected") {
        mos = await viewer?.getObjects?.({ selected: true });
      } else {
        mos = await viewer?.getObjects?.();
      }
      if (!Array.isArray(mos)) {
        setMsg("⛔ API viga");
        return;
      }
      const foundMarks = new Map<string, number>();
      const foundObjects: any[] = [];
      const modelPromises = mos.map(async (mo) => {
        const modelId = String(mo.modelId);
        const objectRuntimeIds = (mo.objects || []).map((o: any) => Number(o?.id)).filter((n: number) => Number.isFinite(n));
        try {
          const fullProperties = await api.viewer.getObjectProperties(modelId, objectRuntimeIds, { includeHidden: true });
          for (const obj of fullProperties) {
            const props: any[] = Array.isArray(obj?.properties) ? obj.properties : [];
            for (const set of props) {
              for (const p of set?.properties ?? []) {
                const propName = String(p?.name || "");
                const shouldCheck = /assembly[\/\s]?cast[_\s]?unit[_\s]?mark|^mark$|block/i.test(propName);
               
                if (shouldCheck) {
                  const val = String(p?.value || p?.displayValue || "").trim();
                  if (uniqueMarks.some(m => val.toLowerCase() === m.toLowerCase())) {
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
      });
      await Promise.all(modelPromises);
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
      let resultMsg = `✓ ${foundCount} ✅ leitud, ${notFoundCount} ⛔ ei leitud.`;
      if (qtyMismatch > 0) {
        resultMsg += ` ⚠️ ${qtyMismatch} koguste erinevus!`;
      }
      setMsg(resultMsg);
    } catch (e: any) {
      console.error("Search error:", e);
      setMsg("⛔ Viga: " + (e?.message || String(e)));
    } finally {
      setSearchingModel(false);
    }
  }
  async function selectInModel() {
    if (!modelObjects.length) {
      setMsg("⛔ Tee esmalt otsing mudelist!");
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
      const modelObjectIds = [];
      for (const [modelId, ids] of byModel.entries()) {
        modelObjectIds.push({ modelId, objectRuntimeIds: ids });
      }
      await viewer?.setSelection({ modelObjectIds }, 'set');
      setMsg(`✓ Selectitud ${modelObjects.length} objekti mudelist.`);
    } catch (e: any) {
      setMsg("⛔ Selectimine ebaõnnestus: " + (e?.message || String(e)));
    }
  }
  async function zoomToRow(row: Row) {
    const mark = String(row[markKey] || "").trim().toLowerCase();
    if (!mark) return;
    const matchingObjects = modelObjects.filter(obj => obj.mark.toLowerCase() === mark);
    if (matchingObjects.length === 0) {
      setMsg("⛔ Pole sobivaid objekte selle mark'i jaoks.");
      return;
    }
    try {
      const viewer = api?.viewer;
      const byModel = new Map<string, number[]>();
      for (const obj of matchingObjects) {
        const ids = byModel.get(obj.modelId) || [];
        ids.push(obj.objectId);
        byModel.set(obj.modelId, ids);
      }
      const modelObjectIds = Array.from(byModel.entries()).map(([modelId, objectRuntimeIds]) => ({ modelId, objectRuntimeIds }));
      await viewer?.setSelection({ modelObjectIds }, 'set');
      await viewer?.setCamera?.({ modelObjectIds }, { animationTime: 500 });
      setMsg(`✓ Märgistatud ja zoomitud ${matchingObjects.length} detailile mark'iga "${mark}".`);
    } catch (e: any) {
      setMsg("⛔ Zoom/märgistus ebaõnnestus: " + (e?.message || String(e)));
    }
  }
  function getExportData(row: Row, col: string) {
    if (col === "GUID") return row._objectId ? String(row._objectId) : "";
    if (col === "PROJECT NAME") return "ProjectX";
    return String(row[col] || "");
  }
  function exportData() {
    if (!rows.length) return;
    const allColumns = [...exportColumns, ...additionalExportFields];
    const separator = exportType === "excel" ? "\t" : ",";
    const csvHeaders = exportIncludeHeaders ? allColumns.join(separator) : '';
    const csvRows = rows.map(r =>
      allColumns.map(col => {
        const val = getExportData(r, col);
        return val.includes(separator) ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(separator)
    );
    const csv = [csvHeaders, ...csvRows].filter(Boolean).join("\n");
    const extension = exportType === "excel" ? "xls" : "csv";
    const mime = exportType === "excel" ? "application/vnd.ms-excel" : "text/csv";
    const blob = new Blob([csv], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan_${new Date().toISOString().slice(0, 10)}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`✓ Eksporditud ${exportType.toUpperCase()}-sse.`);
    setShowExportModal(false);
  }
  function copyToClipboard() {
    if (!rows.length) return;
    const allColumns = [...copyColumns, ...additionalExportFields];
    const csvHeaders = copyIncludeHeaders ? allColumns.join("\t") + '\n' : '';
    const csvRows = rows.map(r =>
      allColumns.map(col => getExportData(r, col)).join("\t")
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
      setMsg("⛔ Tabel on tühi.");
      return;
    }
    if (!markKey || !qtyKey) {
      setMsg("⛔ Vali Mark ja Kogus veerud.");
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
      setMsg("⛔ Viga vaate salvestamisel: " + (e?.message || "tundmatu viga"));
    }
  };
  const cancelSaveView = () => {
    setShowViewSave(false);
    setViewName("");
  };
  const hasInput = files.length > 0 || rawText.trim().length > 0;
 
  const modalOverlayStyle: React.CSSProperties = {
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
  };
  const modalContentStyle: React.CSSProperties = {
    background: COLORS.white,
    borderRadius: 8,
    padding: 24,
    maxWidth: 500,
    width: "90%",
    maxHeight: "90vh",
    overflow: "auto",
    boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
  };
  const modalHeadingStyle: React.CSSProperties = {
    margin: "0 0 16px 0",
    fontSize: 18,
    fontWeight: 600,
    color: COLORS.text
  };
  const btnPrimaryStyle: React.CSSProperties = {
    padding: "8px 16px",
    background: COLORS.primary,
    color: COLORS.white,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    transition: "background 0.2s"
  };
  const btnSecondaryStyle: React.CSSProperties = {
    padding: "8px 16px",
    background: COLORS.white,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13
  };
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rIdx: number, colIdx: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextRow = rIdx + 1;
      if (nextRow < rows.length) {
        const inputId = `input-${nextRow}-${colIdx}`;
        const nextInput = document.getElementById(inputId) as HTMLInputElement;
        if (nextInput) nextInput.focus();
      }
    }
  }
  const isLoading = busy || searchingModel;
  const loadingMessage = busy ? "Palun oota... Scannime infot" : "Palun oota... Otsime detaile";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: COLORS.text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: COLORS.text }}>magic</h3>
        <button
          style={{
            padding: "6px 12px",
            background: COLORS.background,
            color: COLORS.textLight,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
          }}
          onClick={() => setShowApiKeyModal(true)}
        >
          ⚙️ Seaded
        </button>
      </div>
      {/* API võtme modal UUENDATUD */}
      {showApiKeyModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={modalHeadingStyle}>🔑 OpenAI API võti</h3>
           
            {!apiKey && (
              <div style={{
                padding: "12px",
                background: "#e7f3ff",
                border: "1px solid #1E88E5",
                borderRadius: 6,
                marginBottom: 16,
                fontSize: 13,
                lineHeight: 1.5
              }}>
                <p style={{ margin: "0 0 8px 0", fontWeight: 600 }}>📘 Kuidas saada API võtit?</p>
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  <li>Mine <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.secondary, textDecoration: "underline" }}>OpenAI API Keys lehele</a></li>
                  <li>Logi sisse või loo konto</li>
                  <li>Vajuta "Create new secret key"</li>
                  <li>Kopeeri võti ja kleebi siia alla</li>
                </ol>
                <p style={{ margin: "8px 0 0 0", fontSize: 11, opacity: 0.8 }}>
                  💡 Võti salvestatakse turvaliselt sinu brauseris (localStorage)
                </p>
              </div>
            )}
           
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  localStorage.setItem('openai_api_key', apiKey);
                  setShowApiKeyModal(false);
                  setMsg("✅ API võti salvestatud.");
                }}
                style={{ ...btnPrimaryStyle, flex: 1 }}
              >
                Salvesta
              </button>
              <button
                onClick={() => setShowApiKeyModal(false)}
                style={{ ...btnSecondaryStyle, flex: 1 }}
              >
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleFileSelect(e.target.files)}
          style={{ display: "none" }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFileSelect(e.target.files)}
          style={{ display: "none" }}
        />
        <div
          ref={dropRef}
          onDrop={handleFileDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${COLORS.border}`,
            borderRadius: 8,
            padding: 20,
            textAlign: "center",
            marginBottom: 8,
            cursor: "pointer",
            background: COLORS.background,
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.secondary;
            e.currentTarget.style.background = COLORS.backgroundLight;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.background = COLORS.background;
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, marginBottom: 4 }}>
            📁 Lohista pilt siia või kliki valimiseks
          </div>
          <div style={{ fontSize: 11, color: COLORS.textLight }}>
            Või kleebi (Ctrl+V)
          </div>
        </div>
       
        {/* Kaamera nupp mobiilile */}
        <button
          className="camera-button"
          onClick={() => cameraInputRef.current?.click()}
          style={{
            padding: "8px 16px",
            background: COLORS.primary,
            color: COLORS.white,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            display: "none" // Nähtav ainult mobiilil CSS-i abil
          }}
        >
          📷 Kaamera
        </button>
       
        {/* CSS kaamera nupu nähtavuseks */}
        <style>{`
          @media (max-width: 767px) {
            .camera-button {
              display: block !important;
            }
          }
        `}</style>
        {imagePreview && (
          <div>
            <img
              src={imagePreview}
              alt="Preview"
              style={{ maxWidth: "100%", maxHeight: 150, borderRadius: 6, border: `1px solid ${COLORS.borderLight}`, cursor: "pointer" }}
              onClick={() => setShowImageModal(true)}
            />
          </div>
        )}
        {showImageModal && (
          <div style={modalOverlayStyle} onClick={() => setShowImageModal(false)}>
            <img src={imagePreview} alt="Large preview" style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 8 }} />
            <a
              href={imagePreview}
              download="scan_image.jpg"
              style={{ position: "absolute", bottom: 20, color: COLORS.white, background: COLORS.textLight, padding: "8px 16px", borderRadius: 6, textDecoration: "none" }}
            >
              Laadi alla
            </a>
          </div>
        )}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: COLORS.textLight }}>
            Veerud <span title="Kirjuta komaga eraldatud veergude nimed või numbrid">ℹ️</span>
          </label>
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "8px",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            background: COLORS.white,
            minHeight: 40
          }}>
            {targetColumns.split(',').filter(v => v.trim()).map((col, idx) => (
              <div key={idx} style={{
                padding: "4px 10px",
                background: COLORS.secondary,
                color: COLORS.white,
                borderRadius: 16,
                fontSize: 12,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 4
              }}>
                {col.trim()}
                <span
                  style={{ cursor: "pointer", marginLeft: 2, opacity: 0.8 }}
                  onClick={() => {
                    const cols = targetColumns.split(',').map(c => c.trim()).filter(Boolean);
                    cols.splice(idx, 1);
                    setTargetColumns(cols.join(', '));
                  }}
                >
                  ✕
                </span>
              </div>
            ))}
            <input
              value={tempColumn}
              onChange={(e) => setTempColumn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tempColumn.trim()) {
                  const current = targetColumns ? targetColumns + ', ' + tempColumn : tempColumn;
                  setTargetColumns(current);
                  setTempColumn('');
                }
              }}
              onBlur={() => {
                if (tempColumn.trim()) {
                  const current = targetColumns ? targetColumns + ', ' + tempColumn : tempColumn;
                  setTargetColumns(current);
                  setTempColumn('');
                }
              }}
              placeholder={targetColumns ? "Lisa..." : "Component, Pcs..."}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 13,
                minWidth: 100,
                background: "transparent"
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: COLORS.textLight, marginTop: 4 }}>
            Sisesta veergude nimed või vajuta Enter iga veeru järel
          </div>
        </div>
        <div>
          <button
            style={{
              width: "100%",
              padding: "8px 12px",
              background: COLORS.background,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
            onClick={() => setShowOcrPromptModal(true)}
          >
            <span>📝 Lisa OCR juhised {additionalPrompt && `(${additionalPrompt.length} tähemärki)`}</span>
            <span style={{ fontSize: 10, color: COLORS.textLight }}>▶</span>
          </button>
        </div>
        {showOcrPromptModal && (
          <div style={modalOverlayStyle}>
            <div style={modalContentStyle}>
              <h3 style={modalHeadingStyle}>📝 Lisa OCR juhised</h3>
              <p style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 12 }}>
                Lisa täiendavad juhised OCR-ile, nt "Loe täpselt T ja 5 erinevusega, numbrid on kogused."
              </p>
              <textarea
                value={additionalPrompt}
                onChange={(e) => setAdditionalPrompt(e.target.value)}
                placeholder="Kirjuta siia täiendavad juhised OCR-ile..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: "monospace",
                  height: 120,
                  marginBottom: 16,
                  resize: "vertical"
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowOcrPromptModal(false)}
                  style={{ ...btnPrimaryStyle, flex: 1 }}
                >
                  Salvesta
                </button>
                <button
                  onClick={() => {
                    setAdditionalPrompt("");
                    setShowOcrPromptModal(false);
                  }}
                  style={{ ...btnSecondaryStyle }}
                >
                  Tühjenda
                </button>
                <button
                  onClick={() => setShowOcrPromptModal(false)}
                  style={{ ...btnSecondaryStyle }}
                >
                  Tühista
                </button>
              </div>
            </div>
          </div>
        )}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: COLORS.textLight }}>
            Või kleebi tekst <span title="Kleebi siia eelnevalt kopeeritud tekst saatelehelt või mujalt.">ℹ️</span>
          </label>
          <textarea
            style={{ width: "100%", padding: "6px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13, fontFamily: "monospace", height: 100, resize: "vertical" }}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Tekst..."
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            style={{ ...btnPrimaryStyle }}
            disabled={busy}
            onClick={runOcr}
          >
            {busy ? "⏳ OCR..." : "🔍 OCR"}
          </button>
          {!hasInput && (
            <button
              style={{ ...btnSecondaryStyle }}
              onClick={loadSampleData}
            >
              📋 Näidis
            </button>
          )}
          <button
            style={{ ...btnSecondaryStyle }}
            onClick={() => {
              if (!rawText.trim()) {
                setMsg("⛔ Pole teksti.");
                return;
              }
              parseTextToTable(rawText);
            }}
          >
            ⚡ Parsi
          </button>
          <button
            style={{ ...btnSecondaryStyle }}
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
            padding: "12px",
            borderRadius: 6,
            fontSize: 13,
            background: "#ffebee",
            border: "1px solid #ef9a9a",
          }}>
            ⚠️ <strong>API võti puudub!</strong> OCR ei tööta ilma võtmeta. Vajuta üleval "⚙️ Seaded" nupule ja sisesta võti.
          </div>
        )}
        {msg && (
          <div style={{
            padding: "12px",
            borderRadius: 6,
            fontSize: 13,
            ...(msg.includes("⛔") ? { background: "#ffebee", border: "1px solid #ef9a9a" } :
                msg.includes("✅") || msg.includes("✓") ? { background: "#e8f5e9", border: "1px solid #a5d6a7" } :
                { background: COLORS.background, border: `1px solid ${COLORS.borderLight}` })
          }}>
            {msg}
          </div>
        )}
      </div>
      {showFindReplace && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={modalHeadingStyle}>🔄 Otsi ja asenda</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: COLORS.textLight }}>Otsi</label>
              <input
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="nt: ."
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: COLORS.textLight }}>Asenda</label>
              <input
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="nt: -"
                style={{ width: "100%", padding: "8px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={findAndReplace}
                style={{ ...btnPrimaryStyle, flex: 1 }}
              >
                ✓ Asenda
              </button>
              <button
                onClick={() => setShowFindReplace(false)}
                style={{ ...btnSecondaryStyle, flex: 1 }}
              >
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}
      {showSearchScopeModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={modalHeadingStyle}>🔍 Otsi mudelist</h3>
            <p style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 16 }}>
              Vali otsingu ulatus ja vajuta "Otsi" nuppu. Otsime automaatselt Kooste märgi (BLOCK) alusel.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", cursor: "pointer", padding: 12, border: `2px solid ${searchScope === "scopeAll" ? COLORS.secondary : COLORS.borderLight}`, borderRadius: 6, marginBottom: 8, background: searchScope === "scopeAll" ? "#e3f2fd" : COLORS.white }}>
                <input
                  type="radio"
                  checked={searchScope === "scopeAll"}
                  onChange={() => setSearchScope("scopeAll")}
                  style={{ marginRight: 8 }}
                />
                <strong>Kõik saadaval</strong>
                <div style={{ fontSize: 11, color: COLORS.textLight, marginLeft: 24, marginTop: 4 }}>
                  Otsi kõigist mudelis olevatest objektidest
                </div>
              </label>
              <label style={{ display: "block", cursor: "pointer", padding: 12, border: `2px solid ${searchScope === "scopeSelected" ? COLORS.secondary : COLORS.borderLight}`, borderRadius: 6, background: searchScope === "scopeSelected" ? "#e3f2fd" : COLORS.white }}>
                <input
                  type="radio"
                  checked={searchScope === "scopeSelected"}
                  onChange={() => setSearchScope("scopeSelected")}
                  style={{ marginRight: 8 }}
                />
                <strong>Valitud</strong>
                <div style={{ fontSize: 11, color: COLORS.textLight, marginLeft: 24, marginTop: 4 }}>
                  Otsi ainult 3D vaates valitud objektidest
                </div>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  setShowSearchScopeModal(false);
                  searchInModel();
                }}
                style={{ ...btnPrimaryStyle, flex: 1 }}
                disabled={searchingModel}
              >
                {searchingModel ? "🔍 Otsin..." : "🔍 Otsi"}
              </button>
              <button
                onClick={() => setShowSearchScopeModal(false)}
                style={{ ...btnSecondaryStyle, flex: 1 }}
              >
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}
      {/* UUENDATUD Veerud modal - sisaldab nüüd ka Mark ja Qty valikuid */}
      {showColumnsModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={modalHeadingStyle}>📊 Veergude haldamine</h3>
            {/* Mark ja Qty veergude valik */}
            <div style={{ marginBottom: 20, padding: 12, background: "#e7f3ff", borderRadius: 6, border: `1px solid ${COLORS.secondary}` }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600, color: COLORS.secondary }}>🔖 Põhiveerud</h4>
             
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: "block", fontSize: 11, color: COLORS.textLight, marginBottom: 4 }}>Mark veerg 📖</label>
                <select
                  value={markKey}
                  onChange={(e) => setMarkKey(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 12 }}
                >
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: COLORS.textLight, marginBottom: 4 }}>Kogus veerg 🔢</label>
                <select
                  value={qtyKey}
                  onChange={(e) => setQtyKey(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 12 }}
                >
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
            {/* Lisa uus veerg */}
            <div style={{ marginBottom: 20, padding: 12, background: COLORS.background, borderRadius: 6 }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600 }}>➕ Lisa veerg</h4>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Veeru nimi"
                  style={{ flex: 1, padding: "6px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 13 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newColumnName.trim()) {
                      addColumn();
                    }
                  }}
                />
                <button
                  onClick={addColumn}
                  disabled={!newColumnName.trim()}
                  style={{ ...btnPrimaryStyle, padding: "6px 12px" }}
                >
                  Lisa
                </button>
              </div>
            </div>
            {/* Kuva/Peida veerud */}
            <div style={{ marginBottom: 20, padding: 12, background: COLORS.background, borderRadius: 6 }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600 }}>👁️ Nähtavus</h4>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 150, overflowY: "auto" }}>
                {headers.map((h) => (
                  <label key={h} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(h)}
                      onChange={() => toggleColumn(h)}
                    />
                    <span>{h}</span>
                    {h === markKey && " 📖"}
                    {h === qtyKey && " 🔢"}
                  </label>
                ))}
              </div>
            </div>
            {/* Kustuta ja järjesta veerud */}
            <div style={{ marginBottom: 20, padding: 12, background: COLORS.background, borderRadius: 6 }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600 }}>🔄 Järjesta ja kustuta</h4>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {headers.map((h, idx) => (
                  <div key={h} style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 8px",
                    marginBottom: 4,
                    background: COLORS.white,
                    borderRadius: 4,
                    border: `1px solid ${COLORS.borderLight}`
                  }}>
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {h}
                      {h === markKey && " 📖"}
                      {h === qtyKey && " 🔢"}
                    </span>
                    <IconButton
                      icon="↑"
                      onClick={() => {
                        if (idx === 0) return;
                        const newHeaders = [...headers];
                        [newHeaders[idx - 1], newHeaders[idx]] = [newHeaders[idx], newHeaders[idx - 1]];
                        reorderColumns(newHeaders);
                      }}
                      disabled={idx === 0}
                      tooltip="Liiguta üles"
                      size="small"
                    />
                    <IconButton
                      icon="↓"
                      onClick={() => {
                        if (idx === headers.length - 1) return;
                        const newHeaders = [...headers];
                        [newHeaders[idx], newHeaders[idx + 1]] = [newHeaders[idx + 1], newHeaders[idx]];
                        reorderColumns(newHeaders);
                      }}
                      disabled={idx === headers.length - 1}
                      tooltip="Liiguta alla"
                      size="small"
                    />
                    <IconButton
                      icon="🗑"
                      onClick={() => removeColumn(h)}
                      disabled={h === markKey || h === qtyKey}
                      tooltip={h === markKey || h === qtyKey ? "Mark ja Kogus veerge ei saa kustutada" : "Kustuta veerg"}
                      variant="danger"
                      size="small"
                    />
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => setShowColumnsModal(false)}
              style={{ ...btnPrimaryStyle, width: "100%" }}
            >
              Valmis
            </button>
          </div>
        </div>
      )}
      {/* UUENDATUD Export modal - integratsioon AssemblyExporter stiil stiiliga */}
      {showExportModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={modalHeadingStyle}>📥 Ekspordi</h3>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={exportIncludeHeaders}
                onChange={(e) => setExportIncludeHeaders(e.target.checked)}
              />
              <span>Kaasa päised</span>
            </label>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: COLORS.textLight }}>Veerud</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 200, overflowY: "auto", padding: 4 }}>
                {headers.map((h) => (
                  <label key={h} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={exportColumns.includes(h)}
                      onChange={() => setExportColumns(prev => prev.includes(h) ? prev.filter(c => c !== h) : [...prev, h])}
                    />
                    <span>{h}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: COLORS.textLight }}>Täiendavad andmed</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["GUID", "PROJECT NAME", "ModelId", "_objectId", "_modelQuantity"].map(field => (
                  <label key={field} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={additionalExportFields.includes(field)}
                      onChange={() => setAdditionalExportFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field])}
                    />
                    <span>{field}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button onClick={() => { setExportType("csv"); exportData(); }} style={{ ...btnPrimaryStyle, flex: 1 }}>CSV</button>
              <button onClick={() => { setExportType("excel"); exportData(); }} style={{ ...btnPrimaryStyle, flex: 1 }}>EXCEL</button>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              style={{ ...btnSecondaryStyle, width: "100%" }}
            >
              Tühista
            </button>
          </div>
        </div>
      )}
      {/* Copy modal UUENDATUD - sama nagu export */}
      {showCopyModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={modalHeadingStyle}>📋 Kopeeri lõikelauale</h3>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={copyIncludeHeaders}
                onChange={(e) => setCopyIncludeHeaders(e.target.checked)}
              />
              <span>Kaasa päised</span>
            </label>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: COLORS.textLight }}>Veerud</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 200, overflowY: "auto", padding: 4 }}>
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
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: COLORS.textLight }}>Täiendavad andmed</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["GUID", "PROJECT NAME", "ModelId", "_objectId", "_modelQuantity"].map(field => (
                  <label key={field} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={additionalExportFields.includes(field)}
                      onChange={() => setAdditionalExportFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field])}
                    />
                    <span>{field}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={copyToClipboard}
                style={{ ...btnPrimaryStyle, flex: 1 }}
                disabled={copyColumns.length === 0}
              >
                Kopeeri
              </button>
              <button
                onClick={() => setShowCopyModal(false)}
                style={{ ...btnSecondaryStyle, flex: 1 }}
              >
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}
      {showViewSave && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={modalHeadingStyle}>💾 Salvesta vaatesse</h3>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: COLORS.textLight }}>Vaate nimi:</label>
            <input
              type="text"
              value={viewName}
              onChange={e => setViewName(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={saveView}
                style={{ ...btnPrimaryStyle, flex: 1 }}
                disabled={!viewName.trim()}
              >
                Salvesta vaade
              </button>
              <button
                onClick={cancelSaveView}
                style={{ ...btnSecondaryStyle, flex: 1 }}
              >
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Tabel */}
      {rows.length > 0 && (
        <div style={{ border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, padding: 12, background: COLORS.backgroundLight }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                style={{ ...btnPrimaryStyle, fontSize: 12 }}
                disabled={searchingModel}
                onClick={() => setShowSearchScopeModal(true)}
              >
                {searchingModel ? "🔍..." : "🔍 Otsi"}
              </button>
              <button
                style={{ ...btnSecondaryStyle, fontSize: 12, background: COLORS.secondary, color: COLORS.white, border: "none" }}
                disabled={!modelObjects.length}
                onClick={selectInModel}
              >
                🎯 Selecti
              </button>
              <button
                style={{ ...btnSecondaryStyle, fontSize: 12 }}
                onClick={() => setShowFindReplace(true)}
              >
                🔄 Otsi/Asenda
              </button>
              <button
                style={{ ...btnSecondaryStyle, fontSize: 12 }}
                onClick={() => {
                  setExportColumns([...headers]);
                  setAdditionalExportFields([]);
                  setShowExportModal(true);
                }}
              >
                📥 Eksport
              </button>
              <button
                style={{ ...btnSecondaryStyle, fontSize: 12 }}
                onClick={() => {
                  setCopyColumns([...headers]);
                  setAdditionalExportFields([]);
                  setShowCopyModal(true);
                }}
              >
                📋 Kopeeri
              </button>
              <button
                style={{ ...btnSecondaryStyle, fontSize: 12 }}
                onClick={initSaveView}
                disabled={!modelObjects.length}
              >
                💾 Salvesta
              </button>
             
              <button
                style={{ ...btnSecondaryStyle, fontSize: 12 }}
                onClick={() => setShowColumnsModal(true)}
              >
                📊 Veerud
              </button>
            </div>
          </div>
          {/* Kompaktsem statistika */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))",
            gap: 6,
            marginBottom: 12
          }}>
            <div style={{ padding: "4px 8px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, fontSize: 10, textAlign: "center" }}>
              <div style={{ fontWeight: 600, color: "#1e40af", fontSize: 12 }}>{totalRows}</div>
              <div style={{ color: "#1e40af" }}>Kokku</div>
            </div>
            {foundRows > 0 && (
              <div style={{ padding: "4px 8px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 4, fontSize: 10, textAlign: "center" }}>
                <div style={{ fontWeight: 600, color: "#15803d", fontSize: 12 }}>{foundRows}</div>
                <div style={{ color: "#15803d" }}>Leitud</div>
              </div>
            )}
            {notFoundRows > 0 && (
              <div style={{ padding: "4px 8px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 4, fontSize: 10, textAlign: "center" }}>
                <div style={{ fontWeight: 600, color: "#c2410c", fontSize: 12 }}>{notFoundRows}</div>
                <div style={{ color: "#c2410c" }}>Puudu</div>
              </div>
            )}
            {warningRows > 0 && (
              <div style={{ padding: "4px 8px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 4, fontSize: 10, textAlign: "center" }}>
                <div style={{ fontWeight: 600, color: "#dc2626", fontSize: 12 }}>{warningRows}</div>
                <div style={{ color: "#dc2626" }}>Hoiat.</div>
              </div>
            )}
            {qtyKey && totalSheetQty > 0 && (
              <div style={{ padding: "4px 8px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 4, fontSize: 10, textAlign: "center" }}>
                <div style={{ fontWeight: 600, color: "#92400e", fontSize: 12 }}>{totalSheetQty}</div>
                <div style={{ color: "#92400e" }}>Leht</div>
              </div>
            )}
            {totalModelQty > 0 && (
              <div style={{ padding: "4px 8px", background: "#f3e8ff", border: "1px solid #d8b4fe", borderRadius: 4, fontSize: 10, textAlign: "center" }}>
                <div style={{ fontWeight: 600, color: "#6b21a8", fontSize: 12 }}>{totalModelQty}</div>
                <div style={{ color: "#6b21a8" }}>Mudel</div>
              </div>
            )}
            {qtyMismatchRows > 0 && (
              <div style={{ padding: "4px 8px", background: "#ffedd5", border: "1px solid #fdba74", borderRadius: 4, fontSize: 10, textAlign: "center" }}>
                <div style={{ fontWeight: 600, color: "#ea580c", fontSize: 12 }}>{qtyMismatchRows}</div>
                <div style={{ color: "#ea580c" }}>Erinev</div>
              </div>
            )}
          </div>
          <div style={{ overflow: "auto", border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, maxWidth: "100%" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: `2px solid ${COLORS.borderLight}`, padding: "6px 4px", background: COLORS.background, position: "sticky", top: 0, zIndex: 10, width: "25px", fontSize: 10 }}>#</th>
                  <th style={{ textAlign: "center", borderBottom: `2px solid ${COLORS.borderLight}`, padding: "6px 4px", background: COLORS.background, position: "sticky", top: 0, width: "30px", zIndex: 10, fontSize: 10 }}>✓</th>
                  {displayColumns.map((key) => (
                    <th key={key} style={{
                      textAlign: "left",
                      borderBottom: `2px solid ${COLORS.borderLight}`,
                      padding: "6px",
                      background: COLORS.background,
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      fontSize: 11,
                      ...(key === markKey || key === qtyKey ? { width: "min-content", whiteSpace: "nowrap" } : {}),
                      ...(key === "_modelQuantity" ? { width: "60px" } : {})
                    }}>
                      {key === "_modelQuantity" ? "M.kogus" : key}
                    </th>
                  ))}
                  <th style={{ textAlign: "center", borderBottom: `2px solid ${COLORS.borderLight}`, padding: "6px 4px", background: COLORS.background, position: "sticky", top: 0, width: 90, zIndex: 10, fontSize: 10 }}>-</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const hasWarning = !!r._warning;
                  const notFound = r._foundInModel === false;
                  const found = r._foundInModel === true;
                  const rowBg = hasWarning ? "#fef2f2" : notFound ? "#fff7ed" : found ? "#f0fdf4" : (idx % 2 === 0 ? COLORS.white : "#fafafa");
                  const highlight = idx === movedRowIdx ? { background: "#d1fae5", transition: "background 1s ease-out" } : {};
                  return (
                    <tr
                      key={idx}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      style={{ background: rowBg, ...highlight }}
                    >
                      <td style={{ padding: "4px", borderBottom: `1px solid ${COLORS.borderLight}`, textAlign: "center", opacity: 0.5, fontWeight: 600, fontSize: 10 }}>{idx + 1}</td>
                      <td style={{ padding: "4px", borderBottom: `1px solid ${COLORS.borderLight}`, textAlign: "center", fontSize: 12 }} title={r._warning}>
                        {hasWarning ? "⚠️" : notFound ? "⛔" : found ? "✅" : ""}
                      </td>
                      {displayColumns.map((key, colIdx) => (
                        <td key={key} style={{ padding: "4px 6px", borderBottom: `1px solid ${COLORS.borderLight}`, wordBreak: "break-word" }}>
                          <input
                            id={`input-${idx}-${colIdx}`}
                            value={r[key] || ""}
                            onChange={(e) => changeCell(idx, key, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
                            style={{
                              width: "100%",
                              maxWidth: "100%",
                              boxSizing: "border-box",
                              padding: "4px 6px",
                              border: (r[key] === "???" ? "2px solid #f59e0b" : `1px solid ${COLORS.borderLight}`),
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
                      <td style={{ padding: "2px", borderBottom: `1px solid ${COLORS.borderLight}`, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                          <IconButton icon="↑" onClick={() => moveRowUp(idx)} tooltip="Liiguta üles" size="small" disabled={idx === 0} />
                          <IconButton icon="↓" onClick={() => moveRowDown(idx)} tooltip="Liiguta alla" size="small" disabled={idx === rows.length - 1} />
                          <IconButton icon="×" onClick={() => removeRow(idx)} tooltip="Kustuta" variant="danger" size="small" />
                          {r._foundInModel && r.modelId && r._objectId && (
                            <IconButton icon="🔎" onClick={() => zoomToRow(r)} tooltip="Zoom" variant="info" size="small" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            <button
              style={{ ...btnSecondaryStyle }}
              onClick={addRow}
            >
              ➕ Lisa rida
            </button>
            <div style={{ marginLeft: "auto", fontSize: 11, color: COLORS.textLight }}>
              Otsingusse: <strong>{previewMarks.length}</strong> kirjet
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              style={{
                width: "100%",
                padding: "12px",
                background: (warningRows > 0 || notFoundRows > 0) ? COLORS.textLight : COLORS.primary,
                color: COLORS.white,
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
              <div style={{ marginTop: 6, fontSize: 12, color: COLORS.error, textAlign: "center" }}>
                ⚠️ Parandamist vajavad read - vajuta ikkagi kinnitamiseks
              </div>
            )}
          </div>
        </div>
      )}
      {isLoading && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001 }}>
          <div style={{ background: COLORS.white, padding: 20, borderRadius: 10, fontSize: 16, fontWeight: 600, color: COLORS.text }}>
            {loadingMessage}
          </div>
        </div>
      )}
    </div>
  );
}
