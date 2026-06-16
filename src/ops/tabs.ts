import type { Herdr } from '../client/herdr.ts';
import type { Tab } from '../client/types.ts';

export interface TabCreateOptions {
  workspace_id: string;
  cwd?: string;
  label?: string;
  focus?: boolean;
}

export class Tabs {
  constructor(private readonly herdr: Herdr) {}

  async create(options: TabCreateOptions): Promise<Tab> {
    const args = ['tab', 'create', '--workspace', options.workspace_id];
    if (options.cwd) args.push('--cwd', options.cwd);
    if (options.label) args.push('--label', options.label);
    if (options.focus === false) args.push('--no-focus');
    else if (options.focus === true) args.push('--focus');

    const response = await this.herdr.json<{ result: { tab: Tab } }>(args);
    return response.result.tab;
  }

  async rename(tabId: string, label: string): Promise<void> {
    await this.herdr.run(['tab', 'rename', tabId, label]);
  }

  async focus(tabId: string): Promise<void> {
    await this.herdr.run(['tab', 'focus', tabId]);
  }
}
