import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, Upload, ImageOff, Trash2, Check, Info, Loader2, RefreshCw, Cloud, CloudOff, UploadCloud, AlertCircle } from 'lucide-react';
import {
  resolveImage, getThumbLocal, saveImage, removeImage, restoreImage, confirmSuggested,
  backupAvailable, backupImage, fetchImageToCache, fetchSuggestedImage,
  getBackupState, deleteBackup, retryBackups, BACKUP_STATE,
} from '../../lib/productImages';

// Small, honest badge of where a saved photo lives: on this device only, uploading, safely backed up, or a
// failed upload the owner can retry. Only meaningful for a stored (owner/catalogue) image.
function BackupBadge({ state, onRetry }) {
  if (state === BACKUP_STATE.DONE) {
    return <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600"><Cloud className="h-3 w-3" /> Backed up</span>;
  }
  if (state === BACKUP_STATE.PENDING) {
    return <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400"><UploadCloud className="h-3 w-3 animate-pulse" /> Backing up…</span>;
  }
  if (state === BACKUP_STATE.FAILED) {
    return (
      <button type="button" onClick={onRetry} className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 active:scale-95">
        <AlertCircle className="h-3 w-3" /> Backup failed — retry
      </button>
    );
  }
  return <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400"><CloudOff className="h-3 w-3" /> On this device</span>;
}

const MAX_SOURCE_BYTES = 12 * 1024 * 1024; // pre-compression guard; we downscale anyway
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(file);
  });
}

/**
 * Editable product picture. Resolves owner → catalogue → provider-suggestion → placeholder, never blocking
 * (a placeholder shows immediately while bytes load). The parent persists the ref via `onSave`/`onRemove`
 * (e.g. inventory updateProduct({ image })). Reusable in scan, inventory and delivery screens.
 */
