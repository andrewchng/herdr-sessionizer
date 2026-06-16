import type { Herdr } from '../client/herdr.ts';
import type { Pane } from '../client/types.ts';

export interface SplitOptions {
  direction: 'right' | 'down';
  cwd?: string;
  focus?: boolean;
}

export class Panes {
  constructor(private readonly herdr: Herdr) {}

  async split(paneId: string, options: SplitOptions): Promise<Pane> {
    const args = ['pane', 'split', paneId, '--direction', options.direction];
    if (options.cwd) args.push('--cwd', options.cwd);
    if (options.focus === false) args.push('--no-focus');
    else if (options.focus === true) args.push('--focus');

    const response = await this.herdr.json<{ result: { pane: Pane } }>(args);
    return response.result.pane;
  }

  async run(paneId: string, command: string): Promise<void> {
    await this.herdr.run(['pane', 'run', paneId, command]);
  }
}
