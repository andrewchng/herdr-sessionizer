import type { Herdr } from "../client/herdr.ts";
import type { Workspace, WorkspaceListResult } from "../client/types.ts";

interface CreateOptions {
  cwd: string;
  label: string;
  focus?: boolean;
}

export class Workspaces {
  constructor(private readonly herdr: Herdr) {}

  async list(): Promise<Workspace[]> {
    const response = await this.herdr.json<{ result: WorkspaceListResult }>([
      "workspace",
      "list",
    ]);
    return response.result.workspaces;
  }

  async create(options: CreateOptions): Promise<Workspace> {
    const args = [
      "workspace",
      "create",
      "--cwd",
      options.cwd,
      "--label",
      options.label,
    ];
    if (options.focus === false) args.push("--no-focus");
    else if (options.focus === true) args.push("--focus");

    const response = await this.herdr.json<{
      result: { workspace: Workspace };
    }>(args);
    return response.result.workspace;
  }

  async get(workspaceId: string): Promise<Workspace | undefined> {
    const response = await this.herdr.json<{
      result: { workspace?: Workspace };
    }>(["workspace", "get", workspaceId]);
    return response.result.workspace;
  }

  async focus(workspaceId: string): Promise<void> {
    await this.herdr.run(["workspace", "focus", workspaceId]);
  }

  async close(
    workspaceId: string,
    options?: { group?: boolean }
  ): Promise<void> {
    const args = ["workspace", "close", workspaceId];
    // A parent/main workspace of a repo that has open worktrees must be closed
    // with --group; a single close refuses with workspace_group_close_required.
    if (options?.group) args.push("--group");
    await this.herdr.run(args);
  }
}
