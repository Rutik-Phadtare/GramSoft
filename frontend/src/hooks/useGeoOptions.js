import { useEffect, useMemo, useState } from "react";
import { gramPanchayatApi } from "../api/gramPanchayats";
import { useLanguage } from "../context/LanguageContext";
import { sortedGeoOptions } from "../utils/i18nData";

// Filter options are shared by several screens and change rarely, so they're
// cached per district (and de-duplicated while in flight): switching tabs or
// pages never re-fetches them.
const TTL_MS = 60_000;
const cache = new Map(); // districtKey || "*" -> { at, data }
const inflight = new Map();

function loadOptions(districtKey) {
  const id = districtKey || "*";
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.data);
  if (inflight.has(id)) return inflight.get(id);
  const p = gramPanchayatApi
    .filterOptions(districtKey || undefined)
    .then((data) => {
      cache.set(id, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export function invalidateGeoOptions() {
  cache.clear();
}

/**
 * District + taluka dropdown options in the selected language. Option `value`s
 * are language-independent keys, so a selected filter keeps working (and just
 * re-labels itself) when the user switches language.
 */
export function useGeoOptions(districtKey) {
  const { language } = useLanguage();
  const [districtsRaw, setDistrictsRaw] = useState([]);
  const [talukasRaw, setTalukasRaw] = useState([]);

  useEffect(() => {
    let alive = true;
    loadOptions().then((d) => alive && setDistrictsRaw(d.districts || [])).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    loadOptions(districtKey)
      .then((d) => alive && setTalukasRaw(d.talukas || []))
      .catch(() => alive && setTalukasRaw([]));
    return () => { alive = false; };
  }, [districtKey]);

  const districts = useMemo(() => sortedGeoOptions(districtsRaw, language), [districtsRaw, language]);
  const talukas = useMemo(() => sortedGeoOptions(talukasRaw, language), [talukasRaw, language]);
  return { districts, talukas };
}
