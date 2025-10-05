import { useState } from "react";
import { ModusButton, ModusTextInput } from "@trimble-oss/modus-react-components";
import type { WorkspaceAPI } from "trimble-connect-workspace-api";

interface Props {
  api: WorkspaceAPI;
}

export default function AssemblyExporter({ api }: Props) {
  const [scriptUrl, setScriptUrl] = useState(
    localStorage.getItem("scriptUrl") || ""
  );
  const [secret, setSecret] = useState(
    localStorage.getItem("secret") || "sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU"
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);

  const getProp = (obj: any, name: string) => {
    for (const group of obj?.properties || [])
      for (const p of group.properties || [])
        if (p.name === name) return p.value;
    return "";
  };

  async function handleSend() {
    try {
      localStorage.setItem("scriptUrl", scriptUrl);
      localStorage.setItem("secret", secret);
      setStatus("Loen valikut...");
      setError(false);

      const selection = await api.viewer.getSelection();
      if (!selection.length) {
        setError(true);
        setStatus("Valik on tühi!");
        return;
      }

      const model = selection[0];
      const ids = model.objectRuntimeIds;
      if (!ids?.length) {
        setError(true);
        setStatus("Valik on tühi!");
        return;
      }

      const props = await api.viewer.getObjectProperties(model.modelId, ids);

      const rows = props.map((o: any) => ({
        ObjectId: o.id,
        Name: getProp(o, "Name") || "Unknown",
        Type:
          getProp(o, "IfcType") ||
          getProp(o, "Type") ||
          getProp(o, "IFC_TYPE") ||
          "Unknown",
        ModelId: model.modelId,
      }));

      setStatus(`Saadan ${rows.length} rida...`);

      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, rows }),
      });

      const result = await res.json();
      if (result.ok) {
        setStatus(`✅ Edukalt lisatud ${result.inserted} rida Google Sheeti!`);
      } else {
        setError(true);
        setStatus(`❌ Viga: ${result.error}`);
      }
    } catch (err: any) {
      setError(true);
      setStatus(`❌ Viga: ${err.message}`);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h3>Assembly Exporter</h3>

      <ModusTextInput
        label="Google Apps Script URL"
        value={scriptUrl}
        onValueChange={(e: any) => setScriptUrl(e.target.value)}
      />
      <ModusTextInput
        label="Shared Secret"
        type="password"
        value={secret}
        onValueChange={(e: any) => setSecret(e.target.value)}
      />

      <ModusButton onClick={handleSend}>Saada valik Google Sheeti</ModusButton>

      {status && (
        <div
          style={{
            marginTop: "1rem",
            color: error ? "red" : "green",
            fontSize: "14px",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
