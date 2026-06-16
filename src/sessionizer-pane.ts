export {};

import { runSessionizer } from './sessionizer.ts';

runSessionizer().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
