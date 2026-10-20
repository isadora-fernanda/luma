import assert from 'node:assert/strict';
import test from 'node:test';
import { createZipArchive } from '../src/media-tools.ts';

test('gera um ZIP com todos os arquivos selecionados', async () => {
  const archive = await createZipArchive([
    { name: 'foto-1.jpg', blob: new Blob(['primeira']) },
    { name: 'foto-2.png', blob: new Blob(['segunda']) },
  ]);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const decoded = new TextDecoder().decode(bytes);

  assert.equal(archive.type, 'application/zip');
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  assert.match(decoded, /foto-1\.jpg/);
  assert.match(decoded, /foto-2\.png/);
});
