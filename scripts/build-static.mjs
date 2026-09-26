import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Only browser assets enter the deployment; caches, Node tools, and tests stay local.
for (const asset of [
  'index.html',
  'render.html',
  'styles.css',
  'render.css',
  'js',
  'examples',
  'README.md',
  'llm.txt',
]) {
  await cp(new URL(asset, root), new URL(asset, output), { recursive: true });
}
// Keep both agent-guide URLs identical, with one source to maintain.
await cp(new URL('llm.txt', root), new URL('llms.txt', output));
console.log(`Static site ready: ${fileURLToPath(output)}`);
