import { useMemo } from 'react'

/**
 * A deterministic QR-shaped glyph rendered from a token. It is a placeholder for
 * the real payload the backend will supply (Bakong KHQR string / ticket UUID) —
 * it encodes nothing, it just has to read as a scannable code in the layout.
 */
const SIZE = 25 // modules per side

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function isFinder(row, col) {
  const inBox = (r0, c0) => row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7
  return inBox(0, 0) || inBox(0, SIZE - 7) || inBox(SIZE - 7, 0)
}

function finderFill(row, col) {
  const local = (r0, c0) => {
    const r = row - r0
    const c = col - c0
    const edge = r === 0 || c === 0 || r === 6 || c === 6
    const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
    return edge || core
  }
  if (row < 7 && col < 7) return local(0, 0)
  if (row < 7 && col >= SIZE - 7) return local(0, SIZE - 7)
  return local(SIZE - 7, 0)
}

export default function QrGlyph({ token, className = 'qr-canvas', label }) {
  const modules = useMemo(() => {
    const seed = hash(String(token || 'ticket'))
    const cells = []
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (isFinder(row, col)) {
          if (finderFill(row, col)) cells.push([row, col])
          continue
        }
        // Cheap deterministic noise, stable per token.
        const n = hash(`${seed}:${row}:${col}`)
        if (n % 100 < 48) cells.push([row, col])
      }
    }
    return cells
  }, [token])

  return (
    <svg
      className={className}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label || 'QR code'}
    >
      <rect width={SIZE} height={SIZE} fill="#fff" />
      {modules.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="#131a2b" />
      ))}
    </svg>
  )
}
