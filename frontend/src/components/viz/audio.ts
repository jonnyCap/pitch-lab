/** Lazy audio for the figures (the engine is only fetched on the first tap). */
export async function playMidis(midis: readonly number[], offsets?: readonly number[], len = 0.8) {
  const [{ audio }, { learnTimbre }] = await Promise.all([
    import('@/audio/engine'),
    import('@/learn/sound'),
  ])
  await audio.unlock()
  return audio.playTones(learnTimbre(), midis, offsets ?? midis.map(() => 0), len)
}
