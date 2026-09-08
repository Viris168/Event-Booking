import { useState } from 'react'
import Icon from './Icon.jsx'
import QrLightbox from './QrLightbox.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * The building's layout, so a customer can see the shape of the place before
 * choosing where to sit.
 *
 * <p><b>Reads the EVENT's banner image.</b> A venue-level column would be the
 * natural home - the layout belongs to the building, and every event there
 * shares it - but that is a migration, an endpoint and a third upload slot. The
 * banner already exists end to end, so this uses it.
 *
 * <p>The cost of that is real and worth knowing: the same seating chart has to
 * be re-uploaded for every event at the venue, and the banner cannot also be
 * event artwork. Moving to {@code venue.cloudinary_seatmap_id} later changes
 * only which URL this component is handed.
 *
 * <p>Renders nothing when there is no image. An empty box telling a customer
 * that a picture is missing is worse than not raising the subject.
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

  if (!imageUrl) return null

  const name = km ? (venue?.nameKm ?? venue?.name_km) : (venue?.nameEn ?? venue?.name_en)
  const street = venue?.streetAddress ?? venue?.street_address
  const commune = venue?.sangkatCommune ?? venue?.sangkat_commune
  const district = venue?.khanDistrict ?? venue?.khan_district

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="with-icon">
          <Icon name="grid" size={16} />
          {km ? 'ប្លង់ទីកន្លែង' : 'Venue layout'}
        </h2>
      </div>

      <div className="card-body venue-layout">
        {/* contain, not cover: a seating chart that is not exactly this box's
            shape letterboxes rather than losing its edges, and a cut-off stand
            is a section somebody cannot find themselves in. */}
        <button
          type="button"
          className="venue-layout-img"
          onClick={() => setZoomed(true)}
          aria-label={km ? 'ពង្រីកប្លង់' : 'Enlarge the venue layout'}
        >
          <img src={imageUrl} alt={name ? `${name} layout` : 'Venue layout'} />
        </button>

        <div className="venue-layout-meta">
          <b>{name}</b>
          {street && (
            <span className="small muted">
              {street}
              {commune ? `, ${commune}` : ''}
              {district ? `, ${district}` : ''}
            </span>
          )}
          <span className="tiny muted with-icon venue-layout-tap">
            <Icon name="qr" size={12} />
            {km ? 'ចុចដើម្បីពង្រីក' : 'Tap to enlarge'}
          </span>
        </div>
      </div>

      <QrLightbox
        open={zoomed}
        onClose={() => setZoomed(false)}
        caption={name}
        subtitle={street}
      >
        <img className="venue-layout-full" src={imageUrl} alt="" />
      </QrLightbox>
    </div>
  )
}
