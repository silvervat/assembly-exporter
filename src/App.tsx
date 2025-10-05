import { useEffect, useState } from "react";
import * as WorkspaceAPI from "trimble-connect-workspace-api";
import AssemblyExporter from "./components/AssemblyExporter";
import "@trimbleinc/modus-bootstrap/dist/modus.min.css";
import "@trimble-oss/modus-icons/dist/modus-outlined/fonts/modus-icons.css";
import "./App.css";

export default function App() {
  const [api, setApi] = useState<WorkspaceAPI.WorkspaceAPI | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function init() {
      try {
        const connected = await WorkspaceAPI.connect(
          window.parent,
          (event, data) => {
            console.log("Workspace event:", event, data);
            
            // Handle important events
            if (event === "extension.accessToken") {
              console.log("Access token received");
            }
          },
          30000 // 30 second timeout
        );
        setApi(connected);
        console.log("Connected to Trimble Connect");
      } catch (err: any) {
        setError(err?.message || "Failed to connect to Trimble Connect");
        console.error("Connection error:", err);
      }
    }
    init();
  }, []);

  if (error) {
    return (
      <div className="app-container" style={{ padding: 20, color: "#dc3545" }}>
        <h3>Connection Error</h3>
        <p>{error}</p>
        <p style={{ fontSize: 12, opacity: 0.7 }}>
          Make sure this extension is loaded inside Trimble Connect.
        </p>
      </div>
    );
  }

  if (!api) {
    return (
      <div className="app-container" style={{ padding: 20 }}>
        Ühendatakse Trimble Connectiga...
      </div>
    );
  }

  return (
    <div className="app-container">
      <AssemblyExporter api={api} />
    </div>
  );
}
