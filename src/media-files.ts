// Identificação e preparo dos arquivos de mídia escolhidos no celular.

// Alguns celulares enviam vídeos e fotos sem o tipo MIME preenchido,
// então a extensão do arquivo também é usada para reconhecer o formato.
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', '3gp', '3g2', 'mkv', 'hevc', 'avi', 'mts', 'm2ts', 'mpeg', 'mpg', 'ogv']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'webp']);

const VIDEO_TYPE_BY_EXTENSION: Record<string, string> = {
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
  '3g2': 'video/3gpp2',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  ogv: 'video/ogg',
  avi: 'video/x-msvideo',
  mts: 'video/mp2t',
  m2ts: 'video/mp2t',
};

const EXTENSION_BY_VIDEO_TYPE: Record<string, string> = {
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/3gpp': '3gp',
  'video/3gpp2': '3g2',
  'video/x-matroska': 'mkv',
  'video/ogg': 'ogv',
  'video/x-msvideo': 'avi',
  'video/mp2t': 'm2ts',
};

export const MAX_PHOTO_SIDE = 2400;
export const TARGET_JPEG_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function baseType(type: string) {
  return type.toLowerCase().split(';')[0].trim();
}

export function fileExtension(file: Pick<File, 'name'>) {
  const parts = file.name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() ?? '' : '';
}

export function isVideoFile(file: Pick<File, 'name' | 'type'>) {
  return baseType(file.type).startsWith('video/') || VIDEO_EXTENSIONS.has(fileExtension(file));
}

export function isImageFile(file: Pick<File, 'name' | 'type'>) {
  return baseType(file.type).startsWith('image/') || IMAGE_EXTENSIONS.has(fileExtension(file));
}

/** Tipo MIME de vídeo a partir do tipo informado ou, se ele faltar, da extensão. */
export function videoMimeType(file: Pick<File, 'name' | 'type'>) {
  const type = baseType(file.type);
  if (type.startsWith('video/')) return type;
  return VIDEO_TYPE_BY_EXTENSION[fileExtension(file)] ?? 'video/mp4';
}

/** Devolve o vídeo com o tipo MIME correto, para o servidor e o navegador reconhecerem o formato. */
export function normalizedVideoFile(file: File) {
  const type = videoMimeType(file);
  if (file.type === type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

export function videoExtensionFromMime(mimeType: string) {
  const type = baseType(mimeType);
  return EXTENSION_BY_VIDEO_TYPE[type] ?? (type.includes('mp4') ? 'mp4' : 'webm');
}

/**
 * Prepara uma foto para envio no navegador.
 * Corrige a orientação, reduz o lado maior para 2400 px e baixa a qualidade do JPEG
 * em passos até o arquivo ficar com até 4 MB. GIFs são enviados como estão, para não perder a animação.
 */
export async function optimizePhoto(file: File) {
  if (baseType(file.type) === 'image/gif') return file;
  if (!isImageFile(file)) throw new Error('Escolha uma foto válida do aparelho.');

  let source: CanvasImageSource;
  let width = 0;
  let height = 0;
  let cleanup = () => {};
  try {
    if (typeof createImageBitmap !== 'function') throw new Error('bitmap-unavailable');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    cleanup = () => bitmap.close();
  } catch {
    // Navegadores antigos não têm createImageBitmap, então a foto é aberta num <img>
    const imageUrl = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => {
        URL.revokeObjectURL(imageUrl);
        reject(new Error('Não foi possível abrir esta foto no navegador.'));
      };
      element.src = imageUrl;
    });
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
    cleanup = () => URL.revokeObjectURL(imageUrl);
  }

  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  cleanup();

  const outputType = baseType(file.type) === 'image/png' ? 'image/png' : 'image/jpeg';
  let quality = 0.9;
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, quality));
  while (outputType === 'image/jpeg' && blob && blob.size > TARGET_JPEG_BYTES && quality > 0.6) {
    quality -= 0.08;
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, quality));
  }
  if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error('Não foi possível otimizar esta foto para o limite de 20 MB.');

  const extension = outputType === 'image/png' ? 'png' : 'jpg';
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + `.${extension}`, { type: outputType });
}
