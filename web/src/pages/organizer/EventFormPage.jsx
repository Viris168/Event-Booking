import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EventImageField from '../../components/EventImageField.jsx'
import Icon from '../../components/Icon.jsx'
import SeatMapEditor from '../../components/SeatMapEditor.jsx'
import { Alert, Badge, Field } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { usd } from '../../lib/format.js'
import { getVenue, getVenues, getVenueSeatMap } from '../../api/venues.js'
import {
  assignEventSeats,
  deleteEventImage,
  createEvent as createApiEvent,
  createEventZone,
  createSeatClass,
  getOrganizerEvents,
  getEventZones,
  getSeatClasses,
  publishEvent as publishApiEvent,
  updateEvent as updateApiEvent,
  updateEventZone,
  updateSeatClass,
  uploadEventImage,
} from '../../api/events.js'
import { eventImages, mapEvent, mapVenue } from '../../api/adapters.js'

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
  const { t, locale } = useLocale()
  const toast = useToast()
  const navigate = useNavigate()

  /*
   * Everything here now comes from the SERVER.
   *
   * It used to come from mock/store.js while the organiser dashboard listed
   * from the API - two different databases. Saving wrote an event into an
   * in-memory object nothing else read, so it vanished on reload and never
   * appeared under "My events". That is the bug this page was reported for.
   */
  const [venues, setVenues] = useState([])
  const [existing, setExisting] = useState(null)
  const [venueSeats, setVenueSeats] = useState([])
  const [, setLoading] = useState(true)

  const [form, setForm] = useState(() => {
    const base = new Date(Date.now() + 30 * 86400000)
    base.setHours(19, 0, 0, 0)
    return {
      title_en: '',
      title_km: '',
      description_en: '',
      description_km: '',
      venue_id: null,
      inventory_mode: 'SEATED',
      starts_at: toInput(base.toISOString()),
      doors_open_at: toInput(new Date(base.getTime() - 3600000).toISOString()),
      sales_open_at: toInput(new Date().toISOString()),
      sales_close_at: toInput(new Date(base.getTime() - 86400000).toISOString()),
      cover: 'indigo',
      category: 'music',
    }
  })

  const [classes, setClasses] = useState([])
  const [zones, setZones] = useState([])
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [seatMapOpen, setSeatMapOpen] = useState(false)

  /*
   * The two image slots.
   *
   * `file` is a pick that has not been uploaded yet - it cannot be, while
   * creating, because Cloudinary's id needs an event row to land on. `url` is
   * what the server already holds. `clear` records a removal so save() knows to
   * DELETE rather than just forget.
   */
  const [images, setImages] = useState({
    COVER: { file: null, url: null, clear: false },
    BANNER: { file: null, url: null, clear: false },
  })

  const setSlot = (role, patch) =>
    setImages((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }))

  const needsSeats = ['SEATED', 'MIXED'].includes(form.inventory_mode)
  const needsZones = ['ZONED', 'MIXED'].includes(form.inventory_mode)

  // --- load -----------------------------------------------------------------

  useEffect(() => {
    let live = true
    // The organiser's own list, not GET /events/{id}. That endpoint 404s for
    // anything not publicly visible - deliberately, so nobody can walk
    // sequential ids to read other people's drafts - and it has no owner
    // bypass, so editing your own DRAFT failed outright. Worse, the rejection
    // took the whole Promise.all with it, so the venue dropdown came back
    // empty too and the page rendered as "Create event".
    Promise.all([
      getVenues(),
      id ? getOrganizerEvents().then((list) => {
        const rows = list?.content ?? list ?? []
        return rows.find((e) => String(e.id) === String(id)) ?? null
      }) : Promise.resolve(null),
    ])
      .then(async ([venueList, event]) => {
        if (!live) return
        const mappedVenues = (venueList?.content ?? venueList ?? []).map(mapVenue)
        setVenues(mappedVenues)

        if (event) {
          const e = mapEvent(event)
          setExisting(e)
          const urls = eventImages(event)
          setImages({
            COVER: { file: null, url: urls.cover_image_url, clear: false },
            BANNER: { file: null, url: urls.banner_image_url, clear: false },
          })
          setForm({
            title_en: e.title_en ?? '',
            title_km: e.title_km ?? '',
            description_en: e.description_en ?? '',
            description_km: e.description_km ?? '',
            venue_id: e.venue_id,
            inventory_mode: e.inventory_mode,
            starts_at: toInput(e.starts_at),
            doors_open_at: toInput(e.doors_open_at),
            sales_open_at: toInput(e.sales_open_at),
            sales_close_at: toInput(e.sales_close_at),
            cover: typeof e.cover === 'number' ? COVERS[e.cover] ?? 'indigo' : e.cover ?? 'indigo',
            category: e.category ?? 'music',
          })

          /*
           * A retired venue drops out of GET /venue, but an event already held
           * there still points at it. Without this the picker cannot match the
           * event's own venue, the select falls back to its first option, and
           * saving silently MOVES the event to a different building.
           *
           * So it is fetched by id and appended, flagged so the option can say
           * what it is. The server still refuses to bind anything new to it.
           */
          if (e.venue_id && !mappedVenues.some((v) => v.id === Number(e.venue_id))) {
            try {
              const own = mapVenue(await getVenue(e.venue_id))
              if (live && own) setVenues([...mappedVenues, { ...own, is_disabled: true }])
            } catch {
              // Genuinely gone; the picker stays as-is and validation catches it.
            }
          }

          // Its existing tiers and zones, so an edit does not silently wipe them.
          const [tiers, zoneList] = await Promise.all([
            getSeatClasses(e.id).catch(() => []),
            getEventZones(e.id).catch(() => []),
          ])
          if (!live) return
          setClasses(
            (tiers ?? []).map((c) => ({
              id: c.id,
              section_label: c.section_label ?? c.sectionLabel ?? '',
              name_en: c.name_en ?? c.nameEn,
              name_km: c.name_km ?? c.nameKm,
              price: ((c.price_usd_cents ?? c.priceUsdCents) / 100).toFixed(2),
            })),
          )
          setZones(
            (zoneList ?? []).map((z) => ({
              id: z.id,
              name_en: z.name_en ?? z.nameEn,
              name_km: z.name_km ?? z.nameKm,
              price: ((z.price_usd_cents ?? z.priceUsdCents) / 100).toFixed(2),
              capacity: String(z.capacity),
              committed: (z.held_qty ?? z.heldQty ?? 0) + (z.sold_qty ?? z.soldQty ?? 0),
            })),
          )
        } else if (mappedVenues.length) {
          setForm((f) => ({ ...f, venue_id: mappedVenues[0].id }))
        }
      })
      .catch(() => live && toast('Could not load the catalogue', 'error'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [id, toast])

  /*
   * The venue's physical seats. Re-fetched whenever the venue changes AND
   * whenever the seat-map drawer reports a change, which is what makes a newly
   * generated section appear without a reload.
   */
  const [seatMapVersion, setSeatMapVersion] = useState(0)

  useEffect(() => {
    if (!form.venue_id) {
      setVenueSeats([])
      return undefined
    }
    let live = true
    getVenueSeatMap(form.venue_id)
      .then((map) => live && setVenueSeats(map?.seats ?? map?.sections?.flatMap((x) => x.seats) ?? []))
      .catch(() => live && setVenueSeats([]))
    return () => {
      live = false
    }
  }, [form.venue_id, seatMapVersion])

  const venue = venues.find((v) => v.id === Number(form.venue_id)) || null

  const sections = [
    ...new Set(venueSeats.map((s) => s.section_label ?? s.sectionLabel)),
  ].filter(Boolean)

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

  async function save(publish) {
    if (busy) return
    if (!validate()) {
      toast(locale === 'km' ? 'សូមពិនិត្យទម្រង់' : 'Please fix the highlighted fields', 'error')
      return
    }
    setBusy(true)

    /*
     * Four calls, not one: the server has no endpoint that takes an event and
     * its inventory together, and no transaction spans them.
     *
     * So the event is created FIRST and left as a draft, and `publish` only
     * runs once its zones and tiers are in. If a later call fails the organiser
     * is left with a visible, editable draft and a message saying what did not
     * save - which they can fix by pressing save again. The alternative, and
     * the reason for this order, is a PUBLISHED event on sale with no zones and
     * no prices.
     */
    try {
      const payload = {
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
        // The server stores a cover as an index; the form works in names.
        cover: Math.max(0, COVERS.indexOf(form.cover)),
        category: form.category,
      }

      const saved = existing
        ? await updateApiEvent(existing.id, payload)
        : await createApiEvent(payload)
      const eventId = saved.id

      if (needsZones) {
        for (const z of zones) {
          const body = {
            name_en: z.name_en.trim(),
            name_km: (z.name_km || z.name_en).trim(),
            price_usd_cents: Math.round(Number(z.price) * 100),
            capacity: Number(z.capacity),
          }
          if (z.id) await updateEventZone(z.id, body)
          else await createEventZone(eventId, body)
        }
      }

      if (needsSeats) {
        for (const section of sections) {
          const c = classFor(section)
          if (!c || !(Number(c.price) > 0)) continue
          const body = {
            name_en: c.name_en || section,
            name_km: c.name_km || section,
            price_usd_cents: Math.round(Number(c.price) * 100),
          }
          const tier = c.id
            ? await updateSeatClass(eventId, c.id, body)
            : await createSeatClass(eventId, body)

          // Only newly created tiers need their seats attaching; an edit is a
          // re-price, and the seats are already on the class.
          if (!c.id) {
            const ids = venueSeats
              .filter((s) => (s.section_label ?? s.sectionLabel) === section)
              .map((s) => s.id)
            if (ids.length) await assignEventSeats(eventId, tier.id, ids)
          }
        }
      }

      /*
       * Images last, and before publish.
       *
       * They need an event id, so a file picked while creating can only go up
       * once the create call has returned. A failure here does NOT lose the
       * event - it is already saved, and the message says the artwork is what
       * did not stick, which is a thing the organiser can retry on its own.
       */
      for (const role of ['COVER', 'BANNER']) {
        const slot = images[role]
        try {
          if (slot.file) await uploadEventImage(eventId, slot.file, role)
          else if (slot.clear && slot.url) await deleteEventImage(eventId, role)
        } catch (imgErr) {
          const detail =
            imgErr?.response?.data?.detail || imgErr?.response?.data?.message || imgErr.message
          toast(
            `${locale === 'km' ? 'រក្សាទុករូបភាពមិនបាន' : 'Saved, but the image did not upload'}: ${detail}`,
            'error',
          )
        }
      }

      if (publish) await publishApiEvent(eventId)

      toast(
        publish
          ? locale === 'km' ? 'ព្រឹត្តិការណ៍ត្រូវបានផ្សាយ' : 'Event published'
          : locale === 'km' ? 'បានរក្សាទុក' : 'Saved',
        'success',
      )
      navigate('/organizer')
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err.message
      toast(
        `${locale === 'km' ? 'រក្សាទុកមិនបានសម្រេច' : 'Could not save'}: ${detail}`,
        'error',
      )
    } finally {
      setBusy(false)
    }
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
            /* Taking a published event down is PATCH /admin/events/{id}/takedown -
               an admin action, not an organiser one, because pulling a show that
               has sold tickets is a refund decision. The button used to flip the
               status in the prototype store, which looked like it worked and
               changed nothing on the server. */
            <span className="small muted">
              {locale === 'km'
                ? 'ដើម្បីដកព្រឹត្តិការណ៍ចេញ សូមទាក់ទងអ្នកគ្រប់គ្រង'
                : 'Ask an admin to take a published event down'}
            </span>
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

          {/* Between Basics and Venue: title, artwork and category are the
              three things a listing card is made of, so they belong together.
              Venue and inventory mode are a different decision. */}
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
                      className={`cover-${c} h-[30px] w-[38px] cursor-pointer rounded-tiny ${
                        form.cover === c ? 'border-2 border-brand-900' : 'border border-line'
                      }`}
                      aria-label={c}
                      aria-pressed={form.cover === c}
                    />
                  ))}
                </div>
                <span className="hint">
                  {locale === 'km'
                    ? 'ពណ៌នេះប្រើពេលគ្មានរូបភាព។'
                    : 'The colour is the fallback shown when there is no image.'}
                </span>

                {/* The two real slots. Uploaded after save — see save() for
                    why a file picked while creating cannot go up sooner. */}
                <div className="img-grid">
                  <EventImageField
                    label={locale === 'km' ? 'រូបភាពគម្រប' : 'Cover image'}
                    hint={locale === 'km' ? 'បញ្ឈរ · បង្ហាញក្នុងបញ្ជី' : 'Portrait · shown in listings'}
                    aspect="16 / 6"
                    // Previews match each other; the CROP matches how each
                    // image is really used - the cover is portrait on the public
                    // page, so cropping it 16:6 would throw most of it away.
                    cropAspect={3 / 4}
                    currentUrl={images.COVER.clear ? null : images.COVER.url}
                    file={images.COVER.file}
                    busy={busy}
                    onPick={(file, err) => {
                      if (err) return toast(err, 'error')
                      setSlot('COVER', { file, clear: false })
                    }}
                    onClear={() => setSlot('COVER', { file: null, clear: true })}
                  />
                  <EventImageField
                    label={locale === 'km' ? 'រូបភាពបដា' : 'Banner image'}
                    hint={
                      locale === 'km'
                        ? 'ប្រើជាប្លង់ទីកន្លែងផងដែរ'
                        : 'Also shown as the venue layout'
                    }
                    aspect="16 / 6"
                    // Free crop, not 16:6. The banner doubles as the venue
                    // layout on the event page, and venue charts range from a
                    // near-square stadium bowl to a 2:1 hall - a fixed shape
                    // cuts the ends off one or the other. The panel letterboxes
                    // whatever comes out, so nothing is ever lost.
                    cropAspect={undefined}
                    currentUrl={images.BANNER.clear ? null : images.BANNER.url}
                    file={images.BANNER.file}
                    busy={busy}
                    onPick={(file, err) => {
                      if (err) return toast(err, 'error')
                      setSlot('BANNER', { file, clear: false })
                    }}
                    onClear={() => setSlot('BANNER', { file: null, clear: true })}
                  />
                </div>
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
                        {locale === 'km' ? v.name_km : v.name_en}
                        {/* Says why it is here at all: a retired venue is only
                            listed because this event already sits in it. */}
                        {v.is_disabled ? (locale === 'km' ? ' · បានដកចេញ' : ' · retired') : ''}
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
                  {venueSeats.length}{' '}
                  {locale === 'km' ? 'កៅអីក្នុងប្លង់' : 'seats in this venue’s map'} ·{' '}
                  <button type="button" className="linkish with-icon" onClick={() => setSeatMapOpen(true)}>
                    {t('seatMap')}
                    <Icon name="arrowRight" size={14} />
                  </button>
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
                      <button type="button" className="linkish with-icon" onClick={() => setSeatMapOpen(true)}>
                        {t('seatMap')}
                        <Icon name="arrowRight" size={14} />
                      </button>
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

        </div>
      </div>
      {/* The venue's seat map, edited without leaving a half-filled form.

          It stays a DRAWER rather than becoming another field, because it is
          not this event's data: venue_seat rows are the physical seats in a
          building and every event held there points at them. Folding them in
          would make "price my VIP section" and "delete a row from the theatre"
          look like the same kind of edit. */}
      {venue && seatMapOpen && (
        <div
          className="drawer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('seatMap')}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSeatMapOpen(false)
          }}
        >
          <div className="drawer-panel">
            <div className="drawer-head">
              <div>
                <h2>{t('seatMap')}</h2>
                <span className="small muted">
                  {locale === 'km' ? venue.name_km : venue.name_en}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setSeatMapOpen(false)}
              >
                {locale === 'km' ? 'រួចរាល់' : 'Done'}
              </button>
            </div>
            <div className="drawer-body stack-sm">
              <SeatMapEditor
                venueId={venue.id}
                showVenueWarning
                onChange={() => setSeatMapVersion((v) => v + 1)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
