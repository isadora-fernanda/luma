import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readMedia } from '../src/media-storage.ts';

test('lê os bytes exatos salvos na pasta Media', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'luma-media-'));
  const previousRoot = process.env.MEDIA_ROOT;
  process.env.MEDIA_ROOT = root;
  const key = 'events/evento-teste/media/foto.jpg';
  const expected = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  try {
    const destination = path.join(root, key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, expected);
    const received = await readMedia(key);
    assert.deepEqual(Uint8Array.from(received), expected);
  } finally {
    if (previousRoot === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});
