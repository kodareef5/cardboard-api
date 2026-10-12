import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import T from '../tabletop.mjs';

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
  'assets',
  'design',
  'examples',
  'README.md',
  'EXTRAS.md',
  'MTG26.md',
  'llm.txt',
]) {
  await cp(new URL(asset, root), new URL(asset, output), { recursive: true });
}
// Keep both agent-guide URLs identical, with one source to maintain.
await cp(new URL('llm.txt', root), new URL('llms.txt', output));
for (const item of T.listExamples()) {
  await writeFile(
    new URL(`examples/${item.id}.json`, output),
    JSON.stringify(T.toConfig(T.example(item.id)), null, 2) + '\n',
  );
}
await writeFile(
  new URL('examples/index.json', output),
  JSON.stringify(
    T.listExamples().map((item) => ({ ...item, file: `${item.id}.json` })),
    null,
    2,
  ) + '\n',
);
console.log(`Static site ready: ${fileURLToPath(output)}`);
