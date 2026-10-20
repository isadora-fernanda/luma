// Cálculos da câmera do navegador, separados do componente para poderem ser testados.

export type Rect = { x: number; y: number; width: number; height: number };
export type ZoomRange = { min: number; max: number; step: number };

export const DEFAULT_ZOOM_RANGE: ZoomRange = { min: 1, max: 3, step: 0.1 };
export const MAX_VIDEO_MS = 10_000;

// Formatos tentados na gravação, em ordem de preferência.
// O Safari só grava MP4. Chrome e Firefox costumam gravar WebM.
export const RECORDER_MIME_TYPES = [
  'video/mp4',
  'video/mp4;codecs=h264,aac',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

/**
 * Parte do quadro da câmera que aparece na tela.
 * O vídeo usa `object-fit: cover`, então as bordas que sobram são cortadas.
 * A foto precisa sair com o mesmo enquadramento que o usuário viu.
 */
export function visibleSourceRect(
  videoWidth: number,
  videoHeight: number,
  renderedWidth: number,
  renderedHeight: number,
): Rect {
  const renderedAspect = Math.max(renderedWidth, 1) / Math.max(renderedHeight, 1);
  const sourceAspect = videoWidth / Math.max(videoHeight, 1);
  let x = 0;
  let y = 0;
  let width = videoWidth;
  let height = videoHeight;
  if (sourceAspect > renderedAspect) {
    width = videoHeight * renderedAspect;
    x = (videoWidth - width) / 2;
  } else if (sourceAspect < renderedAspect) {
    height = videoWidth / renderedAspect;
    y = (videoHeight - height) / 2;
  }
  return { x, y, width, height };
}

/** Zoom digital: recorta o centro da área visível quando a câmera não tem zoom próprio. */
export function applyDigitalZoom(rect: Rect, zoom: number): Rect {
  if (zoom <= 1) return rect;
  const width = rect.width / zoom;
  const height = rect.height / zoom;
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

/** Tamanho final da foto, limitando o lado maior sem nunca ampliar a imagem. */
export function outputSize(rect: Rect, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(rect.width, rect.height));
  return {
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale)),
  };
}

/**
 * Converte o toque na tela (de 0 a 1 em cada eixo) para o ponto do sensor usado no foco.
 * Na câmera frontal a imagem aparece espelhada, então o eixo X é invertido.
 */
export function tapToSensorPoint(rect: Rect, visualX: number, visualY: number, mirrored: boolean) {
  const x = Math.max(0, Math.min(1, visualX));
  const y = Math.max(0, Math.min(1, visualY));
  return {
    x: Math.round(rect.x + (mirrored ? 1 - x : x) * rect.width),
    y: Math.round(rect.y + y * rect.height),
  };
}

/** Arredonda o zoom ao passo da câmera e mantém dentro do intervalo permitido. */
export function normalizeZoom(value: number, range: ZoomRange) {
  const stepped = Math.round(value / range.step) * range.step;
  const clamped = Math.max(range.min, Math.min(range.max, stepped));
  return Number(clamped.toFixed(4));
}

/** Zoom de pinça: proporcional ao quanto os dois dedos se afastaram desde o início do gesto. */
export function pinchZoom(startZoom: number, startDistance: number, currentDistance: number) {
  if (startDistance <= 0) return startZoom;
  return startZoom * (currentDistance / startDistance);
}

/** Primeiro formato de gravação que o navegador suporta, ou texto vazio para usar o padrão dele. */
export function pickRecorderMimeType(isTypeSupported: (type: string) => boolean) {
  return RECORDER_MIME_TYPES.find((type) => isTypeSupported(type)) ?? '';
}

/** Duração do vídeo gravado, limitada ao máximo permitido. */
export function recordedDuration(startedAt: number, stoppedAt: number) {
  return Math.min(MAX_VIDEO_MS, Math.max(0, Math.round(stoppedAt - startedAt)));
}
