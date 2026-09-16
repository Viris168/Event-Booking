/*
 * CSV export, for the tables an admin has to tick off against something else.
 *
 * Built here rather than on the server because the file is the view that is
 * already on screen: the filters have run, the rows are in hand, and asking the
 * API for them a second time only introduces a way for the download and the
 * table to disagree.
 *
 * CSV rather than PDF, deliberately. A PDF is for a document somebody is owed -
 * the payout invoice is one, and prints from the browser. This is the opposite
 * job: numbers that have to sit next to a Bakong or ABA statement in a
 * spreadsheet while somebody works down both.
 */

/**
 * One field, quoted the way RFC 4180 asks and defused the way spreadsheets
 * require.
 *
 * <p>The leading apostrophe on =, +, - and @ is not decoration. Excel and
 * Sheets treat a cell starting with any of those as a formula, so a provider
 * reference or a buyer name beginning with one is executed rather than read -
 * the standard CSV injection. Prefixing with an apostrophe makes the cell text,
 * and the apostrophe itself is not displayed.
 */
function field(value) {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Rows to a CSV string.
 *
 * @param columns [{ header, value }], where value is called with each row. The
 *        column list is the caller's, in the caller's order, so the file reads
 *        like the table it came from rather than like the API payload.
 * @param rows    whatever is currently on screen.
 */
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => field(c.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => field(c.value(row))).join(','))
  }
  // CRLF, which is what RFC 4180 specifies and what Excel on Windows expects.
  return lines.join('\r\n')
}

/**
 * Hand the file to the browser.
 *
 * <p>The BOM is load-bearing on this platform: without it Excel reads a UTF-8
 * file as the local code page, and every Khmer event title and buyer name in
 * the export arrives as mojibake. Nothing else in the app needs it, which is
 * exactly why it is easy to leave out and hard to notice in testing done in
 * English.
 */
export function downloadCsv(filename, csv) {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Freed on the next tick rather than immediately - revoking synchronously
  // races the click in Safari and downloads an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** `payments-2026-09-16.csv` - sortable, and unambiguous about which day. */
export function stampedFilename(prefix) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`
}