export default function ProductImage({ product, suggested = null, onSave, onRemove, size = 'lg', editable = true, barcode = null }) {
  const resolved = resolveImage(product, suggested);
  const stored = resolved.state === 'owner' || resolved.state === 'catalogue';
  const [thumb, setThumb] = useState(() => (stored ? getThumbLocal(resolved.id) : null));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState(() => (stored ? getBackupState(resolved.id).state : BACKUP_STATE.LOCAL));
  const camRef = useRef(null);
  const fileRef = useRef(null);

  const refreshBackup = (id) => setBackup(getBackupState(id).state);

  const box = size === 'sm' ? 'h-12 w-12' : 'h-28 w-28';

  // Load a stored image's thumbnail (local first; fetch from the shop's backup if not on this device). Never
  // blocks the screen — this runs in the background and just fills the thumbnail when ready.
  useEffect(() => {
    let live = true;
    if (resolved.state === 'owner' || resolved.state === 'catalogue') {
      setBackup(getBackupState(resolved.id).state);
      const local = getThumbLocal(resolved.id);
      if (local) { setThumb(local); return undefined; }
      setLoading(true);
      (async () => {
        // Not on this device — pull it from the shop's backup (second-device recovery). Success means the
        // server holds it, so reflect that as backed-up locally too.
        if (await backupAvailable()) { const r = await fetchImageToCache(resolved.id); if (r.ok && live) setBackup(BACKUP_STATE.DONE); }
        if (live) { setThumb(getThumbLocal(resolved.id)); setLoading(false); }
      })();
    } else if (resolved.state === 'suggested') {
      setLoading(true);
      (async () => {
        const d = await fetchSuggestedImage(resolved.url);
        if (live) { setThumb(d); setLoading(false); }
      })();
    } else {
      setThumb(null);
    }
    return () => { live = false; };
  }, [resolved.state, resolved.id, resolved.url]);

  async function onPicked(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.type && !OK_TYPES.includes(f.type)) { toast.error('Use a JPEG, PNG or WebP photo.'); return; }
    if (f.size > MAX_SOURCE_BYTES) { toast.error('That image is too large.'); return; }
    setBusy(true);
    try {
      const src = await readFileDataUrl(f);
      const saved = await saveImage(src, { source: 'owner' });
      if (!saved.ok) { toast.error(saved.error || 'Couldn’t save that photo'); return; }
      setThumb(saved.thumb);
      onSave?.({ id: saved.id, source: 'owner', attribution: null, updatedAt: Date.now() });
      // Back up in the background; the badge tracks local → pending → backed-up / failed.
      setBackup(BACKUP_STATE.PENDING);
      backupImage(saved.id, { barcode, source: 'owner' }).then(() => refreshBackup(saved.id));
      toast.success('Photo saved');
    } catch { toast.error('Couldn’t read that photo'); }
    finally { setBusy(false); }
  }

  async function useSuggested() {
    setBusy(true);
    try {
      const ref = await confirmSuggested(suggested, { barcode });
      if (!ref) { toast.error('Couldn’t fetch that image — try taking your own photo.'); return; }
      setThumb(getThumbLocal(ref.id));
      onSave?.(ref);
      refreshBackup(ref.id); // confirmSuggested already kicks off a backup when available
      toast.success('Added — you can replace it with your own photo any time.');
    } finally { setBusy(false); }
  }

  function doRemove() {
    const id = resolved.id;
    const src = product?.image?.source || 'owner';
    const res = removeImage(id);
    deleteBackup(id); // remove the authorised server copy too (best-effort, async)
    onRemove?.();
    setThumb(null);
    setBackup(BACKUP_STATE.LOCAL);
    if (res.recoverable) {
      toast((t) => (
        <span className="flex items-center gap-2 text-sm">Photo removed
          <button type="button" onClick={() => { const r = restoreImage(id); if (r.ok) { onSave?.({ id, source: src, updatedAt: Date.now() }); setThumb(r.thumb); setBackup(BACKUP_STATE.PENDING); backupImage(id, { barcode, source: src }).then(() => refreshBackup(id)); } toast.dismiss(t.id); }} className="font-semibold text-primary underline">Undo</button>
        </span>
      ), { duration: 6000 });
    } else { toast('Photo removed'); }
  }

  async function handleRetry() {
    setBackup(BACKUP_STATE.PENDING);
    await retryBackups();
    refreshBackup(resolved.id);
  }

  const showImg = thumb || null;
  const isSuggested = resolved.state === 'suggested';

  return (
    <div className={size === 'sm' ? 'flex items-center gap-2' : ''}>
      <div className={`relative ${box} shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50`}>
        {showImg ? (
          <img src={showImg} alt={product?.name ? `Photo of ${product.name}` : 'Product photo'} className="h-full w-full object-cover" onError={() => setThumb(null)} />
        ) : loading ? (
          <span className="flex h-full w-full items-center justify-center text-gray-300"><Loader2 className="h-5 w-5 animate-spin" /></span>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-gray-300"><ImageOff className={size === 'sm' ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={1.5} /></span>
        )}
        {isSuggested && showImg && (
          <span className="absolute inset-x-0 bottom-0 bg-amber-500/90 px-1 py-0.5 text-center text-[9px] font-bold text-white">SUGGESTED</span>
        )}
      </div>

      {editable && size !== 'sm' && (
        <div className="mt-2 space-y-1.5">
          {isSuggested ? (
            <>
              <button type="button" disabled={busy || !showImg} onClick={useSuggested} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Use this photo
              </button>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => camRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95"><Camera className="h-3.5 w-3.5" /> Take</button>
                <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95"><Upload className="h-3.5 w-3.5" /> Upload</button>
              </div>
              {resolved.attribution && <p className="flex items-start gap-1 text-[9px] leading-tight text-gray-400"><Info className="mt-0.5 h-2.5 w-2.5 shrink-0" /> {resolved.attribution}</p>}
            </>
          ) : resolved.state === 'placeholder' ? (
            <div className="flex gap-1.5">
              <button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary-50 px-2 py-1.5 text-[11px] font-semibold text-primary active:scale-95 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} Take photo</button>
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95 disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> Upload</button>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => camRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95"><RefreshCw className="h-3.5 w-3.5" /> Replace</button>
                <button type="button" onClick={doRemove} className="flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 active:scale-95" aria-label="Remove photo"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <BackupBadge state={backup} onRetry={handleRetry} />
            </>
          )}
        </div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onPicked} hidden />
      <input ref={fileRef} type="file" accept="image/*" onChange={onPicked} hidden />
    </div>
  );
}

/** Light display-only thumbnail for lists (inventory/delivery). Non-blocking; placeholder when absent. */
export function ProductThumb({ product, suggested = null, size = 'sm' }) {
  const resolved = resolveImage(product, suggested);
  const [thumb, setThumb] = useState(() => (resolved.state === 'owner' || resolved.state === 'catalogue' ? getThumbLocal(resolved.id) : null));
  useEffect(() => {
    let live = true;
    if ((resolved.state === 'owner' || resolved.state === 'catalogue')) {
      const local = getThumbLocal(resolved.id);
      if (local) { setThumb(local); return undefined; }
      (async () => { if (await backupAvailable()) { await fetchImageToCache(resolved.id); if (live) setThumb(getThumbLocal(resolved.id)); } })();
    } else { setThumb(null); }
    return () => { live = false; };
  }, [resolved.state, resolved.id]);
  const box = size === 'sm' ? 'h-10 w-10' : 'h-14 w-14';
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50`}>
      {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" onError={() => setThumb(null)} /> : <ImageOff className="h-4 w-4 text-gray-300" strokeWidth={1.5} />}
    </span>
  );
}
