/**
 * Root App component — routing shell.
 */

import { Keyboard } from "@capacitor/keyboard";
import { ErrorBoundary } from "@tokagentos/ui";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

const OperatorShell = lazy(() =>
  import("./components/pages/operator/OperatorShell.js").then((m) => ({
    default: m.OperatorShell,
  })),
);

import { subscribeDesktopBridgeEvent } from "./bridge/electrobun-rpc";
import { GameViewOverlay } from "./components/apps/GameViewOverlay";
import { getOverlayApp } from "./components/apps/overlay-app-registry";
import { SaveCommandModal } from "./components/chat/SaveCommandModal";
import { CustomActionEditor } from "./components/custom-actions/CustomActionEditor";
import { MusicPlayerGlobal } from "./components/music/MusicPlayerGlobal";
import { StreamView } from "./components/pages/StreamView";
import { BugReportModal } from "./components/shell/BugReportModal";
import { ConnectionFailedBanner } from "./components/shell/ConnectionFailedBanner";
import { ConnectionLostOverlay } from "./components/shell/ConnectionLostOverlay";
import { ShellOverlays } from "./components/shell/ShellOverlays";
import { StartupShell } from "./components/shell/StartupShell";
import { SystemWarningBanner } from "./components/shell/SystemWarningBanner";
import {
  BugReportProvider,
  useBugReportState,
  useContextMenu,
  useStreamPopoutNavigation,
} from "./hooks";
import { isIOS, isNative } from "./platform/init";
import { useApp } from "./state";

/** Check if we're in pop-out mode (StreamView only, no chrome) — used by the
 *  headless browser-capture service + the electrobun screen-capture popout. */
function useIsPopout(): boolean {
  const [popout] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(
      window.location.search || window.location.hash.split("?")[1] || "",
    );
    return params.has("popout") && params.get("popout") !== "false";
  });
  return popout;
}

function TabContentView({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full overflow-hidden">
      {children}
    </div>
  );
}

function ViewRouter() {
  return (
    <ErrorBoundary>
      <TabContentView>
        <Suspense fallback={null}>
          <OperatorShell />
        </Suspense>
      </TabContentView>
    </ErrorBoundary>
  );
}

