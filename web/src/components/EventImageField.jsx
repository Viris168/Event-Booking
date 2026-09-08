import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import ImageCropDialog from './ImageCropDialog.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * One of an event's two image slots.
 *
 * <p>Deliberately works before the event exists. A file picked while CREATING
 * an event cannot be uploaded yet — Cloudinary's returned id has to land on a
 * row, and there is no row until save. So this component holds the {@code File}
 * and shows a local preview, and the form uploads it right after the create
 * call succeeds. Making the organiser save first and come back to add artwork
 * would be the easy implementation and a worse one.
 *
 * <p>The preview is an object URL, revoked on unmount. Leaking them keeps the
 * whole file alive in memory for the life of the tab, which on a page where
 * someone tries four covers is four full-size images.
 */
export default function EventImageField({
  label,
  hint,
  aspect = '3 / 4',
  cropAspect,
  currentUrl,
  file,
  onPick,
  onClear,
  busy = false,
}) {
  const { locale } = useLocale()
  const km = locale === 'km'
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)
  // The raw pick, held only until it has been cropped. The `file` prop is
  // always the cropped result, so the form never uploads an uncropped original.
  const [pending, setPending] = useState(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const shown = preview ?? currentUrl

  function pick(e) {
    const chosen = e.target.files?.[0]
    if (!chosen) return
    // Checked here as well as on the server: a 12 MB phone photo that fails
    // after a slow upload is a worse message than one refused instantly.
    if (!chosen.type.startsWith('image/')) {
      onPick(null, km ? 'ត្រូវជារូបភាព' : 'That is not an image file')
      return
    }
    if (chosen.size > 5 * 1024 * 1024) {
      onPick(null, km ? 'រូបភាពធំជាង 5MB' : 'Images must be 5MB or smaller')
      return
    }
    // Straight into the cropper rather than onPick: the two slots want
    // different shapes, and one photo should be able to serve either.
    setPending(chosen)
  }

  return (
    <div className="img-field">
      <div className="img-field-head">
        <span className="label">{label}</span>
        {shown && (
          <button
            type="button"
            className="img-field-clear"
            onClick={() => {
              onClear()
              if (inputRef.current) inputRef.current.value = ''
            }}
            disabled={busy}
          >
            {km ? 'ដកចេញ' : 'Remove'}
          </button>
        )}
      </div>

      <button
        type="button"
        className={`img-drop ${shown ? 'has-image' : ''}`}
        style={{ aspectRatio: aspect }}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {shown ? (
          <img src={shown} alt="" />
        ) : (
          <span className="img-drop-empty">
            <Icon name="grid" size={16} />
            {km ? 'ជ្រើសរូបភាព' : 'Choose an image'}
          </span>
        )}

        {/* Says the file is not saved yet. Without it a picked-but-unsaved
            image looks identical to one already on the server. */}
        {preview && (
          <span className="img-pending">{km ? 'មិនទាន់រក្សាទុក' : 'Not saved yet'}</span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={pick}
      />

      <ImageCropDialog
        open={!!pending}
        file={pending}
        aspect={cropAspect}
        title={label}
        onCancel={() => {
          setPending(null)
          // Cleared so re-picking the SAME file still fires a change event.
          if (inputRef.current) inputRef.current.value = ''
        }}
        onCropped={(cropped) => {
          setPending(null)
          if (inputRef.current) inputRef.current.value = ''
          onPick(cropped, null)
        }}
      />

      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}
