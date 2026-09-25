import { useState } from "react";
import Icon from "./Icon.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import {
  PRECISE_ENOUGH_M,
  currentPosition,
  directionsUrl,
  openExternal,
} from "../lib/directions.js";

/**
 * Route from wherever the viewer is to a venue's stored pin. A refused or
 * failed location still opens the route; Maps just picks the start itself.
 * Renders nothing for a venue without a pin.
 */
export default function DirectionsButton({ venue, className = "" }) {
  const { t } = useLocale();
  const toast = useToast();
  const [locating, setLocating] = useState(false);

  if (!venue?.lat || !venue?.lng) return null;

  async function onClick() {
    const dest = { lat: +venue.lat, lng: +venue.lng };
    setLocating(true);
    const { coords, accuracy, error } = await currentPosition();
    setLocating(false);
    const precise = coords && accuracy <= PRECISE_ENOUGH_M;
    if (error === "denied") toast(t("locationDenied"), "info");
    else if (coords && !precise) toast(t("locationRough"), "info");
    openExternal(directionsUrl(dest, precise ? coords : null));
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locating}
      aria-busy={locating}
      className={`btn btn-sm btn-outline inline-flex items-center gap-1.5 shrink-0 ${className}`}
    >
      <Icon name="navigate" size={13} />
      <span>{locating ? t("locatingYou") : t("getDirections")}</span>
    </button>
  );
}
