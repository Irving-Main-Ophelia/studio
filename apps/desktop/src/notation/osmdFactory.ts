import {
  OpenSheetMusicDisplay,
  SkyBottomLineBatchCalculatorBackendType,
} from "opensheetmusicdisplay";

/**
 * OSMD instance for ScoreView.
 * - Log level `error` hides per-measure SkyBottomLine warnings.
 * - Plain (non-WebGL) skyline backend avoids WebGL context leaks on re-render.
 */
export function createScoreOsmd(
  container: HTMLElement,
  theme: "parchment" | "night",
): OpenSheetMusicDisplay {
  const osmd = new OpenSheetMusicDisplay(container, {
    autoResize: true,
    backend: "svg",
    drawTitle: true,
    drawSubtitle: false,
    drawComposer: true,
    drawCredits: false,
    drawPartNames: false,
    drawingParameters: theme === "night" ? "compact" : "default",
    preferredSkyBottomLineBatchCalculatorBackend:
      SkyBottomLineBatchCalculatorBackendType.Plain,
    skyBottomLineBatchMinMeasures: 999_999,
  });
  const rules = osmd.EngravingRules;
  rules.AlwaysSetPreferredSkyBottomLineBackendAutomatically = false;
  rules.PreferredSkyBottomLineBatchCalculatorBackend =
    SkyBottomLineBatchCalculatorBackendType.Plain;
  rules.SkyBottomLineWebGLMinMeasures = Number.MAX_VALUE;
  osmd.setLogLevel("error");
  return osmd;
}
