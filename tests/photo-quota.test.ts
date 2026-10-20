import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePhotoQuotaTransfer,
  PhotoQuotaTransferError,
  type ParticipantQuotaSnapshot,
} from '../src/photo-quota.ts';

const source: ParticipantQuotaSnapshot = {
  id: 'participante-a',
  eventId: 'evento-1',
  currentLimit: 25,
  usedPhotos: 8,
};
const destination: ParticipantQuotaSnapshot = {
  id: 'participante-b',
  eventId: 'evento-1',
  currentLimit: 25,
  usedPhotos: 18,
};

test('transfere apenas o saldo livre e preserva o total das cotas', () => {
  const result = calculatePhotoQuotaTransfer('evento-1', source, destination, 10);
  assert.equal(result.sourceLimitAfter, 15);
  assert.equal(result.sourceAvailableAfter, 7);
  assert.equal(result.destinationLimitAfter, 35);
  assert.equal(result.destinationAvailableAfter, 17);
  assert.equal(result.pairTotalBefore, 50);
  assert.equal(result.pairTotalAfter, 50);
});

test('rejeita nova transferência acima do saldo remanescente', () => {
  const afterFirstTransfer = { ...source, currentLimit: 15 };
  assert.throws(
    () => calculatePhotoQuotaTransfer('evento-1', afterFirstTransfer, { ...destination, currentLimit: 35 }, 10),
    /somente 7 fotos disponíveis/,
  );
});

test('participante que já utilizou toda a cota não pode ceder fotos', () => {
  assert.throws(
    () => calculatePhotoQuotaTransfer('evento-1', { ...source, currentLimit: 25, usedPhotos: 25 }, destination, 1),
    /não possui fotos disponíveis/,
  );
});

test('rejeita quantidade zero, negativa ou fracionada', () => {
  for (const quantity of [0, -1, 1.5]) {
    assert.throws(() => calculatePhotoQuotaTransfer('evento-1', source, destination, quantity), PhotoQuotaTransferError);
  }
});

test('rejeita transferência para o próprio participante', () => {
  assert.throws(() => calculatePhotoQuotaTransfer('evento-1', source, source, 1), /participantes diferentes/);
});

test('rejeita participantes de eventos diferentes', () => {
  assert.throws(
    () => calculatePhotoQuotaTransfer('evento-1', source, { ...destination, eventId: 'evento-2' }, 1),
    /mesmo evento/,
  );
});

test('rejeita participante de origem ou destino inexistente', () => {
  assert.throws(() => calculatePhotoQuotaTransfer('evento-1', null, destination, 1), /origem não encontrado/);
  assert.throws(() => calculatePhotoQuotaTransfer('evento-1', source, null, 1), /destino não encontrado/);
});
