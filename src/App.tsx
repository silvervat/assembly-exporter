import { useEffect, useState } from "react";
import * as WorkspaceAPI from "trimble-connect-workspace-api";
import AssemblyExporter from "./components/AssemblyExporter";
import "@trimbleinc/modus-bootstrap/dist/modus.min.css";
import "@trimble-oss/modus-icons/dist/modus-outlined/fonts/modus-icons.css";
import "./App.css";

export default function App() {
  const [api, setApi] = useState<WorkspaceAPI.WorkspaceAPI | null>(null);

  useEffect(() => {
    async function init() {
      const connected = await WorkspaceAPI.connect(window.parent, () => {});
      setApi(connected);
    }
    init();
  }, []);

  return (
    <div className="app-container">
      {api ? (
        <AssemblyExporter api={api} />
      ) : (
        <div>Ühendatakse Trimble Connectiga...</div>
      )}
    </div>
  );
}
