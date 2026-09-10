import client from './client.js'

/**
 * The province reference list, straight from the API.
 *
 * This replaces the hard-coded PROVINCES array that used to live in
 * mock/store.js. That list drifted from the database the moment
 * V17__all_cambodian_provinces.sql landed - the seed had a partial list while
 * the table has the full set, so a venue in a province the mock did not know
 * about rendered its raw numeric code in the UI.
 */
export const getProvinces = () => client.get('/province').then((r) => r.data)
