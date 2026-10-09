export {};

import { runClosePicker } from "./close.ts";

runClosePicker().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
