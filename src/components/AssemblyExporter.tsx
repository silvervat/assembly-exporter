import { ModusButton, ModusTextInput } from "@trimble-oss/modus-react-components";
import { useState } from "react";
import { WorkspaceAPI } from "trimble-connect-workspace-api";

export default function AssemblyExporter({ api }: { api: WorkspaceAPI }) {
  const [webAppUrl, setWebAppUrl] = useState<string>(
    localStorage.getItem('sheet_webapp') || ''
  );
  const [secret, setSecret] = useState<string>(
    localStorage.getItem('sheet_secret') || 'sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU'
  );
  const [status, setStatus] = useState<string>('');
  const [isError, setIsError] = useState<boolean>(false);

  async function exportToSheet() {
    try {
      localStorage.setItem('sheet_webapp', webAppUrl);
      localStorage.setItem('sheet_secret', secret);

      setIsError(false);
      setStatus('Loen valitud objekte...');

      const selection = await api.viewer.getSelection();
      if (selection.length === 0) {
        setIsError(true);
        setStatus('Vali esmalt objekte mudelist!');
        return;
      }

      const firstModel = selection[0];
      if (!firstModel.objectRuntimeIds || firstModel.objectRuntimeIds.length === 0) {
        setIsError(true);
        setStatus('Valik on tühi');
        return;
      }

      setStatus(`Loen ${firstModel.objectRuntimeIds.length} objekti omadusi...`);

      const properties = await api.viewer.getObjectProperties(
        firstModel.modelId,
        firstModel.objectRuntimeIds
      );

      const rows = properties.map(obj => {
        const name = getPropertyValue(obj, 'Name') || 
                     getPropertyValue(obj, 'NAME') || 
                     'Unknown';
        
        const type = getPropertyValue(obj, 'IfcType') || 
                     getPropertyValue(obj, 'IFC_TYPE') ||
                     getPropertyValue(obj, 'Type') ||
                     'Unknown';

        return {
          ObjectId: obj.id,
          Name: name,
          Type: type,
          ModelId: firstModel.modelId
        };
      });

      setStatus(`Saadan ${rows.length} rida Google Sheeti...`);

      const response = await fetch(webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: secret,
          rows: rows
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP viga: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.ok) {
        setIsError(false);
        setStatus(`✅ Edukalt lisatud ${result.inserted} rida Google Sheeti!`);
      } else {
        setIsError(true);
        setStatus(`❌ Viga: ${result.error}`);
      }

    } catch (error) {
      setIsError(true);
      setStatus(`❌ Viga: ${error}`);
      console.error(error);
    }
  }

  function getPropertyValue(obj: any, propertyName: string): string {
    if (!obj.properties) return '';
    
    for (const propSet of obj.properties) {
      if (!propSet.properties) continue;
      
      const prop = propSet.properties.find((p: any) => 
        p.name === propertyName
      );
      
      if (prop) {
        return String(prop.value);
      }
    }
    return '';
  }

  return (
    <div className="content-panel">
      <h3>Seaded</h3>
      
      <ModusTextInput
        label="Google Apps Script URL"
        placeholder="https://script.google.com/macros/s/.../exec"
        value={webAppUrl}
        onValueChange={(e: any) => setWebAppUrl(e.target.value)}
      />
      
      <ModusTextInput
        label="Shared Secret"
        type="password"
        placeholder="sK9pL2mN8qR4vT6xZ1wC7jH3fY5bA0eU"
        value={secret}
        onValueChange={(e: any) => setSecret(e.target.value)}
      />
      
      <div className="button-container">
        <ModusButton onClick={exportToSheet}>
          Saada valik Google Sheeti
        </ModusButton>
      </div>

      {status && (
        <div className={`status-message ${isError ? 'error' : 'success'}`}>
          {status}
        </div>
      )}
    </div>
  );
}
