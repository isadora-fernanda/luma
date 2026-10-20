'use client';

const GIF_WIDTH = 480;
const GIF_FPS = 8;
const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function pushWord(target: number[], value: number) {
  target.push(value & 0xff, (value >> 8) & 0xff);
}

function pushAscii(target: number[], value: string) {
  for (let index = 0; index < value.length; index += 1) target.push(value.charCodeAt(index));
}

function fixedPalette() {
  const palette: number[] = [];
  for (let index = 0; index < 256; index += 1) {
    palette.push(
      Math.round(((index >> 5) & 7) * 255 / 7),
      Math.round(((index >> 2) & 7) * 255 / 7),
      Math.round((index & 3) * 255 / 3),
    );
  }
  return palette;
}

function quantizeFrame(data: Uint8ClampedArray, width: number) {
  const indexed = new Uint8Array(data.length / 4);
  for (let pixel = 0, target = 0; pixel < data.length; pixel += 4, target += 1) {
    const x = target % width;
    const y = Math.floor(target / width);
    const threshold = (BAYER_4X4[(y % 4) * 4 + (x % 4)] - 7.5) / 16;
    const red = Math.max(0, Math.min(255, data[pixel] + threshold * 32));
    const green = Math.max(0, Math.min(255, data[pixel + 1] + threshold * 32));
    const blue = Math.max(0, Math.min(255, data[pixel + 2] + threshold * 64));
    indexed[target] = ((red >> 5) << 5) | ((green >> 5) << 2) | (blue >> 6);
  }
  return indexed;
}

function lzwEncode(indices: Uint8Array) {
  const clearCode = 256;
  const endCode = 257;
  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const writeCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += 9;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  // Um clear code frequente mantém o fluxo sempre em 9 bits. O arquivo fica
  // um pouco maior, porém evita a dessincronização de dicionário que corrompia
  // GIFs em alguns navegadores móveis.
  writeCode(clearCode);
  for (let index = 0; index < indices.length; index += 1) {
    writeCode(indices[index]);
    if ((index + 1) % 120 === 0 && index + 1 < indices.length) writeCode(clearCode);
  }
  writeCode(endCode);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);
  return bytes;
}

function encodeGif(frames: Uint8Array[], width: number, height: number, delayHundredths: number) {
  const output: number[] = [];
  pushAscii(output, 'GIF89a');
  pushWord(output, width);
  pushWord(output, height);
  output.push(0xf7, 0, 0, ...fixedPalette());
  output.push(0x21, 0xff, 0x0b);
  pushAscii(output, 'NETSCAPE2.0');
  output.push(0x03, 0x01, 0x00, 0x00, 0x00);

  for (const frame of frames) {
    output.push(0x21, 0xf9, 0x04, 0x00);
    pushWord(output, delayHundredths);
    output.push(0x00, 0x00);
    output.push(0x2c);
    pushWord(output, 0);
    pushWord(output, 0);
    pushWord(output, width);
    pushWord(output, height);
    output.push(0x00, 0x08);
    const compressed = lzwEncode(frame);
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const block = compressed.slice(offset, offset + 255);
      output.push(block.length, ...block);
    }
    output.push(0x00);
  }
  output.push(0x3b);
  return new Blob([new Uint8Array(output)], { type: 'image/gif' });
}

function waitForEvent(target: EventTarget, eventName: string) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, resolveEvent);
      target.removeEventListener('error', rejectEvent);
    };
    const resolveEvent = () => { cleanup(); resolve(); };
    const rejectEvent = () => { cleanup(); reject(new Error('Não foi possível ler este arquivo.')); };
    target.addEventListener(eventName, resolveEvent, { once: true });
    target.addEventListener('error', rejectEvent, { once: true });
  });
}

export async function readVideoDuration(url: string) {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.src = url;
  await waitForEvent(video, 'loadedmetadata');
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  video.removeAttribute('src');
  video.load();
  return duration;
}

export async function createGifFromVideo(url: string) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  await waitForEvent(video, 'loadedmetadata');
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    await waitForEvent(video, 'loadeddata');
  }
  const duration = Math.min(10, Math.max(.25, video.duration));
  const width = Math.min(GIF_WIDTH, Math.max(1, video.videoWidth));
  const height = Math.max(1, Math.round(width * video.videoHeight / Math.max(1, video.videoWidth)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Seu navegador não conseguiu criar o GIF.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const frameCount = Math.min(80, Math.max(2, Math.ceil(duration * GIF_FPS)));
  const frames: Uint8Array[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    const targetTime = Math.min(duration - .01, index * duration / frameCount);
    if (Math.abs(video.currentTime - targetTime) > .005) {
      const seeked = waitForEvent(video, 'seeked');
      video.currentTime = targetTime;
      await seeked;
    }
    context.drawImage(video, 0, 0, width, height);
    frames.push(quantizeFrame(context.getImageData(0, 0, width, height).data, width));
  }

  video.removeAttribute('src');
  video.load();
  return encodeGif(frames, width, height, Math.max(2, Math.round(100 / GIF_FPS)));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipHeader(size: number) {
  return new Uint8Array(size);
}

function write16(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(offset, value, true);
}

function write32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value >>> 0, true);
}

function zipDateParts(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export async function createZipArchive(entries: Array<{ name: string; blob: Blob }>) {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  const createdAt = zipDateParts(new Date());
  let localOffset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const checksum = crc32(data);
    const local = zipHeader(30);
    write32(local, 0, 0x04034b50);
    write16(local, 4, 20);
    write16(local, 6, 0x0800);
    write16(local, 8, 0);
    write16(local, 10, createdAt.time);
    write16(local, 12, createdAt.date);
    write32(local, 14, checksum);
    write32(local, 18, data.byteLength);
    write32(local, 22, data.byteLength);
    write16(local, 26, name.byteLength);
    write16(local, 28, 0);
    localParts.push(local, name, data);

    const central = zipHeader(46);
    write32(central, 0, 0x02014b50);
    write16(central, 4, 20);
    write16(central, 6, 20);
    write16(central, 8, 0x0800);
    write16(central, 10, 0);
    write16(central, 12, createdAt.time);
    write16(central, 14, createdAt.date);
    write32(central, 16, checksum);
    write32(central, 20, data.byteLength);
    write32(central, 24, data.byteLength);
    write16(central, 28, name.byteLength);
    write16(central, 30, 0);
    write16(central, 32, 0);
    write16(central, 34, 0);
    write16(central, 36, 0);
    write32(central, 38, 0);
    write32(central, 42, localOffset);
    centralParts.push(central, name);
    localOffset += local.byteLength + name.byteLength + data.byteLength;
    centralSize += central.byteLength + name.byteLength;
  }

  const end = zipHeader(22);
  write32(end, 0, 0x06054b50);
  write16(end, 4, 0);
  write16(end, 6, 0);
  write16(end, 8, entries.length);
  write16(end, 10, entries.length);
  write32(end, 12, centralSize);
  write32(end, 16, localOffset);
  write16(end, 20, 0);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}
