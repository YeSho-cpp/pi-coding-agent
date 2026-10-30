import type { ChatTypographyView } from "../model/chatTypography.js";
import type { ComposerDraftView } from "../model/composerDraftModel.js";
import type { ContextAttachItemView } from "../model/contextAttachModel.js";
import type { AgentTurnItemView, AgentTurnView, ConversationItemView } from "../model/conversationModel.js";
import type { McpServerView } from "../model/mcpModel.js";
import type { SessionViewModel } from "../model/sessionViewModel.js";
import type { WebviewPresentationView } from "../model/webviewPresentationModel.js";
import type { EditorMentionSpecialView, WorkspaceFileCandidateView } from "../model/workspaceFileModel.js";

export type SessionBaseView = Omit<SessionViewModel, "conversationItems">;

export type MarkdownImageFailureReason =
  | "invalidSource"
  | "notFound"
  | "notAFile"
  | "tooLarge"
  | "unsupportedType"
  | "readFailed";

export type MarkdownImageLoadResult =
  | {
      ok: true;
      mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml";
      data: string;
    }
  | { ok: false; reason: MarkdownImageFailureReason };

/**
 * Edits a turn the Webview already holds, so a running turn does not resend its user message
 * (with attached images) and every earlier tool output each time one token arrives.
 */
export interface TurnPatch {
  id: string;
  /** Only the turn fields whose value changed to a defined value. */
  fields: Partial<Pick<AgentTurnView, "status" | "startedAt" | "endedAt" | "userMessage">>;
  /** Items that are new or differ from the held ones: held ids are replaced in place, new ids append in the order given. */
  items: AgentTurnItemView[];
  /** The turn's complete item order; present only when it is not "held order plus the new items". */
  order?: string[];
}

export interface CollectionDelta<T> {
  mode: "replace" | "upsert";
  items: T[];
  /** Upserts of turns already held, expressed as patches; the Webview applies them before `items`. */
  turnPatches?: TurnPatch[];
}

export interface PresentationDeltaView extends Omit<WebviewPresentationView, "displayedSession"> {
  displayedSession: {
    base: SessionBaseView;
    conversationItems: CollectionDelta<ConversationItemView>;
  } | null;
}

export type HostToWebviewPayload =
  | { type: "snapshot"; presentation: WebviewPresentationView; draft: ComposerDraftView | null }
  | { type: "setChatTypography"; typography: ChatTypographyView }
  | { type: "presentationDelta"; presentation: PresentationDeltaView }
  | { type: "draftReplacement"; sessionId: string; draft: ComposerDraftView }
  | { type: "replaceComposerText"; sessionId: string; text: string }
  | { type: "insertPromptText"; sessionId: string; text: string }
  | { type: "contextAttachPicked"; items: ContextAttachItemView[]; sessionId?: string }
  | {
      type: "editorContextHint";
      available: boolean;
      /** true = chip active (sent on submit); false = ghost / inactive */
      attached?: boolean;
      hasSelection?: boolean;
      path?: string;
      startLine?: number;
      endLine?: number;
      label?: string;
      /** Material icon SVG data URI */
      iconDataUri?: string;
    }
  | { type: "focusComposer" }
  | { type: "promptResult"; requestId: string; ok: boolean; error?: string }
  | { type: "markdownImageResult"; requestId: string; sessionId: string; result: MarkdownImageLoadResult }
  | {
      type: "forkResult";
      requestId: string;
      ok: boolean;
      cancelled?: boolean;
      forkSessionId?: string;
      error?: string;
    }
  | { type: "workspaceFileSuggestions"; requestId: string; items: WorkspaceFileCandidateView[]; specials?: EditorMentionSpecialView[]; error?: string }
  | { type: "toast"; level: "info" | "warning" | "error"; message: string }
  | {
      type: "welcomeResources";
      version: string;
      skills: string[];
      extensions: string[];
      skillsPaths: string[];
      extensionsPaths: string[];
    }
  | { type: "saveImageResult"; requestId: string; ok: boolean; path?: string; error?: string }
  | {
      type: "mcpServers";
      sessionId: string;
      servers: McpServerView[];
      /** Set when a config file exists but could not be read or parsed. */
      warning?: string;
    }
  | { type: "highlightCodeResult"; requestId: string; html: string | null }
  | { type: "fileIconResult"; requestId: string; dataUri: string | null };

export type HostToWebviewMessage = HostToWebviewPayload & { bridgeVersion: string };
