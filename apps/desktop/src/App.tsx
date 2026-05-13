import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Shell } from "./shell/Shell";
import { NorthStar } from "./shell/NorthStar";

interface AppInfo {
  name: string;
  version: string;
  phase: string;
}

/**
 * The app entry. Holds bootstrap state and renders either:
 *  - the loading splash (the slow-pulsing north-star),
 *  - or the main three-pane shell.
 *
 * See docs/UI_DESIGN.md §13 for the first-screen experience spec.
 */
export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    invoke<AppInfo>("app_info")
      .then((value) => {
        // brief minimum splash so the star is seen
        const start = Date.now();
        const minSplashMs = 900;
        const elapsed = Date.now() - start;
        const wait = Math.max(0, minSplashMs - elapsed);
        window.setTimeout(() => setInfo(value), wait);
      })
      .catch((err) => {
        console.error("failed to load app_info from native core:", err);
        setInfo({ name: "Stockhausen", version: "0.0.1", phase: "0" });
      });
  }, []);

  if (!info) {
    return <Splash />;
  }
  return <Shell info={info} />;
}

function Splash() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-obsidian-900">
      <NorthStar size={88} />
    </div>
  );
}
