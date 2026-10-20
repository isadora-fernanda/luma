import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDigitalZoom,
  normalizeZoom,
  outputSize,
  pickRecorderMimeType,
  pinchZoom,
  recordedDuration,
  tapToSensorPoint,
  visibleSourceRect,
} from '../src/camera-math.ts';

test('câmera deitada numa tela em pé corta as laterais', () => {
  // Quadro 1280x720 exibido numa área de 360x640
  const rect = visibleSourceRect(1280, 720, 360, 640);
  assert.equal(rect.height, 720);
  assert.equal(rect.width, 405);
  assert.equal(rect.x, (1280 - 405) / 2);
  assert.equal(rect.y, 0);
});

test('câmera em pé numa tela deitada corta em cima e embaixo', () => {
  const rect = visibleSourceRect(720, 1280, 640, 360);
  assert.equal(rect.width, 720);
  assert.equal(rect.height, 405);
  assert.equal(rect.x, 0);
  assert.equal(rect.y, (1280 - 405) / 2);
});

test('mesma proporção não corta nada', () => {
  assert.deepEqual(visibleSourceRect(1280, 720, 640, 360), { x: 0, y: 0, width: 1280, height: 720 });
});

test('zoom digital de 2x recorta o centro pela metade', () => {
  const zoomed = applyDigitalZoom({ x: 0, y: 0, width: 800, height: 600 }, 2);
  assert.deepEqual(zoomed, { x: 200, y: 150, width: 400, height: 300 });
});

test('zoom de 1x ou menor não altera o recorte', () => {
  const rect = { x: 10, y: 20, width: 800, height: 600 };
  assert.deepEqual(applyDigitalZoom(rect, 1), rect);
  assert.deepEqual(applyDigitalZoom(rect, 0.5), rect);
});

test('a foto é reduzida para 1600 px no lado maior, mas nunca ampliada', () => {
  assert.deepEqual(outputSize({ x: 0, y: 0, width: 3200, height: 1800 }, 1600), { width: 1600, height: 900 });
  assert.deepEqual(outputSize({ x: 0, y: 0, width: 640, height: 480 }, 1600), { width: 640, height: 480 });
});

test('o toque no centro foca o centro do recorte', () => {
  const rect = { x: 100, y: 0, width: 400, height: 720 };
  assert.deepEqual(tapToSensorPoint(rect, 0.5, 0.5, false), { x: 300, y: 360 });
});

test('na câmera frontal o foco espelha o eixo horizontal', () => {
  const rect = { x: 0, y: 0, width: 1000, height: 500 };
  assert.deepEqual(tapToSensorPoint(rect, 0.2, 0.4, false), { x: 200, y: 200 });
  assert.deepEqual(tapToSensorPoint(rect, 0.2, 0.4, true), { x: 800, y: 200 });
});

test('o zoom respeita o passo e os limites da câmera', () => {
  const range = { min: 1, max: 3, step: 0.1 };
  assert.equal(normalizeZoom(1.234, range), 1.2);
  assert.equal(normalizeZoom(0.4, range), 1);
  assert.equal(normalizeZoom(7, range), 3);
  assert.equal(normalizeZoom(0.6, { min: 0.5, max: 10, step: 0.5 }), 0.5);
});

test('afastar os dedos ao dobro da distância dobra o zoom', () => {
  assert.equal(pinchZoom(1.5, 100, 200), 3);
  assert.equal(pinchZoom(2, 100, 50), 1);
  assert.equal(pinchZoom(2, 0, 50), 2);
});

test('a gravação escolhe o primeiro formato suportado pelo navegador', () => {
  const safari = (type: string) => type.startsWith('video/mp4');
  const chrome = (type: string) => type.startsWith('video/webm');
  assert.equal(pickRecorderMimeType(safari), 'video/mp4');
  assert.equal(pickRecorderMimeType(chrome), 'video/webm;codecs=vp8,opus');
  assert.equal(pickRecorderMimeType(() => false), '');
});

test('a duração do vídeo nunca passa de 10 segundos', () => {
  assert.equal(recordedDuration(1000, 4500), 3500);
  assert.equal(recordedDuration(0, 12_345), 10_000);
});
