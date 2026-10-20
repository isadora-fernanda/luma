import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjustIndividualPhotoLimit,
  calculateEventPhotoLimitAdjustment,
  calculatePhotoLimitTotal,
  parsePersonalUpgradeUnits,
} from '../src/photo-limits.ts';

test('o total sempre acompanha participantes vezes fotos por participante', () => {
  assert.equal(calculatePhotoLimitTotal(50, 20), 1000);
  assert.equal(calculatePhotoLimitTotal(60, 25), 1500);
});

test('aumentos e reduções recalculam o total sem capacidade independente', () => {
  const current = { participantLimit: 50, photoLimitPerParticipant: 20, photoLimitTotal: 1000 };
  assert.deepEqual(calculateEventPhotoLimitAdjustment(current, 60, 25), {
    participantLimit: 60,
    photoLimitPerParticipant: 25,
    photoLimitTotal: 1500,
    participantDelta: 10,
    perParticipantDelta: 5,
    capacityDelta: 500,
    billedPhotos: 500,
  });
  assert.deepEqual(calculateEventPhotoLimitAdjustment(current, 40, 15), {
    participantLimit: 40,
    photoLimitPerParticipant: 15,
    photoLimitTotal: 600,
    participantDelta: -10,
    perParticipantDelta: -5,
    capacityDelta: -400,
    billedPhotos: 0,
  });
});

test('limites individuais personalizados acompanham a variação da base', () => {
  assert.equal(adjustIndividualPhotoLimit(28, 5), 33);
  assert.equal(adjustIndividualPhotoLimit(28, -4), 24);
});

test('valores inválidos não geram totais silenciosamente', () => {
  assert.throws(() => calculatePhotoLimitTotal(0, 20));
  assert.throws(() => calculatePhotoLimitTotal(10, 0));
  assert.throws(() => adjustIndividualPhotoLimit(2, -3));
});

test('upgrade pessoal aceita qualquer inteiro positivo, inclusive acima do antigo limite de 200', () => {
  assert.equal(parsePersonalUpgradeUnits(1), 1);
  assert.equal(parsePersonalUpgradeUnits(250), 250);
  assert.equal(parsePersonalUpgradeUnits(1000), 1000);
  assert.throws(() => parsePersonalUpgradeUnits(0));
  assert.throws(() => parsePersonalUpgradeUnits(10.5));
});
