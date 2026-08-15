import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Empty, Field } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import {
  PROVINCES,
  createVenue,
  listVenues,
  provinceName,
  seatCountOf,
  updateVenue,
  useStore,
} from '../../mock/store.js'

const BLANK = {
  name_en: '',
  name_km: '',
  province_code: 'PP',
  khan_district: '',
  sangkat_commune: '',
  street_address: '',
  lat: '',
  lng: '',
}

export default function OrganizerVenuesPage() {
  useStore()
  const { t, locale } = useLocale()
  useDocumentTitle(t('venues'))
  const { organizerProfile } = useAuth()
  const toast = useToast()
  const orgId = organizerProfile?.id || null

  const [editing, setEditing] = useState(null) // venue id, or 'new'
  const [form, setForm] = useState(BLANK)
  const [errors, setErrors] = useState({})

  const venues = listVenues(orgId)

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openNew() {
    setForm(BLANK)
    setErrors({})
    setEditing('new')
  }

  function openEdit(venue) {
    setForm({ ...venue, lat: venue.lat ?? '', lng: venue.lng ?? '' })
    setErrors({})
    setEditing(venue.id)
  }

  function save(e) {
    e.preventDefault()
    const next = {}
    if (!form.name_en.trim()) next.name_en = 'Required'
    if (!form.name_km.trim()) next.name_km = 'Required'
    if (!form.khan_district.trim()) next.khan_district = 'Required'
    if (!form.sangkat_commune.trim()) next.sangkat_commune = 'Required'
    if (!form.street_address.trim()) next.street_address = 'Required'
    setErrors(next)
    if (Object.keys(next).length) return

    const payload = {
      ...form,
      organizer_id: orgId || 1,
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
    }
    if (editing === 'new') createVenue(payload)
    else updateVenue(editing, payload)
    toast(locale === 'km' ? 'បានរក្សាទុកទីកន្លែង' : 'Venue saved', 'success')
    setEditing(null)
  }

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t('venues')}</h1>
          <p>
            {locale === 'km'
              ? 'ទីកន្លែង និងប្លង់កៅអី ត្រូវបានប្រើឡើងវិញនៅគ្រប់ព្រឹត្តិការណ៍។'
              : 'Venues and their seat maps are reused across events.'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Icon name="plus" size={16} />
          {locale === 'km' ? 'បន្ថែមទីកន្លែង' : 'Add venue'}
        </button>
      </div>

      {editing !== null && (
        <div className="panel" style={{ marginBottom: '1.4rem' }}>
          <div className="panel-head">
            <h2>{editing === 'new' ? (locale === 'km' ? 'ទីកន្លែងថ្មី' : 'New venue') : t('save')}</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>
              <Icon name="close" size={14} />
              {t('cancel')}
            </button>
          </div>
          <form className="panel-body" onSubmit={save} noValidate>
            <div className="form-grid">
              <Field label="Name (EN)" error={errors.name_en}>
                <input className="input" value={form.name_en} onChange={(e) => set('name_en', e.target.value)} />
              </Field>
              <Field label="ឈ្មោះ (KM)" error={errors.name_km}>
                <input
                  className="input km"
                  value={form.name_km}
                  onChange={(e) => set('name_km', e.target.value)}
                />
              </Field>
              <Field label={t('province')}>
                <select
                  className="select"
                  value={form.province_code}
                  onChange={(e) => set('province_code', e.target.value)}
                >
                  {PROVINCES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {locale === 'km' ? p.name_km : p.name_en}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Khan / District" error={errors.khan_district}>
                <input
                  className="input"
                  value={form.khan_district}
                  onChange={(e) => set('khan_district', e.target.value)}
                />
              </Field>
              <Field label="Sangkat / Commune" error={errors.sangkat_commune}>
                <input
                  className="input"
                  value={form.sangkat_commune}
                  onChange={(e) => set('sangkat_commune', e.target.value)}
                />
              </Field>
              <Field label="Street address" error={errors.street_address} className="span-2">
                <input
                  className="input"
                  value={form.street_address}
                  onChange={(e) => set('street_address', e.target.value)}
                />
              </Field>
              <Field label="Latitude" hint="Map pin, optional">
                <input
                  className="input"
                  type="number"
                  step="0.000001"
                  value={form.lat}
                  onChange={(e) => set('lat', e.target.value)}
                />
              </Field>
              <Field label="Longitude" hint="Map pin, optional">
                <input
                  className="input"
                  type="number"
                  step="0.000001"
                  value={form.lng}
                  onChange={(e) => set('lng', e.target.value)}
                />
              </Field>
            </div>
            <div className="row" style={{ marginTop: '1rem' }}>
              <button className="btn btn-primary" type="submit">
                {t('save')}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>
                {t('cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {venues.length ? (
        <div className="grid grid-2">
          {venues.map((venue) => (
            <div className="panel" key={venue.id}>
              <div className="panel-body stack-sm">
                <div className="spread">
                  <div>
                    <div className="font-bold">{locale === 'km' ? venue.name_km : venue.name_en}</div>
                    <div className={locale === 'km' ? 'small muted' : 'small muted km'}>
                      {locale === 'km' ? venue.name_en : venue.name_km}
                    </div>
                  </div>
                  <span className="badge badge-cool">
                    {seatCountOf(venue.id)} {locale === 'km' ? 'កៅអី' : 'seats'}
                  </span>
                </div>
                <div className="small muted">
                  <span className="with-icon">
                    <Icon name="mapPin" size={14} />
                    {venue.street_address}, {venue.sangkat_commune}, {venue.khan_district},{' '}
                    {provinceName(venue.province_code, locale)}
                  </span>
                </div>
                {venue.lat != null && (
                  <div className="small muted mono">
                    {Number(venue.lat).toFixed(4)}, {Number(venue.lng).toFixed(4)}
                  </div>
                )}
                <div className="row row-tight">
                  <button className="btn btn-sm btn-outline" onClick={() => openEdit(venue)}>
                    <Icon name="edit" size={14} />
                    {t('editEvent')}
                  </button>
                  <Link className="btn btn-sm btn-ghost" to={`/organizer/venues/${venue.id}/seat-map`}>
                    {t('seatMap')}
                    <Icon name="arrowRight" size={14} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="building" title={locale === 'km' ? 'គ្មានទីកន្លែង' : 'No venues yet'} />
      )}
    </div>
  )
}
