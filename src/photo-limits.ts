export type EventPhotoLimits = {
  participantLimit: number;
  photoLimitPerParticipant: number;
  photoLimitTotal: number;
};

export type EventPhotoLimitAdjustment = EventPhotoLimits & {
  participantDelta: number;
  perParticipantDelta: number;
  capacityDelta: number;
  billedPhotos: number;
};

function requirePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} deve ser um número inteiro maior que zero.`);
  }
  return value;
}

export function calculatePhotoLimitTotal(participantLimit: number, photoLimitPerParticipant: number) {
  const participants = requirePositiveInteger(participantLimit, 'O limite de participantes');
  const perParticipant = requirePositiveInteger(photoLimitPerParticipant, 'O limite por participante');
  const total = participants * perParticipant;
  if (!Number.isSafeInteger(total)) throw new Error('O limite total de fotos é grande demais.');
  return total;
}

export function calculateEventPhotoLimitAdjustment(
  current: EventPhotoLimits,
  participantLimit: number,
  photoLimitPerParticipant: number,
): EventPhotoLimitAdjustment {
  const photoLimitTotal = calculatePhotoLimitTotal(participantLimit, photoLimitPerParticipant);
  return {
    participantLimit,
    photoLimitPerParticipant,
    photoLimitTotal,
    participantDelta: participantLimit - current.participantLimit,
    perParticipantDelta: photoLimitPerParticipant - current.photoLimitPerParticipant,
    capacityDelta: photoLimitTotal - current.photoLimitTotal,
    billedPhotos: Math.max(photoLimitTotal - current.photoLimitTotal, 0),
  };
}

export function adjustIndividualPhotoLimit(currentLimit: number, perParticipantDelta: number) {
  const adjusted = currentLimit + perParticipantDelta;
  if (!Number.isSafeInteger(adjusted) || adjusted < 0) {
    throw new Error('O ajuste deixaria um limite individual inválido.');
  }
  return adjusted;
}

export function parsePersonalUpgradeUnits(value: unknown) {
  const units = Number(value);
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new Error('As fotos precisam ser maiores que 0.');
  }
  if (!Number.isSafeInteger(units * 7)) {
    throw new Error('A quantidade de envios é grande demais.');
  }
  return units;
}
