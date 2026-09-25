import { useDocumentTitle } from "../lib/useDocumentTitle.js";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import EventCard from "../components/EventCard.jsx";
import { plottable } from "../lib/eventGeo.js";
import { minPriceUsd } from "../lib/eventPrice.js";
import PriceRange from "../components/PriceRange.jsx";
import Icon from "../components/Icon.jsx";
import { EventGridSkeleton, Skeleton } from "../components/Skeleton.jsx";
import {
  ActiveFilters,
  Empty,
  Field,
  IconSelect,
  Pager,
  SearchInput,
} from "../components/ui.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { useProvinces } from "../lib/useProvinces.js";
import { getEvents } from "../api/events.js";
import { mapEvent } from "../api/adapters.js";
import MapErrorBoundary from "../components/MapErrorBoundary.jsx";

/*
 * Leaflet is ~45kB gzipped and the map is one half of one page, so it is split
 * out rather than carried in the bundle every visitor downloads. Mobile never
 * opens it at all unless the visitor asks for it.
 */
const EventsMap = lazy(() => import("../components/EventsMap.jsx"));

/*
 * Eight fills a four-across grid twice over. In the split layout the list is
 * narrower and runs two across, so the same eight is four rows - still one
 * screenful of scrolling beside a map that has to plot all of them.
 */
const PAGE_SIZE = 8;
const EMPTY = {
  q: "",
  province: "",
  from: "",
  to: "",
  minUsd: "",
  maxUsd: "",
  sort: "soonest",
};

const TOP_PROVINCES = [
  { name: "Phnom Penh", icon: "building" },
  { name: "Siem Reap", icon: "temple" },
  { name: "Kampot", icon: "mountain" },
  { name: "Koh Kong", icon: "palmtree" },
  { name: "Kep", icon: "sun" },
];

/*
 * The price slider's ends, in whole dollars.
 *
 * PRICE_MAX is a ceiling for the control, not a claim about the catalogue: the
 * seeded events top out at $90, and the top of the track means "no maximum"
 * rather than "$100", so an event priced above it is never filtered out by a
 * slider the visitor left alone. Both ends drop out of the URL when they sit at
 * their extremes, which keeps a default range out of the query string and out
 * of the filter chips.
 */
const PRICE_MIN = 0;
const PRICE_MAX = 100;

/** How long typing has to pause before the search reaches the URL and the API. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * What actually goes on the wire: the filters that are set, plus the window of
 * the catalogue to return.
 *
 * <p>Filtering and paging both happen on the server now. They have to happen in
 * the same place - this page used to ask for 20 events and then slice them into
 * pages of 8 in the browser, which made "3 pages" mean "the first 20 rows",
 * left event 21 unreachable, and printed a count that was really "up to 20".
 */
function requestParams(filters, page) {
  const query = { page: page - 1, size: PAGE_SIZE };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "" && value != null) query[key] = value;
  }
  return query;
}

