export type ParticipantQuotaSnapshot = {
  id: string;
  eventId: string;
  currentLimit: number;
  usedPhotos: number;
};

export type PhotoQuotaTransfer = {
  quantity: number;
  sourceLimitBefore: number;
  sourceLimitAfter: number;
  sourceUsedPhotos: number;
  sourceAvailableBefore: number;
  sourceAvailableAfter: number;
  destinationLimitBefore: number;
  destinationLimitAfter: number;
  destinationUsedPhotos: number;
  destinationAvailableBefore: number;
  destinationAvailableAfter: number;
  pairTotalBefore: number;
  pairTotalAfter: number;
};

export class PhotoQuotaTransferError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PhotoQuotaTransferError';
    this.status = status;
  }
}

export function calculatePhotoQuotaTransfer(
  expectedEventId: string,
  source: ParticipantQuotaSnapshot | null,
  destination: ParticipantQuotaSnapshot | null,
  quantityValue: unknown,
): PhotoQuotaTransfer {
  const quantity = Number(quantityValue);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new PhotoQuotaTransferError('Informe uma quantidade inteira maior que zero.');
  }
  if (!source) throw new PhotoQuotaTransferError('Participante de origem não encontrado.', 404);
  if (!destination) throw new PhotoQuotaTransferError('Participante de destino não encontrado.', 404);
  if (source.id === destination.id) {
    throw new PhotoQuotaTransferError('Escolha participantes diferentes para a transferência.');
  }
  if (source.eventId !== expectedEventId || destination.eventId !== expectedEventId || source.eventId !== destination.eventId) {
    throw new PhotoQuotaTransferError('Os participantes precisam pertencer ao mesmo evento.');
  }
  if (source.currentLimit < 0 || destination.currentLimit < 0 || source.usedPhotos < 0 || destination.usedPhotos < 0) {
    throw new PhotoQuotaTransferError('Os dados de limite do evento estão inconsistentes.', 409);
  }

  const sourceAvailableBefore = Math.max(source.currentLimit - source.usedPhotos, 0);
  if (quantity > sourceAvailableBefore) {
    const availableLabel = sourceAvailableBefore === 0
      ? 'Este participante não possui fotos disponíveis'
      : `Este participante possui somente ${sourceAvailableBefore} foto${sourceAvailableBefore === 1 ? ' disponível' : 's disponíveis'}`;
    throw new PhotoQuotaTransferError(
      `${availableLabel} para redistribuição.`,
      409,
    );
  }

  const sourceLimitAfter = source.currentLimit - quantity;
  const destinationLimitAfter = destination.currentLimit + quantity;
  const pairTotalBefore = source.currentLimit + destination.currentLimit;
  const pairTotalAfter = sourceLimitAfter + destinationLimitAfter;
  if (sourceLimitAfter < source.usedPhotos || pairTotalAfter !== pairTotalBefore) {
    throw new PhotoQuotaTransferError('A transferência deixaria as cotas do evento inconsistentes.', 409);
  }

  return {
    quantity,
    sourceLimitBefore: source.currentLimit,
    sourceLimitAfter,
    sourceUsedPhotos: source.usedPhotos,
    sourceAvailableBefore,
    sourceAvailableAfter: sourceLimitAfter - source.usedPhotos,
    destinationLimitBefore: destination.currentLimit,
    destinationLimitAfter,
    destinationUsedPhotos: destination.usedPhotos,
    destinationAvailableBefore: Math.max(destination.currentLimit - destination.usedPhotos, 0),
    destinationAvailableAfter: Math.max(destinationLimitAfter - destination.usedPhotos, 0),
    pairTotalBefore,
    pairTotalAfter,
  };
}
