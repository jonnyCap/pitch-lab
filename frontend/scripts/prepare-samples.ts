/**
 * Builds the instrument sample sets served from public/samples/.
 *
 *   node scripts/prepare-samples.ts            (needs ffmpeg on PATH, or FFMPEG=/path/to/ffmpeg)
 *
 * Source: VSCO-2 Community Edition (CC0 / redistributable), github.com/sgossner/VSCO-2-CE
 *
 * Per note:
 *   download WAV (cached in .sample-cache/) → decode (pure JS) → mono
 *   → onset detection, keep 1.3 s from 5 ms before onset (enough for ±2 semitone repitching)
 *   → f0 estimate (NSDF): verify the note, derive the true MIDI number (labels may be an octave off)
 *     and a detune correction in cents; notes > 35 cents off are rejected
 *   → RMS-normalise the first second, peak-limit, 5 ms fade-in / 80 ms fade-out
 *   → ffmpeg: mono 44.1 kHz → .ogg (Vorbis q4) + .m4a (AAC 96k)
 * Then writes src/audio/sampleSets.ts describing every set (notes, detune, playable range).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { medianPitchMidi } from '../src/audio/analysis.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.sample-cache')
const PUBLIC = join(ROOT, 'public', 'samples')
const OUT_TS = join(ROOT, 'src', 'audio', 'sampleSets.ts')
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const REPO = 'sgossner/VSCO-2-CE'
const BRANCH = 'master'

const SEGMENT_SEC = 1.3
const TARGET_RMS = 0.1
const PEAK_LIMIT = 0.89
const MAX_CENTS = 35

interface SetDef {
  id: string
  version: number
  label: string
  dir: string
  /** Returns the labelled MIDI note for a file name, or null to skip the file. */
  parse: (file: string) => number | null
  /** Only keep notes in this labelled MIDI range (saves downloads). */
  keep: readonly [number, number]
  credit: string
}

const NOTE_RE = /([A-G])(#|b)?(-?\d)/
const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
function nameToMidi(name: string): number | null {
  const m = NOTE_RE.exec(name)
  if (!m) return null
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (Number(m[3]) + 1) * 12 + STEP[m[1]!]! + acc
}

const SETS: SetDef[] = [
  {
    id: 'piano',
    version: 1,
    label: 'Piano',
    dir: 'Keys/Upright Piano',
    // MappingChart.txt: file index N ↔ MIDI 21 + 2N.
    parse: (f) => {
      const m = /^Player_dyn2_rr1_(\d{3})\.wav$/.exec(f)
      return m ? 21 + 2 * Number(m[1]) : null
    },
    keep: [44, 99],
    credit:
      'Upright Piano by Simon Dalzell (Ivy Audio), distributed by Versilian Studios (VSCO-2 CE)',
  },
  {
    id: 'violin',
    version: 1,
    label: 'Violin',
    dir: 'Strings/Solo Violin/Arco Vib',
    parse: (f) => (/^LLVln_ArcoVib_.+_f\.wav$/.test(f) ? nameToMidi(f.split('_')[2]!) : null),
    keep: [50, 100],
    credit: 'Solo Violin (VSCO-2 CE, Versilian Studios, CC0)',
  },
  {
    id: 'clarinet',
    version: 1,
    label: 'Clarinet',
    dir: 'Woodwinds/Clarinet/susLong',
    parse: (f) => {
      const m = /^DCClar_susLong_([A-G]#?\d)_v2_rr1_sum\.wav$/.exec(f)
      return m ? nameToMidi(m[1]!) : null
    },
    keep: [24, 100],
    credit: 'Clarinet (VSCO-2 CE, Versilian Studios, CC0)',
  },
  {
    id: 'harp',
    version: 1,
    label: 'Harp',
    dir: 'Strings/Harp',
    parse: (f) => {
      const m = /^KSHarp_([A-G]#?\d)_(mf|f|mp)\.wav$/.exec(f)
      return m ? nameToMidi(m[1]!) : null
    },
    keep: [44, 100],
    credit: 'Harp (VSCO-2 CE, Versilian Studios, CC0)',
  },
]

// ---------------------------------------------------------------------------

/** fetch with retries (GitHub occasionally drops connections). */
async function fetchRetry(url: string, init?: RequestInit, attempts = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, init)
      if (res.status < 500 || i >= attempts) return res
    } catch (e) {
      if (i >= attempts) throw e
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i))
  }
}

