import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import * as THREE from "three";
import type { GeoData, Puzzle } from "./data";
import { doseOf, targetsFor, type GeoHit, type Pin } from "./rules";

// Layers run along x, each a vertical sheet of side x side neurons placed by what they write (neuron-explorer's layout).
const GAP = 1.9;
const SHEET = 4.2;
const IDLE = new THREE.Color(0.11, 0.14, 0.16);
const HOT = new THREE.Color(1.0, 0.71, 0.28);
const HOME_DIR = new THREE.Vector3(0.62, 0.4, 1).normalize();
const FACE_DIR = new THREE.Vector3(1, 0.06, 0.03).normalize();

/** Camera distance that keeps all 32 layers in view. A narrow map (a phone held upright) has to stand further back. */
function homeDistance() {
  const w = Math.min(920, innerWidth) - 32;
  const h = innerWidth <= 640 ? innerHeight * 0.7 : Math.min(innerHeight * 0.72, 600);
  return 78 * Math.min(2.6, Math.max(1, 1.47 / (w / h)));
}
/** looking at a marked spot from the side, so the sheets in front of it do not cover it */
const SPOT_DIR = new THREE.Vector3(0.5, 0.35, 1).normalize();
const COLOR = { answer: "#3fcf6e", wrong: "#ff6166", hover: "#7fd4ff" };
const ORIGIN = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]);
const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

type Cell = { layer: number; row: number; col: number };
type Hover = Pin & { up: string; down: string };
type Fly = { target: THREE.Vector3; offset: THREE.Vector3; id: number };
type Controls = { target: THREE.Vector3; update(): void };

/** Something the map points out: the answer once the puzzle is over, or the neurons behind a wrong guess. */
export type Mark = { key: string; kind: "answer" | "wrong"; title: string; puzzle: Puzzle };
/** One marked point, drawn as a DOM marker that follows it on screen. */
type Spot = { key: string; kind: Mark["kind"] | "pin"; pos: THREE.Vector3; title?: string; text: string };

const cellPos = (side: number, c: Cell) =>
  new THREE.Vector3(c.layer * GAP, (c.row / (side - 1)) * SHEET, (c.col / (side - 1) - 0.5) * SHEET);
const sheetCenter = (layer: number) => new THREE.Vector3(layer * GAP, SHEET / 2, 0);

const Sheet = memo(function Sheet({ geo, layer, dim, tint }: { geo: GeoData; layer: number; dim: boolean; tint?: string }) {
  const points = useMemo(() => {
    const { side } = geo;
    const n = side * side;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = geo.kl[layer * n + i] / 255;
      cellPos(side, { layer, row: Math.floor(i / side), col: i % side }).toArray(pos, i * 3);
      c.copy(IDLE).lerp(HOT, t * t).toArray(col, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [geo, layer]);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(SHEET, SHEET)), []);
  const center = sheetCenter(layer);
  // a tint marks a whole-layer vector
  return (
    <group>
      {/* normal blending: additive turned 9,216 dim points into a white slab when zoomed out */}
      <points geometry={points}>
        <pointsMaterial size={0.045} vertexColors transparent opacity={dim ? 0.035 : 1} depthWrite={false} />
      </points>
      <mesh position={center} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[SHEET, SHEET]} />
        <meshBasicMaterial color={tint ?? "#9ec3d1"} transparent opacity={tint ? 0.12 : dim ? 0.008 : 0.04} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} position={center} rotation={[0, Math.PI / 2, 0]}>
        <lineBasicMaterial color={tint ?? "#4a5c66"} transparent opacity={dim && !tint ? 0.15 : 1} />
      </lineSegments>
    </group>
  );
});

function Dot({ at, color }: { at: THREE.Vector3; color: string }) {
  return (
    <points geometry={ORIGIN} position={at} renderOrder={10}>
      <pointsMaterial color={color} size={9} sizeAttenuation={false} depthTest={false} transparent />
    </points>
  );
}

