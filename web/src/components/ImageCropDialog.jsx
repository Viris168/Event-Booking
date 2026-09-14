import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cropper from 'react-easy-crop'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * Crop one picked image to a slot's shape before it is uploaded.
 *
 * <p>The two slots want different shapes - a portrait cover and a wide banner -
 * and asking an organiser to produce two differently-cropped files themselves
 * is the kind of task that ends with a stretched logo.
 *
 * <p><b>The crop is destructive, on purpose.</b> The canvas output is what gets
 * uploaded, so Cloudinary holds exactly what was shown and the upload endpoint
 * needs no change. The alternative - store the original plus crop coordinates
 * and cut at render time, as Facebook does - makes re-cropping free but costs
 * new columns, a render pipeline, and a migration. Re-cropping is rare here;
 * uploading again is an acceptable price for it.
 *
 * <p>Exports through a canvas, which also strips EXIF - including the
 * orientation tag. That matters: a phone photo carries its rotation as metadata
 * rather than in the pixels, so an uploaded original often arrives sideways.
 * Drawing it here bakes in the rotation the user actually saw.
 *
 * <p><b>`aspect={null}` fits the crop to the picked image itself</b>, rather
 * than to a fixed shape. react-easy-crop has no real unconstrained mode - its
 * `aspect` prop always resolves to a number, defaulting to 4/3 even when left
 * undefined, so a caller that actually wants "don't force a shape" (a venue
 * seating chart, which ranges from a near-square bowl to a 2:1 hall) got a
 * silent 4:3 crop that cut the sides off anything wider.
 *
 * <p>The image's own ratio is read BEFORE the Cropper ever mounts, with a
 * plain {@code Image()} probe, rather than by passing a fallback aspect and
 * correcting it once react-easy-crop reports the size itself. Correcting it
 * after the fact means the Cropper mounts once with the wrong aspect, and
 * its first emitted crop area is sized for THAT aspect - measured against a
 * container that has often not even laid out yet, so that first area can be
 * zero-sized. If nothing the user does prompts a second emit before they
 * confirm, a zero-sized area is exactly what gets cropped: a few-byte,
 * undecodable "image". Resolving the aspect first means the Cropper's very
 * first render, and its very first emitted area, already use the right
 * shape - nothing to correct out from under it later.
 */
export default function ImageCropDialog({ open, file, aspect, title, onCancel, onCropped }) {
  const { locale } = useLocale()
  const km = locale === 'km'

  const [src, setSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState(null)
  const [busy, setBusy] = useState(false)
  // Only set when `aspect` itself is null - see the class doc above.
  const [autoAspect, setAutoAspect] = useState(null)
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!file) {
      setSrc(null)
      return undefined
    }
    let cancelled = false
    const url = URL.createObjectURL(file)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setAutoAspect(null)

    if (aspect == null) {
      // Probed separately from the Cropper's own <img>, and gated on THIS
      // load rather than the Cropper's onMediaLoaded, precisely so `src`
      // (and therefore the Cropper mounting at all) waits for it.
      const probe = new Image()
      probe.onload = () => {
        if (cancelled) return
        setAutoAspect(probe.naturalWidth / probe.naturalHeight)
        setSrc(url)
      }
      probe.src = url
    } else {
      setSrc(url)
    }

    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file, aspect])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    cancelRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open, busy, onCancel])

  const onComplete = useCallback((_, pixels) => setArea(pixels), [])

  /*
   * react-easy-crop measures the crop area against its own stage element's
   * getBoundingClientRect(), which can still be 0x0 on the very first
   * measurement if that element has not been through a layout pass yet - the
   * dialog only just mounted via a portal. The area it emits from that first
   * pass is degenerate (zero-sized), and cropToBlob would happily draw a
   * zero-sized canvas from it: a few-byte, undecodable "image", uploaded
   * without complaint. A later measurement corrects it - the gap is a single
   * layout pass, imperceptible to an actual click - but a confirm that lands
   * inside that gap must not be allowed to go through. Guarding on the
   * area's own size is what makes this robust regardless of what the true
   * cause of any particular bad measurement turns out to be.
   */
  const validArea = area && area.width > 0 && area.height > 0

  async function confirm() {
    if (!validArea || !src || busy) return
    setBusy(true)
    try {
      const blob = await cropToBlob(src, area)
      // Kept as a File so the name survives into Cloudinary and the FormData
      // part looks the same as an uncropped upload.
      onCropped(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }))
    } finally {
      setBusy(false)
    }
  }

  if (!open || !src) return null

  return createPortal(
    <div className="crop-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panel crop-panel">
        <div className="panel-head">
          <h2>{title}</h2>
          <span className="small muted">
            {km ? 'អូសដើម្បីរៀបចំ · រំកិលដើម្បីពង្រីក' : 'Drag to position · scroll to zoom'}
          </span>
        </div>

        <div className="crop-stage">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            // `src` (and so this mount) is held back until autoAspect is
            // resolved when aspect is null - see the class doc above - so by
            // the time the Cropper exists at all, this is already correct.
            aspect={aspect ?? autoAspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
            restrictPosition
          />
        </div>

        <div className="crop-zoom">
          <Icon name="minus" size={14} />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label={km ? 'ពង្រីក' : 'Zoom'}
          />
          <Icon name="plus" size={14} />
        </div>

        <div className="crop-foot">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {km ? 'បោះបង់' : 'Cancel'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={confirm}
            disabled={busy || !validArea}
          >
            {busy ? (km ? 'កំពុងកាត់…' : 'Cropping…') : km ? 'យកតាមនេះ' : 'Use this crop'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Draw the selected region to a canvas and hand back a JPEG.
 *
 * <p>Capped at 1600px on the long edge. A modern phone shoots 4000px wide, and
 * a cover rendered at 400px gains nothing from the other 3600 - it only makes
 * the upload slow on the venue wifi where organisers actually do this.
 */
async function cropToBlob(src, area) {
  const image = await loadImage(src)

  const scale = Math.min(1, 1600 / Math.max(area.width, area.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(area.width * scale)
  canvas.height = Math.round(area.height * scale)

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    area.x, area.y, area.width, area.height,
    0, 0, canvas.width, canvas.height,
  )

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = src
  })
}
