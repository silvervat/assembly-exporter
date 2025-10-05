import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

/* =========================================================
   CONSTANTS / TYPES
   ========================================================= */

type Tab = "search" | "discover" | "export" | "settings" | "about";
type Row = Record<string, string>;

const LOCKED_ORDER = [
  "GUID",
  "GUID_IFC",
  "GUID_MS",
  "Project",
  "ModelId",
  "FileName",
  "Name",
  "Type",
  "BLOCK",
] as const;
type LockedKey = (typeof LOCKED_ORDER)[number];

const FORCE_TEXT_KEYS = new Set<string>([
  "Tekla_Assembly.AssemblyCast_unit_top_elevation",
  "Tekla_Assembly.AssemblyCast_unit_bottom_elevation",
]);

const DEBOUNCE_MS = 300;

/* =========================================================
   SETTINGS
   ========================================================= */

type DefaultPreset = "recommended" | "tekla" | "ifc";

type ColorName =
  | "darkred"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

interface AppSettings {
  scriptUrl: string;
  secret: string;
  autoColorize: boolean;
  defaultPreset: DefaultPreset;
  colorName: ColorName;
}

const COLOR_MAP: Record<ColorName, { r: number; g: number; b: number; a: number }> =
  {
    darkred: { r: 140, g: 0, b: 0, a: 255 },
    red: { r: 220, g: 0, b: 0, a: 255 },
    orange: { r: 255, g: 140, b: 0, a: 255 },
    yellow: { r: 240, g: 200, b: 0, a: 255 },
    green: { r: 0, g: 160, b: 80, a: 255 },
    blue: { r: 0, g: 120, b: 220, a: 255 },
    purple: { r: 130, g: 70, b: 200, a: 255 },
  };

function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("assemblyExporterSettings");
    if (saved) {
      try {
        return JSON.parse(saved) as AppSettings;
      } catch {}
    }
    return {
      scriptUrl: localStorage.getItem("sheet_webapp") || "",
      secret:
        localStorage.getItem("sheet_secret") ||
        "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU",
      autoColorize: true,
      defaultPreset: "recommended",
      colorName: (localStorage.getItem("assy_color") as ColorName) || "darkred",
    };
  });

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    localStorage.setItem("assemblyExporterSettings", JSON.stringify(next));
    localStorage.setItem("sheet_webapp", next.scriptUrl || "");
    localStorage.setItem("sheet_secret", next.secret || "");
    localStorage.setItem("assy_color", next.colorName || "darkred");
  };

  return [settings, update] as const;
}

/* =========================================================
   UTILS
   ========================================================= */

function sanitizeKey(s: string) {
  return String(s).replace(/\s+/g, "_").replace(/[^\w.-]/g, "").trim();
}

function groupSortKey(group: string) {
  const g = group.toLowerCase();
  if (g === "data") return 0;
  if (g === "reference_object") return 1;
  if (g.startsWith("tekla_assembly")) return 2;
  return 10;
}

type Grouped = Record<string, string[]>;

function groupKeys(keys: string[]): Grouped {
  const g: Grouped = {};
  for (const k of keys) {
    const dot = k.indexOf(".");
    const grp = dot > 0 ? k.slice(0, dot) : "Other";
    if (!g[grp]) g[grp] = [];
    g[grp].push(k);
  }
  for (const arr of Object.values(g)) arr.sort((a, b) => a.localeCompare(b));
  return g;
}

function isNumericString(s: string) {
  return /^[-+]?(\d+|\d*\.\d+)(e[-+]?\d+)?$/i.test(s.trim());
}

function normaliseNumberString(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  const r = Math.round(n);
  if (Math.abs(n - r) < 1e-9) return String(r);
  return String(parseFloat(n.toFixed(4)));
}

/* =========================================================
   PROPERTY SETS + GUIDS
   ========================================================= */

type TCProperty = { name: string; value: unknown };
type TCPropertySet = { name: string; properties: TCProperty[] };

function collectAllPropertySets(obj: any): TCPropertySet[] {
  const official: TCPropertySet[] = [
    ...(Array.isArray(obj?.propertySets) ? obj.propertySets : []),
    ...(Array.isArray(obj?.propertySetLibraries)
      ? obj.propertySetLibraries
      : []),
  ];
  const fallbacks: TCPropertySet[] = [
    ...(Array.isArray(obj?.properties) ? obj.properties : []),
    ...(Array.isArray(obj?.psets) ? obj.psets : []),
    ...(Array.isArray(obj?.libraries) ? obj.libraries : []),
    ...(Array.isArray(obj?.customProperties) ? obj.customProperties : []),
  ];
  return [...official, ...fallbacks].filter(
    (s): s is TCPropertySet => !!s && Array.isArray((s as any).properties)
  );
}

