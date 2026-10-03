import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, X, Flashlight, FlashlightOff } from 'lucide-react';

// Camera barcode scanner using the native BarcodeDetector API (Chrome/Android/Edge).
// Progressive enhancement: if unsupported (e.g. iOS Safari today), the caller still has manual entry.
// - one-shot (default): calls onScan(code) once, then stops.
// - continuous: calls onScan(code) for each scan and keeps going (for rapid delivery book-in), ignoring
//   the same code if re-read within a short window so one barcode isn't counted twice.
const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

// A short confirmation beep (WebAudio) + vibrate, so staff know a scan registered without looking.
function feedback() {
  try { if (navigator.vibrate) navigator.vibrate(50); } catch { /* ignore */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880; gain.gain.value = 0.05;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close().catch(() => {}); }, 90);
  } catch { /* audio not allowed — vibrate still fires */ }
}

export default function BarcodeScanner({ onScan, onClose, continuous = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastRef = useRef({ code: null, armed: true });
  const [error, setError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  // Explain the camera BEFORE the browser's permission prompt (Phase 2.6e). First-ever use shows a short
  // primer; after the owner taps "Turn on camera" we remember it and go straight to the camera next time.
  const [primed, setPrimed] = useState(() => { try { return localStorage.getItem('vendora:camera-primed') === '1'; } catch { return false; } });

  useEffect(() => {
    if (!supported) { setError('unsupported'); return undefined; }
    if (!primed) return undefined; // wait for the primer; don't request the camera yet
    let cancelled = false;
    let detector;
    try {
      // eslint-disable-next-line no-undef
      detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      });
    } catch {
      setError('unsupported');
      return undefined;
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) { video.srcObject = stream; await video.play().catch(() => {}); }
        // Torch is only on some devices/tracks.
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track && track.getCapabilities ? track.getCapabilities() : {};
          if (caps && caps.torch) setTorchAvailable(true);
        } catch { /* no torch */ }

        let emptyTicks = 0;
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length) {
              const value = codes[0].rawValue;
              if (value) {
                if (!continuous) { stop(); feedback(); onScan(value); return; }
                // continuous: count a code once per physical presentation. A different code counts straight
                // away; the SAME code only counts again after the item has left the frame (a few confirmed
                // empty frames re-arm it), so holding one barcode steady can't inflate the count (audit W5).
                emptyTicks = 0;
                if (value !== lastRef.current.code || lastRef.current.armed) {
                  lastRef.current = { code: value, armed: false };
                  feedback();
                  onScan(value);
                }
              }
            } else {
              // a confirmed empty frame (detect succeeded, saw nothing) — item is out of view
              emptyTicks += 1;
              if (emptyTicks >= 3) lastRef.current.armed = true;
            }
          } catch { /* frame not ready — keep trying (does NOT count as an empty frame) */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setError('denied');
      }
    })();

    function stop() {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    }
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuous, primed]);

  function allowCamera() {
    try { localStorage.setItem('vendora:camera-primed', '1'); } catch { /* ignore */ }
    setPrimed(true);
  }

  async function toggleTorch() {
    try {
      const track = streamRef.current && streamRef.current.getVideoTracks()[0];
      if (!track) return;
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch { /* torch toggle failed */ }
  }

  // First-use primer: explain the camera before the browser asks for permission (Phase 2.6e).
  if (supported && !primed && !error) {
    return (
      <div className="rounded-2xl bg-gray-50 p-5 text-center">
        <Camera className="mx-auto mb-2 h-8 w-8 text-primary" />
        <p className="text-sm font-semibold text-gray-900">Use your camera to scan barcodes?</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-gray-500">Vendora only reads barcodes on your device — it never records or uploads video. You can also type codes by hand.</p>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" onClick={allowCamera} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">Turn on camera</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">Not now</button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-gray-50 p-5 text-center">
        <CameraOff className="mx-auto mb-2 h-8 w-8 text-gray-400" />
        <p className="text-sm text-gray-600">
          {error === 'denied'
            ? 'Camera permission was blocked. Type the barcode below instead.'
            : 'Camera scanning needs Chrome or an Android device. Type the barcode below instead.'}
        </p>
        <button type="button" onClick={onClose} className="mt-3 text-sm font-semibold text-primary hover:underline">
          Close camera
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} className="h-56 w-full object-cover" playsInline muted />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-24 w-52 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-2 text-white">
        <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-xs">
          <Camera className="h-3.5 w-3.5" /> {continuous ? 'Keep scanning' : 'Point at a barcode'}
        </span>
        <div className="flex items-center gap-1">
          {torchAvailable && (
            <button type="button" onClick={toggleTorch} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40" aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}>
              {torchOn ? <FlashlightOff className="h-4 w-4" /> : <Flashlight className="h-4 w-4" />}
            </button>
          )}
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40" aria-label="Close camera">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export const barcodeScanSupported = supported;
