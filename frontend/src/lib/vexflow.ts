/**
 * Shared lazy VexFlow loader. Uses the font-less `vexflow/core` build and loads
 * Bravura (SIL OFL) from a separate, hashed woff2 asset instead of the ~330 kB
 * base64 copy inlined in `vexflow/bravura`. Notation contains no text, so the
 * Academico text font is not needed.
 */
import bravuraUrl from '@/assets/fonts/Bravura.woff2?url'

export type VF = typeof import('vexflow/core')

let promise: Promise<VF> | null = null

export function loadVexFlow(): Promise<VF> {
  promise ??= import('vexflow/core').then(async (m) => {
    await m.Font.load('Bravura', bravuraUrl, { display: 'block' })
    m.default.setFonts('Bravura')
    return m
  })
  promise.catch(() => (promise = null))
  return promise
}
