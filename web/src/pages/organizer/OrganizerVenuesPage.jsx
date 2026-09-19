import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import FormDialog from "../../components/FormDialog.jsx";
import Icon from "../../components/Icon.jsx";
import MapLinkField from "../../components/MapLinkField.jsx";
import { Alert, Empty, Field } from "../../components/ui.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  createVenue as createApiVenue,
  disableVenue,
  getProvinces,
  getVenueSeatMap,
  getVenues,
  resolveMapLink,
  updateVenue as updateApiVenue,
} from "../../api/venues.js";
import { mapVenue } from "../../api/adapters.js";
import {
  readMapLink,
  coordsFromMapsUrl,
  inCambodia,
} from "../../lib/mapLink.js";

const BLANK = {
  name_en: "",
  name_km: "",
  province_code: "12", // Phnom Penh, ISO 3166-2:KH
  khan_district: "",
  sangkat_commune: "",
  street_address: "",
  lat: "",
  lng: "",
  map_url: "",
};

/*
 * Leaflet and its stylesheet are ~45kB gzipped, and the only screen that wants
 * them is this form - which no ticket buyer ever opens. Split out so that
 * weight is fetched when an organiser actually resolves a pin, rather than
 * riding in the bundle every visitor downloads to look at the catalogue.
 */
const VenuePinPreview = lazy(
  () => import("../../components/VenuePinPreview.jsx"),
);

