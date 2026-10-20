'use client';

// Câmera do Luma no navegador: foto com um toque, vídeo segurando o botão,
// troca entre câmera frontal e traseira, zoom de pinça e foco por toque.
// Componente extraído do projeto. As classes CSS ficam no código privado.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Camera, SwitchCamera, Upload, Video, X } from 'lucide-react';
import {
  DEFAULT_ZOOM_RANGE,
  MAX_VIDEO_MS,
  applyDigitalZoom,
  normalizeZoom,
  outputSize,
  pickRecorderMimeType,
  pinchZoom,
  recordedDuration,
  tapToSensorPoint,
  visibleSourceRect,
  type ZoomRange,
} from './camera-math';
import { videoExtensionFromMime } from './media-files';

type FacingMode = 'environment' | 'user';

// Tempo segurando o botão para a câmera entender que é vídeo e não foto
const HOLD_TO_RECORD_MS = 220;
const MAX_PHOTO_SIDE = 1600;

type CameraCaptureProps = {
  libraryEnabled: boolean;
  onClose: () => void;
  onChooseFile: () => void;
  onCapture: (file: File, durationMs: number | null) => void | Promise<void>;
  showToast: (message: string) => void;
};

// Pede a câmera com a qualidade ideal e vai afrouxando as exigências se o aparelho recusar
async function openCameraStream(facingMode: FacingMode) {
  const video = { width: { ideal: 1280 }, height: { ideal: 720 } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { ...video, facingMode: { exact: facingMode } }, audio: true });
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { ...video, facingMode: { ideal: facingMode } }, audio: true });
    } catch {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
    }
  }
}

