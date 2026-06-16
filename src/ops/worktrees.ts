import type { Herdr } from '../client/herdr.ts';
import type { Workspace } from '../client/types.ts';

export interface WorktreeCreateOptions {
  workspaceId?: string;
  cwd?: string;
  branch: string;
  label: string;
  base?: string;
  path?: string;
  focus?: boolean;
}

export interface WorktreeOpenOptions {
  workspaceId?: string;
  cwd?: string;
  branch?: string;
  path?: string;
  label?: string;
  focus?: boolean;
}

interface WorktreeEnvelope {
  result?: {
    workspace?: Workspace;
    worktree?: {
      path?: string;
      checkout_path?: string;
    };
  };
}

export interface WorktreeOpenResult {
  workspace?: Workspace;
  worktreePath?: string;
}

export class Worktrees {
  constructor(private readonly herdr: Herdr) {}

  async create(options: WorktreeCreateOptions): Promise<Workspace> {
    const args = ['worktree', 'create'];
    if (options.workspaceId) args.push('--workspace', options.workspaceId);
    else if (options.cwd) args.push('--cwd', options.cwd);
    else throw new Error('worktree create requires either workspaceId or cwd');

    args.push('--branch', options.branch, '--label', options.label, '--json');
    if (options.base) args.push('--base', options.base);
    if (options.path) args.push('--path', options.path);
    if (options.focus === false) args.push('--no-focus');
    else if (options.focus === true) args.push('--focus');

    const response = await this.herdr.json<WorktreeEnvelope>(args);
    const workspace = response.result?.workspace;
    if (!workspace) {
      throw new Error('worktree create succeeded but no workspace was returned');
    }
    return workspace;
  }

  async open(options: WorktreeOpenOptions): Promise<WorktreeOpenResult> {
    const args = ['worktree', 'open'];
    if (options.workspaceId) args.push('--workspace', options.workspaceId);
    else if (options.cwd) args.push('--cwd', options.cwd);
    else throw new Error('worktree open requires either workspaceId or cwd');

    if (options.path) args.push('--path', options.path);
    else if (options.branch) args.push('--branch', options.branch);
    else throw new Error('worktree open requires either branch or path');

    args.push('--json');
    if (options.label) args.push('--label', options.label);
    if (options.focus === false) args.push('--no-focus');
    else if (options.focus === true) args.push('--focus');

    const response = await this.herdr.json<WorktreeEnvelope>(args);
    return {
      workspace: response.result?.workspace,
      worktreePath: response.result?.worktree?.checkout_path ?? response.result?.worktree?.path,
    };
  }
}
