/**
 * Theme preference: 'auto' follows the OS; 'light' / 'dark' pin it via
 * <html data-theme>. index.html applies the stored value before first paint.
 */
import { ref, watch } from 'vue'

export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'pitchlab-theme'
const META = { light: '#F7F7F4', dark: '#0F1013' }

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export const themePref = ref<ThemePref>(read())

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

function apply() {
  const pref = themePref.value
  const root = document.documentElement
  if (pref === 'auto') delete root.dataset.theme
  else root.dataset.theme = pref
  const dark = pref === 'dark' || (pref === 'auto' && !!media?.matches)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', META[dark ? 'dark' : 'light'])
}

export function initTheme() {
  apply()
  media?.addEventListener('change', apply)
  watch(themePref, (v) => {
    try {
      if (v === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, v)
    } catch {
      /* storage unavailable: preference lasts for this visit */
    }
    apply()
  })
}

export function cycleTheme() {
  const order: ThemePref[] = ['auto', 'light', 'dark']
  themePref.value = order[(order.indexOf(themePref.value) + 1) % order.length]!
}