export function CameraCapture({ libraryEnabled, onClose, onChooseFile, onCapture, showToast }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pressTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const gestureWasVideoRef = useRef(false);
  const zoomRef = useRef(1);
  const pinchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const focusTapRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const pinchGestureRef = useRef(false);
  const focusTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState<ZoomRange>(DEFAULT_ZOOM_RANGE);
  const [hardwareZoom, setHardwareZoom] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  const stopTimers = () => {
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
    pressTimerRef.current = null;
    progressTimerRef.current = null;
  };

  // Abre a câmera sempre que o usuário troca entre frontal e traseira
  useEffect(() => {
    let mounted = true;
    const start = async () => {
      setReady(false);
      setCameraError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('A câmera ao vivo não está disponível neste navegador.');
        return;
      }
      try {
        zoomRef.current = 1;
        setZoom(1);
        setZoomRange(DEFAULT_ZOOM_RANGE);
        setHardwareZoom(false);
        const stream = await openCameraStream(facingMode);
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        // Se a câmera tiver zoom óptico ou do próprio aparelho, ele é usado no lugar do zoom digital
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack?.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } };
        if (capabilities?.zoom && capabilities.zoom.max > capabilities.zoom.min) {
          const settings = videoTrack.getSettings() as MediaTrackSettings & { zoom?: number };
          const initialZoom = Math.max(capabilities.zoom.min, Math.min(capabilities.zoom.max, settings.zoom ?? capabilities.zoom.min));
          setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max, step: capabilities.zoom.step || 0.1 });
          zoomRef.current = initialZoom;
          setZoom(initialZoom);
          setHardwareZoom(true);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (mounted) setReady(true);
      } catch {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraError('Permita o acesso à câmera ou escolha uma foto ou vídeo do aparelho.');
      }
    };
    void start();
    return () => {
      mounted = false;
      stopTimers();
      if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [facingMode]);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // A foto sai com o mesmo enquadramento e o mesmo zoom que aparecem na tela
    let source = visibleSourceRect(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
    if (!hardwareZoom) source = applyDigitalZoom(source, zoom);
    const size = outputSize(source, MAX_PHOTO_SIDE);

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return showToast('Não foi possível tirar a foto.');
    if (facingMode === 'user') {
      // A câmera frontal aparece espelhada, e a foto mantém o que a pessoa viu
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) return showToast('Não foi possível tirar a foto.');
    await onCapture(new File([blob], `luma-${Date.now()}.jpg`, { type: 'image/jpeg' }), null);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      showToast('A gravação de vídeo não está disponível neste navegador.');
      return;
    }
    const mimeType = pickRecorderMimeType((type) => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 3_500_000,
        audioBitsPerSecond: 128_000,
      });
    } catch {
      showToast('Este navegador não conseguiu iniciar a gravação. Use “Galeria” para gravar com a câmera do celular.');
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    gestureWasVideoRef.current = true;
    startedAtRef.current = performance.now();
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      stopTimers();
      const durationMs = recordedDuration(startedAtRef.current, performance.now());
      const type = (recorder.mimeType || mimeType || 'video/webm').split(';')[0].toLowerCase();
      const blob = new Blob(chunksRef.current, { type });
      setRecording(false);
      setProgress(0);
      recorderRef.current = null;
      if (!blob.size) return showToast('Não foi possível gravar o vídeo.');
      void onCapture(new File([blob], `luma-${Date.now()}.${videoExtensionFromMime(type)}`, { type }), durationMs);
    };
    recorder.start(200);
    setRecording(true);
    // Atualiza o anel de progresso e para a gravação sozinha no limite de 10 s
    progressTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current;
      setProgress(Math.min(1, elapsed / MAX_VIDEO_MS));
      if (elapsed >= MAX_VIDEO_MS && recorder.state === 'recording') recorder.stop();
    }, 50);
  };

  // Botão de captura: um toque tira foto, segurar grava vídeo
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!ready) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Safari antigo pode não oferecer captura de ponteiro. */ }
    gestureWasVideoRef.current = false;
    pressTimerRef.current = window.setTimeout(startRecording, HOLD_TO_RECORD_MS);
  };

  const pointerUp = () => {
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    if (gestureWasVideoRef.current) {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      gestureWasVideoRef.current = false;
      return;
    }
    void capturePhoto();
  };

  const pointerCancel = () => {
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    gestureWasVideoRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const close = () => {
    if (recording) return;
    onClose();
  };

  const switchCamera = () => {
    if (recording) return;
    setReady(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setFacingMode((current) => current === 'environment' ? 'user' : 'environment');
  };

  const changeZoom = async (next: number) => {
    const normalized = normalizeZoom(next, zoomRange);
    zoomRef.current = normalized;
    setZoom(normalized);
    if (!hardwareZoom) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: normalized } as unknown as MediaTrackConstraintSet] });
    } catch {
      // Se o aparelho recusar o zoom próprio, volta para o zoom digital
      setHardwareZoom(false);
      setZoomRange(DEFAULT_ZOOM_RANGE);
      zoomRef.current = Math.max(1, Math.min(3, normalized));
      setZoom(zoomRef.current);
    }
  };

  const pinchDistance = () => {
    const points = [...pinchPointersRef.current.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };

  const focusCameraAt = async (clientX: number, clientY: number) => {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!video || !track || !ready) return;
    const rect = video.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Mostra a mira de foco no ponto tocado por menos de um segundo
    const visualX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const visualY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setFocusPoint({ x: visualX * 100, y: visualY * 100 });
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => setFocusPoint(null), 850);

    const source = visibleSourceRect(video.videoWidth, video.videoHeight, rect.width, rect.height);
    const sensorPoint = tapToSensorPoint(source, visualX, visualY, facingMode === 'user');
    const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & { focusMode?: string[] };
    const focusMode = capabilities?.focusMode?.includes('single-shot')
      ? 'single-shot'
      : capabilities?.focusMode?.includes('continuous')
        ? 'continuous'
        : undefined;
    const pointConstraint = {
      ...(focusMode ? { focusMode } : {}),
      pointsOfInterest: [sensorPoint],
    } as unknown as MediaTrackConstraintSet;
    try {
      await track.applyConstraints({ advanced: [pointConstraint] });
    } catch {
      if (!focusMode) return;
      try {
        await track.applyConstraints({ advanced: [{ focusMode } as unknown as MediaTrackConstraintSet] });
      } catch {
        // Alguns navegadores exibem a mira, mas mantêm o foco automático do aparelho.
      }
    }
  };

  // Gestos na imagem da câmera: um toque foca, dois dedos dão zoom
  const cameraPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (recording || (event.target as HTMLElement).closest('button')) return;
    focusTapRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    if (event.pointerType !== 'touch') return;
    pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Captura pode não existir em versões antigas do Safari. */ }
    if (pinchPointersRef.current.size === 2) {
      event.preventDefault();
      pinchGestureRef.current = true;
      focusTapRef.current = null;
      pinchStartRef.current = { distance: pinchDistance(), zoom: zoomRef.current };
    }
  };

  const cameraPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const focusTap = focusTapRef.current;
    // Se o dedo andar mais de 10 px, o toque deixa de contar como foco
    if (focusTap?.pointerId === event.pointerId && Math.hypot(event.clientX - focusTap.x, event.clientY - focusTap.y) > 10) {
      focusTap.moved = true;
    }
    if (!pinchPointersRef.current.has(event.pointerId)) return;
    pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = pinchStartRef.current;
    if (!start || pinchPointersRef.current.size < 2 || start.distance <= 0) return;
    event.preventDefault();
    void changeZoom(pinchZoom(start.zoom, start.distance, pinchDistance()));
  };

  const cameraPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const focusTap = focusTapRef.current;
    const shouldFocus = event.type === 'pointerup' && focusTap?.pointerId === event.pointerId && !focusTap.moved && !pinchGestureRef.current;
    pinchPointersRef.current.delete(event.pointerId);
    if (pinchPointersRef.current.size < 2) pinchStartRef.current = null;
    if (focusTap?.pointerId === event.pointerId) focusTapRef.current = null;
    if (pinchPointersRef.current.size === 0) pinchGestureRef.current = false;
    if (shouldFocus) void focusCameraAt(event.clientX, event.clientY);
  };

  return (
    <div className="modal-backdrop camera-backdrop" role="dialog" aria-modal="true" aria-labelledby="camera-title">
      <section className="camera-capture">
        <div className="camera-stage" onPointerDown={cameraPointerDown} onPointerMove={cameraPointerMove} onPointerUp={cameraPointerEnd} onPointerCancel={cameraPointerEnd}>
          <video ref={videoRef} className={facingMode === 'user' ? 'mirrored' : ''} style={{ '--camera-zoom': hardwareZoom ? 1 : zoom } as CSSProperties} autoPlay muted playsInline />
          {focusPoint && <span className="camera-focus-ring" style={{ left: `${focusPoint.x}%`, top: `${focusPoint.y}%` }} aria-hidden="true" />}
          {cameraError && <div className="camera-error"><Camera size={34} /><p>{cameraError}</p>{libraryEnabled && <button className="secondary-button" onClick={onChooseFile}>Escolher do aparelho</button>}</div>}
          <button className="camera-close" onClick={close} aria-label="Fechar câmera"><X size={20} /></button>
          {!cameraError && !recording && <button className="camera-switch" onClick={switchCamera} disabled={!ready} aria-label={`Usar câmera ${facingMode === 'environment' ? 'frontal' : 'traseira'}`}><SwitchCamera size={19} /><span>{facingMode === 'environment' ? 'Frontal' : 'Traseira'}</span></button>}
          {!cameraError && ready && !recording && <div className="camera-pinch-hint" aria-live="polite"><strong>{zoom.toFixed(1)}×</strong><span>Toque para focar · use dois dedos para aproximar ou afastar{hardwareZoom && zoomRange.min < 1 ? ' · 0,5× disponível' : ''}</span></div>}
          {recording && <div className="recording-label"><span /> REC {Math.min(10, progress * 10).toFixed(1)}s</div>}
        </div>
        <div className="camera-controls">
          <div><h2 id="camera-title">Capture o momento</h2><p>Toque para tirar uma foto · segure para gravar</p></div>
          <button
            className={`snap-button ${recording ? 'recording' : ''}`}
            disabled={!ready}
            style={{ '--record-progress': `${progress * 360}deg` } as CSSProperties}
            onPointerDown={pointerDown}
            onPointerUp={pointerUp}
            onPointerCancel={pointerCancel}
            onContextMenu={(event) => event.preventDefault()}
            aria-label="Toque para foto ou segure para vídeo"
          ><span aria-hidden="true">{!recording && <Camera size={25} />}</span></button>
          <button className="library-button" onClick={onChooseFile} disabled={recording || !libraryEnabled} aria-label={libraryEnabled ? 'Escolher foto da galeria' : 'Upload pelo dispositivo desativado'}><Upload size={18} /><span>{libraryEnabled ? 'Galeria' : 'Bloqueado'}</span></button>
          <small><Video size={14} /> Fotos JPG, PNG ou GIF até 20 MB · a gravação de vídeo para automaticamente em 10 segundos.</small>
        </div>
      </section>
    </div>
  );
}
