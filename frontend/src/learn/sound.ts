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
