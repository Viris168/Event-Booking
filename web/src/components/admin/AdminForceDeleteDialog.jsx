import { useState } from 'react'
import ConfirmDialog from '../ConfirmDialog.jsx'
import Icon from '../Icon.jsx'
import { Alert, Field } from '../ui.jsx'
import { exportEventSales, saveBlob } from '../../api/admin.js'
import { useLocale } from '../../context/LocaleContext.jsx'

/** The server's minimum, repeated here so the button can say why it is shut. */
const MIN_REASON = 20

/**
 * The confirmation for erasing an event that sold tickets.
 *
 * <p>Deliberately harder to get through than any other dialog in the product,
 * because of what it does: this is the only action on the platform that voids
 * tickets people paid for, and there is no refund path anywhere to undo it.
 * Three things are asked for, and each one is a different failure it is
 * guarding against:
 *
 * <ul>
 *   <li><b>Download the sales record first.</b> Not advice - the button stays
 *       shut until the file has been fetched. Once the delete commits, the
 *       platform no longer knows who paid for this event, so the download is
 *       the only way the people owed their money back stay reachable.</li>
 *   <li><b>Type the event's title.</b> The defence against the wrong row. An
 *       admin who opened this from a mis-click cannot type a title they were
 *       not looking at.</li>
 *   <li><b>Say why.</b> Sent to the server and written to the log beside the
 *       sales record, because "an admin deleted it" is not an answer to
 *       somebody asking later what happened to their ticket.</li>
 * </ul>
 *
 * <p>Resets from `event` whenever it is pointed at a different one, using the
 * same adjust-during-render pattern as AdminUserEditDialog: a reason typed for
 * one event must never survive into another event's dialog.
 */
export default function AdminForceDeleteDialog({ open, event, busy, onConfirm, onClose }) {
  const { locale } = useLocale()
  const km = locale === 'km'

  const [typedTitle, setTypedTitle] = useState('')
  const [reason, setReason] = useState('')
  const [exported, setExported] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  const [loadedFor, setLoadedFor] = useState(null)
  if (open && event && loadedFor !== event.id) {
    setLoadedFor(event.id)
    setTypedTitle('')
    setReason('')
    setExported(false)
    setExportError(null)
  }

  if (!open || !event) return null

  /*
   * The English title is what must be typed, in both locales. It is the
   * identifier the admin has been reading in the table and in the URL, and
   * asking a non-Khmer reader to reproduce Khmer script from a confirmation
   * dialog is a lock with no key rather than a safeguard.
   */
  const target = event.title_en ?? ''
  const titleMatches = typedTitle.trim() === target.trim()
  const reasonLongEnough = reason.trim().length >= MIN_REASON

  const affected = Math.max(event.booking_count ?? 0, event.sold ?? 0)

  async function download() {
    setExporting(true)
    setExportError(null)
    try {
      saveBlob(await exportEventSales(event.id))
      setExported(true)
    } catch (e) {
      // Left shut on failure. A dialog that unlocked anyway on the grounds
      // that the admin "tried" would be the one case where the record is lost
      // and nobody noticed.
      setExportError(errorText(e, km ? 'មិនអាចទាញយកបានទេ' : 'Could not download the sales record'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      tone="danger"
      busy={busy}
      confirmDisabled={!exported || !titleMatches || !reasonLongEnough}
      title={km ? 'លុបព្រឹត្តិការណ៍ និងការកក់ទាំងអស់?' : 'Erase this event and its bookings?'}
      confirmLabel={km ? 'លុបជាអចិន្ត្រៃយ៍' : 'Erase everything'}
      onConfirm={() => onConfirm(reason.trim())}
      onClose={onClose}
    >
      <Alert tone="danger">
        {km
          ? `«${event.title_km}» មានការកក់ ${affected}។ ការកក់ សំបុត្រ និងកំណត់ត្រាទូទាត់ទាំងអស់នឹងត្រូវលុបចោល។ ប្រព័ន្ធមិនអាចសងប្រាក់វិញបានទេ — អ្នកត្រូវទាក់ទងអ្នកទិញដោយខ្លួនឯង។`
          : `“${event.title_en}” has ${affected} booking${affected === 1 ? '' : 's'}. Every booking, ticket and payment record on it will be erased. This platform cannot issue refunds, so you will have to pay those buyers back yourself.`}
      </Alert>

      <p className="small muted">
        {km
          ? 'បើអ្នកគ្រាន់តែចង់បញ្ឈប់ការលក់ សូមប្រើ «ដកចេញ» វិញ។ សំបុត្រដែលបានលក់រួចនៅតែមានសុពលភាព។'
          : 'If you only want it off sale, take it down instead. That keeps sold tickets valid and can be undone.'}
      </p>

      {/* Step one, and the only one with a side effect outside this dialog. */}
      <Field
        label={km ? '១. ទាញយកកំណត់ត្រាលក់' : '1. Download the sales record'}
        hint={
          km
            ? 'ឈ្មោះ លេខទូរស័ព្ទ និងចំនួនទឹកប្រាក់របស់អ្នកទិញម្នាក់ៗ។ បន្ទាប់ពីលុប ព័ត៌មាននេះនឹងលែងមាន។'
            : 'Each buyer’s name, phone number and what they paid. After the delete, this file is the only copy.'
        }
      >
        <button
          type="button"
          className={`btn ${exported ? 'btn-ghost' : 'btn-primary'}`}
          onClick={download}
          disabled={exporting || busy}
        >
          <Icon name={exported ? 'checkCircle' : 'download'} size={16} />
          {exporting
            ? km
              ? 'កំពុងទាញយក…'
              : 'Downloading…'
            : exported
              ? km
                ? 'បានទាញយករួច — ទាញយកម្ដងទៀត'
                : 'Downloaded. Download again'
              : km
                ? 'ទាញយក CSV'
                : 'Download CSV'}
        </button>
      </Field>

      {exportError && <Alert tone="danger">{exportError}</Alert>}

      <Field
        label={km ? '២. វាយឈ្មោះព្រឹត្តិការណ៍ ដើម្បីបញ្ជាក់' : '2. Type the event title to confirm'}
        hint={target}
        error={
          typedTitle && !titleMatches
            ? km
              ? 'មិនត្រូវគ្នាទេ'
              : 'That does not match'
            : undefined
        }
      >
        <input
          className="input"
          value={typedTitle}
          onChange={(e) => setTypedTitle(e.target.value)}
          disabled={busy}
          autoComplete="off"
        />
      </Field>

      <Field
        label={km ? '៣. មូលហេតុ' : '3. Reason'}
        hint={
          km
            ? `យ៉ាងតិច ${MIN_REASON} តួអក្សរ។ រក្សាទុកក្នុងកំណត់ហេតុ ជាមួយកំណត់ត្រាលក់។`
            : `At least ${MIN_REASON} characters. Recorded in the log alongside the sales record.`
        }
      >
        <textarea
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          placeholder={
            km
              ? 'ឧ. ខ្លឹមសារខុសច្បាប់ រាយការណ៍ដោយ…'
              : 'e.g. Illegal content reported by…'
          }
        />
      </Field>
    </ConfirmDialog>
  )
}

/*
 * A local copy, matching the four admin pages that each carry one. Extracting
 * it into a shared module would be the tidier move and is a change to those
 * four files, not to this one.
 */
function errorText(e, fallback) {
  const detail = e?.response?.data?.detail || e?.response?.data?.message
  return detail ? `${fallback}: ${detail}` : fallback
}
