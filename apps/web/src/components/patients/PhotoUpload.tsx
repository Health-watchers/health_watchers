'use client';

import { useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { API_V1 } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface Props {
  patientId: string;
  patientName: string;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
  canEdit?: boolean;
}

const CROP_SIZE = 300; // canvas crop preview size in px

export default function PhotoUpload({
  patientId,
  patientName,
  photoUrl,
  thumbnailUrl,
  canEdit = false,
}: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = useState<string | null>(null);

  // Fetch pre-signed URL when avatar is clicked (view mode)
  const handleAvatarClick = useCallback(async () => {
    if (!photoUrl) return;
    try {
      const res = await fetch(`${API_V1}/patients/${patientId}/photo`);
      if (!res.ok) return;
      const data = await res.json();
      setResolvedPhotoUrl(data.data?.url ?? null);
    } catch {
      // ignore
    }
  }, [patientId, photoUrl]);

  // ── File selection ──────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be 5 MB or less.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are allowed.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewSrc(ev.target?.result as string);
      setCropOffset({ x: 0, y: 0 });
      setScale(1);
      setModalOpen(true);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // ── Canvas crop rendering ───────────────────────────────────────────────────

  const drawCrop = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);

    const scaledW = img.naturalWidth * scale;
    const scaledH = img.naturalHeight * scale;
    const drawX = (CROP_SIZE - scaledW) / 2 + cropOffset.x;
    const drawY = (CROP_SIZE - scaledH) / 2 + cropOffset.y;

    ctx.drawImage(img, drawX, drawY, scaledW, scaledH);

    // Overlay: darken outside circle
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [cropOffset, scale]);

  const onImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      imgRef.current = e.currentTarget;
      // Auto-fit image to crop area
      const img = e.currentTarget;
      const fitScale = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
      setScale(fitScale);
      setTimeout(drawCrop, 0);
    },
    [drawCrop]
  );

  // Re-draw whenever crop params change
  const onCanvasReady = useCallback(() => {
    drawCrop();
  }, [drawCrop]);

  // ── Drag to reposition ──────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setCropOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    drawCrop();
  };
  const onMouseUp = () => setDragging(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setDragging(true);
    setDragStart({ x: t.clientX - cropOffset.x, y: t.clientY - cropOffset.y });
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    const t = e.touches[0];
    setCropOffset({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y });
    drawCrop();
  };

  // ── Upload cropped image ────────────────────────────────────────────────────

  const handleUpload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Draw final crop without overlay
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = CROP_SIZE;
    finalCanvas.height = CROP_SIZE;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx || !imgRef.current) return;

    const img = imgRef.current;
    const scaledW = img.naturalWidth * scale;
    const scaledH = img.naturalHeight * scale;
    const drawX = (CROP_SIZE - scaledW) / 2 + cropOffset.x;
    const drawY = (CROP_SIZE - scaledH) / 2 + cropOffset.y;
    ctx.drawImage(img, drawX, drawY, scaledW, scaledH);

    finalCanvas.toBlob(
      async (blob) => {
        if (!blob) return;
        setUploading(true);
        setError(null);
        try {
          const form = new FormData();
          form.append('photo', blob, 'photo.jpg');
          const res = await fetch(`${API_V1}/patients/${patientId}/photo`, {
            method: 'POST',
            body: form,
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message ?? 'Upload failed');
          }
          setModalOpen(false);
          setPreviewSrc(null);
          setResolvedPhotoUrl(null);
          queryClient.invalidateQueries({ queryKey: queryKeys.patients.detail(patientId) });
        } catch (err: any) {
          setError(err.message);
        } finally {
          setUploading(false);
        }
      },
      'image/jpeg',
      0.9
    );
  };

  // ── Delete photo ────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!confirm('Remove this patient photo?')) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_V1}/patients/${patientId}/photo`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Delete failed');
      }
      setResolvedPhotoUrl(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.detail(patientId) });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const initials = patientName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Avatar */}
      <button
        type="button"
        onClick={handleAvatarClick}
        className="rounded-full focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        aria-label={`${patientName} profile photo`}
        title={photoUrl ? 'View photo' : 'No photo'}
      >
        <Avatar
          src={resolvedPhotoUrl ?? undefined}
          initials={initials}
          alt={patientName}
          size="lg"
          className="h-24 w-24 text-2xl"
        />
      </button>

      {/* Edit controls */}
      {canEdit && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload photo"
          >
            {photoUrl ? 'Change photo' : 'Upload photo'}
          </Button>
          {photoUrl && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete photo"
            >
              {deleting ? <Spinner size="sm" /> : 'Remove'}
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Crop modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setPreviewSrc(null);
        }}
        title="Crop photo"
      >
        <div className="flex flex-col items-center gap-4">
          {previewSrc && (
            <>
              {/* Hidden img for natural dimensions */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt=""
                className="sr-only"
                onLoad={onImgLoad}
                aria-hidden="true"
              />

              <p className="text-sm text-gray-500">Drag to reposition · scroll to zoom</p>

              <canvas
                ref={(el) => {
                  (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
                  if (el) onCanvasReady();
                }}
                width={CROP_SIZE}
                height={CROP_SIZE}
                className="cursor-grab rounded-full active:cursor-grabbing"
                style={{ touchAction: 'none' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onMouseUp}
                onWheel={(e) => {
                  e.preventDefault();
                  setScale((s) => Math.max(0.5, Math.min(4, s - e.deltaY * 0.001)));
                  drawCrop();
                }}
                aria-label="Crop preview"
              />

              <div className="flex w-full items-center gap-2">
                <label htmlFor="zoom-slider" className="text-sm text-gray-600 shrink-0">
                  Zoom
                </label>
                <input
                  id="zoom-slider"
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.01}
                  value={scale}
                  onChange={(e) => {
                    setScale(Number(e.target.value));
                    drawCrop();
                  }}
                  className="w-full"
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 justify-end w-full">
            <Button
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setPreviewSrc(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? <Spinner size="sm" /> : 'Save photo'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
