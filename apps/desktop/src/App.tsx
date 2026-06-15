import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Shell } from "./shell/Shell";
import { NorthStar } from "./shell/NorthStar";
import { ScoreEngineProvider } from "./lib/ScoreEngine";
import { isTauri } from "./lib/tauri";

interface AppInfo {
  name: string;
  version: string;
  phase: string;
}

const BROWSER_INFO: AppInfo = { name: "Stockhausen", version: "0.0.1", phase: "0" };

/**
 * The app entry. Holds bootstrap state and renders either:
 *  - the loading splash (the slow-pulsing north-star),
 *  - or the main three-pane shell, wrapped in the score engine.
 *
 * See docs/UI_DESIGN.md §13 for the first-screen experience spec.
 */
export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    const start = Date.now();
    const p = isTauri()
      ? invoke<AppInfo>("app_info").catch((err) => {
          console.error("failed to load app_info from native core:", err);
          return BROWSER_INFO;
        })
      : Promise.resolve(BROWSER_INFO);

    void p.then((value) => {
      const elapsed = Date.now() - start;
      // In Tauri, hold the splash for at least 900ms while native modules load.
      // In the browser there is nothing loading, so skip straight to the shell.
      const wait = isTauri() ? Math.max(0, 900 - elapsed) : 0;
      window.setTimeout(() => setInfo(value), wait);
    });
  }, []);

  if (!info) {
    return <Splash />;
  }

  return (
    <ScoreEngineProvider>
      <Shell info={info} />
    </ScoreEngineProvider>
  );
}

function Splash() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-obsidian-900">
      <NorthStar size={88} />
    </div>
  );
}