function classifyGuid(val: string): "IFC" | "MS" | "UNKNOWN" {
  const s = val.trim();
  if (/^[0-9A-Za-z_$]{22}$/.test(s)) return "IFC";
  if (
    /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(
      s
    )
  )
    return "MS";
  if (/^[0-9A-Fa-f]{32}$/.test(s)) return "MS";
  return "UNKNOWN";
}

function deepScanForGuidAndMeta(
  node: any,
  acc: {
    ifc?: string;
    ms?: string;
    any?: string;
    file?: string;
    commonType?: string;
  } = {}
) {
  if (!node || typeof node !== "object") return acc;
  for (const [k, v] of Object.entries(node)) {
    if (/guid/i.test(k)) {
      const s = v == null ? "" : String(v);
      const cls = classifyGuid(s);
      if (cls === "IFC" && !acc.ifc) acc.ifc = s;
      else if (cls === "MS" && !acc.ms) acc.ms = s;
      else if (!acc.any) acc.any = s;
    }
    if (!acc.file && /(file\s*name|filename)/i.test(k))
      acc.file = v == null ? "" : String(v);
    if (!acc.commonType && /(common.*type)/i.test(k))
      acc.commonType = v == null ? "" : String(v);
    if (v && typeof v === "object") deepScanForGuidAndMeta(v, acc);
  }
  return acc;
}

function flattenProps(obj: any, modelId: string, projectName: string): Row {
  const out: Row = {
    GUID: "",
    GUID_IFC: "",
    GUID_MS: "",
    Project: String(projectName),
    ModelId: String(modelId),
    FileName: "",
    Name: "",
    Type: "Unknown",
    BLOCK: "",
  };

  const propMap = new Map<string, string>();
  const rawNames: Array<{ group: string; name: string; value: unknown }> = [];

  const push = (group: string, name: string, val: unknown) => {
    const key = `${sanitizeKey(group)}.${sanitizeKey(name)}`;
    let v: unknown = val;
    if (Array.isArray(v))
      v = (v as unknown[])
        .map((x) => (x == null ? "" : String(x)))
        .join(" | ");
    else if (typeof v === "object" && v !== null) v = JSON.stringify(v);
    const s = v == null ? "" : String(v);
    propMap.set(key, s);
    out[key] = s;
  };

  const sets = collectAllPropertySets(obj);
  for (const set of sets) {
    const g = set?.name || "Group";
    for (const p of set?.properties ?? []) {
      const nm = (p as any)?.name ?? "Prop";
      const vv = (p as any)?.value;
      rawNames.push({ group: g, name: nm, value: vv });
      push(g, nm, vv);
      if (!out.Name && /^(name|object[_\s]?name)$/i.test(String(nm)))
        out.Name = String(vv ?? "");
      if (out.Type === "Unknown" && /\btype\b/i.test(String(nm)))
        out.Type = String(vv ?? "Unknown");
    }
  }

  // FileName
  const fileKeyCandidates = [
    "Reference_Object.File_Name",
    "Reference_Object.FileName",
    "IFC.File_Name",
  ];
  for (const k of fileKeyCandidates) {
    if (propMap.has(k)) {
      out.FileName = propMap.get(k)!;
      break;
    }
  }
  if (!out.FileName) {
    for (const r of rawNames) {
      if (
        /^file\s*name$/i.test(String(r.name)) &&
        /reference/i.test(String(r.group))
      ) {
        out.FileName = r.value == null ? "" : String(r.value);
        break;
      }
    }
  }

  // BLOCK
  const blockCandidates = [
    "DATA.BLOCK",
    "BLOCK.BLOCK",
    "BLOCK.BLOCK_2",
    "Tekla_Assembly.AssemblyCast_unit_Mark",
  ];
  for (const k of blockCandidates) {
    if (propMap.has(k)) {
      out.BLOCK = propMap.get(k)!;
      break;
    }
  }

  // GUIDs
  let guidIfc = "";
  let guidMs = "";
  for (const [k, v] of propMap) {
    if (!/guid/i.test(k)) continue;
    const cls = classifyGuid(v);
    if (cls === "IFC" && !guidIfc) guidIfc = v;
    if (cls === "MS" && !guidMs) guidMs = v;
  }
  if (!guidIfc || !guidMs) {
    for (const r of rawNames) {
      if (!/guid/i.test(String(r.name))) continue;
      const val = r.value == null ? "" : String(r.value);
      const cls = classifyGuid(val);
      if (cls === "IFC" && !guidIfc) guidIfc = val;
      if (cls === "MS" && !guidMs) guidMs = val;
    }
  }
  out.GUID_IFC = guidIfc;
  out.GUID_MS = guidMs;
  out.GUID = guidIfc || guidMs || "";

  if (!out.GUID || !out.GUID_IFC || !out.GUID_MS || !out.FileName) {
    const found = deepScanForGuidAndMeta(obj);
    if (!out.GUID_IFC && found.ifc) out.GUID_IFC = found.ifc;
    if (!out.GUID_MS && found.ms) out.GUID_MS = found.ms;
    if (!out.GUID) out.GUID = found.ifc || found.ms || found.any || out.GUID;
    if (!out.FileName && found.file) out.FileName = found.file;
  }

  return out;
}