/** Hover and click on the sheets: intersect the view ray with each layer's plane, nearest sheet wins. */
function Picker({ geo, focus, onHover, onPick }: { geo: GeoData; focus: number | null; onHover: (h: Hover | null, x: number, y: number) => void; onPick: (h: Hover) => void }) {
  const { camera, gl } = useThree();
  const state = useRef({ focus, onHover, onPick });
  state.current = { focus, onHover, onPick };

  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const { side, layers } = geo;
    const n = side * side;
    const pick = (e: PointerEvent): Hover | null => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const { origin: o, direction: d } = ray.ray;
      if (Math.abs(d.x) < 1e-6) return null;
      let best: { t: number; layer: number; y: number; z: number } | null = null;
      for (let layer = 0; layer < layers; layer++) {
        if (state.current.focus !== null && layer !== state.current.focus) continue;
        const t = (layer * GAP - o.x) / d.x;
        if (t <= 0 || (best && t >= best.t)) continue;
        const y = o.y + d.y * t;
        const z = o.z + d.z * t;
        if (y < -0.05 || y > SHEET + 0.05 || Math.abs(z) > SHEET / 2 + 0.05) continue;
        best = { t, layer, y, z };
      }
      if (!best) return null;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      const row = Math.round(clamp(best.y / SHEET) * (side - 1));
      const col = Math.round(clamp(best.z / SHEET + 0.5) * (side - 1));
      const i = best.layer * n + row * side + col;
      return { layer: best.layer, row, col, neuron: geo.nid[i], up: geo.vocab[geo.up[i]] || "—", down: geo.vocab[geo.down[i]] || "—" };
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      state.current.onHover(null, 0, 0);
    };
    const onMove = (e: PointerEvent) => {
      if (down) return;
      const r = el.getBoundingClientRect();
      state.current.onHover(pick(e), e.clientX - r.left, e.clientY - r.top);
    };
    const onUp = (e: PointerEvent) => {
      const moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
      down = null;
      const h = moved ? null : pick(e);
      if (h) state.current.onPick(h);
    };
    const onLeave = () => state.current.onHover(null, 0, 0);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [camera, gl, geo]);
  return null;
}

/** Eases the camera and orbit target to a new view whenever `fly` changes. */
function Rig({ fly }: { fly: Fly }) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const anim = useRef<{ t0: number; fromT: THREE.Vector3; fromP: THREE.Vector3 } | null>(null);
  useEffect(() => {
    if (controls) anim.current = { t0: performance.now(), fromT: controls.target.clone(), fromP: camera.position.clone() };
  }, [fly, controls, camera]);
  useFrame(() => {
    const a = anim.current;
    if (!a || !controls) return;
    const k = Math.min(1, (performance.now() - a.t0) / 900);
    const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    controls.target.lerpVectors(a.fromT, fly.target, e);
    camera.position.lerpVectors(a.fromP, fly.target.clone().add(fly.offset), e);
    controls.update();
    if (k >= 1) anim.current = null;
  });
  return null;
}

/** Arrow keys pan the view while held; the step scales with how far the camera is from the map. */
function Pan({ held }: { held: RefObject<Set<string>> }) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const right = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const keys = held.current;
    const x = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
    const y = (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0);
    if (!controls || (x === 0 && y === 0)) return;
    const step = camera.position.distanceTo(controls.target) * 0.007;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const move = right.multiplyScalar(x * step).add(up.multiplyScalar(y * step));
    controls.target.add(move);
    camera.position.add(move);
    controls.update();
  });
  return null;
}

/** Moves the layer-name buttons (plain DOM over the canvas) to their sheets every frame. */
function LabelProjector({ labels, focus }: { labels: RefObject<(HTMLButtonElement | null)[]>; focus: number | null }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const crowded = size.width < 480;
  useFrame(() => {
    labels.current.forEach((b, l) => {
      if (!b) return;
      v.set(l * GAP, SHEET + 0.3, -SHEET / 2).project(camera);
      // facing one layer, the others' names would pile up in a corner; on a narrow map every fourth name is enough
      const shown = focus === null ? !crowded || l % 4 === 0 : focus === l;
      const show = shown && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      b.style.display = show ? "" : "none";
      if (show) b.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
    });
  });
  return null;
}

