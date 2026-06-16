export interface Workspace {
  workspace_id: string;
  label?: string;
  cwd?: string;
  [key: string]: unknown;
}

export interface WorkspaceListResult {
  workspaces: Workspace[];
}

export interface Tab {
  tab_id: string;
  workspace_id: string;
  label?: string;
  [key: string]: unknown;
}

export interface Pane {
  pane_id: string;
  terminal_id: string;
  workspace_id: string;
  tab_id: string;
  [key: string]: unknown;
}
