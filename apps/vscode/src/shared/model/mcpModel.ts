/** Wire shape for Pi's MCP servers as the chat panel renders them. */

/** Tool names are carried (without schemas) so the panel can search them; counts derive from them. */
export interface McpCatalogSnapshot {
  toolNames: string[];
  resourceCount: number;
  cachedAt: number;
}

export type McpCatalogState =
  | ({ kind: "available" } & McpCatalogSnapshot)
  | ({ kind: "expired" } & McpCatalogSnapshot)
  | { kind: "uncached" };

export interface McpServerView {
  name: string;
  /** Which layer defined the server; the toggle writes overrides to the project layer only. */
  scope: "user" | "project";
  /** Effective state, with any project override applied. */
  enabled: boolean;
  disabledByProject: boolean;
  transport?: string;
  /** Joined argv for stdio servers. */
  command?: string;
  /** Endpoint for remote servers. */
  url?: string;
  /**
   * Catalog knowledge only. Pi does not expose live connection status outside its own TUI, so
   * this reports whether the tool catalog is cached (and how fresh) rather than pretending to be
   * a health check.
   */
  catalog: McpCatalogState;
}
