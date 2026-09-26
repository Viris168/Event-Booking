import { useState } from 'react'
import FormDialog from '../FormDialog.jsx'
import { Alert, Field, IconSelect } from '../ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'

const ROLES = ['CUSTOMER', 'ORGANIZER', 'PLATFORM_ADMIN']

/**
 * Edit one account.
 *
 * <p>The form is reset from `user` every time the dialog opens rather than kept
 * across openings: an admin who edits a row, cancels, then opens a different
 * row must not find the first person's details typed into the second person's
 * form.
 *
 * <p>It reproduces none of the server's rules - it echoes the ones worth knowing
 * before you press Save. The refusals (a duplicate email, an organiser who still
 * owns events, an admin demoting themselves) arrive as messages from the API,
 * because a second copy of those rules in JavaScript is a copy that drifts.
 */
export default function AdminUserEditDialog({ open, user, isSelf, busy, error, onSave, onClose }) {
  const { t, locale } = useLocale()
  const km = locale === 'km'

  const [form, setForm] = useState(null)

  /*
   * Reset from `user` whenever the dialog is pointed at a different account.
   *
   * Adjusted during render rather than in an effect, which is the pattern React
   * documents for state derived from a prop: the re-render happens before
   * anything is committed, so the form never paints one person's details in
   * another person's dialog the way an effect's extra pass would. `loadedFor`
   * is the guard that makes it run once per account instead of every render.
   */
  const [loadedFor, setLoadedFor] = useState(null)
  if (open && user && loadedFor !== user.id) {
    setLoadedFor(user.id)
    setForm({
      display_name: user.display_name ?? '',
      email: user.email ?? '',
      phone_e164: user.phone_e164 ?? '',
      role: user.role,
      org_name_en: '',
      org_name_km: '',
    })
  }

  if (!open || !form) return null

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  /*
   * The organisation name is asked for only when this save is what first makes
   * the person an organiser. Someone who already has a profile keeps the name
   * they have - the server ignores these two fields in that case - and asking
   * anyway would read as an invitation to rename an organisation from a screen
   * that is not about organisations.
   *
   * user.role is the role as loaded, so putting the select back where it
   * started makes the block disappear again, which is the right cue that
   * nothing is being created any more.
   */
  const promotingToOrganizer = form.role === 'ORGANIZER' && user.role !== 'ORGANIZER'

  return (
    <FormDialog
      open={open}
      title={km ? 'កែសម្រួលគណនី' : 'Edit account'}
      subtitle={`#${user.id} · ${user.display_name}`}
      submitLabel={t('save')}
      busy={busy}
      submitDisabled={!form.display_name.trim() || (promotingToOrganizer && !form.org_name_en.trim())}
      onSubmit={() => onSave(form)}
      onClose={onClose}
    >
      {error && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="form-grid">
        <Field label={km ? 'ឈ្មោះ' : 'Display name'} className="span-2">
          <input
            className="input"
            value={form.display_name}
            onChange={(e) => set('display_name', e.target.value)}
            required
          />
        </Field>

        <Field
          label={t('phone')}
          hint={
            km
              ? 'លេខនេះគឺជាឈ្មោះចូលគណនី។'
              : 'This number is how they log in.'
          }
        >
          <input
            className="input mono"
            value={form.phone_e164}
            onChange={(e) => set('phone_e164', e.target.value)}
            placeholder="012345678"
          />
        </Field>

        <Field label={t('email')} optional>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        <Field
          label={km ? 'តួនាទី' : 'Role'}
          className="span-2"
          hint={
            isSelf
              ? km
                ? 'អ្នកមិនអាចប្ដូរតួនាទីខ្លួនឯងបានទេ។'
                : 'You cannot change your own role.'
              : undefined
          }
        >
          <IconSelect
            value={form.role}
            onChange={(v) => set('role', v)}
            ariaLabel={km ? 'តួនាទី' : 'Role'}
            /*
             * The server refuses this regardless - it is the one role change
             * that can revoke the access needed to undo it. Disabling the
             * control says so before the click rather than after.
             */
            disabled={isSelf}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </IconSelect>
        </Field>

        {promotingToOrganizer && (
          <>
            <div className="span-2">
              <Alert tone="info">
                {km
                  ? 'ការផ្ដល់តួនាទីអ្នករៀបចំនឹងបង្កើតទម្រង់អង្គភាពមួយ។ ឈ្មោះនេះនឹងបង្ហាញនៅលើគ្រប់ព្រឹត្តិការណ៍ដែលពួកគេផ្សាយ។'
                  : 'Making them an organiser creates an organisation profile. This name appears on every event they publish.'}
              </Alert>
            </div>
            <Field label={km ? 'ឈ្មោះអង្គភាព (EN)' : 'Organisation name (EN)'}>
              <input
                className="input"
                value={form.org_name_en}
                onChange={(e) => set('org_name_en', e.target.value)}
                required
              />
            </Field>
            <Field label={km ? 'ឈ្មោះអង្គភាព (KM)' : 'Organisation name (KM)'} optional>
              <input
                className="input km"
                value={form.org_name_km}
                onChange={(e) => set('org_name_km', e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
    </FormDialog>
  )
}
