/**
 * Shell component subset — curated re-exports consumed by App.tsx.
 *
 * When adding a new shell/page component, add it here AND in
 * `./components/index.ts`. Both files must stay in sync.
 */

export { FineTuningView } from "@tokagentos/app-training/ui/FineTuningView";
export { GameViewOverlay } from "./components/apps/GameViewOverlay";
export { CharacterEditor } from "./components/character/CharacterEditor";
export { SaveCommandModal } from "./components/chat/SaveCommandModal";
export { ConversationsSidebar } from "./components/conversations/ConversationsSidebar";
export { CustomActionEditor } from "./components/custom-actions/CustomActionEditor";
export { CustomActionsPanel } from "./components/custom-actions/CustomActionsPanel";
export { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
export { ChatView } from "./components/pages/ChatView";
export { KnowledgeView } from "./components/pages/KnowledgeView";
export { StreamView } from "./components/pages/StreamView";
export { DesktopWorkspaceSection } from "./components/settings/DesktopWorkspaceSection";
export { BugReportModal } from "./components/shell/BugReportModal";

export { ConnectionFailedBanner } from "./components/shell/ConnectionFailedBanner";
export { ConnectionLostOverlay } from "./components/shell/ConnectionLostOverlay";
export { Header } from "./components/shell/Header";
export { PairingView } from "./components/shell/PairingView";
export { ShellOverlays } from "./components/shell/ShellOverlays";
export { StartupFailureView } from "./components/shell/StartupFailureView";
export { StartupShell } from "./components/shell/StartupShell";
export { SystemWarningBanner } from "./components/shell/SystemWarningBanner";
