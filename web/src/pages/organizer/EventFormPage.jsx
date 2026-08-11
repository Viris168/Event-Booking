import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Alert, Badge, Field } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { usd } from '../../lib/format.js'
import {
  createEvent,
  getEvent,
  listVenues,
  provinceName,
  seatClassesOf,
  setEventStatus,
  updateEvent,
  useStore,
  venueSeatsOf,
  zonesOf,
} from '../../mock/store.js'

const COVERS = ['sunset', 'river', 'gold', 'teal', 'plum', 'indigo', 'lime', 'cyan', 'rose']
const CATEGORIES = ['music', 'festival', 'conference', 'culture', 'sport', 'comedy']

function toInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

function fromInput(value) {
  return value ? new Date(value).toISOString() : ''
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function EventFormPage() {
  const { id } = useParams()
  useStore()
  const { t, locale } = useLocale()
  const { organizerProfile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const existing = id ? getEvent(id) : null
  const venues = listVenues(organizerProfile?.id || null)

  const [form, setForm] = useState(() => {
    if (existing) {
      return {
        title_en: existing.title_en,
        title_km: existing.title_km,
        description_en: existing.description_en,
        description_km: existing.description_km,
        venue_id: existing.venue_id,
        inventory_mode: existing.inventory_mode,
        starts_at: toInput(existing.starts_at),
        doors_open_at: toInput(existing.doors_open_at),
        sales_open_at: toInput(existing.sales_open_at),
        sales_close_at: toInput(existing.sales_close_at),
        cover: existing.cover,
        category: existing.category,
      }
    }
    const base = new Date(Date.now() + 30 * 86400000)
    base.setHours(19, 0, 0, 0)
    const doors = new Date(base.getTime() - 3600000)
    const close = new Date(base.getTime() - 86400000)
    return {
      title_en: '',
      title_km: '',
      description_en: '',
      description_km: '',
      venue_id: venues[0]?.id || null,
      inventory_mode: 'SEATED',
      starts_at: toInput(base.toISOString()),
      doors_open_at: toInput(doors.toISOString()),
      sales_open_at: toInput(new Date().toISOString()),
      sales_close_at: toInput(close.toISOString()),
      cover: 'indigo',
      category: 'music',
    }
  })

  // Seat classes are keyed to the venue's physical sections.
  const sections = useMemo(() => {
    const list = venueSeatsOf(form.venue_id)
    return [...new Set(list.map((s) => s.section_label))]
  }, [form.venue_id])

  const [classes, setClasses] = useState(() => {
    const current = existing ? seatClassesOf(existing.id) : []
    return current.map((c) => ({
      section_label: c.section_label,
      name_en: c.name_en,
      name_km: c.name_km,
      price: (c.price_usd_cents / 100).toFixed(2),
    }))
  })

  const [zones, setZones] = useState(() => {
    const current = existing ? zonesOf(existing.id) : []
    return current.map((z) => ({
      name_en: z.name_en,
      name_km: z.name_km,
      price: (z.price_usd_cents / 100).toFixed(2),
      capacity: String(z.capacity),
      committed: z.held_qty + z.sold_qty,
    }))
  })

  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const needsSeats = ['SEATED', 'MIXED'].includes(form.inventory_mode)
  const needsZones = ['ZONED', 'MIXED'].includes(form.inventory_mode)
  const venue = venues.find((v) => v.id === Number(form.venue_id))

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function classFor(section) {
    return classes.find((c) => c.section_label === section)
  }

  function setClassField(section, key, value) {
    setClasses((list) => {
      const found = list.find((c) => c.section_label === section)
      if (!found) {
        return [
          ...list,
          {
            section_label: section,
            name_en: key === 'name_en' ? value : section,
            name_km: key === 'name_km' ? value : section,
            price: key === 'price' ? value : '',
            [key]: value,
          },
        ]
      }
      return list.map((c) => (c.section_label === section ? { ...c, [key]: value } : c))
    })
  }

  function validate() {
    const next = {}
    if (!form.title_en.trim()) next.title_en = 'Required'
    if (!form.title_km.trim()) next.title_km = 'Required'
    if (!form.venue_id) next.venue_id = 'Pick a venue'

    const starts = new Date(form.starts_at).getTime()
    const doors = new Date(form.doors_open_at).getTime()
    const open = new Date(form.sales_open_at).getTime()
    const close = new Date(form.sales_close_at).getTime()

    if (!form.starts_at) next.starts_at = 'Required'
    if (doors > starts) next.doors_open_at = 'Doors must open before the event starts'
    // Mirrors the schema CHECK (sales_close_at <= starts_at).
    if (close > starts) next.sales_close_at = 'Sales must close no later than the start time'
    if (open >= close) next.sales_open_at = 'Sales must open before they close'

    if (needsSeats) {
      if (!sections.length) next.inventory_mode = 'This venue has no seats — generate a seat map first'
      const priced = sections.filter((s) => {
        const c = classFor(s)
        return c && Number(c.price) > 0
      })
      if (sections.length && !priced.length) next.classes = 'Price at least one section'
    }
    if (needsZones) {
      if (!zones.length) next.zones = 'Add at least one GA zone'
      if (zones.some((z) => !z.name_en.trim() || Number(z.price) <= 0 || Number(z.capacity) <= 0))
        next.zones = 'Every zone needs a name, a price above zero and a capacity'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  function save(publish) {
    if (busy) return
    if (!validate()) {
      toast(locale === 'km' ? 'សូមពិនិត្យទម្រង់' : 'Please fix the highlighted fields', 'error')
      return
    }
    setBusy(true)

    const payload = {
      organizer_id: organizerProfile?.id || 1,
      venue_id: Number(form.venue_id),
      inventory_mode: form.inventory_mode,
      slug: existing?.slug || `${slugify(form.title_en)}-${Date.now().toString(36).slice(-4)}`,
      title_en: form.title_en.trim(),
      title_km: form.title_km.trim(),
      description_en: form.description_en.trim(),
      description_km: form.description_km.trim(),
      starts_at: fromInput(form.starts_at),
      doors_open_at: fromInput(form.doors_open_at),
      sales_open_at: fromInput(form.sales_open_at),
      sales_close_at: fromInput(form.sales_close_at),
      cover: form.cover,
      category: form.category,
      classes: needsSeats
        ? sections
            .map((s) => classFor(s))
            .filter((c) => c && Number(c.price) > 0)
            .map((c) => ({
              section_label: c.section_label,
              name_en: c.name_en || c.section_label,
              name_km: c.name_km || c.section_label,
              price_usd_cents: Math.round(Number(c.price) * 100),
            }))
        : [],
      zones: needsZones
        ? zones.map((z) => ({
            name_en: z.name_en.trim(),
            name_km: (z.name_km || z.name_en).trim(),
            price_usd_cents: Math.round(Number(z.price) * 100),
            capacity: Number(z.capacity),
          }))
        : [],
    }

    const event = existing ? updateEvent(existing.id, payload) : createEvent(payload)
    if (publish) setEventStatus(event.id, 'PUBLISHED')
    setBusy(false)
    toast(
      publish
        ? locale === 'km'
          ? 'ព្រឹត្តិការណ៍ត្រូវបានផ្សាយ'
          : 'Event published'
        : locale === 'km'
          ? 'បានរក្សាទុក'
          : 'Saved',
      'success',
    )
    navigate('/organizer')
  }

  return (
    <div className="container container-wide">
      <div className="breadcrumb">
        <Link to="/organizer">{t('myEvents')}</Link> / {existing ? t('editEvent') : t('createEvent')}
      </div>

      <div className="page-head">
        <div>
          <h1>{existing ? t('editEvent') : t('createEvent')}</h1>
          {existing && (
            <p className="row row-tight">
              <Badge status={existing.status} />
              <span className="mono small">{existing.slug}</span>
            </p>
          )}
        </div>
        <div className="row">
          <button className="btn btn-outline" onClick={() => save(false)} disabled={busy}>
            {t('save')}
          </button>
          {existing?.status === 'PUBLISHED' ? (
            <button
              className="btn btn-danger"
              onClick={() => {
                setEventStatus(existing.id, 'TAKEN_DOWN')
                toast(locale === 'km' ? 'បានដកចេញ' : 'Event taken down', 'info')
              }}
            >
              {t('unpublish')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => save(true)} disabled={busy}>
              {t('publish')}
            </button>
          )}
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h2>{locale === 'km' ? 'ព័ត៌មានទូទៅ' : 'Basics'}</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label="Title (EN)" error={errors.title_en}>
                  <input className="input" value={form.title_en} onChange={(e) => set('title_en', e.target.value)} />
                </Field>
                <Field label="ចំណងជើង (KM)" error={errors.title_km}>
                  <input
                    className="input km"
                    value={form.title_km}
                    onChange={(e) => set('title_km', e.target.value)}
                  />
                </Field>
                <Field label="Description (EN)" className="span-2">
                  <textarea
                    className="textarea"
                    value={form.description_en}
                    onChange={(e) => set('description_en', e.target.value)}
                  />
                </Field>
                <Field label="ការពិពណ៌នា (KM)" className="span-2">
                  <textarea
                    className="textarea km"
                    value={form.description_km}
                    onChange={(e) => set('description_km', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{locale === 'km' ? 'ទីកន្លែង និងរបៀបលក់' : 'Venue & inventory mode'}</h2>
            </div>
            <div className="panel-body stack-sm">
              <div className="form-grid">
                <Field label={t('venues')} error={errors.venue_id}>
                  <select
                    className="select"
                    value={form.venue_id || ''}
                    onChange={(e) => set('venue_id', Number(e.target.value))}
                  >
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {locale === 'km' ? v.name_km : v.name_en} · {provinceName(v.province_code, locale)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Inventory mode" error={errors.inventory_mode}>
                  <select
                    className="select"
                    value={form.inventory_mode}
                    onChange={(e) => set('inventory_mode', e.target.value)}
                  >
                    <option value="SEATED">SEATED — assigned seats only</option>
                    <option value="ZONED">ZONED — general admission only</option>
                    <option value="MIXED">MIXED — seats and GA together</option>
                  </select>
                </Field>
              </div>
              {venue && (
                <p className="hint">
                  {venueSeatsOf(venue.id).length}{' '}
                  {locale === 'km' ? 'កៅអីក្នុងប្លង់' : 'seats in this venue’s map'} ·{' '}
                  <Link to={`/organizer/venues/${venue.id}/seat-map`} className="with-icon">
                    {t('seatMap')}
                    <Icon name="arrowRight" size={14} />
                  </Link>
                </p>
              )}
            </div>
          </div>

          {needsSeats && (
            <div className="panel">
              <div className="panel-head">
                <h2>{locale === 'km' ? 'តម្លៃកៅអី' : 'Seat class pricing'}</h2>
                <span className="small muted">
                  {locale === 'km' ? 'មួយតាមផ្នែកនៃទីកន្លែង' : 'One per venue section'}
                </span>
              </div>
              <div className="panel-body">
                {sections.length ? (
                  <>
                    {errors.classes && <p className="err" style={{ marginBottom: '0.6rem' }}>{errors.classes}</p>}
                    <div className="stack-sm">
                      {sections.map((section) => {
                        const c = classFor(section) || {}
                        return (
                          <div className="zone-card" key={section} style={{ gridTemplateColumns: '1fr' }}>
                            <div className="form-grid">
                              <Field label={locale === 'km' ? 'ផ្នែក' : 'Section'}>
                                <input className="input" value={section} readOnly />
                              </Field>
                              <Field label="Class name (EN)">
                                <input
                                  className="input"
                                  value={c.name_en || ''}
                                  placeholder={section}
                                  onChange={(e) => setClassField(section, 'name_en', e.target.value)}
                                />
                              </Field>
                              <Field label="ឈ្មោះ (KM)">
                                <input
                                  className="input km"
                                  value={c.name_km || ''}
                                  placeholder={section}
                                  onChange={(e) => setClassField(section, 'name_km', e.target.value)}
                                />
                              </Field>
                              <Field
                                label="Price USD"
                                hint={c.price ? usd(Math.round(Number(c.price) * 100)) : 'Leave blank to skip'}
                              >
                                <input
                                  className="input"
                                  type="number"
                                  min="0"
                                  step="0.50"
                                  value={c.price || ''}
                                  onChange={(e) => setClassField(section, 'price', e.target.value)}
                                />
                              </Field>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <Alert tone="warn" title={locale === 'km' ? 'គ្មានកៅអី' : 'No seats in this venue'}>
                    {locale === 'km'
                      ? 'សូមបង្កើតប្លង់កៅអីមុន ឬប្តូរទៅ ZONED។'
                      : 'Generate a seat map for this venue first, or switch the mode to ZONED.'}{' '}
                    {venue && (
                      <Link to={`/organizer/venues/${venue.id}/seat-map`} className="with-icon">
                        {t('seatMap')}
                        <Icon name="arrowRight" size={14} />
                      </Link>
                    )}
                  </Alert>
                )}
              </div>
            </div>
          )}

          {needsZones && (
            <div className="panel">
              <div className="panel-head">
                <h2>{locale === 'km' ? 'តំបន់ចូលទូទៅ' : 'General-admission zones'}</h2>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() =>
                    setZones((list) => [
                      ...list,
                      { name_en: '', name_km: '', price: '', capacity: '', committed: 0 },
                    ])
                  }
                >
                  <Icon name="plus" size={14} />
                  {locale === 'km' ? 'បន្ថែមតំបន់' : 'Add zone'}
                </button>
              </div>
              <div className="panel-body">
                {errors.zones && <p className="err" style={{ marginBottom: '0.6rem' }}>{errors.zones}</p>}
                <div className="stack-sm">
                  {zones.map((zone, i) => (
                    <div className="zone-card" key={i} style={{ gridTemplateColumns: '1fr' }}>
                      <div className="form-grid">
                        <Field label="Zone name (EN)">
                          <input
                            className="input"
                            value={zone.name_en}
                            placeholder="GA Floor"
                            onChange={(e) =>
                              setZones((list) =>
                                list.map((z, j) => (j === i ? { ...z, name_en: e.target.value } : z)),
                              )
                            }
                          />
                        </Field>
                        <Field label="ឈ្មោះ (KM)">
                          <input
                            className="input km"
                            value={zone.name_km}
                            onChange={(e) =>
                              setZones((list) =>
                                list.map((z, j) => (j === i ? { ...z, name_km: e.target.value } : z)),
                              )
                            }
                          />
                        </Field>
                        <Field label="Price USD">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.50"
                            value={zone.price}
                            onChange={(e) =>
                              setZones((list) => list.map((z, j) => (j === i ? { ...z, price: e.target.value } : z)))
                            }
                          />
                        </Field>
                        <Field
                          label={t('capacity')}
                          hint={
                            zone.committed
                              ? `${zone.committed} ${locale === 'km' ? 'បានលក់/កាន់រួច' : 'already held or sold'}`
                              : undefined
                          }
                        >
                          <input
                            className="input"
                            type="number"
                            min={zone.committed || 1}
                            value={zone.capacity}
                            onChange={(e) =>
                              setZones((list) =>
                                list.map((z, j) => (j === i ? { ...z, capacity: e.target.value } : z)),
                              )
                            }
                          />
                        </Field>
                      </div>
                      <div className="row">
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={!!zone.committed}
                          title={zone.committed ? 'Tickets already sold in this zone' : undefined}
                          onClick={() => setZones((list) => list.filter((_, j) => j !== i))}
                        >
                          <Icon name="trash" size={14} />
                          {locale === 'km' ? 'លុបតំបន់' : 'Remove zone'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!zones.length && (
                    <p className="muted small">
                      {locale === 'km' ? 'មិនទាន់មានតំបន់' : 'No zones yet.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------- schedule */}
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h3>{locale === 'km' ? 'កាលវិភាគ' : 'Schedule'}</h3>
            </div>
            <div className="panel-body stack-sm">
              <Field label={t('starts')} error={errors.starts_at}>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => set('starts_at', e.target.value)}
                />
              </Field>
              <Field label={t('doorsOpen')} error={errors.doors_open_at}>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.doors_open_at}
                  onChange={(e) => set('doors_open_at', e.target.value)}
                />
              </Field>
              <Field label={locale === 'km' ? 'បើកការលក់' : 'Sales open'} error={errors.sales_open_at}>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.sales_open_at}
                  onChange={(e) => set('sales_open_at', e.target.value)}
                />
              </Field>
              <Field
                label={t('salesClose')}
                error={errors.sales_close_at}
                hint={locale === 'km' ? 'ត្រូវមុន ឬស្មើពេលចាប់ផ្តើម' : 'Must be at or before the start time'}
              >
                <input
                  className="input"
                  type="datetime-local"
                  value={form.sales_close_at}
                  onChange={(e) => set('sales_close_at', e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>{locale === 'km' ? 'រូបភាព' : 'Artwork'}</h3>
            </div>
            <div className="panel-body stack-sm">
              <Field label={locale === 'km' ? 'ប្រភេទ' : 'Category'}>
                <select className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="field">
                <span className="label">{locale === 'km' ? 'ពណ៌គម្រប' : 'Cover'}</span>
                <div className="chips">
                  {COVERS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set('cover', c)}
                      className={`cover-${c}`}
                      aria-label={c}
                      aria-pressed={form.cover === c}
                      style={{
                        width: 38,
                        height: 30,
                        borderRadius: 8,
                        border: form.cover === c ? '2px solid var(--brand-900)' : '1px solid var(--line)',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
                <span className="hint">
                  {locale === 'km'
                    ? 'ការបញ្ចូលរូបភាពពិតនឹងមកក្នុងជំហានបន្ទាប់។'
                    : 'Real image upload is out of scope for this pass.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
