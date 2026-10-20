import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isImageFile,
  isVideoFile,
  normalizedVideoFile,
  videoExtensionFromMime,
  videoMimeType,
} from '../src/media-files.ts';

test('reconhece vídeos pelo tipo ou, sem tipo, pela extensão', () => {
  assert.equal(isVideoFile({ name: 'clip.bin', type: 'video/mp4' }), true);
  assert.equal(isVideoFile({ name: 'IMG_0001.MOV', type: '' }), true);
  assert.equal(isVideoFile({ name: 'foto.jpg', type: 'image/jpeg' }), false);
});

test('reconhece fotos do iPhone em HEIC mesmo sem tipo', () => {
  assert.equal(isImageFile({ name: 'IMG_0002.HEIC', type: '' }), true);
  assert.equal(isImageFile({ name: 'documento.pdf', type: 'application/pdf' }), false);
});

test('completa o tipo MIME de vídeos enviados sem ele', () => {
  assert.equal(videoMimeType({ name: 'video.mov', type: '' }), 'video/quicktime');
  assert.equal(videoMimeType({ name: 'video.mts', type: '' }), 'video/mp2t');
  assert.equal(videoMimeType({ name: 'video.desconhecido', type: '' }), 'video/mp4');
  assert.equal(videoMimeType({ name: 'gravacao', type: 'video/webm;codecs=vp8' }), 'video/webm');
});

test('normaliza o arquivo de vídeo sem perder o conteúdo', async () => {
  const original = new File(['dados do vídeo'], 'festa.mov', { type: '' });
  const normalized = normalizedVideoFile(original);
  assert.equal(normalized.type, 'video/quicktime');
  assert.equal(normalized.name, 'festa.mov');
  assert.equal(await normalized.text(), 'dados do vídeo');

  const alreadyRight = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
  assert.equal(normalizedVideoFile(alreadyRight), alreadyRight);
});

test('escolhe a extensão do arquivo gravado a partir do tipo MIME', () => {
  assert.equal(videoExtensionFromMime('video/mp4;codecs=h264,aac'), 'mp4');
  assert.equal(videoExtensionFromMime('video/webm;codecs=vp9,opus'), 'webm');
  assert.equal(videoExtensionFromMime('video/quicktime'), 'mov');
});
