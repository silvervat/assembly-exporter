// src/App.tsx või ExtensionRoot.tsx
import { useEffect, useState } from "react";
import * as WorkspaceAPI from "trimble-connect-workspace-api";
import type { WorkspaceAPI as TWorkspaceAPI } from "trimble-connect-workspace-api";
import AssemblyExporter from "./components/AssemblyExporter";

export default function App() {
  const [api, setApi] = useState<TWorkspaceAPI | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // For 3D Extension (most common)
    WorkspaceAPI.connect(
      window.parent,
      (event, data) => {
        console.log("Workspace event:", event, data);
        
        // Handle events
        if (event === "extension.accessToken") {
          console.log("Access token received:", data);
        }
      },
      30000 // 30 second timeout
    )
      .then((connectedApi) => {
        setApi(connectedApi);
        console.log("Connected to Trimble Connect Workspace API");
      })
      .catch((err) => {
        setError(`Failed to connect: ${err.message}`);
        console.error("Connection error:", err);
      });
  }, []);

  if (error) {
    return <div style={{ padding: 20, color: "red" }}>{error}</div>;
  }

  if (!api) {
    return <div style={{ padding: 20 }}>Connecting to Trimble Connect...</div>;
  }

  return <AssemblyExporter api={api} />;
}
