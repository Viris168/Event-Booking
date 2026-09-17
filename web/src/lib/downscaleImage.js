/**
 * Shrink a picked image before it is uploaded, via a canvas.
 *
 * Written for the payout receipt drop zone, where the file is on its way to a
 * vision model rather than to storage. That changes what "good enough" means: a
 * 12-megapixel phone photo of a phone screen carries no more *readable text*
 * than a 1024px one, but it costs the admin an upload they are sitting and
 * waiting through, and it is base64-encoded on the next hop, a third larger
 * again. The transaction id survives the downscale; the wait does not.
 *
 * Deliberately not reusing ImageCropDialog's canvas path. That one crops to a
 * slot's shape and its output is what Cloudinary keeps forever, so it is worth
 * a dialog and a confirm. Here there is nothing to choose - no shape, no
 * framing, nothing kept - and asking an admin to crop a receipt before it can
 * be read would be a step invented for its own sake.
 *
 * Going through a canvas also strips EXIF, which matters twice over. The
 * orientation tag is the visible half: a phone photo stores its rotation as
 * metadata rather than in the pixels, so an untouched upload often reaches the
 * model sideways and reads as nothing at all. The rest of EXIF is the quieter
 * half - GPS coordinates and a device id, on an image about to be posted to a
 * third-party API. Neither belongs in a bank reference lookup.
 */

const MAX_EDGE = 1024
const QUALITY = 0.7

export async function downscaleImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  const bitmap = await loadBitmap(file)

  try {
    // Only ever down. Scaling a small screenshot UP invents pixels, which makes
    // the upload bigger and the text no sharper.
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    // Receipts are text on a flat background, which is the case where the
    // browser's default smoothing does most good and costs least.
    ctx.imageSmoothingQuality = 'high'
    // A JPEG has no alpha channel, and an unpainted canvas is transparent
    // black - which flattens to BLACK, not white, taking the text with it if
    // the source was a PNG with any transparency at all.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) throw new Error('canvas produced no image')

    // A File rather than a Blob so the multipart part has a filename, and a
    // .jpg name because the bytes are now JPEG whatever was dropped in.
    return new File([blob], 'receipt.jpg', { type: 'image/jpeg' })
  } finally {
    bitmap.close?.()
  }
}

/**
 * createImageBitmap where it exists, an <img> everywhere else.
 *
 * Safari only grew createImageBitmap recently enough that the fallback is still
 * worth carrying, and this runs on whatever laptop is in the office.
 */
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('the file could not be decoded as an image'))
      img.src = url
    })
  } finally {
    // After the load has settled either way: revoking earlier can abort the
    // decode in some browsers.
    URL.revokeObjectURL(url)
  }
}
