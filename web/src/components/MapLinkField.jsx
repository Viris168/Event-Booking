import { useState, useEffect } from "react";
import Icon from "./Icon.jsx";
import { Field } from "./ui.jsx";
import { readMapLink, coordsFromMapsUrl, inCambodia } from "../lib/mapLink.js";
import { resolveMapLink } from "../api/venues.js";

/**
 * How a venue gets its map pin.
 *
 * Replaces the two bare "Latitude" / "Longitude" number inputs this form used
 * to carry. Those were marked optional and asked an organiser for decimal
 * degrees, which nobody knows offhand - nine of the ten venues in production
 * were saved with a null pin, which is what a catalogue map would have plotted
 * as a single marker.
 *
 * Pasting a Maps link is something they can actually do, and the coordinates
 * are already in the URL. The two numbers are still here underneath, because a
 * venue with no Google presence has to be placeable by hand.
 *
 * @param {{lat: string, lng: string}} value  Form state, kept as strings so an
 *   empty field stays empty rather than becoming 0.
 * @param {(patch: {lat: string, lng: string}) => void} onChange
 * @param {React.ReactNode} preview  The map that shows the resolved pin back.
 *   Passed in rather than imported so this component stays independent of which
 *   mapping library the project settles on.
 */
export default function MapLinkField({
  value,
  onChange,
  preview = null,
  locale = "en",
}) {
  const initialLink =
    value.url ||
    (value.lat && value.lng
      ? `https://www.google.com/maps?q=${value.lat},${value.lng}`
      : "");
  const [link, setLink] = useState(initialLink);
  const [status, setStatus] = useState(null); // { tone, text }
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);

  const km = locale === "km";
  const hasPin =
    value.lat !== "" &&
    value.lat != null &&
    value.lng !== "" &&
    value.lng != null;

  // Keep link in sync when opening edit on a venue or switching venues
  useEffect(() => {
    if (value.url) {
      setLink(value.url);
    } else if (value.lat && value.lng && !link) {
      setLink(`https://www.google.com/maps?q=${value.lat},${value.lng}`);
    } else if (!value.lat && !value.lng && !value.url) {
      setLink("");
      setStatus(null);
    }
  }, [value.url, value.lat, value.lng]);

  function apply(coords, note, sourceUrl) {
    const finalUrl = sourceUrl || link;
    onChange({
      lat: String(coords.lat),
      lng: String(coords.lng),
      url: finalUrl,
    });
    setStatus({ tone: "ok", text: note });
  }

  async function read(overrideText) {
    const raw = (typeof overrideText === "string" ? overrideText : link).trim();
    if (!raw) return;

    setBusy(true);
    setStatus(null);
    try {
      let result = readMapLink(raw);

      if (!result.ok && result.reason === "short-link") {
        const resolved = await resolveMapLink(result.url || raw);
        const coords = coordsFromMapsUrl(resolved);
        if (!coords) {
          setStatus({ tone: "bad", text: unreadable(km) });
          return;
        }
        if (!inCambodia(coords)) {
          setStatus({ tone: "bad", text: outside(km) });
          return;
        }
        apply(coords, found(km, coords), result.url || raw);
        return;
      }

      if (result.ok) {
        apply(result.coords, found(km, result.coords), result.url || raw);
        return;
      }

      setStatus({
        tone: "bad",
        text: result.reason === "out-of-bounds" ? outside(km) : unreadable(km),
      });
    } catch (err) {
      const detail =
        err?.response?.data?.message || err?.response?.data?.detail;
      setStatus({ tone: "bad", text: detail || unreadable(km) });
    } finally {
      setBusy(false);
    }
  }

  // Auto-read link when user pastes or finishes typing
  function handleInputChange(e) {
    const text = e.target.value;
    setLink(text);
    onChange({ lat: value.lat, lng: value.lng, url: text });

    const trimmed = text.trim();
    if (trimmed.length > 10) {
      const result = readMapLink(trimmed);
      if (result.ok || result.reason === "short-link") {
        read(trimmed);
      }
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData?.getData("text");
    if (pasted && pasted.trim()) {
      setTimeout(() => read(pasted.trim()), 50);
    }
  }

  return (
    <div className="stack-sm">
      <Field
        label={km ? "តំណ Google Maps" : "Google Maps link"}
        hint={
          km
            ? "បើកទីកន្លែងក្នុង Google Maps ចុច Share រួចបិទភ្ជាប់តំណនៅទីនេះ"
            : "Open the venue in Google Maps, tap Share, and paste the link here"
        }
      >
        <div className="row row-tight">
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://maps.app.goo.gl/…"
            value={link}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onBlur={() => link.trim() && !hasPin && read(link)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                read();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => read()}
            disabled={busy || !link.trim()}
          >
            <Icon name={busy ? "refresh" : "mapPin"} size={15} />
            {busy ? (km ? "កំពុងអាន…" : "Reading…") : km ? "អាន" : "Read"}
          </button>
        </div>
      </Field>

      {status && (
        <p className={status.tone === "ok" ? "hint" : "err"}>
          <Icon name={status.tone === "ok" ? "check" : "xCircle"} size={13} />{" "}
          {status.text}
        </p>
      )}

      {hasPin && preview}

      {/*
        The manual pair, kept for venues Google does not know and for correcting
        a pin by hand. Collapsed rather than removed: it is the fallback, not
        the path, and two decimal-degree boxes presented as equals are what
        produced the nulls in the first place.
      */}
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setManual((v) => !v)}
          aria-expanded={manual}
        >
          <Icon name={manual ? "chevronDown" : "chevronRight"} size={14} />
          {km ? "បញ្ចូលកូអរដោនេដោយដៃ" : "Enter coordinates manually"}
        </button>

        {manual && (
          <div className="advanced-row">
            <Field label={km ? "រយៈទទឹង" : "Latitude"}>
              <input
                className="input"
                type="number"
                step="0.000001"
                value={value.lat}
                onChange={(e) => onChange({ ...value, lat: e.target.value })}
              />
            </Field>
            <Field label={km ? "រយៈបណ្តោយ" : "Longitude"}>
              <input
                className="input"
                type="number"
                step="0.000001"
                value={value.lng}
                onChange={(e) => onChange({ ...value, lng: e.target.value })}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

const found = (km, c) =>
  km
    ? `រកឃើញទីតាំង៖ ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`
    : `Pin found: ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}. Check it below`;

const unreadable = (km) =>
  km
    ? "មិនអាចអានតំណនេះបានទេ។ សូមប្រើប៊ូតុង Share ក្នុង Google Maps។"
    : "Could not read that link. Use the Share button in Google Maps, or enter the coordinates manually.";

const outside = (km) =>
  km
    ? "ទីតាំងនេះនៅក្រៅប្រទេសកម្ពុជា។ សូមពិនិត្យតំណម្តងទៀត។"
    : "That location is outside Cambodia. Check the link is for the right place.";
