import { createRoot } from "react-dom/client";
import { MigrationApp, applyMigrationMood } from "@cruxgarden/migration-ui";
import { desktopClient } from "./bridge";
import "./styles.css";
applyMigrationMood({});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());
const client = desktopClient();
createRoot(document.getElementById("root")!).render(
  <MigrationApp
    client={client}
    appearance="standalone"
    hostNotice="Closing the window keeps work running. Use the Migrate menu-bar or tray icon to reopen or quit."
  />,
);
