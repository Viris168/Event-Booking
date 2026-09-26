import { useState } from 'react'
import FormDialog from '../FormDialog.jsx'
import { Alert, DateInput, Field, IconSelect } from '../ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { CATEGORIES } from '../../lib/categories.js'

/**
 * Datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time; the API speaks UTC
 * ISO. Same pair as EventFormPage's, and for the same reason: handing the input
 * a raw ISO string shows the organiser a time in a timezone they are not in.
 */
function toInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

function fromInput(value) {
  return value ? new Date(value).toISOString() : null
}

/**
 * Moderation's repair tool: fix what is wrong with somebody else's listing.
 *
 * <p>Deliberately narrower than the organiser's own form, and the omissions are
 * the design rather than a shortcut:
 *
 * <ul>
 *   <li><b>No pricing, zones or seat map.</b> That is the organiser's inventory,
 *       and rewriting it underneath tickets people have already bought is not
 *       moderation - a zone whose capacity drops below its sold count is a
 *       venue with more ticket-holders than seats.</li>
 *   <li><b>No venue move.</b> Seats belong to a venue, so moving an event with
 *       an assigned seat map means rebuilding that map. The organiser's form
 *       does that with care; a moderation dialog doing it in passing would
 *       silently strand every seat already sold.</li>
 *   <li><b>No images.</b> Uploads are their own multipart endpoints, scoped to
 *       the owner.</li>
 * </ul>
 *
 * <p>What is left is what a moderator actually corrects: the words, the
 * category and the four times. The event loads fresh from the admin endpoint
 * rather than from the table row, because the row carries only the columns the
 * table prints - the descriptions and the three secondary timestamps are not
 * among them.
 */
export default function AdminEventEditDialog({ open, event, busy, error, onSave, onClose }) {
  const { t, locale } = useLocale()
  const km = locale === 'km'

  const [form, setForm] = useState(null)

  /*
   * Fill the form the moment the event arrives, and refill it if the dialog is
   * pointed at a different one.
   *
   * Adjusted during render rather than in an effect - the pattern React
   * documents for state derived from a prop. The event is fetched, so `event`
   * is null on the first render and the dialog shows its loading state; when it
   * lands, this runs before the commit, so the fields appear filled rather than
   * blank for one frame.
   */
  const [loadedFor, setLoadedFor] = useState(null)
  if (open && event && loadedFor !== event.id) {
    setLoadedFor(event.id)
    setForm({
      title_en: event.title_en ?? '',
      title_km: event.title_km ?? '',
      description_en: event.description_en ?? '',
      description_km: event.description_km ?? '',
      category: event.category ?? 'music',
      starts_at: toInput(event.starts_at),
      doors_open_at: toInput(event.doors_open_at),
      sales_open_at: toInput(event.sales_open_at),
      sales_close_at: toInput(event.sales_close_at),
    })
  }

  if (!open) return null

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  /*
   * The same three orderings the server validates, checked here so a wrong one
   * is caught before the round trip. The server still enforces them - this is
   * the earlier of two answers to one question, not the only one.
   */
  const scheduleError = (() => {
    if (!form) return null
    const { starts_at: starts, doors_open_at: doors, sales_open_at: open_, sales_close_at: close } = form
    if (doors && starts && doors > starts) {
      return km ? 'ពេលបើកទ្វារត្រូវតែមុនពេលចាប់ផ្ដើម។' : 'Doors must open before the event starts.'
    }
    if (open_ && close && open_ >= close) {
      return km ? 'ការលក់ត្រូវបើកមុនពេលបិទ។' : 'Sales must open before they close.'
    }
    if (close && starts && close > starts) {
      return km ? 'ការលក់ត្រូវបិទមុនពេលចាប់ផ្ដើម។' : 'Sales must close before the event starts.'
    }
    return null
  })()

  return (
    <FormDialog
      open={open}
      title={km ? 'កែសម្រួលព្រឹត្តិការណ៍' : 'Edit event'}
      subtitle={event ? `#${event.id} · ${event.status}` : undefined}
      submitLabel={t('save')}
      busy={busy || !form}
      submitDisabled={!form || !form.title_en.trim() || Boolean(scheduleError)}
      onSubmit={() =>
        onSave({
          title_en: form.title_en,
          title_km: form.title_km,
          description_en: form.description_en,
          description_km: form.description_km,
          category: form.category,
          starts_at: fromInput(form.starts_at),
          doors_open_at: fromInput(form.doors_open_at),
          sales_open_at: fromInput(form.sales_open_at),
          sales_close_at: fromInput(form.sales_close_at),
        })
      }
      onClose={onClose}
    >
      {!form ? (
        <p className="muted small">{km ? 'កំពុងផ្ទុក…' : 'Loading…'}</p>
      ) : (
        <>
          {error && (
            <div style={{ marginBottom: '1rem' }}>
              <Alert tone="danger">{error}</Alert>
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <Alert tone="info">
              {km
                ? 'តម្លៃ តំបន់ ផែនទីកៅអី និងរូបភាព មិនអាចកែពីទីនេះបានទេ — ទាំងនោះជារបស់អ្នករៀបចំ។'
                : 'Pricing, zones, the seat map and images are not editable here — those belong to the organiser.'}
            </Alert>
          </div>

          <div className="form-grid">
            <Field label="Title (EN)">
              <input
                className="input"
                value={form.title_en}
                onChange={(e) => set('title_en', e.target.value)}
                required
              />
            </Field>
            <Field label="ចំណងជើង (KM)">
              <input
                className="input km"
                value={form.title_km}
                onChange={(e) => set('title_km', e.target.value)}
              />
            </Field>

            <Field label="Description (EN)" className="span-2">
              <textarea
                className="textarea"
                rows={3}
                value={form.description_en}
                onChange={(e) => set('description_en', e.target.value)}
              />
            </Field>
            <Field label="ការពិពណ៌នា (KM)" className="span-2">
              <textarea
                className="textarea km"
                rows={3}
                value={form.description_km}
                onChange={(e) => set('description_km', e.target.value)}
              />
            </Field>

            <Field label={km ? 'ប្រភេទ' : 'Category'}>
              <IconSelect
                value={form.category}
                onChange={(v) => set('category', v)}
                ariaLabel={km ? 'ប្រភេទ' : 'Category'}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </IconSelect>
            </Field>

            <Field label={km ? 'ពេលចាប់ផ្ដើម' : 'Starts'}>
              <DateInput
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => set('starts_at', e.target.value)}
              />
            </Field>
            <Field label={km ? 'ពេលបើកទ្វារ' : 'Doors open'}>
              <DateInput
                type="datetime-local"
                value={form.doors_open_at}
                onChange={(e) => set('doors_open_at', e.target.value)}
              />
            </Field>
            <Field label={km ? 'ការលក់បើក' : 'Sales open'}>
              <DateInput
                type="datetime-local"
                value={form.sales_open_at}
                onChange={(e) => set('sales_open_at', e.target.value)}
              />
            </Field>
            <Field
              label={km ? 'ការលក់បិទ' : 'Sales close'}
              className="span-2"
              error={scheduleError}
            >
              <DateInput
                type="datetime-local"
                value={form.sales_close_at}
                onChange={(e) => set('sales_close_at', e.target.value)}
              />
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  )
}
