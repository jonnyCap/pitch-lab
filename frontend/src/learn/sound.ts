/** Playback helpers for fundamentals (piano when samples exist, else a synth tone). */
import { audio, type PlayedSound } from '@/audio/engine'
import { listTimbres } from '@/audio/instruments'

export function learnTimbre(): string {
  return listTimbres().some((t) => t.id === 'piano') ? 'piano' : 'complex'
}

/** Melodic: one after another (0.75 s apart); harmonic: together. */
export async function playNotes(
  midis: readonly number[],
  harmonic = false,
): Promise<PlayedSound[]> {
  if (harmonic)
    return audio.playTones(
      learnTimbre(),
      midis,
      midis.map(() => 0),
      1.1,
    )
  return audio.playTones(
    learnTimbre(),
    midis,
    midis.map((_, i) => i * 0.75),
    0.7,
  )
}

/** Ear-training playback: scale = quick ascending run; chord = block, then arpeggio. */
export async function playStyled(
  midis: readonly number[],
  style: 'scale' | 'chord',
): Promise<PlayedSound[]> {
  if (style === 'scale') {
    return audio.playTones(
      learnTimbre(),
      midis,
      midis.map((_, i) => i * 0.32),
      0.34,
    )
  }
  const block = midis.map(() => 0)
  const arp = midis.map((_, i) => 1.3 + i * 0.38)
  return audio.playTones(learnTimbre(), [...midis, ...midis], [...block, ...arp], 1.0)
}
