import type { StreamingBehavior } from "@frostime/pi-rpc";

import type { ProxyConfiguration } from "../network/proxyConfiguration.js";

export interface FrostUiConfiguration {
  piExecutable?: string;
  piArguments: string[];
  startSessionOnOpen: boolean;
  streamingBehavior: StreamingBehavior;
  collapseTurnTrace: boolean;
  questionToolEnabled: boolean;
  /** How Pi Coding Agent answers Pi tool/extension confirmations. */
  agentPermissionMode: "ask" | "autoConfirm" | "restricted";
  /** Auto-name new sessions from the first user prompt. */
  sessionAutoRename: boolean;
  maxImageBytes: number;
  diagnosticsLevel: "error" | "info" | "debug";
  experimentalNotificationsEnabled: boolean;
  proxy: ProxyConfiguration;
  fileMentionRespectSearchExclude: boolean;
  fileMentionRespectIgnoreFiles: boolean;
  fileMentionFollowSymlinks: boolean;
}
