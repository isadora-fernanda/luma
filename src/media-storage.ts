import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

function rootDirectory() {
  const configured = process.env.MEDIA_ROOT?.trim();
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error('Configure MEDIA_ROOT com um caminho absoluto para a pasta Media.');
  }
  return configured.replace(/[\\/]+$/, '');
}

function mediaPath(key: string) {
  const normalized = key.replaceAll('\\', '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Chave de mídia inválida.');
  }
  const root = rootDirectory();
  return `${root}${path.sep}${segments.join(path.sep)}`;
}

export async function ensureMediaRoot() {
  await mkdir(rootDirectory(), { recursive: true, mode: 0o750 });
}

export async function putMedia(key: string, stream: ReadableStream<Uint8Array>) {
  const destination = mediaPath(key);
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const temporary = `${destination}.${crypto.randomUUID()}.upload`;
  const source = Readable.fromWeb(stream as never);
  const target = createWriteStream(temporary, { mode: 0o640 });
  try {
    await pipeline(source, target);
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function headMedia(key: string) {
  try {
    const metadata = await stat(mediaPath(key));
    if (!metadata.isFile()) return null;
    return { size: metadata.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function streamMedia(key: string, range?: { start: number; end: number }) {
  return Readable.toWeb(createReadStream(mediaPath(key), range ? { start: range.start, end: range.end } : undefined)) as ReadableStream<Uint8Array>;
}

export async function readMedia(key: string) {
  return readFile(mediaPath(key));
}

export async function deleteMedia(key: string) {
  try {
    await unlink(mediaPath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
