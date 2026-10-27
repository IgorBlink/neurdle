export type Puzzle = {
  id: string;
  label: string;
  note: string;
  /** puzzles of one group never appear as each other's wrong options */
  group: string;
  recipe: string;
  q: string;
  a: string;
  hintQ: string;
  hint: string;
};
export type PuzzleData = { base: Record<string, string>; puzzles: Puzzle[] };

/** [layer, row, col, neuron]: a neuron's cell on its layer's sheet */
export type Target = [number, number, number, number];

/** neuron-explorer's map of Qwen3.5-4B: per layer a side x side sheet, neurons placed by what they write. */
export type GeoData = {
  side: number;
  layers: number;
  vocab: string[];
  targets: Record<string, Target[]>;
  /** everything below is indexed by cell: layer * side^2 + row * side + col */
  kl: Uint8Array;
  nid: Uint16Array;
  up: Uint16Array | Uint32Array;
  down: Uint16Array | Uint32Array;
};

const url = (file: string) => new URL(`data/${file}`, document.baseURI).href;

async function fetchOk(file: string) {
  const res = await fetch(url(file));
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res;
}

export async function loadPuzzles(): Promise<PuzzleData> {
  return (await fetchOk("puzzles.json")).json();
}

/** base64 of a little-endian typed array; the artifact host serves no binary data files */
function decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

let geo: Promise<GeoData> | null = null;
export function loadGeo(): Promise<GeoData> {
  geo ??= (async () => {
    const raw = await (await fetchOk("geo.json")).json();
    const Tokens = raw.wide ? Uint32Array : Uint16Array;
    return {
      ...raw,
      kl: new Uint8Array(decode(raw.kl)),
      nid: new Uint16Array(decode(raw.nid)),
      up: new Tokens(decode(raw.up)),
      down: new Tokens(decode(raw.down)),
    };
  })();
  return geo;
}
