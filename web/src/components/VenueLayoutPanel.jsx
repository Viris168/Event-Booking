import { useState } from 'react'
import Icon from './Icon.jsx'
import QrLightbox from './QrLightbox.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * Where the event is: the venue's name and address, plus its seating layout
 * when there is one to show.
 *
 * <p><b>The layout image is optional, the venue is not.</b> This used to bail
 * out entirely without an image, and it used to be handed the EVENT's banner as
 * a stand-in for a layout it did not have. Both of those together meant the
 * panel showed the event's own poster under a "Venue layout" heading — a
 * photograph presented as a seating chart — and removing that wrong picture
 * took the address down with it.
 *
 * <p>So the two are now separate. The address always renders, because a
 * customer deciding whether to buy needs to know where they would be going. The
 * image renders only when a real venue-level layout exists, which today it does
 * not: there is no venue column or upload slot for one yet.
 *
 * <p>The heading follows the content — "Venue" on its own, "Venue layout" once
 * there is a layout to look at — so it never promises a picture that is absent.
 *
 * <p>No tier legend. The image is whatever the organiser uploaded, so its
 * colours mean nothing to this system - a legend would promise a colour-coding
 * it cannot deliver. Tier colours live beside the tier selector, where they are
 * backed by data.
 */
const CLASS_COLORS = ['#12613c', '#0e6f8a', '#c2410c', '#6b3aa0', '#7a5c12']

export default function VenueLayoutPanel({ imageUrl, venue, zones = [] }) {
  const { locale } = useLocale()
  const km = locale === 'km'
  const [zoomed, setZoomed] = useState(false)

  // Nothing to say at all only when there is no venue either.
  if (!venue) return null

  const name = km ? (venue?.name_km ?? venue?.nameKm) : (venue?.name_en ?? venue?.nameEn)
  const street = venue?.street_address ?? venue?.streetAddress
  const commune = venue?.sangkat_commune ?? venue?.sangkatCommune
  const district = venue?.khan_district ?? venue?.khanDistrict

  const address = [street, commune, district].filter(Boolean).join(', ')
  const hasLayout = !!imageUrl

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="with-icon">
          <Icon name={hasLayout ? 'grid' : 'mapPin'} size={16} />
          {hasLayout
            ? (km ? 'ប្លង់ទីកន្លែង' : 'Venue layout')
            : (km ? 'ទីកន្លែង' : 'Venue')}
        </h2>
      </div>

      <div className={`card-body venue-layout${hasLayout ? '' : ' is-plain'}`}>
        {/* contain, not cover: a seating chart that is not exactly this box's
            shape letterboxes rather than losing its edges, and a cut-off stand
            is a section somebody cannot find themselves in. */}
        {hasLayout && (
          <button
            type="button"
            className="venue-layout-img"
            onClick={() => setZoomed(true)}
            aria-label={km ? 'ពង្រីកប្លង់' : 'Enlarge the venue layout'}
          >
            <img src={imageUrl} alt={name ? `${name} layout` : 'Venue layout'} />
          </button>
        )}

        <div className="venue-layout-meta">
          <b>{name}</b>
          {address && <span className="small muted">{address}</span>}
          {hasLayout && (
            <span className="tiny muted with-icon venue-layout-tap">
              <Icon name="qr" size={12} />
              {km ? 'ចុចដើម្បីពង្រីក' : 'Tap to enlarge'}
            </span>
          )}

          {zones.length > 0 && (
            <div className="venue-layout-legend" style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.4rem', color: 'var(--color-ink-2)' }}>
                {km ? 'តំបន់កៅអីអង្គុយ' : 'Seating Zones'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                {zones.map((z, i) => (
                  <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: CLASS_COLORS[i % 5] }}></div>
                    <span style={{ color: 'var(--color-muted)' }}>{z.key}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {hasLayout && (
        /*
         * `media`, not the default `qr`.
         *
         * The default panel is 30rem wide because it was sized around a square
         * QR code - narrower than this card renders the layout at, so opening
         * it made the picture SMALLER, which is the opposite of what "tap to
         * enlarge" promises. `media` gives it 76rem and drops the panel chrome.
         *
         * It also drops the ticket copy. The default footer reads "turn your
         * screen brightness up and show this at the gate", which under a
         * seating chart is simply untrue.
         *
         * The name and address are not passed: `media` suppresses them, and
         * they are already on the card this opened from.
         */
        <QrLightbox open={zoomed} onClose={() => setZoomed(false)} variant="media" caption={name}>
          <img className="venue-layout-full" src={imageUrl} alt="" />
        </QrLightbox>
      )}
    </div>
  )
}