export default function EventsPage() {
  const { t, locale, date } = useLocale();
  const { provinces, provinceName } = useProvinces();
  useDocumentTitle(t("events"));
  const [params, setParams] = useSearchParams();
  /*
   * The page number lives in the URL like every other filter.
   *
   * It used to be component state, which made it the one part of the result
   * set a link could not carry: reloading on page 3, or coming back to it,
   * silently landed on page 1. The split layout makes that worse rather than
   * better - what the map is showing IS the page, so a shared link that drops
   * it shows a different map.
   */
  const page = Math.max(1, Number(params.get("page")) || 1);
  const setPage = (n) => {
    const next = new URLSearchParams(params);
    if (n <= 1) next.delete("page");
    else next.set("page", String(n));
    setParams(next);
    /*
     * The new page begins above where the pager sits, so staying put would
     * land the reader at the bottom of results they have not seen.
     *
     * On desktop the list is its own scroll container - the document barely
     * moves - so scrolling the window would do nothing at all. Scroll the
     * column when it is the thing that scrolls, and fall back to the document
     * on a phone, where the list is simply part of the page.
     */
    const list = listRef.current;
    if (list && list.scrollHeight > list.clientHeight) {
      list.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document
        .getElementById("events-results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  // The scrolling half of the split, so turning the page can send it back up.
  const listRef = useRef(null);
  // Two-layer selection: a pinned event persists as a visual marker, while a
  // hovered event is the only card interaction that moves the map camera.
  const [pinnedId, setPinnedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);
  /* Below 900px the map only exists inside the popup, so a pin has nothing
     to mark once it closes - and the card was left highlighted, with its pin
     button reopening the popup instead of clearing it. Closing clears it. */
  const closeMapModal = () => {
    setShowMapModal(false);
    setPinnedId(null);
  };
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiResults, setApiResults] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [failed, setFailed] = useState(false);
  // Bumped by Retry. Re-setting identical search params would not change the
  // effect's dependency, so a failed read had no way to be re-run.
  const [reload, setReload] = useState(0);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 900px)");
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Placeholders until the read settles, so the grid never jumps.
  const [loading, setLoading] = useState(true);

  // Lock body scroll and listen for Escape when map modal is open on small/medium screens
  useEffect(() => {
    if (!showMapModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeMapModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showMapModal]);

  const filters = { ...EMPTY };
  for (const key of Object.keys(EMPTY))
    filters[key] = params.get(key) ?? EMPTY[key];

  // What the search box shows while it is being typed in. The URL stays the
  // source of truth for what has actually been searched for; this is only the
  // draft on its way there.
  const [qDraft, setQDraft] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);

  // Same draft-then-commit shape as the search box above, and for the same
  // reason: a drag fires a change per step, and writing the URL on each one
  // would refetch the catalogue dozens of times across a single gesture.
  const priceOf = (f) => [
    f.minUsd === "" ? PRICE_MIN : Number(f.minUsd),
    f.maxUsd === "" ? PRICE_MAX : Number(f.maxUsd),
  ];
  const [priceDraft, setPriceDraft] = useState(() => priceOf(filters));
  const [syncedPrice, setSyncedPrice] = useState(
    `${filters.minUsd}|${filters.maxUsd}`,
  );

  // The search changed from somewhere other than the box: arriving from the
  // home page's search bar, removing the chip, Reset, or the back button.
  // Adjusted here rather than in an effect because that is what React
  // recommends for state derived from something outside it - an effect would
  // paint the stale value once before correcting it.
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    setQDraft(filters.q);
  }

  // The range changed from outside the slider — the chip's x, Reset, or the
  // back button. Same derived-state adjustment as the search box.
  const priceKey = `${filters.minUsd}|${filters.maxUsd}`;
  if (priceKey !== syncedPrice) {
    setSyncedPrice(priceKey);
    setPriceDraft(priceOf(filters));
  }

  // Typing used to write the URL on every keystroke, and every write refetched
  // the catalogue and dropped the whole grid to skeletons - eight requests and
  // eight flashes to type "concert", with the answers arriving out of order.
  // Now the URL is written once typing pauses, and one request follows.
  useEffect(() => {
    if (qDraft === filters.q) return;
    const timer = setTimeout(() => update({ q: qDraft }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [qDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  // An end sitting at its extreme is not a filter, so it leaves the URL
  // entirely — otherwise "$0 and up" would show as a chip and would pin the
  // upper bound at PRICE_MAX, hiding anything dearer than the slider can reach.
  useEffect(() => {
    const [low, high] = priceDraft;
    const nextMin = low <= PRICE_MIN ? "" : String(low);
    const nextMax = high >= PRICE_MAX ? "" : String(high);
    if (nextMin === filters.minUsd && nextMax === filters.maxUsd) return;
    const timer = setTimeout(
      () => update({ minUsd: nextMin, maxUsd: nextMax }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [priceDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  // When an event is pinned (from map or button), smoothly scroll the card into view
  useEffect(() => {
    if (!pinnedId) return;
    const card = listRef.current?.querySelector(
      `[data-event-id="${pinnedId}"]`,
    );
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [pinnedId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getEvents(requestParams(filters, page))
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data?.content)
          ? data.content
          : Array.isArray(data)
            ? data
            : [];
        // The API serialises Page in snake_case; the camelCase spellings are
        // here for the same reason adapters.js carries both - one Jackson
        // setting is all that stands between the two, and reading only the
        // camel names silently pins the pager to a single page.
        const pages = Math.max(1, data?.total_pages ?? data?.totalPages ?? 1);
        const total =
          data?.total_elements ?? data?.totalElements ?? list.length;
        setApiResults(list.map(mapEvent));
        setTotalPages(pages);
        setTotalElements(total);
        // The catalogue shrank under a page that no longer exists - Retry after
        // events were taken down. Without this the grid is empty and the pager
        // has already hidden itself, leaving no way back but Reset.
        //
        // Writes the parameter rather than calling setPage: this is a
        // correction the visitor did not ask for, so it should not scroll them
        // anywhere, and it replaces the impossible URL instead of pushing a
        // second entry the back button would return them to.
        if (page > pages) {
          const fixed = new URLSearchParams(params);
          if (pages <= 1) fixed.delete("page");
          else fixed.set("page", String(pages));
          setParams(fixed, { replace: true });
        }
        // A result set the visitor did not choose should not keep an old card
        // lit up on a map that no longer shows it.
        setPinnedId(null);
        setHoveredId(null);
      })
      .catch(() => {
        // No mock fallback: seeded events standing in for a failed read looked
        // like a working catalogue and hid the outage completely.
        if (!active) return;
        setApiResults([]);
        setTotalPages(1);
        setTotalElements(0);
        setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyed on every filter except the price pair, so dragging the handles does
  // not refetch the shape they are being dragged over.
  const shapeKey = ["q", "province", "from", "to"]
    .map((k) => filters[k])
    .join("|");
  useEffect(() => {
    let active = true;
    const query = { page: 0, size: 200 };
    for (const key of ["q", "province", "from", "to"]) {
      if (filters[key] !== "" && filters[key] != null)
        query[key] = filters[key];
    }
    getEvents(query)
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data?.content)
          ? data.content
          : Array.isArray(data)
            ? data
            : [];
        setPriceShape(list.map(minPriceUsd).filter((n) => n != null));
      })
      // A histogram is an adornment on a control that works without it, so a
      // failed read leaves the slider bare rather than surfacing an error.
      .catch(() => active && setPriceShape([]));
    return () => {
      active = false;
    };
  }, [shapeKey, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(patch) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === "" || value == null) next.delete(key);
      else next.set(key, value);
    }
    // Any change to the filters invalidates the page number: result three
    // pages deep into the old query has no counterpart in the new one.
    next.delete("page");
    setParams(next, { replace: true });
  }

  // Everything narrowing the result set, as removable chips.
  const chips = [];
  if (filters.q)
    chips.push({
      key: "q",
      icon: "search",
      label: `“${filters.q}”`,
      onRemove: () => update({ q: "" }),
    });
  if (filters.province)
    chips.push({
      key: "province",
      icon: "mapPin",
      label: provinceName(filters.province, locale),
      onRemove: () => update({ province: "" }),
    });
  if (filters.from)
    chips.push({
      key: "from",
      icon: "calendar",
      label: `${t("from")} ${date(filters.from)}`,
      onRemove: () => update({ from: "" }),
    });
  if (filters.to)
    chips.push({
      key: "to",
      icon: "calendar",
      label: `${t("to")} ${date(filters.to)}`,
      onRemove: () => update({ to: "" }),
    });
  /*
   * One chip for the pair, not one per end. They are now two handles on a
   * single control, so clearing "from $20" while "to $60" stayed behind would
   * leave the slider in a state the visitor never chose.
   */
  if (!showAdvanced && (filters.minUsd || filters.maxUsd)) {
    const low = filters.minUsd || PRICE_MIN;
    const high = filters.maxUsd
      ? `$${filters.maxUsd}`
      : locale === "km"
        ? "ឡើងទៅ"
        : "any";
    chips.push({
      key: "price",
      icon: "wallet",
      label: `$${low} – ${high}`,
      onRemove: () => {
        setPriceDraft([PRICE_MIN, PRICE_MAX]);
        update({ minUsd: "", maxUsd: "" });
      },
    });
  }

  /*
   * The price distribution the slider draws behind itself.
   *
   * Its own read, and deliberately not the paged one above: the histogram
   * describes the whole matching catalogue, so a page of eight would draw a
   * shape that changes every time you turn the page.
   *
   * The price bounds are left OUT of its query - narrowing the range must not
   * carve away the bars that show what narrowing would cost. Everything else
   * applies, so the shape is of what the visitor is actually looking at.
   */
  const [priceShape, setPriceShape] = useState([]);

  // What the map can actually draw. Computed here as well as inside the map
  // so the page can say when the two disagree - and so the map chunk is not
  // fetched at all for a page with nothing to plot.
  const mappable = plottable(apiResults);

  const advancedActive = !!(
    filters.from ||
    filters.to ||
    filters.minUsd ||
    filters.maxUsd
  );

  return (
    <div className="container events-page">
      {/*
       * Title and filters hold the top of the workspace; only the results
       * beneath them move. Grouped so the shell can pin this block and hand
       * everything left over to the list and the map.
       */}
      <div className="events-chrome">
        <div className="page-head">
          <div>
            <h1>{t("events")}</h1>
            {loading ? (
              <Skeleton className="skel-line mt-2 w-52" />
            ) : (
              <p>
                {totalElements}{" "}
                {locale === "km"
                  ? "ព្រឹត្តិការណ៍កំពុងលក់សំបុត្រ"
                  : `${totalElements === 1 ? "event" : "events"} currently on sale`}
              </p>
            )}
          </div>
        </div>

        {/* -------------------------------------------------------- search bar */}
        <div className="panel searchpanel">
          <div className="panel-body">
            <div className="province-pills-row">
              {TOP_PROVINCES.map((tp) => {
                const p = provinces.find(
                  (x) => x.name_en === tp.name || x.nameEn === tp.name,
                );
                const code = p ? p.code || p.provinceCode : "";
                const label = p
                  ? locale === "km"
                    ? p.name_km || p.nameKm
                    : p.name_en || p.nameEn
                  : tp.name;
                const isActive = filters.province === code && code !== "";
                return (
                  <button
                    key={tp.name}
                    className={`pill-btn ${isActive ? "is-active" : ""}`}
                    onClick={() => update({ province: isActive ? "" : code })}
                  >
                    <Icon name={tp.icon} size={18} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
            <div className="search-row">
              <SearchInput
                value={qDraft}
                onChange={setQDraft}
                placeholder={
                  locale === "km"
                    ? "ស្វែងរកព្រឹត្តិការណ៍ ឬទីកន្លែង"
                    : "Search events, artists or venues"
                }
                ariaLabel={t("search")}
                className="search-main"
              />
              <IconSelect
                icon="filter"
                value={filters.sort}
                onChange={(v) => update({ sort: v })}
                ariaLabel={t("sort")}
                className="search-sort"
              >
                <option value="soonest">{t("soonest")}</option>
                <option value="priceLow">{t("priceLow")}</option>
                <option value="priceHigh">{t("priceHigh")}</option>
              </IconSelect>
              <button
                type="button"
                className={`btn ${showAdvanced || advancedActive ? "btn-primary" : "btn-outline"}`}
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
              >
                <Icon name="filter" size={16} />
                {t("filters")}
                {advancedActive && (
                  <span className="dot-badge" aria-hidden="true" />
                )}
              </button>
              {isMobile && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setPinnedId(null);
                    setShowMapModal(true);
                  }}
                  aria-label={locale === "km" ? "ផែនទី" : "Map"}
                >
                  <Icon name="mapPin" size={16} />
                  <span>{locale === "km" ? "ផែនទី" : "Map"}</span>
                </button>
              )}
            </div>

            {showAdvanced && (
              <div className="advanced-row">
                <Field label={t("from")}>
                  <input
                    className="input"
                    type="date"
                    value={filters.from}
                    onChange={(e) => update({ from: e.target.value })}
                  />
                </Field>
                <Field label={t("to")}>
                  <input
                    className="input"
                    type="date"
                    value={filters.to}
                    onChange={(e) => update({ to: e.target.value })}
                  />
                </Field>
                <Field className="range-field" label={t("priceRange")}>
                  <PriceRange
                    min={PRICE_MIN}
                    max={PRICE_MAX}
                    step={1}
                    value={priceDraft}
                    onChange={setPriceDraft}
                    onReset={() => {
                      setPriceDraft([PRICE_MIN, PRICE_MAX]);
                      update({ minUsd: "", maxUsd: "" });
                    }}
                    prices={priceShape}
                    lowLabel={t("minPrice")}
                    highLabel={t("maxPrice")}
                    locale={locale}
                  />
                </Field>
              </div>
            )}

            {chips.length > 0 && (
              <div style={{ marginTop: "0.85rem" }}>
                <ActiveFilters
                  items={chips}
                  onClearAll={() => setParams(new URLSearchParams())}
                  clearAllLabel={t("reset")}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="events-body">
        {loading ? (
          <div className="events-split" style={{ marginTop: "1.4rem" }}>
            <div className="events-list">
              {/* EventGridSkeleton, not a hand-rolled grid of cards: this was
                  the one loading state in the app not wrapped in
                  SkeletonRegion, so it announced nothing - no role="status",
                  no aria-busy, no "loading" for a screen reader - while the
                  catalogue fetched.

                  PAGE_SIZE, not a literal 4. A page holds eight results, so
                  four placeholders reserved 759px for a list that arrived
                  1535px tall - the page grew 776px under the reader the
                  instant the catalogue answered, which is the single largest
                  shift on the site and precisely what a placeholder exists to
                  prevent. Tied to the constant so it cannot drift again. */}
              <EventGridSkeleton
                count={PAGE_SIZE}
                className="grid-cards-split"
              />
            </div>
            <div className="events-map-col">
              <div className="events-map events-map-loading" />
            </div>
          </div>
        ) : apiResults.length ? (
          <div className="events-split" id="events-results">
            <div className="events-list" ref={listRef}>
              <div className="grid grid-cards grid-cards-split">
                {apiResults.map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    data-event-id={e.id}
                    pinned={String(pinnedId) === String(e.id)}
                    onPin={() => {
                      if (isMobile) {
                        /* Same toggle as desktop: a card that is already
                           pinned unpins rather than reopening the map. */
                        if (String(pinnedId) === String(e.id)) {
                          setPinnedId(null);
                        } else {
                          setPinnedId(e.id);
                          setShowMapModal(true);
                        }
                      } else {
                        setPinnedId((prev) =>
                          String(prev) === String(e.id) ? null : e.id,
                        );
                      }
                    }}
                    onMouseEnter={() => setHoveredId(e.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                ))}
              </div>
              <Pager page={page} pages={totalPages} onChange={setPage} />
            </div>

            <div className="events-map-col">
              {!isMobile && mappable.length > 0 && (
                <Suspense
                  fallback={<div className="events-map events-map-loading" />}
                >
                  <MapErrorBoundary
                    locale={locale}
                    events={apiResults}
                    pinnedId={pinnedId}
                  >
                    <EventsMap
                      events={apiResults}
                      hoveredId={hoveredId}
                      pinnedId={pinnedId}
                      onSelect={(id) =>
                        setPinnedId((prev) => (prev === id ? null : id))
                      }
                      locale={locale}
                    />
                  </MapErrorBoundary>
                </Suspense>
              )}
              {!isMobile && !mappable.length && (
                <div className="events-map events-map-empty">
                  <Icon name="mapPin" size={22} />
                  <p className="small muted">
                    {locale === "km"
                      ? "ព្រឹត្តិការណ៍ទាំងនេះមិនទាន់មានទីតាំងលើផែនទី"
                      : "None of these events has a venue pinned on the map yet."}
                  </p>
                </div>
              )}
              {!isMobile &&
                mappable.length > 0 &&
                mappable.length < apiResults.length && (
                  <p className="hint events-map-note">
                    {locale === "km"
                      ? `បង្ហាញ ${mappable.length} ក្នុងចំណោម ${apiResults.length} លើផែនទី`
                      : `${mappable.length} of ${apiResults.length} shown on the map`}
                  </p>
                )}
            </div>
          </div>
        ) : failed ? (
          <Empty
            icon="xCircle"
            title={
              locale === "km"
                ? "មិនអាចផ្ទុកព្រឹត្តិការណ៍"
                : "Could not load events"
            }
          >
            {locale === "km"
              ? "សូមព្យាយាមម្តងទៀត។"
              : "The catalogue is unavailable right now. Please try again."}
            <button
              className="btn btn-sm btn-primary"
              style={{ marginTop: "0.8rem" }}
              onClick={() => setReload((n) => n + 1)}
            >
              <Icon name="refresh" size={14} />
              {locale === "km" ? "ព្យាយាមម្តងទៀត" : "Retry"}
            </button>
          </Empty>
        ) : (
          <>
            <Empty icon="search" title={t("noEvents")}>
              {locale === "km"
                ? "សូមសម្រួលតម្រងរបស់អ្នក"
                : "Try widening your filters."}
            </Empty>
            {chips.length > 0 && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: "-1.5rem",
                  paddingBottom: "2rem",
                }}
              >
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => setParams(new URLSearchParams())}
                >
                  <Icon name="close" size={14} />
                  {t("reset")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Map Popup Modal for Mobile & Tablet */}
      {showMapModal &&
        createPortal(
          <div
            className="events-map-modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeMapModal();
            }}
            role="dialog"
            aria-modal="true"
            aria-label={locale === "km" ? "ផែនទីព្រឹត្តិការណ៍" : "Events Map"}
          >
            <div className="events-map-modal-dialog">
              <div className="events-map-modal-header">
                <div className="events-map-modal-title-group">
                  <span className="events-map-modal-icon-chip">
                    <Icon name="mapPin" size={18} />
                  </span>
                  <div>
                    <h3 className="events-map-modal-title">
                      {locale === "km" ? "ផែនទីព្រឹត្តិការណ៍" : "Events Map"}
                    </h3>
                    <p className="events-map-modal-sub">
                      {locale === "km"
                        ? `${mappable.length} ក្នុងចំណោម ${apiResults.length} ព្រឹត្តិការណ៍មានទីតាំង`
                        : `${mappable.length} of ${apiResults.length} events mapped`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="events-map-modal-close"
                  onClick={closeMapModal}
                  aria-label={locale === "km" ? "បិទ" : "Close"}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>

              <div className="events-map-modal-body">
                {mappable.length ? (
                  <Suspense
                    fallback={<div className="events-map events-map-loading" />}
                  >
                    <MapErrorBoundary
                      locale={locale}
                      events={apiResults}
                      pinnedId={pinnedId}
                    >
                      <EventsMap
                        events={apiResults}
                        hoveredId={hoveredId}
                        pinnedId={pinnedId}
                        onSelect={(id) =>
                          setPinnedId((prev) => (prev === id ? null : id))
                        }
                        locale={locale}
                      />
                    </MapErrorBoundary>
                  </Suspense>
                ) : (
                  <div className="events-map events-map-empty">
                    <Icon name="mapPin" size={26} />
                    <p className="small muted">
                      {locale === "km"
                        ? "ព្រឹត្តិការណ៍ទាំងនេះមិនទាន់មានទីតាំងលើផែនទី"
                        : "None of these events has a venue pinned on the map yet."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
