import { useEffect, useState } from "react";
import * as WorkspaceAPI from "trimble-connect-workspace-api";
import AssemblyExporter from "./components/AssemblyExporter";
import "@trimbleinc/modus-bootstrap/dist/modus.min.css";
import "@trimble-oss/modus-icons/dist/modus-outlined/fonts/modus-icons.css";
import "./App.css";

function App() {
  const [tcApi, setTcApi] = useState<WorkspaceAPI.WorkspaceAPI>();

  useEffect(() => {
    async function connectWithTcAPI() {
      const api = await WorkspaceAPI.connect(window.parent, () => {});
      setTcApi(api);
    }
    connectWithTcAPI();
  }, []);

  return (
    <div className="app-container">
      <h2 className="title">Assembly Exporter</h2>
      {tcApi && <AssemblyExporter api={tcApi} />}
    </div>
  );
}

export default App;
