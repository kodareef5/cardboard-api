import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// JSON records include their original expiry so process restarts don't reset the TTL.
export function createScryfallDiskStore(
  directory = fileURLToPath(new URL('./.cache/scryfall/', import.meta.url)),
) {
  const root = resolve(directory);
  const file = (key) => join(root, `${createHash('sha256').update(key).digest('hex')}.json`);
  return {
    async get(key) {
      try {
        return JSON.parse(await readFile(file(key), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) return undefined;
        throw error;
      }
    },
    async set(key, record) {
      await mkdir(root, { recursive: true });
      const target = file(key),
        temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(record));
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    },
    async clear() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