async function listDir(dir: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(dir).replace(/%2F/g, '/')}?ref=${BRANCH}`
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetchRetry(url, { headers })
  if (!res.ok) throw new Error(`list ${dir}: ${res.status} ${await res.text()}`)
  const items = (await res.json()) as { name: string; type: string }[]
  return items.filter((i) => i.type === 'file').map((i) => i.name)
}

async function download(dir: string, file: string): Promise<string> {
  const local = join(CACHE, 'raw', dir, file)
  if (existsSync(local)) return local
  mkdirSync(dirname(local), { recursive: true })
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${encodeURI(`${dir}/${file}`).replace(/#/g, '%23')}`
  const res = await fetchRetry(url)
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`)
  writeFileSync(local, Buffer.from(await res.arrayBuffer()))
  return local
}

// --- WAV decoding (PCM 16/24/32, float32, WAVE_FORMAT_EXTENSIBLE) -----------

export function decodeWav(buf: Buffer): { sampleRate: number; mono: Float32Array } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file')
  }
  let off = 12
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null
  let data: Buffer | null = null
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    const body = buf.subarray(off + 8, off + 8 + size)
    if (id === 'fmt ') {
      let format = body.readUInt16LE(0)
      if (format === 0xfffe) format = body.readUInt16LE(24) // extensible: sub-format GUID
      fmt = {
        format,
        channels: body.readUInt16LE(2),
        rate: body.readUInt32LE(4),
        bits: body.readUInt16LE(14),
      }
    } else if (id === 'data') {
      data = body
    }
    off += 8 + size + (size % 2)
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk')
  const { format, channels, bits } = fmt
  const bytes = bits / 8
  const frames = Math.floor(data.length / (bytes * channels))
  const mono = new Float32Array(frames)
  const read = (pos: number): number => {
    if (format === 3 && bits === 32) return data.readFloatLE(pos)
    if (format !== 1) throw new Error(`unsupported WAV format ${format}/${bits}`)
    if (bits === 16) return data.readInt16LE(pos) / 32768
    if (bits === 24) return data.readIntLE(pos, 3) / 8388608
    if (bits === 32) return data.readInt32LE(pos) / 2147483648
    throw new Error(`unsupported bit depth ${bits}`)
  }
  for (let i = 0; i < frames; i++) {
    let s = 0
    for (let c = 0; c < channels; c++) s += read((i * channels + c) * bytes)
    mono[i] = s / channels
  }
  return { sampleRate: fmt.rate, mono }
}

function encodeWavFloat(samples: Float32Array, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + samples.length * 4, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(3, 20) // IEEE float
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(32, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(samples.length * 4, 40)
  return Buffer.concat([
    header,
    Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
  ])
}

// --- Processing --------------------------------------------------------------

interface Processed {
  midi: number
  cents: number
  samples: Float32Array
  sampleRate: number
  gainDb: number
}

function process1(
  labelMidi: number,
  mono: Float32Array,
  sr: number,
): Processed | { reject: string } {
  let peak = 0
  for (const s of mono) peak = Math.max(peak, Math.abs(s))
  if (peak < 1e-4) return { reject: 'silent' }
  const thr = peak * Math.pow(10, -30 / 20)
  let onset = 0
  while (onset < mono.length && Math.abs(mono[onset]!) < thr) onset++
  const start = Math.max(0, onset - Math.round(0.005 * sr))
  const len = Math.round(SEGMENT_SEC * sr)
  const seg = new Float32Array(len)
  seg.set(mono.subarray(start, Math.min(mono.length, start + len)))

  // Pitch: median over many windows of the part the listener hears (tones play for 1 s),
  // robust to vibrato.
  const detected = medianPitchMidi(seg, sr, {
    startSec: 0.15,
    endSec: 1.0,
    window: labelMidi < 55 ? 8192 : 4096,
  })
  if (detected === null) return { reject: 'no pitch detected' }
  const nearest = Math.round(detected)
  let midi: number
  if (nearest === labelMidi) midi = labelMidi
  else if (Math.abs(nearest - labelMidi) === 12)
    midi = nearest // octave-label convention differs
  else return { reject: `label ${labelMidi} but detected ${detected.toFixed(2)}` }
  const cents = (detected - midi) * 100
  if (Math.abs(cents) > MAX_CENTS) return { reject: `${cents.toFixed(1)} cents off` }

  // Loudness: RMS of the first second after onset.
  let sumSq = 0
  const rmsEnd = Math.min(len, Math.round(1.0 * sr))
  for (let i = 0; i < rmsEnd; i++) sumSq += seg[i]! * seg[i]!
  const rms = Math.sqrt(sumSq / rmsEnd)
  let gain = TARGET_RMS / rms
  let segPeak = 0
  for (const s of seg) segPeak = Math.max(segPeak, Math.abs(s))
  gain = Math.min(gain, PEAK_LIMIT / segPeak)

  const fadeIn = Math.round(0.005 * sr)
  const fadeOut = Math.round(0.08 * sr)
  for (let i = 0; i < len; i++) {
    let env = 1
    if (i < fadeIn) env = i / fadeIn
    else if (i > len - fadeOut) env = (len - i) / fadeOut
    seg[i] = seg[i]! * gain * env
  }
  return { midi, cents, samples: seg, sampleRate: sr, gainDb: 20 * Math.log10(gain) }
}

function hasFfmpeg(): boolean {
  try {
    execFileSync(FFMPEG, ['-hide_banner', '-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function encode(wavPath: string, outBase: string): void {
  const common = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    wavPath,
    '-ac',
    '1',
    '-ar',
    '44100',
  ]
  execFileSync(FFMPEG, [...common, '-c:a', 'libvorbis', '-q:a', '4', `${outBase}.ogg`])
  execFileSync(FFMPEG, [
    ...common,
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    `${outBase}.m4a`,
  ])
}

// --- Main --------------------------------------------------------------------

interface SetResult {
  def: SetDef
  notes: number[]
  detune: Record<number, number>
}

async function main() {
  const ffmpeg = hasFfmpeg()
  if (!ffmpeg) {
    console.warn(
      `⚠ ffmpeg not found (${FFMPEG}). Analysing only; no files will be written to public/.`,
    )
    console.warn('  Install it (e.g. `sudo apt install ffmpeg`) or set FFMPEG=/path/to/ffmpeg.')
  }
  const results: SetResult[] = []

  for (const def of SETS) {
    console.log(`\n▶ ${def.label} (${def.dir})`)
    const files = (await listDir(def.dir))
      .map((f) => ({ f, midi: def.parse(f) }))
      .filter((x): x is { f: string; midi: number } => x.midi !== null)
      .filter((x) => x.midi >= def.keep[0] && x.midi <= def.keep[1])
      .sort((a, b) => a.midi - b.midi)

    const outDir = join(PUBLIC, `${def.id}-v${def.version}`)
    const procDir = join(CACHE, 'processed', def.id)
    mkdirSync(procDir, { recursive: true })
    if (ffmpeg) {
      rmSync(outDir, { recursive: true, force: true })
      mkdirSync(outDir, { recursive: true })
    }

    const notes: number[] = []
    const detune: Record<number, number> = {}
    for (const { f, midi: label } of files) {
      const path = await download(def.dir, f)
      const { sampleRate, mono } = decodeWav(readFileSync(path))
      const r = process1(label, mono, sampleRate)
      if ('reject' in r) {
        console.log(`  ✗ ${f}: ${r.reject}`)
        continue
      }
      if (notes.includes(r.midi)) {
        console.log(`  ✗ ${f}: duplicate MIDI ${r.midi}`)
        continue
      }
      const wav = join(procDir, `${r.midi}.wav`)
      writeFileSync(wav, encodeWavFloat(r.samples, r.sampleRate))
      if (ffmpeg) encode(wav, join(outDir, String(r.midi)))
      notes.push(r.midi)
      detune[r.midi] = Math.round(r.cents * 10) / 10
      const shift = r.midi !== label ? ` (label ${label})` : ''
      console.log(
        `  ✓ ${f} → MIDI ${r.midi}${shift}, ${r.cents >= 0 ? '+' : ''}${r.cents.toFixed(1)} ct, gain ${r.gainDb.toFixed(1)} dB, ${r.sampleRate} Hz`,
      )
    }
    results.push({ def, notes: notes.sort((a, b) => a - b), detune })
  }

  if (!ffmpeg) {
    console.log('\nAnalysis complete. Re-run with ffmpeg available to write the sample files.')
    return
  }
  writeSampleSets(results)
  console.log(`\n✔ Wrote ${OUT_TS}`)
}

function writeSampleSets(results: SetResult[]) {
  const defs = results
    .filter((r) => r.notes.length > 0)
    .map((r) => {
      const lo = r.notes[0]! - 2
      const hi = r.notes.at(-1)! + 2
      return `  {
    id: '${r.def.id}',
    label: '${r.def.label}',
    source: {
      kind: 'samples',
      baseUrl: '/samples/${r.def.id}-v${r.def.version}',
      notes: [${r.notes.join(', ')}],
      detuneCents: ${JSON.stringify(r.detune).replace(/"/g, '')},
    },
    range: [${lo}, ${hi}],
  },`
    })
  const credits = results.map((r) => `  '${r.def.credit.replace(/'/g, "\\'")}',`)
  writeFileSync(
    OUT_TS,
    `// GENERATED by scripts/prepare-samples.ts — do not edit by hand.
import type { TimbreDef } from './instruments'

export const SAMPLE_TIMBRES: readonly TimbreDef[] = [
${defs.join('\n')}
]

export const SAMPLE_CREDITS: readonly string[] = [
${credits.join('\n')}
]
`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