async function getProjectName(api: any): Promise<string> {
  try {
    if (typeof api?.project?.getProject === "function") {
      const proj = await api.project.getProject();
      if (proj?.name) return String(proj.name);
    }
  } catch {}
  return "";
}

async function getCurrentSelectionBlocks(
  api: any
): Promise<{ modelId: string; ids: number[] }[]> {
  try {
    const sel = await api?.viewer?.getSelection?.();
    if (Array.isArray(sel) && sel.length) {
      return sel
        .map((m: any) => ({
          modelId: String(m.modelId),
          ids: (m.objectRuntimeIds || []).slice(),
        }))
        .filter((b: any) => b.ids.length);
    }
  } catch {}

  // try property panel fallback
  const tryPP = async (host: any) => {
    try {
      const data = await host?.getPropertyPanelData?.();
      const ents = data?.entities || data?.items || [];
      if (Array.isArray(ents) && ents.length) {
        return ents
          .map((e: any) => ({
            modelId: String(e.modelId),
            ids: (e.objectRuntimeIds || e.selection || []).slice(),
          }))
          .filter((b: any) => b.ids.length);
      }
    } catch {}
    return [];
  };

  for (const host of [
    api,
    (api as any)?.propertyPanel,
    (api as any)?.detailsPanel,
    (api as any)?.panel,
  ]) {
    const blocks = await tryPP(host);
    if (blocks.length) return blocks;
  }

  return [];
}

/* =========================================================
   COMPONENT
   ========================================================= */

type Props = { api: any };

