export {};

async function run(): Promise<void> {
  console.log('hello world');
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