/**
 * Keeps the DOM markers over the canvas on their points every frame. Tags point away from the middle of the group,
 * so two markers close together put their tags on opposite sides, unless that side has no room for the tag.
 */
function MarkProjector({ spots, els }: { spots: Spot[]; els: RefObject<Map<string, HTMLElement>> }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const placed: { el: HTMLElement; x: number; tw: number }[] = [];
    for (const s of spots) {
      const el = els.current.get(s.key);
      if (!el) continue;
      const tw = (el.lastElementChild as HTMLElement | null)?.offsetWidth ?? 0; // read before this frame's writes
      v.copy(s.pos).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      el.style.display = v.z < 1 ? "" : "none";
      el.style.transform = `translate(${x}px, ${((1 - v.y) / 2) * size.height}px)`;
      if (v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) placed.push({ el, x, tw });
    }
    const mid = placed.reduce((a, p) => a + p.x, 0) / (placed.length || 1);
    for (const { el, x, tw } of placed) {
      const fitsLeft = x - 10 - tw >= 0;
      const fitsRight = x + 10 + tw <= size.width;
      const left = x < mid - 1 ? fitsLeft || !fitsRight : !fitsRight && (fitsLeft || x > size.width / 2);
      el.classList.toggle("left", left);
    }
  });
  return null;
}

