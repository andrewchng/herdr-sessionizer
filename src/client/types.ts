export interface Workspace {
  workspace_id: string;
  label?: string;
  cwd?: string;
  worktree?: WorktreeProvenance;
  tab_count?: number;
  pane_count?: number;
  [key: string]: unknown;
}

export interface WorkspaceListResult {
  workspaces: Workspace[];
}

export interface WorktreeProvenance {
  repo_workspace_id?: string;
  branch?: string;
  path?: string;
  checkout_path?: string;
  [key: string]: unknown;
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
