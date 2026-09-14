import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, X } from 'lucide-react';

// Camera barcode scanner using the native BarcodeDetector API (Chrome/Android/Edge).
// Progressive enhancement: if unsupported (e.g. iOS Safari today), the caller still
// has manual entry. Calls onScan(code) once per detected code, then stops.
const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supported) { setError('unsupported'); return undefined; }
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length) {
              const value = codes[0].rawValue;
              if (value) { stop(); onScan(value); return; }
            }
          } catch { /* frame not ready — keep trying */ }
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
  }, []);

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
      {/* aiming reticle */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-24 w-52 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-2 text-white">
        <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-xs">
          <Camera className="h-3.5 w-3.5" /> Point at a barcode
        </span>
        <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40" aria-label="Close camera">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export const barcodeScanSupported = supported;