/** Line from the pin to the answer. */
function Trail({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
  return <Line points={[from, to]} color={COLOR.answer} lineWidth={1.5} depthTest={false} transparent />;
}

type Props = {
  geo: GeoData;
  /** changes with every puzzle: resets the view */
  round: number;
  /** clicks drop a pin; off, the map is only for looking */
  pinnable: boolean;
  /** neuron numbers show only once the puzzle has been named, so the map cannot be searched by option */
  numbers: boolean;
  pin: Pin | null;
  onPin: (p: Pin) => void;
  /** pin can no longer move */
  locked: boolean;
  /** the pin's score against the nearest answer neuron; withheld until the puzzle is over */
  hit: GeoHit | null;
  /** wrong guesses and, once the puzzle is over, the answer; the camera flies to the newest */
  marks: Mark[];
  onLock: () => void;
};

export function NeuronMap({ geo, round, pinnable, numbers, pin, onPin, locked, hit, marks, onLock }: Props) {
  const { side } = geo;
  const [focus, setFocus] = useState<number | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [pinInfo, setPinInfo] = useState<Hover | null>(null);
  const [visible, setVisible] = useState(false);
  // layers left lit after the answer is shown; the rest fade like when facing one layer
  const [lit, setLit] = useState<Set<number> | null>(null);
  const [want, setWant] = useState<{ pts: THREE.Vector3[]; lit: Set<number> | null } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLButtonElement | null)[]>([]);
  const held = useRef(new Set<string>());
  const markEls = useRef(new Map<string, HTMLElement>());
  const seen = useRef(new Set<string>());
  const center = useMemo(() => new THREE.Vector3(((geo.layers - 1) * GAP) / 2, SHEET / 2, 0), [geo]);
  const dist = useMemo(homeDistance, []);
  const home = useMemo(() => ({ target: center, offset: HOME_DIR.clone().multiplyScalar(dist) }), [center, dist]);
  const [fly, setFly] = useState<Fly>({ ...home, id: 0 });
  const flyTo = (target: THREE.Vector3, offset: THREE.Vector3) => setFly((f) => ({ target, offset, id: f.id + 1 }));

  const focusLayer = (l: number | null) => {
    setFocus(l);
    setLit(null);
    if (l === null) flyTo(home.target, home.offset);
    else flyTo(sheetCenter(l), FACE_DIR.clone().multiplyScalar(8.5));
  };
  /** Frames a few points (the answer and the pin, say) from the side; `layers` also fades every other layer. */
  const frame = (pts: THREE.Vector3[], layers?: Set<number> | null) => {
    const box = new THREE.Box3().setFromPoints(pts);
    setFocus(null);
    if (layers !== undefined) setLit(layers);
    const dist = Math.max(12, box.getSize(new THREE.Vector3()).length() * 2.4);
    // aim below the points so they sit above the controls at the bottom
    flyTo(box.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, -0.12 * dist, 0)), SPOT_DIR.clone().multiplyScalar(dist));
  };

  const spots = useMemo(() => {
    const out: Spot[] = [];
    for (const m of marks)
      targetsFor(m.puzzle, geo.targets, side).forEach(([layer, row, col, neuron], i) => {
        const up = geo.vocab[geo.up[layer * side * side + row * side + col]] || "—";
        const dose = doseOf(m.puzzle, layer, neuron);
        out.push({
          key: `${m.key} ${i}`, kind: m.kind, pos: cellPos(side, { layer, row, col }), title: i ? undefined : m.title,
          text: neuron < 0 ? `L${layer} whole-layer vector ${dose}` : `L${layer}${numbers ? ` N${neuron}` : ""} ${dose}  ↑ ${up}`,
        });
      });
    if (pin) out.push({ key: `pin ${pin.layer} ${pin.row} ${pin.col}`, kind: "pin", pos: cellPos(side, pin), text: `pin L${pin.layer}${numbers ? ` N${pin.neuron}` : ""}` });
    return out;
  }, [marks, pin, geo, side, numbers]);

  const tints = useMemo(() => {
    const t = new Map<number, string>();
    for (const m of marks) for (const [layer, , , neuron] of targetsFor(m.puzzle, geo.targets, side)) if (neuron < 0) t.set(layer, COLOR[m.kind]);
    return t;
  }, [marks, geo, side]);

  useEffect(() => {
    seen.current.clear();
    setFocus(null);
    setHover(null);
    setPinInfo(null);
    setLit(null);
    setWant(null);
    setFly((f) => ({ ...home, id: f.id + 1 }));
  }, [round, home]);

  // A new mark gets the camera: the answer framed with the pin, a wrong guess on its own.
  useEffect(() => {
    const fresh = marks.filter((m) => !seen.current.has(m.key));
    fresh.forEach((m) => seen.current.add(m.key));
    const m = fresh.find((x) => x.kind === "answer") ?? fresh[fresh.length - 1];
    if (!m) return;
    const cells: Cell[] = targetsFor(m.puzzle, geo.targets, side).map(([layer, row, col]) => ({ layer, row, col }));
    if (!cells.length) return;
    // the answer ends the puzzle, so nothing else needs to stay pickable: fade all but its layers and the pin's
    if (m.kind === "answer" && pin) cells.push(pin);
    setWant({ pts: cells.map((c) => cellPos(side, c)), lit: m.kind === "answer" ? new Set(cells.map((c) => c.layer)) : null });
  }, [marks, pin, geo, side]);

  // The flight waits until the map is on screen, so a guess made up in the terminal still plays out in view.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!want || !visible) return;
    frame(want.pts, want.lit);
    setWant(null);
  }, [want, visible]);

  const onHover = (h: Hover | null, x: number, y: number) => {
    setHover((prev) => (h && prev && prev.layer === h.layer && prev.row === h.row && prev.col === h.col ? prev : h));
    if (!h) return;
    const flip = x > (wrap.current?.clientWidth ?? 0) - 230;
    if (tip.current) tip.current.style.transform = `translate(${x}px, ${y}px) translate(${flip ? "calc(-100% - 14px)" : "14px"}, 16px)`;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (ARROWS.has(e.key)) held.current.add(e.key);
    else if (e.key === "[" || e.key === "]") {
      const step = e.key === "]" ? 1 : -1;
      focusLayer(focus === null ? (step > 0 ? 0 : geo.layers - 1) : Math.min(geo.layers - 1, Math.max(0, focus + step)));
    } else if (e.key === "Escape") focusLayer(null);
    else if (e.key === "Enter") onLock();
    else return;
    e.preventDefault();
  };

  const pinPos = useMemo(() => (pin ? cellPos(side, pin) : null), [pin, side]);
  const hitPos = useMemo(() => (hit ? cellPos(side, hit) : null), [hit, side]);
  return (
    <div ref={wrap} className="mapwrap" tabIndex={0} onKeyDown={onKeyDown} onKeyUp={(e) => held.current.delete(e.key)} onBlur={() => held.current.clear()} aria-label="Map of Qwen3.5-4B, 32 layers of 9,216 neurons">
      <Canvas dpr={[1, 2]} camera={{ fov: 32, near: 0.05, far: 1000, position: home.target.clone().add(home.offset) }}>
        <color attach="background" args={["#000000"]} />
        {Array.from({ length: geo.layers }, (_, l) => (
          <Sheet key={l} geo={geo} layer={l} dim={(focus !== null && focus !== l) || (lit !== null && !lit.has(l))} tint={tints.get(l)} />
        ))}
        <LabelProjector labels={labels} focus={focus} />
        <MarkProjector spots={spots} els={markEls} />
        {hover && <Dot at={cellPos(side, hover)} color={COLOR.hover} />}
        {pinPos && hitPos && <Trail from={pinPos} to={hitPos} />}
        <Picker
          geo={geo}
          focus={focus}
          onHover={onHover}
          onPick={(h) => {
            if (locked || !pinnable) return;
            setPinInfo(h);
            onPin({ layer: h.layer, row: h.row, col: h.col, neuron: h.neuron });
          }}
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} zoomSpeed={0.7} minDistance={1.2} maxDistance={220} />
        <Rig fly={fly} />
        <Pan held={held} />
      </Canvas>
      <div className="labels">
        {Array.from({ length: geo.layers }, (_, l) => (
          <button key={l} ref={(b) => { labels.current[l] = b; }} type="button" className={`lbl${focus === l ? " on" : ""}`} onClick={() => focusLayer(l)}>
            L{l}
          </button>
        ))}
        {spots.map((s) => (
          <div
            key={s.key}
            ref={(el) => {
              if (el) markEls.current.set(s.key, el);
              else markEls.current.delete(s.key);
            }}
            className={`mark ${s.kind}${s.title ? " titled" : ""}`}
            style={{ display: "none" }}
          >
            <i className="ring" />
            <i className="dot" />
            <button type="button" className="tag" onClick={() => frame([s.pos])}>
              {s.title && <b>{s.title}</b>}
              {s.text}
            </button>
          </div>
        ))}
      </div>
      <div ref={tip} className="tip" hidden={!hover}>
        {hover && (
          <>
            <b>{numbers ? `L${hover.layer} · N${hover.neuron}` : `L${hover.layer}`}</b>
            {`\npushes up    ${hover.up}\npushes down  ${hover.down}`}
          </>
        )}
      </div>
      <div className="hud bottom">
        <span className="grow">
          {hit ? (
            `map ${hit.score} / 5000`
          ) : locked && pin ? (
            `pin locked on L${pin.layer}${numbers ? ` N${pin.neuron}` : ""} · pick the neurons above to see where they really are`
          ) : pinInfo ? (
            `pin: L${pinInfo.layer}${numbers ? ` · N${pinInfo.neuron}` : ""}  (${pinInfo.up})`
          ) : (
            <span className="dim hint">hover: what a neuron pushes{pinnable ? " · click: pin" : ""} · drag: orbit · scroll: zoom · arrows: move · [ ]: layers</span>
          )}
        </span>
        <button type="button" onClick={() => focusLayer(null)}>all layers</button>
        {pinnable && !locked && (
          <button type="button" className="primary" disabled={!pin} onClick={onLock}>lock in</button>
        )}
      </div>
    </div>
  );
}