export default function OrganizerVenuesPage() {
  const { t, locale } = useLocale();
  useDocumentTitle(t("venues"));
  const toast = useToast();

  const [editing, setEditing] = useState(null); // venue id, or 'new'
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});

  /*
   * From the SERVER, not mock/store.js.
   *
   * A venue created here used to land in an in-memory object, so it never
   * appeared in the event form's venue picker - which reads GET /venue - and
   * disappeared on reload. Same split that made saved events vanish.
   */
  const [venues, setVenues] = useState([]);
  // From the server: venue.province_code is a FK, so a list invented on this
  // side can only produce saves the database refuses.
  const [provinces, setProvinces] = useState([]);
  const [seatCounts, setSeatCounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  // The venue awaiting confirmation, or null.
  const [retiring, setRetiring] = useState(null);

  useEffect(() => {
    let live = true;
    getProvinces()
      .then((list) => live && setProvinces(list ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const provinceLabel = (code) => {
    const p = provinces.find((x) => x.code === code);
    if (!p) return code;
    return locale === "km" ? (p.nameKm ?? p.name_km) : (p.nameEn ?? p.name_en);
  };

  useEffect(() => {
    let live = true;
    getVenues()
      .then(async (list) => {
        if (!live) return;
        const mapped = (list?.content ?? list ?? [])
          .map(mapVenue)
          .filter(Boolean);
        setVenues(mapped);

        // Seat counts one call each. Cheap at this scale, and it keeps the list
        // honest about which venues can host a seated event at all.
        const counts = await Promise.all(
          mapped.map((v) =>
            getVenueSeatMap(v.id)
              .then((m) => [
                v.id,
                (m?.seats ?? m?.sections?.flatMap((x) => x.seats ?? []) ?? [])
                  .length,
              ])
              .catch(() => [v.id, 0]),
          ),
        );
        if (live) setSeatCounts(Object.fromEntries(counts));
      })
      .catch(() => live && toast("Could not load venues", "error"));
    return () => {
      live = false;
    };
  }, [version, toast]);

  /*
   * Retiring a venue is a SOFT delete on the server - it sets is_disabled and
   * keeps every row, because event.venue_id points at it and sold tickets reach
   * back through venue_seat. Events already held there keep working; it simply
   * stops being offered for new ones.
   *
   * Labelled "Retire" rather than "Delete" for that reason: a button that says
   * delete and disables instead teaches people to distrust the words.
   */
  async function confirmRetire() {
    const venue = retiring;
    if (!venue || busy) return;
    const name = locale === "km" ? venue.name_km : venue.name_en;

    setBusy(true);
    try {
      await disableVenue(venue.id);
      toast(
        locale === "km" ? "បានដកទីកន្លែងចេញ" : `${name} retired`,
        "success",
      );
      setVersion((v) => v + 1);
      setRetiring(null);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err.message;
      toast(
        `${locale === "km" ? "ដកចេញមិនបានសម្រេច" : "Could not retire"}: ${detail}`,
        "error",
      );
      // Left open on failure: closing it would look like the retire had worked.
    } finally {
      setBusy(false);
    }
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openNew() {
    setForm(BLANK);
    setErrors({});
    setEditing("new");
  }

  function openEdit(venue) {
    const lat = venue.lat != null && venue.lat !== "" ? String(venue.lat) : "";
    const lng = venue.lng != null && venue.lng !== "" ? String(venue.lng) : "";
    const mapUrl =
      venue.map_url ||
      venue.mapUrl ||
      (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : "");

    setForm({
      ...venue,
      lat,
      lng,
      map_url: mapUrl,
    });
    setErrors({});
    setEditing(venue.id);
  }

  // Venues the catalogue map could not plot.
  const unpinned = venues.filter((v) => v.lat == null || v.lng == null).length;

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    const next = {};
    if (!form.name_en.trim()) next.name_en = "Required";
    if (!form.name_km.trim()) next.name_km = "Required";
    if (!form.khan_district.trim()) next.khan_district = "Required";
    if (!form.sangkat_commune.trim()) next.sangkat_commune = "Required";
    if (!form.street_address.trim()) next.street_address = "Required";
    setErrors(next);
    if (Object.keys(next).length) return;

    let lat = form.lat;
    let lng = form.lng;

    // If coordinates are missing but user entered a Google Maps link, auto-resolve before saving!
    if (
      (lat === "" || lng === "" || lat == null || lng == null) &&
      form.map_url?.trim()
    ) {
      try {
        const text = form.map_url.trim();
        const res = readMapLink(text);
        if (res.ok) {
          lat = String(res.coords.lat);
          lng = String(res.coords.lng);
        } else if (res.reason === "short-link") {
          const resolved = await resolveMapLink(res.url || text);
          const coords = coordsFromMapsUrl(resolved);
          if (coords && inCambodia(coords)) {
            lat = String(coords.lat);
            lng = String(coords.lng);
          }
        }
      } catch {
        // Continue and let the save proceed or show error
      }
    }

    /*
     * No organizer_id. The server derives ownership from the caller - see the
     * note on CreateVenueRequest, and OrganizerResolver's javadoc about the
     * period when the client supplied its own owner id and was believed.
     * Sending it here would be, at best, ignored noise that invites someone to
     * start trusting it again.
     */
    const payload = {
      name_en: form.name_en.trim(),
      name_km: form.name_km.trim(),
      province_code: form.province_code,
      khan_district: form.khan_district.trim(),
      sangkat_commune: form.sangkat_commune.trim(),
      street_address: form.street_address.trim(),
      lat: lat === "" || lat == null ? null : Number(lat),
      lng: lng === "" || lng == null ? null : Number(lng),
    };
    setBusy(true);
    try {
      if (editing === "new") await createApiVenue(payload);
      else await updateApiVenue(editing, payload);
      toast(locale === "km" ? "បានរក្សាទុកទីកន្លែង" : "Venue saved", "success");
      setEditing(null);
      setVersion((v) => v + 1);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err.message;
      toast(
        `${locale === "km" ? "រក្សាទុកមិនបានសម្រេច" : "Could not save"}: ${detail}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t("venues")}</h1>
          {/* Says whose these are, which the old wording left open.
              "Reused across events" was true and incomplete: it read as though
              the catalogue were shared, and until V27 it partly was. Venues are
              private to the organiser who created them now - only they can
              edit one, retire it, or hold an event there - so the sentence has
              to carry the ownership as well as the reuse. */}
          <p>
            {locale === "km"
              ? "ទីកន្លែងរបស់អ្នក និងប្លង់កៅអី ប្រើឡើងវិញបាននៅគ្រប់ព្រឹត្តិការណ៍របស់អ្នក។"
              : "Your venues and their seat maps, reused across your own events."}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Icon name="plus" size={16} />
          {locale === "km" ? "បន្ថែមទីកន្លែង" : "Add venue"}
        </button>
      </div>

      {/* One line saying how much of the map is still missing, because the
          per-row badges only add up once you have scrolled the whole list -
          and an unpinned venue is invisible on the catalogue map rather than
          visibly broken. Hidden at zero: a standing banner reporting nothing
          wrong is one people stop reading. */}
      {editing === null && unpinned > 0 && (
        <div style={{ marginBottom: "1.1rem" }}>
          <Alert
            tone="warn"
            title={
              locale === "km"
                ? `ទីកន្លែង ${unpinned} មិនទាន់មានទីតាំងលើផែនទី`
                : `${unpinned} ${unpinned === 1 ? "venue has" : "venues have"} no map pin`
            }
          >
            {locale === "km"
              ? "បើកទីកន្លែង ចុចកែ រួចបិទភ្ជាប់តំណ Google Maps របស់វា។"
              : "Open one, choose Edit, and paste its Google Maps link. Until then it cannot be shown on a map."}
          </Alert>
        </div>
      )}

      <FormDialog
        open={editing !== null}
        title={
          editing === "new"
            ? locale === "km"
              ? "បន្ថែមទីកន្លែងថ្មី"
              : "New Venue"
            : locale === "km"
              ? "កែសម្រួលទីកន្លែង"
              : "Edit Venue"
        }
        subtitle={
          editing === "new"
            ? locale === "km"
              ? "បញ្ចូលព័ត៌មានទីតាំង និងជ្រើសរើសទីតាំងលើផែនទីសម្រាប់ព្រឹត្តិការណ៍របស់អ្នក។"
              : "Add venue details, address, and map pin for your events."
            : locale === "km"
              ? "កែសម្រួលព័ត៌មានទីតាំង អាសយដ្ឋាន និងទីតាំងលើផែនទី។"
              : "Update venue details, address, and map pin location."
        }
        submitLabel={
          editing === "new"
            ? locale === "km"
              ? "បង្កើតទីកន្លែង"
              : "Create Venue"
            : locale === "km"
              ? "រក្សាទុក"
              : "Save Changes"
        }
        cancelLabel={locale === "km" ? "បោះបង់" : "Cancel"}
        busy={busy}
        onSubmit={save}
        onClose={() => setEditing(null)}
        style={{ width: "min(95vw, 44rem)", maxHeight: "min(90vh, 52rem)" }}
      >
        <div className="form-grid">
          <Field label="Name (EN)" error={errors.name_en}>
            <input
              className="input"
              value={form.name_en}
              onChange={(e) => set("name_en", e.target.value)}
            />
          </Field>
          <Field label="ឈ្មោះ (KM)" error={errors.name_km}>
            <input
              className="input km"
              value={form.name_km}
              onChange={(e) => set("name_km", e.target.value)}
            />
          </Field>
          <Field label={t("province")}>
            <select
              className="select"
              value={form.province_code}
              onChange={(e) => set("province_code", e.target.value)}
            >
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {locale === "km"
                    ? (p.nameKm ?? p.name_km)
                    : (p.nameEn ?? p.name_en)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Khan / District" error={errors.khan_district}>
            <input
              className="input"
              value={form.khan_district}
              onChange={(e) => set("khan_district", e.target.value)}
            />
          </Field>
          <Field label="Sangkat / Commune" error={errors.sangkat_commune}>
            <input
              className="input"
              value={form.sangkat_commune}
              onChange={(e) => set("sangkat_commune", e.target.value)}
            />
          </Field>
          <Field
            label="Street address"
            error={errors.street_address}
            className="span-2"
          >
            <input
              className="input"
              value={form.street_address}
              onChange={(e) => set("street_address", e.target.value)}
            />
          </Field>
          <div className="span-2">
            <MapLinkField
              locale={locale}
              value={{ lat: form.lat, lng: form.lng, url: form.map_url }}
              onChange={(pin) =>
                setForm((f) => ({
                  ...f,
                  lat: pin.lat != null ? String(pin.lat) : f.lat,
                  lng: pin.lng != null ? String(pin.lng) : f.lng,
                  map_url: pin.url !== undefined ? pin.url : f.map_url,
                }))
              }
              preview={
                form.lat !== "" && form.lng !== "" ? (
                  <Suspense fallback={<div className="pin-preview" />}>
                    <VenuePinPreview
                      locale={locale}
                      lat={Number(form.lat)}
                      lng={Number(form.lng)}
                      onMove={(pin) =>
                        setForm((f) => ({
                          ...f,
                          lat: String(pin.lat),
                          lng: String(pin.lng),
                          map_url: `https://www.google.com/maps?q=${pin.lat},${pin.lng}`,
                        }))
                      }
                    />
                  </Suspense>
                ) : null
              }
            />
          </div>
        </div>
      </FormDialog>

      {venues.length ? (
        <div className="grid grid-2">
          {venues.map((venue) => (
            <div className="panel" key={venue.id}>
              <div className="panel-body stack-sm">
                <div className="spread">
                  <div>
                    <div className="font-bold">
                      {locale === "km" ? venue.name_km : venue.name_en}
                    </div>
                    <div
                      className={
                        locale === "km" ? "small muted" : "small muted km"
                      }
                    >
                      {locale === "km" ? venue.name_en : venue.name_km}
                    </div>
                  </div>
                  <span className="badge badge-cool">
                    {seatCounts[venue.id] ?? 0}{" "}
                    {locale === "km" ? "កៅអី" : "seats"}
                  </span>
                </div>
                <div className="small muted">
                  <span className="with-icon">
                    <Icon name="mapPin" size={14} />
                    {venue.street_address}, {venue.sangkat_commune},{" "}
                    {venue.khan_district}, {provinceLabel(venue.province_code)}
                  </span>
                </div>
                {venue.lat != null ? (
                  <div className="small muted mono">
                    {Number(venue.lat).toFixed(4)},{" "}
                    {Number(venue.lng).toFixed(4)}
                  </div>
                ) : (
                  /* Said out loud rather than shown as an absence. A venue
                     with no pin is invisible on any map of the catalogue, and
                     the row that omits its coordinates looks the same as one
                     that never had room for them. */
                  <div className="small">
                    <span className="badge badge-warm">
                      <Icon name="mapPin" size={12} />
                      {locale === "km" ? "គ្មានទីតាំងលើផែនទី" : "No map pin"}
                    </span>
                  </div>
                )}
                <div className="row row-tight">
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => openEdit(venue)}
                  >
                    <Icon name="edit" size={14} />
                    {locale === "km" ? "កែសម្រួល" : "Edit"}
                  </button>
                  <Link
                    className="btn btn-sm btn-ghost"
                    to={`/organizer/venues/${venue.id}/seat-map`}
                  >
                    {t("seatMap")}
                    <Icon name="arrowRight" size={14} />
                  </Link>
                  {/* Pushed to the right and ghost-weighted: destructive-looking
                      actions sitting beside routine ones get mis-tapped. */}
                  <button
                    className="btn btn-sm btn-ghost venue-retire"
                    onClick={() => setRetiring(venue)}
                    disabled={busy}
                    title={
                      locale === "km"
                        ? "ព្រឹត្តិការណ៍ដែលមានស្រាប់នៅតែដំណើរការ"
                        : "Existing events there keep working"
                    }
                  >
                    <Icon name="trash" size={14} />
                    {locale === "km" ? "ដកចេញ" : "Retire"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon="building"
          title={locale === "km" ? "គ្មានទីកន្លែង" : "No venues yet"}
        />
      )}
      <ConfirmDialog
        open={!!retiring}
        busy={busy}
        title={locale === "km" ? "ដកទីកន្លែងចេញ?" : "Retire this venue?"}
        confirmLabel={locale === "km" ? "ដកចេញ" : "Retire"}
        onConfirm={confirmRetire}
        onClose={() => !busy && setRetiring(null)}
      >
        {locale === "km" ? (
          <>
            <b>{retiring?.name_km}</b> នឹងលែងបង្ហាញសម្រាប់ព្រឹត្តិការណ៍ថ្មី។
            ព្រឹត្តិការណ៍ដែលមានស្រាប់ និងសំបុត្រនៅតែដំណើរការ។
          </>
        ) : (
          <>
            <b>{retiring?.name_en}</b> stops being offered for new events.
            Events already held there — and their tickets — keep working,
            because nothing is deleted.
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