export default function AssemblyExporter({ api }: Props) {
  const [settings, updateSettings] = useSettings();

  const [tab, setTab] = useState<Tab>("search");

  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    new Set<string>(JSON.parse(localStorage.getItem("fieldSel") || "[]"))
  );

  const [filter, setFilter] = useState<string>("");
  const [debouncedFilter, setDebouncedFilter] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filter]);

  const [busy, setBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string>("");
  const [settingsMsg, setSettingsMsg] = useState<string>("");
  const [progress, setProgress] = useState<{ current: number; total: number }>(
    { current: 0, total: 0 }
  );

  const [lastSelection, setLastSelection] = useState<
    Array<{ modelId: string; ids: number[] }>
  >([]);

  // SEARCH
  const [markPaste, setMarkPaste] = useState<string>("");
  const [searchMsg, setSearchMsg] = useState<string>("");

  // EXPORT options
  type ExportFormat = "clipboard-tsv" | "csv" | "xlsx";
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const [order, setOrder] = useState<string[]>([]);

  const allKeys: string[] = useMemo(
    () => Array.from(new Set(rows.flatMap((r: Row) => Object.keys(r)))).sort(),
    [rows]
  );

  const groupedUnsorted: Grouped = useMemo(() => groupKeys(allKeys), [allKeys]);

  const groupedSortedEntries = useMemo(
    () =>
      (Object.entries(groupedUnsorted) as [string, string[]][]).sort(
        (a, b) =>
          groupSortKey(a[0]) - groupSortKey(b[0]) || a[0].localeCompare(b[0])
      ),
    [groupedUnsorted]
  );

  const filteredKeysSet = useMemo(() => {
    if (!debouncedFilter) return new Set(allKeys);
    const f = debouncedFilter.toLowerCase();
    return new Set(allKeys.filter((k) => k.toLowerCase().includes(f)));
  }, [allKeys, debouncedFilter]);

  useEffect(() => {
    localStorage.setItem("fieldSel", JSON.stringify(Array.from(selected)));
  }, [selected]);

  useEffect(() => {
    if (!rows.length) return;
    if (!order.length) {
      const base = [
        ...LOCKED_ORDER,
        ...Array.from(new Set(rows.flatMap((r) => Object.keys(r)))),
      ];
      setOrder(base.filter((k, i) => base.indexOf(k) === i));
    }
    if (selected.size) return;
    if (settings.defaultPreset === "tekla") presetTekla();
    else if (settings.defaultPreset === "ifc") presetIFC();
    else presetRecommended();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const matches = (k: string) => filteredKeysSet.has(k);

  function toggle(k: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }

  function toggleGroup(keys: string[], on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      for (const k of keys) on ? n.add(k) : n.delete(k);
      return n;
    });
  }

  function selectAll(on: boolean) {
    setSelected(() => (on ? new Set(allKeys) : new Set()));
  }

  function presetRecommended() {
    const wanted = new Set<string>([
      ...LOCKED_ORDER,
      "Reference_Object.Common_Type",
      "Reference_Object.File_Name",
    ]);
    setSelected(new Set(allKeys.filter((k) => wanted.has(k))));
  }

  function presetTekla() {
    setSelected(
      new Set(
        allKeys.filter(
          (k) =>
            k.startsWith("Tekla_Assembly.") ||
            k === "BLOCK" ||
            k === "Reference_Object.File_Name"
        )
      )
    );
  }

  function presetIFC() {
    const wanted = new Set<string>([
      "GUID_IFC",
      "GUID_MS",
      "Reference_Object.Common_Type",
      "Reference_Object.File_Name",
    ]);
    setSelected(new Set(allKeys.filter((k) => wanted.has(k))));
  }

  async function discover() {
    try {
      setBusy(true);
      setExportMsg("Reading current selection…");
      setProgress({ current: 0, total: 0 });

      const blocks = await getCurrentSelectionBlocks(api);
      if (!blocks.length) {
        setExportMsg("⚠️ Please select objects in the models first.");
        setRows([]);
        return;
      }

      const timeout = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("Discovery timeout after 30s")), 30000)
      );

      const projectName = await getProjectName(api);
      const perform = async () => {
        const out: Row[] = [];
        setProgress({ current: 0, total: blocks.length });

        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          setExportMsg(`Processing model ${i + 1}/${blocks.length}…`);
          const props: any[] = await (api as any).viewer.getObjectProperties(
            b.modelId,
            b.ids
          );
          out.push(
            ...props.map((o: any) => flattenProps(o, b.modelId, projectName))
          );
          setProgress({ current: i + 1, total: blocks.length });
        }
        return out;
      };

      const collected = await Promise.race([perform(), timeout]);
      setRows(collected);
      setLastSelection(blocks);
      setExportMsg(
        `Found ${collected.length} objects. Total keys: ${
          Array.from(new Set(collected.flatMap((r) => Object.keys(r)))).length
        }.`
      );
    } catch (e: any) {
      console.error("Discovery error:", e);
      setExportMsg(`❌ Error: ${e?.message || "Unknown error during discovery"}`);
    } finally {
      setBusy(false);
    }
  }

  function orderRowByLockedAndAlpha(r: Row, chosen: Set<string>): Row {
    const o: Row = {};
    for (const k of LOCKED_ORDER) if (k in r) o[k] = r[k];
    const rest = Array.from(chosen).filter(
      (k) => !(LOCKED_ORDER as readonly string[]).includes(k as LockedKey)
    );
    rest.sort((a, b) => a.localeCompare(b));
    for (const k of rest) if (k in r) o[k] = r[k];
    return o;
  }

  function validateRows(input: Row[]): { valid: Row[]; errors: string[] } {
    const valid: Row[] = [];
    const errors: string[] = [];
    input.forEach((row, idx) => {
      const rowErrors: string[] = [];
      if (!row.GUID && !row.GUID_IFC && !row.GUID_MS)
        rowErrors.push("Missing all GUID fields");
      if (!row.Name?.trim()) rowErrors.push("Missing Name");
      if (rowErrors.length)
        errors.push(`Row ${idx + 1}: ${rowErrors.join(", ")}`);
      else valid.push(row);
    });
    return { valid, errors };
  }

  async function send() {
    const { scriptUrl, secret, autoColorize } = settings;

    if (!scriptUrl || !secret) {
      setTab("settings");
      setSettingsMsg("Please fill Script URL and Shared Secret.");
      return;
    }
    if (!rows.length) {
      setTab("discover");
      setExportMsg('Click "Discover fields" first.');
      return;
    }

    const { errors: validationErrors } = validateRows(rows);
    if (validationErrors.length)
      console.warn("Validation warnings:", validationErrors);

    const warnRows = rows.map((r) => {
      const warn: string[] = [];
      if (!r.GUID) warn.push("Missing GUID");
      const copy: Row = { ...r };
      if (warn.length) (copy as any)["__warnings"] = warn.join("; ");
      return copy;
    });

    const numericSkip = new Set<string>([
      "GUID",
      "GUID_IFC",
      "GUID_MS",
      "Project",
      "Name",
      "Type",
      "FileName",
    ]);
    const cleaned = warnRows.map((r) => {
      const c: Row = {};
      for (const [k, v] of Object.entries(r) as [string, string][]) {
        if (
          FORCE_TEXT_KEYS.has(k) &&
          typeof v === "string" &&
          !v.startsWith("'")
        ) {
          c[k] = `'${v}`;
        } else if (
          typeof v === "string" &&
          !numericSkip.has(k) &&
          isNumericString(v)
        ) {
          c[k] = normaliseNumberString(v);
        } else {
          c[k] = v as string;
        }
      }
      return c;
    });

    const chosen = new Set<string>(
      [...LOCKED_ORDER, ...Array.from(selected), "__warnings"].filter(
        (k) =>
          allKeys.includes(k) ||
          (LOCKED_ORDER as readonly string[]).includes(k as any) ||
          k === "__warnings"
      )
    );

    const payload = cleaned.map((r) => orderRowByLockedAndAlpha(r, chosen));
    const missing = cleaned.filter((r) => !r.GUID).length;
    if (missing)
      setExportMsg(`⚠️ ${missing} row(s) without GUID – added __warnings.`);

    try {
      setBusy(true);
      setExportMsg("Sending rows to Google Sheet…");
      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows: payload }),
      });
      const data = await res.json();
      setTab("export");
      if (data?.ok) {
        const extra =
          validationErrors.length > 0
            ? ` (${validationErrors.length} validation warning(s))`
            : "";
        setExportMsg(
          `✅ Added ${payload.length} row(s) to Google Sheet${extra}.` +
            (autoColorize ? " Coloring selection…" : "")
        );
        if (autoColorize) await colorLastSelection();
      } else {
        setExportMsg(`❌ Error: ${data?.error || "unknown"}`);
      }
    } catch (e: any) {
      setTab("export");
      setExportMsg(`❌ Error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function colorLastSelection() {
    const viewer: any = (api as any).viewer;
    let blocks = lastSelection;
    if (!blocks?.length) blocks = await getCurrentSelectionBlocks(api);
    if (!blocks?.length) return;

    const rgba = COLOR_MAP[settings.colorName];
    for (const b of blocks) {
      await viewer.setObjectState(
        { modelObjectIds: [{ modelId: b.modelId, objectRuntimeIds: b.ids }] },
        { color: rgba }
      );
    }
  }

  async function resetState() {
    try {
      const viewer: any = (api as any).viewer;
      if (typeof viewer?.resetObjectState === "function")
        await viewer.resetObjectState();
      else if (typeof viewer?.clearObjectStates === "function")
        await viewer.clearObjectStates();
      else if (typeof viewer?.clearColors === "function")
        await viewer.clearColors();
      setExportMsg("View state reset.");
    } catch (e: any) {
      setExportMsg(`Reset failed: ${e?.message || e}`);
    }
  }

  /* ---------- EXPORT BUILDERS ---------- */

  function buildMatrix(): { headers: string[]; rows: string[][] } {
    const chosen = [
      ...LOCKED_ORDER,
      ...order.filter((k) => !(LOCKED_ORDER as readonly string[]).includes(k as any)),
    ].filter(
      (k) =>
        (selected.size ? selected.has(k) || (LOCKED_ORDER as readonly string[]).includes(k as any) : true) &&
        allKeys.includes(k as any)
    );
    const headers = chosen;
    const data = rows.map((r) => chosen.map((k) => String(r[k] ?? "")));
    return { headers, rows: data };
  }

  function download(name: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doExport() {
    if (!rows.length) return;
    const { headers, rows: data } = buildMatrix();

    if (exportFormat === "clipboard-tsv") {
      const tsv =
        [headers.join("\t")]
          .concat(data.map((r) => r.map((x) => x.replace(/\t/g, " ")).join("\t")))
          .join("\n");
      await navigator.clipboard.writeText(tsv);
      setExportMsg("✅ Kopeeritud lõikelauale (TSV).");
      return;
    }

    if (exportFormat === "csv") {
      const csv =
        [headers.join(",")]
          .concat(data.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")))
          .join("\n");
      download(
        `assembly-export-${new Date().toISOString().slice(0, 10)}.csv`,
        new Blob([csv], { type: "text/csv" })
      );
      setExportMsg("✅ CSV allalaetud.");
      return;
    }

    // XLSX – päris Exceli fail
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    download(
      `assembly-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
      new Blob([wbout], {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    setExportMsg("✅ Excel (XLSX) allalaetud.");
  }

  /* ---------- SEARCH (by Assembly Mark) ---------- */

  function parseMarks(paste: string): string[] {
    return paste
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\s+/g, ""));
  }

  function readMarkFromFlatObject(o: any): string {
    const direct = o?.["Tekla_Assembly.AssemblyCast_unit_Mark"];
    if (typeof direct === "string" && direct) return direct;
    const sets = collectAllPropertySets(o);
    for (const s of sets) {
      for (const p of s.properties || []) {
        const nm = String((p as any).name || "");
        if (
          /^AssemblyCast[_\s]?unit[_\s]?Mark$/i.test(nm) &&
          /Tekla[_\s]?Assembly/i.test(String(s.name || ""))
        ) {
          return String((p as any).value ?? "");
        }
      }
    }
    return "";
  }

  async function findAndSelectByMarks() {
    try {
      setBusy(true);
      setSearchMsg("Otsin…");
      const wanted = new Set(parseMarks(markPaste));
      if (!wanted.size) {
        setSearchMsg("Pole midagi otsida.");
        return;
      }

      // Kasuta olemasolevat selection’i propsideks (odavaim tee)
      let blocks = await getCurrentSelectionBlocks(api);
      if (!blocks.length) {
        setSearchMsg("Vali enne mudelist tükk ja proovi uuesti (kasutan seda ‘ankruna’ omaduste lugemiseks).");
        return;
      }

      const viewer: any = api?.viewer;
      const projectName = await getProjectName(api);
      const foundBlocks: Array<{ modelId: string; ids: number[] }> = [];
      let foundCount = 0;

      for (const b of blocks) {
        const props: any[] = await viewer.getObjectProperties(b.modelId, b.ids);
        const ids: number[] = [];
        for (const p of props) {
          const flat = flattenProps(p, b.modelId, projectName);
          const m = (flat["Tekla_Assembly.AssemblyCast_unit_Mark"] || "")
            .replace(/\s+/g, "");
          if (m && wanted.has(m)) {
            const rid = Number((p as any)?.objectRuntimeId ?? (p as any)?.id);
            if (Number.isFinite(rid)) ids.push(rid);
          }
        }
        if (ids.length) {
          foundBlocks.push({ modelId: b.modelId, ids });
          foundCount += ids.length;
        }
      }

      if (foundBlocks.length) {
        await viewer.setSelection(
          {
            modelObjectIds: foundBlocks.map((fb) => ({
              modelId: fb.modelId,
              objectRuntimeIds: fb.ids,
            })),
          },
          "replace"
        );
        setLastSelection(foundBlocks);
        setSearchMsg(`✅ Leitud/valitud ${foundCount} objekti (${foundBlocks.length} mudelist).`);
        if (settings.autoColorize) await colorLastSelection();
      } else {
        setSearchMsg("Ei leidnud vastet praeguse valiku sees. Tee ‘Discover’ ja kontrolli, mis väärtused reas on.");
      }
    } catch (e: any) {
      setSearchMsg(`❌ Otsing ebaõnnestus: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  const c = styles;

  return (
    <div style={c.shell}>
      <div style={c.topbar}>
        <button
          style={{ ...c.tab, ...(tab === "search" ? c.tabActive : {}) }}
          onClick={() => setTab("search")}
        >
          SEARCH
        </button>
        <button
          style={{ ...c.tab, ...(tab === "discover" ? c.tabActive : {}) }}
          onClick={() => setTab("discover")}
        >
          DISCOVER
        </button>
        <button
          style={{ ...c.tab, ...(tab === "export" ? c.tabActive : {}) }}
          onClick={() => setTab("export")}
        >
          EXPORT
        </button>
        <button
          style={{ ...c.tab, ...(tab === "settings" ? c.tabActive : {}) }}
          onClick={() => setTab("settings")}
        >
          SETTINGS
        </button>
        <button
          style={{ ...c.tab, ...(tab === "about" ? c.tabActive : {}) }}
          onClick={() => setTab("about")}
        >
          ABOUT
        </button>
      </div>

      <div style={c.page}>
        {/* SETTINGS */}
        {tab === "settings" && (
          <div style={c.section}>
            <div style={c.row}>
              <label style={c.label}>Google Apps Script URL</label>
              <input
                value={settings.scriptUrl}
                onChange={(e) => updateSettings({ scriptUrl: e.target.value })}
                placeholder="https://…/exec"
                style={c.input}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Shared Secret</label>
              <input
                type="password"
                value={settings.secret}
                onChange={(e) => updateSettings({ secret: e.target.value })}
                style={c.input}
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Auto colorize</label>
              <input
                type="checkbox"
                checked={settings.autoColorize}
                onChange={(e) =>
                  updateSettings({ autoColorize: e.target.checked })
                }
              />
            </div>
            <div style={c.row}>
              <label style={c.label}>Värv</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                <span
                  title={settings.colorName}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: "1px solid #cfd6df",
                    background: `rgba(${COLOR_MAP[settings.colorName].r},${COLOR_MAP[settings.colorName].g},${COLOR_MAP[settings.colorName].b},1)`,
                  }}
                />
                <select
                  value={settings.colorName}
                  onChange={(e) =>
                    updateSettings({ colorName: e.target.value as ColorName })
                  }
                  style={{ ...c.input, flex: 1 }}
                >
                  <option value="darkred">Tumepunane</option>
                  <option value="red">Punane</option>
                  <option value="orange">Oranž</option>
                  <option value="yellow">Kollane</option>
                  <option value="green">Roheline</option>
                  <option value="blue">Sinine</option>
                  <option value="purple">Lilla</option>
                </select>
              </div>
            </div>
            <div style={c.row}>
              <label style={c.label}>Default preset</label>
              <select
                value={settings.defaultPreset}
                onChange={(e) =>
                  updateSettings({
                    defaultPreset: e.target.value as DefaultPreset,
                  })
                }
                style={c.input}
              >
                <option value="recommended">Recommended</option>
                <option value="tekla">Tekla Assembly</option>
                <option value="ifc">IFC Reference</option>
              </select>
            </div>
            <div style={{ ...c.row, justifyContent: "flex-end" }}>
              <button
                style={c.btn}
                onClick={() => setSettingsMsg("Settings saved.")}
              >
                Save
              </button>
              <button
                style={c.btnGhost}
                onClick={() => {
                  localStorage.removeItem("assemblyExporterSettings");
                  updateSettings({
                    scriptUrl: "",
                    secret: "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU",
                    autoColorize: true,
                    defaultPreset: "recommended",
                    colorName: "darkred",
                  });
                  setSettingsMsg("Settings reset.");
                }}
              >
                Reset
              </button>
            </div>
            {!!settingsMsg && <div style={c.note}>{settingsMsg}</div>}
          </div>
        )}

        {/* ABOUT */}
        {tab === "about" && (
          <div style={c.section}>
            <div style={c.small}>
              Assembly Exporter – Trimble Connect → Google Sheet & Excel.
              <br />
              • Search by Assembly Mark • Discover fields (PSL priority)
              <br />
              • GUID + GUID_IFC + GUID_MS • Number normalisation
              <br />
              • Colorize (custom color) & Reset • Presets • Locked column order
            </div>
          </div>
        )}

        {/* DISCOVER */}
        {tab === "discover" && (
          <div style={c.section}>
            <div style={c.controls}>
              <button style={c.btn} onClick={discover} disabled={busy}>
                {busy ? "…" : "Discover fields"}
              </button>
              <input
                placeholder="Filter columns…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ ...c.input, flex: 1, minWidth: 120 }}
              />
              <button
                style={c.btnGhost}
                onClick={() => selectAll(true)}
                disabled={!rows.length}
              >
                Select all
              </button>
              <button
                style={c.btnGhost}
                onClick={() => selectAll(false)}
                disabled={!rows.length}
              >
                Clear
              </button>
              <button style={c.btnGhost} onClick={resetState}>
                Reset state
              </button>
            </div>

            {!!progress.total && progress.total > 1 && (
              <div style={c.small}>
                Progress: {progress.current}/{progress.total}
              </div>
            )}

            <div style={c.meta}>
              Locked order: {Array.from(LOCKED_ORDER).join(", ")}. Selected:{" "}
              {selected.size}.
            </div>

            <div style={c.list}>
              {!rows.length ? (
                <div style={c.small}>Click "Discover fields".</div>
              ) : (
                groupedSortedEntries.map(([groupName, keys]) => {
                  const keysShown = keys.filter(matches);
                  if (!keysShown.length) return null;
                  const allOn = keys.every((k) => selected.has(k));
                  const noneOn = keys.every((k) => !selected.has(k));
                  return (
                    <div key={groupName} style={c.group}>
                      <div style={c.groupHeader}>
                        <b>{groupName}</b>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            style={c.mini}
                            onClick={() => toggleGroup(keys, true)}
                          >
                            select
                          </button>
                          <button
                            style={c.mini}
                            onClick={() => toggleGroup(keys, false)}
                          >
                            clear
                          </button>
                        </div>
                        <span style={c.faint}>
                          {allOn ? "all" : noneOn ? "none" : "partial"}
                        </span>
                      </div>
                      <div style={c.grid}>
                        {keysShown.map((k) => (
                          <label key={k} style={c.checkRow} title={k}>
                            <input
                              type="checkbox"
                              checked={selected.has(k)}
                              onChange={() => toggle(k)}
                            />
                            <span style={c.ellipsis}>{k}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span style={{ alignSelf: "center", opacity: 0.7 }}>
                Presets:
              </span>
              <button
                style={c.btnGhost}
                onClick={presetRecommended}
                disabled={!rows.length}
              >
                Recommended
              </button>
              <button
                style={c.btnGhost}
                onClick={presetTekla}
                disabled={!rows.length}
              >
                Tekla Assembly
              </button>
              <button
                style={c.btnGhost}
                onClick={presetIFC}
                disabled={!rows.length}
              >
                IFC Reference
              </button>
            </div>

            {!!exportMsg && (
              <div style={{ ...c.note, marginTop: 6 }}>{exportMsg}</div>
            )}
          </div>
        )}

        {/* EXPORT */}
        {tab === "export" && (
          <div style={c.section}>
            <h3 style={{ margin: 0 }}>Export Data</h3>
            <div style={c.row}>
              <label style={c.label}>Formaat:</label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as any)}
                style={c.input}
              >
                <option value="clipboard-tsv">Clipboard (TSV)</option>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (.xlsx)</option>
              </select>
            </div>

            <div>
              <div style={{ ...c.small, marginBottom: 4 }}>
                Veergude järjestus (lukus veerud on ees):
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  border: "1px solid #edf0f4",
                  borderRadius: 8,
                  maxHeight: 240,
                  overflow: "auto",
                }}
              >
                {order.map((k, idx) => (
                  <li
                    key={k}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 8px",
                      borderBottom: "1px dashed #f0f3f7",
                    }}
                  >
                    <code style={{ opacity: 0.8 }}>{k}</code>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="checkbox"
                          checked={
                            selected.has(k) ||
                            (LOCKED_ORDER as readonly string[]).includes(k as any)
                          }
                          disabled={(LOCKED_ORDER as readonly string[]).includes(k as any)}
                          onChange={() => toggle(k)}
                        />
                        <span style={c.small}>kaasa</span>
                      </label>
                      <button
                        style={c.mini}
                        disabled={idx === 0}
                        onClick={() =>
                          setOrder((o) => {
                            const n = [...o];
                            [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                            return n;
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        style={c.mini}
                        disabled={idx === order.length - 1}
                        onClick={() =>
                          setOrder((o) => {
                            const n = [...o];
                            [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]];
                            return n;
                          })
                        }
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={c.btn} onClick={doExport} disabled={!rows.length}>
                Ekspordi
              </button>
              <button style={c.btnGhost} onClick={send} disabled={busy || !rows.length}>
                {busy ? "Sending…" : `Saada Google Sheeti (${rows.length})`}
              </button>
            </div>

            {!!exportMsg && (
              <div style={{ ...c.note, marginTop: 6 }}>{exportMsg}</div>
            )}
          </div>
        )}

        {/* SEARCH */}
        {tab === "search" && (
          <div style={c.section}>
            <h3 style={{ margin: 0 }}>Otsi ja vali Assembly Marki järgi</h3>
            <textarea
              value={markPaste}
              onChange={(e) => setMarkPaste(e.target.value)}
              placeholder={
                "Kleebi siia assembly märgid (üks rea kohta või komadega eraldatud)\nNäiteks:\n2ERP11\n2ERP12\n2ERP13"
              }
              style={{
                ...c.input,
                minHeight: 180,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={c.btn}
                onClick={findAndSelectByMarks}
                disabled={!markPaste.trim()}
              >
                Otsi ja vali
              </button>
              <button
                style={c.btnGhost}
                onClick={() => {
                  setMarkPaste("");
                  setSearchMsg("");
                }}
              >
                Tühjenda
              </button>
            </div>
            {!!searchMsg && <div style={{ ...c.note, marginTop: 6 }}>{searchMsg}</div>}
          </div>
        )}
      </div>

      <div style={c.footer}>
        created by <b>Silver Vatsel</b> | Consiva OÜ
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    color: "#111",
    fontFamily: "Inter, system-ui, Arial, sans-serif",
    fontSize: 13,
    lineHeight: 1.25,
  },
  topbar: {
    display: "flex",
    gap: 2,
    background: "#0a3a67",
    padding: "8px 10px",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  tab: {
    all: "unset" as any,
    color: "rgba(255,255,255,.85)",
    padding: "6px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },
  tabActive: {
    background: "rgba(255,255,255,.14)",
    color: "#fff",
    fontWeight: 600,
  },
  page: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: 10,
    gap: 10,
    minHeight: 0,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    height: "100%",
    minHeight: 0,
  },
  row: { display: "flex", alignItems: "center", gap: 8 },
  label: { width: 160, opacity: 0.8 },
  input: {
    flex: 1,
    padding: "6px 8px",
    border: "1px solid #cfd6df",
    borderRadius: 8,
    outline: "none",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  btn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #cfd6df",
    background: "#f6f8fb",
    cursor: "pointer",
  },
  btnGhost: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #d7dde6",
    background: "#fff",
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #0a3a67",
    background: "#0a3a67",
    color: "#fff",
    cursor: "pointer",
    marginLeft: "auto",
  },
  meta: { fontSize: 12, opacity: 0.75 },
  list: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    border: "1px solid #edf0f4",
    borderRadius: 8,
    padding: 8,
    background: "#fafbfc",
  },
  group: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "1px dashed #e5e9f0",
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  mini: {
    padding: "2px 6px",
    borderRadius: 6,
    border: "1px solid #d7dde6",
    background: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 6,
  },
  checkRow: { display: "flex", alignItems: "center", gap: 6 },
  ellipsis: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  small: { fontSize: 12, opacity: 0.8 },
  faint: { fontSize: 12, opacity: 0.55, marginLeft: "auto" },
  note: { fontSize: 12, opacity: 0.9 },
  footer: {
    padding: "6px 10px",
    borderTop: "1px solid #eef2f6",
    fontSize: 12,
    color: "#66758c",
  },
};
