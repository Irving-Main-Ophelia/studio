import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Shell } from "./shell/Shell";
import { NorthStar } from "./shell/NorthStar";
import { ScoreEngineProvider } from "./lib/ScoreEngine";

interface AppInfo {
  name: string;
  version: string;
  phase: string;
}

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
    invoke<AppInfo>("app_info")
      .catch((err) => {
        console.error("failed to load app_info from native core:", err);
        return { name: "Stockhausen", version: "0.0.1", phase: "0" };
      })
      .then((value) => {
        const elapsed = Date.now() - start;
        const wait = Math.max(0, 900 - elapsed);
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
