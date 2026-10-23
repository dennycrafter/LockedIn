"use client";

// The Excalidraw canvas for the Board tab (Oct 2026). Loaded only in the
// browser (board-view.tsx imports it with ssr: false) because Excalidraw
// needs window. It reports every change up; board-view decides when to save.
import "@excalidraw/excalidraw/index.css";
import {
  CaptureUpdateAction,
  Excalidraw,
  FONT_FAMILY,
  MainMenu,
  convertToExcalidrawElements,
  getCommonBounds,
  getNonDeletedElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { useMemo, useRef } from "react";
import { starterSkeleton, type BoardScene } from "@/lib/board";
import type { Theme } from "@/lib/theme";

type Props = {
  /** Saved board, or null for a fresh board with the starter lanes. */
  initial: BoardScene | null;
  theme: Theme;
  onChange: (scene: BoardScene, signature: string) => void;
  status: React.ReactNode;
};

function lanes(origin?: { x: number; y: number }) {
  return convertToExcalidrawElements(starterSkeleton(origin) as unknown as ExcalidrawElementSkeleton[], {
    regenerateIds: true,
  });
}

// Starter note text must be measured in the real font or it gets clipped.
// Excalidraw loads a scene's fonts after it mounts, so wait (at most 4s) for
// its Nunito face to finish loading.
async function waitForNoteFont(): Promise<void> {
  const loaded = () => {
    try {
      for (const face of document.fonts) {
        if (face.family.replace(/["']/g, "") === "Nunito" && face.status === "loaded") return true;
      }
    } catch {
      return true;
    }
    return false;
  };
  for (let waited = 0; waited < 4000 && !loaded(); waited += 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Ids of what is on the board: unchanged means you have not drawn or deleted
// anything yet (versions bump on their own while a scene settles, ids do not).
function sceneIds(api: ExcalidrawImperativeAPI): string {
  return getNonDeletedElements(api.getSceneElements())
    .map((element) => element.id)
    .join(",");
}

export default function BoardCanvas({ initial, theme, onChange, status }: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // initialData is read once by Excalidraw, so build it once.
  const initialData = useMemo(() => {
    const appState = {
      // Clean look by default: straight lines and a plain font, not the
      // hand-drawn style. Both can still be switched per shape.
      currentItemRoughness: 0,
      currentItemFontFamily: FONT_FAMILY.Nunito,
      currentItemRoundness: "round" as const,
    };
    if (!initial) {
      // Fresh board: starter lanes. They are re-measured once the font has
      // loaded (see excalidrawAPI below).
      return { elements: lanes(), appState };
    }
    return {
      elements: initial.elements as never,
      files: initial.files as never,
      appState: {
        ...appState,
        scrollX: initial.view.scrollX,
        scrollY: initial.view.scrollY,
        zoom: { value: initial.view.zoom as never },
      },
    };
    // Only on mount: later saves must not reset the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLanes = () => {
    const api = apiRef.current;
    if (!api) return;
    const current = getNonDeletedElements(api.getSceneElements());
    // New lanes go to the right of everything already on the board.
    const origin = current.length > 0 ? (() => {
      const [, minY, maxX] = getCommonBounds(current);
      return { x: Math.round(maxX + 120), y: Math.round(minY) || 80 };
    })() : undefined;
    const added = lanes(origin);
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...added],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent(added, { fitToContent: true, animate: true, maxZoom: 1 });
  };

  return (
    <Excalidraw
      excalidrawAPI={(api) => {
        apiRef.current = api;
        if (!initial) {
          // Fresh board: once the note font has loaded, rebuild the starter
          // lanes so their text is measured right (unless you already started
          // drawing), then frame them. On a phone, just the first lane.
          const starterIds = (initialData.elements as ReadonlyArray<{ id: string }>).map((element) => element.id).join(",");
          void waitForNoteFont().then(() => {
            if (sceneIds(api) === starterIds) {
              api.updateScene({ elements: lanes(), captureUpdate: CaptureUpdateAction.NEVER });
            }
            const all = getNonDeletedElements(api.getSceneElements());
            const firstLane = all.find((element) => element.type === "frame");
            const narrow = window.innerWidth < 640;
            const target = narrow && firstLane ? all.filter((e) => e.id === firstLane.id || e.frameId === firstLane.id) : all;
            api.scrollToContent(target, { fitToViewport: true, viewportZoomFactor: narrow ? 0.9 : 0.8, maxZoom: 1 });
          });
        }
      }}
      initialData={initialData}
      theme={theme}
      name="LockedIn board"
      UIOptions={{
        canvasActions: { toggleTheme: false, saveToActiveFile: false },
      }}
      renderTopRightUI={() => <>{status}</>}
      onChange={(elements, appState, files) => {
        const kept = getNonDeletedElements(elements);
        // Keep only pasted images that are still on the board.
        const usedFiles: Record<string, unknown> = {};
        for (const element of kept) {
          if (element.type === "image" && element.fileId && files[element.fileId]) {
            usedFiles[element.fileId] = files[element.fileId];
          }
        }
        const view = { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom.value };
        // Changes only when something worth saving changed (a shape, or
        // where you are looking), not on every mouse move.
        const signature = [
          kept.length,
          kept.reduce((sum, element) => sum + element.version, 0),
          Math.round(view.scrollX),
          Math.round(view.scrollY),
          view.zoom.toFixed(3),
        ].join(":");
        onChange({ elements: kept as unknown[], files: usedFiles, view }, signature);
      }}
    >
      <MainMenu>
        <MainMenu.Item onSelect={addLanes}>Add Now / Next / Long-term lanes</MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.Help />
        <MainMenu.DefaultItems.ClearCanvas />
      </MainMenu>
    </Excalidraw>
  );
}
