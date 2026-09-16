import React, { useState, useRef, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * CameraExpiryScanner
 * Opens the device camera, captures a photo, sends it to the AI endpoint,
 * and returns the detected expiry date via onDetected(isoDate).
 *
 * Props:
 *   productId?  - if provided, auto-saves a batch to the product
 *   onDetected  - callback(isoDateString, formattedDate)
 *   onClose     - callback to close the modal
 */
export default function CameraExpiryScanner({ productId, productName, onDetected, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase, setPhase] = useState('idle'); // idle | camera | scanning | confirmed | error
  const [detectedDate, setDetectedDate] = useState(null);
  const [detectedFormatted, setDetectedFormatted] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [quantity, setQuantity] = useState('');

  const startCamera = useCallback(async () => {
    setPhase('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      setPhase('error');
      setErrorMsg('Camera access denied. Please allow camera permission and try again.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    setPhase('scanning');

    try {
      const res = await api.post('/ai/scan-expiry', {
        image: base64,
        productId: productId || undefined,
      });

      if (!res.expiryDate) {
        setPhase('error');
        setErrorMsg('Could not detect an expiry date. Please try again with the date clearly visible.');
        return;
      }

      setDetectedDate(res.expiryDate);
      setDetectedFormatted(res.expiryDateFormatted);
      setPhase('confirmed');
    } catch (e) {
      setPhase('error');
      setErrorMsg(e.response?.data?.error || 'AI scan failed. Please try again.');
    }
  }, [productId, stopCamera]);

  const handleConfirm = useCallback(async () => {
    if (!detectedDate) return;

    if (productId && quantity) {
      try {
        await api.post(`/expiry/${productId}/batch`, {
          quantity: Number(quantity),
          expiryDate: detectedDate,
        });
        toast.success('Expiry batch saved');
      } catch {
        toast.error('Failed to save batch');
      }
    }

    onDetected?.(detectedDate, detectedFormatted);
    onClose?.();
  }, [detectedDate, detectedFormatted, productId, quantity, onDetected, onClose]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose?.();
  }, [stopCamera, onClose]);

  const reset = useCallback(() => {
    stopCamera();
    setPhase('idle');
    setDetectedDate(null);
    setDetectedFormatted(null);
    setErrorMsg('');
  }, [stopCamera]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: 420, maxWidth: '95vw', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>AI Expiry Scanner</h3>
            {productName && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{productName}</p>}
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {phase === 'idle' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Point your camera at the expiry date on the product packaging.<br />
                AI will read the date automatically.
              </p>
              <button
                onClick={startCamera}
                style={{
                  background: 'var(--blue)', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '12px 28px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Open Camera
              </button>
            </div>
          )}

          {phase === 'camera' && (
            <div>
              <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                <video
                  ref={videoRef}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  playsInline
                  muted
                />
                {/* Scanning crosshair overlay */}
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    width: '60%', height: '40%', border: '2px solid rgba(96,165,250,0.8)',
                    borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)',
                  }} />
                </div>
              </div>
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8, marginBottom: 14 }}>
                Position the expiry date inside the frame
              </p>
              <button
                onClick={captureAndScan}
                style={{
                  width: '100%', background: 'var(--blue)', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                📸 Capture & Scan
              </button>
            </div>
          )}

          {phase === 'scanning' && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ width: 40, height: 40, border: '3px solid var(--blue-dim)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Claude AI is reading the expiry date...</p>
            </div>
          )}

          {phase === 'confirmed' && (
            <div>
              <div style={{
                background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)',
                borderRadius: 10, padding: '16px 20px', marginBottom: 16, textAlign: 'center',
              }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>AI DETECTED EXPIRY DATE</p>
                <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--green-light)', fontFamily: 'monospace' }}>{detectedFormatted}</p>
              </div>

              {productId && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>QUANTITY TO SAVE (optional)</label>
                  <input
                    className="vd-input"
                    style={{ width: '100%' }}
                    type="number"
                    min="1"
                    placeholder="e.g. 12"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={reset} style={{
                  flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                }}>Retry</button>
                <button onClick={handleConfirm} style={{
                  flex: 2, background: 'var(--green)', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                }}>Confirm — {detectedFormatted}</button>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
              <p style={{ fontSize: 13, color: '#F87171', marginBottom: 16 }}>{errorMsg}</p>
              <button onClick={reset} style={{
                background: 'var(--blue)', color: '#fff', border: 'none',
                borderRadius: 10, padding: '10px 24px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Try Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
