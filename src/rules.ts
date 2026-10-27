import type { Puzzle, Target } from "./data";

export const TRIES = 2;
export const LAYERS = 32;
const EPOCH = Date.UTC(2026, 9, 27);

export const dayIndex = () => Math.max(0, Math.floor((Date.now() - EPOCH) / 86_400_000));
export const pad = (n: number) => String(n).padStart(3, "0");

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** The answer plus three puzzles from other groups, same kind (neurons or a vector) first, never two that read the same. */
export function choicesFor(p: Puzzle, all: Puzzle[]): Puzzle[] {
  const vec = vectorLayer(p) !== null;
  const off = (x: Puzzle) => Number((vectorLayer(x) !== null) !== vec);
  const pool = all.filter((x) => x.id !== p.id && (!p.group || x.group !== p.group));
  pool.sort((a, b) => off(a) - off(b) || hash(p.id + a.label) - hash(p.id + b.label));
  const picked = [p];
  for (const x of pool) if (picked.length < 4 && picked.every((y) => optionText(y) !== optionText(x))) picked.push(x);
  return picked.sort((a, b) => hash(p.id + "o" + a.label) - hash(p.id + "o" + b.label));
}

/** A recipe as an answer option: "L14 N8949 +1  L13 N7956 -1" with neurons grouped by layer, or "L12 whole-layer vector ×4". */
export function optionText(p: Puzzle): string {
  const vec = p.recipe.match(/^vector .* layer (\d+) x(-?[\d.]+)/);
  if (vec) return `L${vec[1]} whole-layer vector ×${vec[2]}`;
  const layers = new Map<string, string[]>();
  for (const [, l, n, dose] of p.recipe.matchAll(/L(\d+)N(\d+)([+-][\d.]+)/g)) layers.set(l, [...(layers.get(l) ?? []), `N${n} ${dose}`]);
  return [...layers].map(([l, ns]) => `L${l} ${ns.join(" ")}`).join("  ");
}

/** The dose a recipe gives one neuron ("+1", "-0.63"), or the scale of a whole-layer vector (neuron -1). */
export function doseOf(p: Puzzle, layer: number, neuron: number): string {
  if (neuron < 0) return `×${p.recipe.match(/ x(-?[\d.]+)$/)?.[1] ?? "?"}`;
  return p.recipe.match(new RegExp(`L${layer}N${neuron}([+-][\\d.]+)`))?.[1] ?? "";
}

/** A neuron's number once the puzzle is over; before that, just its first digit, so the map cannot be searched by number. */
export function neuronLabel(n: number, shown: boolean): string {
  return shown ? `N${n}` : `N${String(n)[0]}…`;
}

export function where(p: Puzzle): string {
  const vec = p.recipe.match(/^vector .* layer (\d+)/);
  if (vec) return `layer ${vec[1]} of ${LAYERS}, whole-layer vector`;
  const layers = [...new Set([...p.recipe.matchAll(/L(\d+)N/g)].map((m) => +m[1]))].sort((a, b) => a - b);
  const n = (p.recipe.match(/N\d+/g) ?? []).length;
  return `${n} neuron${n > 1 ? "s" : ""}, layer${layers.length > 1 ? "s" : ""} ${layers.join(", ")} of ${LAYERS}`;
}

/** Layer of a whole-layer vector recipe, or null for a neuron recipe. */
export function vectorLayer(p: Puzzle): number | null {
  const m = p.recipe.match(/^vector .* layer (\d+)/);
  return m ? +m[1] : null;
}

/** Where the answer sits on the map: its neurons, or for a vector the middle of its layer (neuron -1). */
export function targetsFor(p: Puzzle, mapTargets: Record<string, Target[]>, side: number): Target[] {
  const layer = vectorLayer(p);
  if (layer !== null) return [[layer, side >> 1, side >> 1, -1]];
  return mapTargets[p.id] ?? [];
}

export type Pin = { layer: number; row: number; col: number; neuron: number };
export type GeoHit = { score: number; layer: number; row: number; col: number; neuron: number; layersOff: number; cellsOff: number };

/**
 * Distance in sheet cells, one layer apart counting as 12 cells; with several neurons the nearest counts.
 * A whole-layer vector (neuron -1) has no spot on its sheet, so only the layer counts.
 */
export function geoScore(pin: Pin, targets: Target[]): GeoHit {
  let best: GeoHit | null = null;
  let bestD = Infinity;
  for (const [layer, row, col, neuron] of targets) {
    const sheetOff = neuron < 0 ? 0 : Math.hypot(pin.row - row, pin.col - col);
    const d = Math.hypot((pin.layer - layer) * 12, sheetOff);
    if (d < bestD) {
      bestD = d;
      best = { layer, row, col, neuron, score: 0, layersOff: Math.abs(pin.layer - layer), cellsOff: Math.round(sheetOff) };
    }
  }
  return { ...best!, score: Math.round(5000 * Math.exp(-bestD / 24)) };
}

/** 5000 for naming it on the first try, 2500 on the second. */
export const labelPoints = (won: boolean, misses: number) => (won ? (misses ? 2500 : 5000) : 0);
