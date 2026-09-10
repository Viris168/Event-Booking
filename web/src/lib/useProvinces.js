import { useEffect, useState } from 'react'
import { getProvinces } from '../api/provinces.js'

/**
 * Province reference data, fetched once per page load and shared.
 *
 * The list is small, immutable for the life of a session, and needed by three
 * unrelated places (the home hero, the events filter, every event card). A
 * module-level promise means those three mount in any order and still trigger
 * exactly one request - a plain useEffect per consumer would fire one each.
 *
 * No provider on purpose: a context would have to wrap the whole app to reach
 * EventCard, and this data never changes, so there is nothing for a provider
 * to coordinate.
 */
let cache = null

function load() {
  if (!cache) {
    cache = getProvinces().catch((err) => {
      // Let the next mount retry rather than caching the failure forever.
      cache = null
      throw err
    })
  }
  return cache
}

export function useProvinces() {
  const [provinces, setProvinces] = useState(() => [])

  useEffect(() => {
    let active = true
    load()
      .then((list) => {
        if (active) setProvinces(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (active) setProvinces([])
      })
    return () => {
      active = false
    }
  }, [])

  /**
   * Falls back to the raw code rather than empty text: an unknown province is
   * a data problem, and showing "12" makes that visible instead of rendering a
   * card that looks like it simply has no location.
   */
  function provinceName(code, locale = 'en') {
    if (code == null) return ''
    const p = provinces.find((x) => String(x.code) === String(code))
    if (!p) return String(code)
    return locale === 'km' ? p.name_km : p.name_en
  }

  return { provinces, provinceName }
}
