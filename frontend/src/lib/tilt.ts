/**
 * v-tilt: a gentle 3D tilt toward the pointer (max ~5°) plus a --mx/--my
 * highlight position for CSS. Mouse only; skipped under reduced motion.
 */
import type { Directive } from 'vue'

const MAX = 5
const cleanup = new WeakMap<HTMLElement, () => void>()

export const vTilt: Directive<HTMLElement> = {
  mounted(el) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.style.transform = `perspective(700px) rotateX(${(0.5 - y) * MAX}deg) rotateY(${(x - 0.5) * MAX}deg) translateZ(0)`
        el.style.setProperty('--mx', `${x * 100}%`)
        el.style.setProperty('--my', `${y * 100}%`)
      })
    }
    const leave = () => {
      cancelAnimationFrame(frame)
      el.style.transform = ''
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    cleanup.set(el, () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    })
  },
  unmounted(el) {
    cleanup.get(el)?.()
  },
}