export function App() {
  const {
    startupError,
    startupCoordinator,
    tab,
    setTab,
    setState,
    actionNotice,
    activeOverlayApp,
    uiTheme,
    backendConnection,
    activeGameViewerUrl,
    gameOverlayEnabled,
    t,
  } = useApp();

  const isPopout = useIsPopout();
  const companionShellVisible = activeOverlayApp !== null;
  // Don't initialize the 3D scene while the system is still booting — this
  // prevents VrmEngine's Three.js setup from blocking the JS thread and
  // delaying WebSocket agent-status updates (which would freeze the loader).
  const overlayAppActive =
    startupCoordinator.phase === "ready" && activeOverlayApp !== null;
  const resolvedOverlayApp =
    overlayAppActive && activeOverlayApp
      ? getOverlayApp(activeOverlayApp)
      : undefined;
  const contextMenu = useContextMenu();

  useStreamPopoutNavigation(setTab);

  useEffect(() => {
    if (startupCoordinator.phase !== "ready") return;
    if (backendConnection?.state !== "connected") return;

    const report = () => {
      void fetch("/api/apps/overlay-presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: activeOverlayApp }),
      }).catch(() => {
        /* ignore */
      });
    };

    report();
    const intervalId = window.setInterval(report, 25_000);
    return () => {
      window.clearInterval(intervalId);
      void fetch("/api/apps/overlay-presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: null }),
      }).catch(() => {
        /* ignore */
      });
    };
  }, [activeOverlayApp, backendConnection?.state, startupCoordinator.phase]);

  const [customActionsEditorOpen, setCustomActionsEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<
    import("./api").CustomActionDef | null
  >(null);
  const [desktopShuttingDown, setDesktopShuttingDown] = useState(false);

  const handleEditorSave = useCallback(() => {
    setCustomActionsEditorOpen(false);
    setEditingAction(null);
  }, []);

  useEffect(() => {
    if (!isNative || !isIOS) {
      return;
    }

    // Disable the iOS WebView scroll only while the companion shell is active.
    void Keyboard.setScroll({ isDisabled: companionShellVisible }).catch(() => {
      // Ignore bridge failures so web and desktop shells keep working.
    });
  }, [companionShellVisible]);

  useEffect(() => {
    if (!isNative || !isIOS) {
      return;
    }

    return () => {
      void Keyboard.setScroll({ isDisabled: false }).catch(() => {
        // Ignore cleanup failures when the native bridge is unavailable.
      });
    };
  }, []);

  useEffect(() => {
    return subscribeDesktopBridgeEvent({
      rpcMessage: "desktopShutdownStarted",
      ipcChannel: "desktop:shutdownStarted",
      listener: () => {
        setDesktopShuttingDown(true);
      },
    });
  }, []);

  const bugReport = useBugReportState();
  // Loading is handled entirely by StartupShell — no separate loader needed.

  useEffect(() => {
    // Safety-net watchdog: the coordinator has its own timeouts per phase, but
    // this catches any edge case where the coordinator gets stuck in a loading
    // phase. During "starting-runtime" the agent-wait loop has its own sliding
    // deadline (up to 900s for embedding downloads), so we only watch the
    // pre-runtime phases.
    const STARTUP_TIMEOUT_MS = 300_000;
    const coordinatorPolling =
      startupCoordinator.phase === "polling-backend" ||
      startupCoordinator.phase === "restoring-session";
    if (coordinatorPolling && !startupError) {
      const timer = setTimeout(() => {
        startupCoordinator.retry();
      }, STARTUP_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [startupCoordinator.phase, startupError, startupCoordinator.retry]);

  // shellContent is memoized before early returns to satisfy the Rules of Hooks.
  // Operator-only: the operator console fills the shell full-bleed — no app
  // header, no chrome (the console is the whole app).
  const shellContent = useMemo(
    () => (
      <div
        key={`tab-shell-${tab}`}
        className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg"
      >
        <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          <ViewRouter />
        </main>
      </div>
    ),
    [tab],
  );

  // Pop-out mode — render only StreamView, skip startup gates. Used by the
  // headless browser-capture service (opens the app with ?popout) + electrobun.
  if (isPopout) {
    return (
      <div className="flex flex-col h-screen w-screen font-body text-txt bg-bg overflow-hidden">
        <StreamView />
      </div>
    );
  }

  // StartupCoordinator gate — the coordinator is the sole startup authority.
  // Non-ready phases are handled by StartupShell (which renders the appropriate
  // view for each coordinator phase: loading, pairing, onboarding, or error).
  if (startupCoordinator.phase !== "ready") {
    return (
      <BugReportProvider value={bugReport}>
        <StartupShell />
        <BugReportModal />
      </BugReportProvider>
    );
  }

  // Coordinator is at "ready" — the app shell renders. No legacy onboarding
  // overlays — the coordinator handled all of that before reaching ready.

  return (
    <BugReportProvider value={bugReport}>
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <ConnectionFailedBanner />
        <SystemWarningBanner />
        {shellContent}
      </div>
      {/* Full-screen overlay app — renders whichever overlay app is active */}
      {resolvedOverlayApp && (
        <resolvedOverlayApp.Component
          exitToApps={() => {
            setState("activeOverlayApp", null);
            setTab("operator");
          }}
          uiTheme={uiTheme === "dark" ? "dark" : "light"}
          t={t}
        />
      )}
      <MusicPlayerGlobal />

      {/* Persistent game overlay — stays visible across all tabs */}
      {activeGameViewerUrl && gameOverlayEnabled && tab !== "apps" && (
        <GameViewOverlay />
      )}
      <ShellOverlays actionNotice={actionNotice} />
      <SaveCommandModal
        open={contextMenu.saveCommandModalOpen}
        text={contextMenu.saveCommandText}
        onSave={contextMenu.confirmSaveCommand}
        onClose={contextMenu.closeSaveCommandModal}
      />
      <CustomActionEditor
        open={customActionsEditorOpen}
        action={editingAction}
        onSave={handleEditorSave}
        onClose={() => {
          setCustomActionsEditorOpen(false);
          setEditingAction(null);
        }}
      />
      <ConnectionLostOverlay />
      {desktopShuttingDown ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-bg/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl border border-border/60 bg-card/95 px-6 py-5 text-center shadow-2xl">
            <div className="text-base font-semibold text-txt">
              Shutting down…
            </div>
            <div className="mt-1 text-sm text-muted">
              Closing services and saving state.
            </div>
          </div>
        </div>
      ) : null}
    </BugReportProvider>
  );
}
