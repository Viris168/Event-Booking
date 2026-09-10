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
export default function VenueLayoutPanel({ imageUrl, venue }) {
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
        </div>
      </div>

      {hasLayout && (
        <QrLightbox
          open={zoomed}
          onClose={() => setZoomed(false)}
          caption={name}
          subtitle={address}
        >
          <img className="venue-layout-full" src={imageUrl} alt="" />
        </QrLightbox>
      )}
    </div>
  )
}
