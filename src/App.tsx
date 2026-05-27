import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { INITIAL_GRAPH } from "./initialGraph";
import { runTick, TICK_MS, getNeighborIds, getFactionColor } from "./simulation";
import type { FactionEvent } from "./simulation";
import type { GraphData, LiveNode, Emotion } from "./types";

const DOUBLE_CLICK_MS     = 280;
const RIPPLE_DURATION     = 650;
const DEATH_RING_DURATION = 400;
const MAX_FACTION_EVENTS  = 5;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// Emotion overlays
const EMOTION: Record<Emotion, { core: string; glow: string }> = {
  neutral:   { core: "",        glow: ""        },
  happy:     { core: "#88ff88", glow: "#44ff44" },
  angry:     { core: "#ff5533", glow: "#ff2200" },
  sad:       { core: "#334488", glow: "#112266" },
  fearful:   { core: "#dddd55", glow: "#aaaa22" },
  disgusted: { core: "#556633", glow: "#334411" },
  surprised: { core: "#ffffff", glow: "#aaccff" },
};

function cloneGraph(g: typeof INITIAL_GRAPH): GraphData {
  return {
    nodes: g.nodes.map(n => ({ ...n })),
    links: g.links.map(l => ({ ...l })),
  };
}

function nodePhase(id: string): number {
  return id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
}

function lerpRGB(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, t: number) {
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

type DeathRing = { start: number; x: number; y: number; r: number };
type NodeStats  = Pick<LiveNode, "id"|"tier"|"energy"|"activity"|"age"|"state"|"emotion"|"emotionIntensity"|"aggression"|"sociability"|"empathy"|"faction">;

const EMOTION_EMOJI: Record<Emotion, string> = {
  neutral: "●", happy: "◕", angry: "⚡", sad: "◔",
  fearful: "◎", disgusted: "✕", surprised: "✦",
};

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Bar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}>
      <div style={{ width:`${Math.round((value/max)*100)}%`, height:"100%", background:color, borderRadius:2 }} />
    </div>
  );
}

function StatRow({ label, value, max = 100, color, display }: {
  label: string; value: number; max?: number; color: string; display?: string;
}) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4 }}>
      <span style={{ color:"#5a7aaa", fontSize:10, width:62, flexShrink:0 }}>{label}</span>
      <Bar value={value} max={max} color={color} />
      <span style={{ color:"#8ab0ff", fontSize:10, width:26, textAlign:"right" }}>
        {display ?? Math.round(value)}
      </span>
    </div>
  );
}

function NodeTooltip({ stats }: { stats: NodeStats }) {
  const tierColor = (["","#6080ee","#00ced1","#ffd700"] as const)[stats.tier];
  const facColor  = getFactionColor(stats.faction);
  const emo       = EMOTION[stats.emotion];
  const emoEmoji  = EMOTION_EMOJI[stats.emotion];

  return (
    <div style={{
      position:"fixed", top:16, right:16, zIndex:10,
      background:"rgba(8,12,28,0.93)",
      border:"1px solid rgba(60,100,200,0.25)", borderRadius:10,
      fontFamily:"ui-monospace,monospace", fontSize:12,
      padding:"10px 14px", width:218,
      backdropFilter:"blur(6px)", userSelect:"none", pointerEvents:"none",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
        <span style={{ color:"#7caeff", fontWeight:"bold", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {stats.id.length > 14 ? stats.id.slice(0,14)+"…" : stats.id}
        </span>
        <span style={{ color:tierColor, fontSize:10, fontWeight:"bold" }}>T-{stats.tier}</span>
        <span style={{ color:facColor, fontSize:10 }}>●F{stats.faction}</span>
      </div>

      <div style={{ color:"#3a5899", fontSize:10, marginBottom:5 }}>VITALS</div>
      <StatRow label="energy"   value={stats.energy}   color="#4a88ff" />
      <StatRow label="activity" value={stats.activity} color="#aa66ff" />
      <div style={{ display:"flex", gap:10, color:"#5a7aaa", fontSize:10, marginBottom:7 }}>
        <span>age: <span style={{ color:"#8ab0ff" }}>{stats.age}</span></span>
        <span style={{ color: stats.state==="excited" ? "#aaccff" : stats.state==="decaying" ? "#8844cc" : "#4a6aaa" }}>
          {stats.state==="excited" ? "⚡ excited" : stats.state==="decaying" ? "↓ decaying" : "· stable"}
        </span>
      </div>

      <div style={{ color:"#3a5899", fontSize:10, marginBottom:5 }}>EMOTION</div>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:7 }}>
        <span style={{ fontSize:13, lineHeight:1 }}>{emoEmoji}</span>
        <span style={{ color: emo.core || "#7a97c8", fontSize:11, width:60 }}>{stats.emotion}</span>
        <Bar value={stats.emotionIntensity} max={1} color={emo.glow || "#8ab0ff"} />
        <span style={{ color:"#8ab0ff", fontSize:10, width:26, textAlign:"right" }}>
          {Math.round(stats.emotionIntensity*100)}
        </span>
      </div>

      <div style={{ color:"#3a5899", fontSize:10, marginBottom:5 }}>PERSONALITY</div>
      <StatRow label="aggression"  value={stats.aggression}  max={1} color="#ff6644" display={Math.round(stats.aggression*100)+""}  />
      <StatRow label="sociability" value={stats.sociability} max={1} color="#44ff88" display={Math.round(stats.sociability*100)+""} />
      <StatRow label="empathy"     value={stats.empathy}     max={1} color="#8888ff" display={Math.round(stats.empathy*100)+""}     />
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Dot({ color, outline }: { color: string; outline?: string }) {
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: color, flexShrink: 0,
      boxShadow: outline ? `0 0 0 2px ${outline}` : "none",
    }} />
  );
}

function LRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
      {children}
      <span style={{ color: "#7a97c8", fontSize: 11 }}>{label}</span>
    </div>
  );
}

function Sym({ ch }: { ch: string }) {
  return <span style={{ width: 10, textAlign: "center", color: "#4a6aaa", fontSize: 10, flexShrink: 0 }}>{ch}</span>;
}

function LSection({ title }: { title: string }) {
  return <div style={{ color: "#3a5899", fontSize: 10, marginTop: 8, marginBottom: 4, letterSpacing: 0.8 }}>{title}</div>;
}

type FactionEntry = { id: number; count: number };
type TimedFactionEvent = FactionEvent & { ts: number };

function Legend({
  nodeCount,
  factions,
  recentEvents,
}: {
  nodeCount: number;
  factions: FactionEntry[];
  recentEvents: TimedFactionEvent[];
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{
      position: "fixed", top: 16, left: 16, zIndex: 10,
      background: "rgba(8,12,28,0.92)",
      border: "1px solid rgba(60,100,200,0.25)", borderRadius: 10,
      fontFamily: "ui-monospace,monospace", fontSize: 12,
      padding: "10px 14px", maxWidth: 260, maxHeight: "92vh", overflowY: "auto",
      backdropFilter: "blur(6px)", userSelect: "none",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", cursor:"pointer" }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontWeight:"bold", color:"#7caeff", letterSpacing:.5 }}>◉ NEURAL SIM</span>
        <span style={{ color:"#4a6aaa", fontSize:10 }}>{open ? "▼" : "▶"}</span>
      </div>

      {open && <>
        <div style={{ color:"#4a6aaa", fontSize:10, marginTop:5 }}>
          nodes alive: <span style={{ color:"#8ab0ff" }}>{nodeCount}</span>
        </div>

        <LSection title="EVOLUTION TIERS" />
        <LRow label="Tier I  — young standard"><Dot color="#6080ee" /></LRow>
        <LRow label="Tier II — evolved (age 150+)"><Dot color="#00ced1" outline="rgba(0,206,209,.55)" /></LRow>
        <LRow label="Tier III — apex, then dies (400+)"><Dot color="#ffd700" outline="rgba(255,215,0,.55)" /></LRow>

        <LSection title="EMOTIONS" />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"2px 6px" }}>
          <LRow label="happy">    <Dot color="#88ff88" /></LRow>
          <LRow label="angry">    <Dot color="#ff5533" /></LRow>
          <LRow label="sad">      <Dot color="#4466aa" /></LRow>
          <LRow label="fearful">  <Dot color="#dddd55" /></LRow>
          <LRow label="disgusted"><Dot color="#556633" /></LRow>
          <LRow label="surprised"><Dot color="#ccddff" /></LRow>
        </div>

        {/* Live factions */}
        <LSection title={`FACTIONS (${factions.length} active)`} />
        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
          {factions.map(({ id, count }) => (
            <div key={id} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Dot color={getFactionColor(id)} />
              <span style={{ color:"#5a7aaa", fontSize:10, flex:1 }}>
                F{id}{id < 4 ? "" : " ★"}
              </span>
              <span style={{ color:"#8ab0ff", fontSize:10 }}>{count}</span>
            </div>
          ))}
        </div>
        <div style={{ color:"#4a6088", fontSize:10, marginTop:4 }}>
          same = cooperate · rival = fight<br/>
          ★ = player-founded faction
        </div>

        {/* Faction events */}
        {recentEvents.length > 0 && <>
          <LSection title="FACTION EVENTS" />
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {recentEvents.slice().reverse().map((ev, i) => (
              <div key={i} style={{
                fontSize:10, padding:"2px 5px", borderRadius:4,
                background: ev.type === "created"
                  ? "rgba(60,180,80,0.12)" : "rgba(180,60,60,0.12)",
                color: ev.type === "created" ? "#66cc88" : "#cc7777",
              }}>
                {ev.type === "created"
                  ? `★ F${ev.factionId} declared independence`
                  : `✕ F${ev.factionId} dissolved`}
              </div>
            ))}
          </div>
        </>}

        <LSection title="FACTION DYNAMICS" />
        <div style={{ color:"#4a6088", fontSize:10, lineHeight:1.65 }}>
          Nodes can <span style={{ color:"#cc7755" }}>defect</span> when isolated<br/>
          or desperate → join majority.<br/>
          A powerful T3 node can<br/>
          <span style={{ color:"#66ccaa" }}>found</span> a new faction and<br/>
          rally nearby allies. Factions<br/>
          <span style={{ color:"#997799" }}>dissolve</span> when all members die.
        </div>

        <LSection title="PERSONALITY" />
        <div style={{ color:"#4a6088", fontSize:10, lineHeight:1.6 }}>
          <span style={{ color:"#ff8877" }}>aggression</span> — attacks rivals<br/>
          <span style={{ color:"#77ff99" }}>sociability</span> — helps allies<br/>
          <span style={{ color:"#aaaaff" }}>empathy</span> — mirrors neighbours<br/>
          Inherited at birth, mutates slightly.
        </div>

        <LSection title="VISUAL" />
        <LRow label="Size = energy"><Sym ch="○" /></LRow>
        <LRow label="Glow = activity + emotion"><Sym ch="✦" /></LRow>
        <LRow label="Outer ring = tier"><Sym ch="◎" /></LRow>
        <LRow label="Dashed ring = faction colour"><Sym ch="- -" /></LRow>
        <LRow label="Red link = combat · blue = flow"><Sym ch="—" /></LRow>
        <LRow label="Purple ring = death"><Sym ch="~" /></LRow>
        <LRow label="White burst = T3 supernova"><Sym ch="✦" /></LRow>

        <LSection title="CONTROLS" />
        <LRow label="Click — boost + ripple"><Sym ch="⊕" /></LRow>
        <LRow label="Double-click — remove"><Sym ch="✕" /></LRow>
      </>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const graphRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [graphData, setGraphData] = useState<GraphData>(() => cloneGraph(INITIAL_GRAPH));
  const liveData = useRef(graphData);

  const rippleRings  = useRef<Map<string, number>>(new Map());
  const deathRings   = useRef<Map<string, DeathRing>>(new Map());
  const lastClick    = useRef<Map<string, number>>(new Map());
  const hoveredId    = useRef<string | null>(null);
  const [hoveredStats, setHoveredStats] = useState<NodeStats | null>(null);

  const [recentFactionEvents, setRecentFactionEvents] = useState<TimedFactionEvent[]>([]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const zoomRef    = useRef({ k: 1, x: window.innerWidth / 2, y: window.innerHeight / 2 });

  const notifyStructural = useCallback(() => {
    const next = { nodes: liveData.current.nodes, links: liveData.current.links };
    liveData.current = next;
    setGraphData(next);
  }, []);

  // ── D3 force tuning ───────────────────────────────────────────────────────
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    fg.d3Force("charge")?.strength(-65);
    fg.d3Force("link")?.distance(28);
    fg.d3Force("attract", (alpha: number) => {
      for (const node of liveData.current.nodes as Array<LiveNode & { vx: number; vy: number }>) {
        node.vx += (cx - (node.x ?? cx)) * 0.04 * alpha;
        node.vy += (cy - (node.y ?? cy)) * 0.04 * alpha;
      }
    });
    // Tiny thermal noise — keeps nodes subtly alive without drifting past the
    // shadow canvas's 800ms hit-detection refresh window.
    fg.d3Force("thermal", () => {
      for (const node of liveData.current.nodes as Array<LiveNode & { vx: number; vy: number }>) {
        node.vx += (Math.random() - 0.5) * 0.07;
        node.vy += (Math.random() - 0.5) * 0.07;
      }
    });
  }, [graphData]);

  // ── Simulation tick ───────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const posMap = new Map(liveData.current.nodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
      const { diedIds, bornNode, factionEvents } = runTick(liveData.current);

      diedIds.forEach(id => {
        const pos = posMap.get(id);
        if (pos) deathRings.current.set(id, { start: Date.now(), ...pos, r: 5 });
        rippleRings.current.delete(id);
      });

      if (factionEvents.length > 0) {
        const timed = factionEvents.map(e => ({ ...e, ts: Date.now() }));
        setRecentFactionEvents(prev => [...prev, ...timed].slice(-MAX_FACTION_EVENTS));
      }

      if (diedIds.length || bornNode || factionEvents.length) notifyStructural();

      if (hoveredId.current) {
        const hn = liveData.current.nodes.find(n => n.id === hoveredId.current);
        if (hn) {
          const { id, tier, energy, activity, age, state, emotion, emotionIntensity, aggression, sociability, empathy, faction } = hn;
          setHoveredStats({ id, tier, energy, activity, age, state, emotion, emotionIntensity, aggression, sociability, empathy, faction });
        } else {
          setHoveredStats(null);
        }
      }
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [notifyStructural]);

  // ── Ripple helper ─────────────────────────────────────────────────────────
  const rippleFrom = useCallback((sourceId: string, strength: number, hops: number) => {
    const visited = new Set([sourceId]);
    let frontier  = [sourceId];
    let s = strength;
    for (let hop = 0; hop < hops; hop++) {
      s *= 0.55;
      if (s < 2) break;
      const next: string[] = [];
      for (const id of frontier) {
        for (const nid of getNeighborIds(id, liveData.current.links)) {
          if (visited.has(nid)) continue;
          visited.add(nid); next.push(nid);
          const n = liveData.current.nodes.find(x => x.id === nid);
          if (n) {
            n.activity = clamp(n.activity + s);
            n.energy   = clamp(n.energy   + s * 0.3);
            rippleRings.current.set(nid, Date.now() + hop * 130);
          }
        }
      }
      frontier = next;
    }
  }, []);

  // ── Click / double-click ──────────────────────────────────────────────────
  const handleNodeClick = useCallback((raw: object) => {
    const node = raw as LiveNode & { x: number; y: number };
    const now  = Date.now();
    const last = lastClick.current.get(node.id) ?? 0;
    if (now - last < DOUBLE_CLICK_MS) {
      lastClick.current.delete(node.id);
      rippleRings.current.delete(node.id);
      const { nodes, links } = liveData.current;
      const i = nodes.findIndex(n => n.id === node.id);
      if (i !== -1) nodes.splice(i, 1);
      for (let j = links.length - 1; j >= 0; j--) {
        const l   = links[j];
        const sid = typeof l.source === "object" ? (l.source as { id: string }).id : l.source;
        const tid = typeof l.target === "object" ? (l.target as { id: string }).id : l.target;
        if (sid === node.id || tid === node.id) links.splice(j, 1);
      }
      notifyStructural(); return;
    }
    lastClick.current.set(node.id, now);
    node.energy   = clamp(node.energy   + 30);
    node.activity = clamp(node.activity + 65);
    rippleRings.current.set(node.id, now);
    rippleFrom(node.id, 55, 3);
  }, [rippleFrom, notifyStructural]);

  const handleNodeHover = useCallback((raw: LiveNode | null) => {
    if (raw) {
      hoveredId.current = raw.id;
      const { id, tier, energy, activity, age, state, emotion, emotionIntensity, aggression, sociability, empathy, faction } = raw;
      setHoveredStats({ id, tier, energy, activity, age, state, emotion, emotionIntensity, aggression, sociability, empathy, faction });
    } else {
      hoveredId.current = null;
      setHoveredStats(null);
    }
  }, []);

  // ── Custom hit detection ──────────────────────────────────────────────────
  // The library's shadow-canvas hit detection is throttled to 800ms and cannot
  // track fast-moving or newly-born nodes. We replace it entirely with a direct
  // distance check against live node positions, using the zoom transform to
  // convert mouse screen coords → graph coords each frame.

  const findNodeAt = useCallback((gx: number, gy: number): LiveNode | null => {
    let hit: LiveNode | null = null;
    let best = Infinity;
    for (const n of liveData.current.nodes) {
      if (!isFinite(n.x ?? NaN) || !isFinite(n.y ?? NaN)) continue;
      let r = 3 + (n.energy / 100) * 5 + (n.activity / 100) * 3.5;
      if (n.tier === 2) r += 1.2;
      if (n.tier === 3) r += 2.5;
      r = Math.max(r, 8) + 6; // match nodePointerAreaPaint padding
      const dist = Math.hypot((n.x ?? 0) - gx, (n.y ?? 0) - gy);
      if (dist <= r && dist < best) { best = dist; hit = n; }
    }
    return hit;
  }, []);

  useEffect(() => {
    const canvas = wrapperRef.current?.querySelector<HTMLCanvasElement>('.force-graph-container canvas');
    if (!canvas) return;

    const toGraph = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const { k, x: cx, y: cy } = zoomRef.current; // cx/cy = graph-space coords at canvas centre
      return {
        gx: (e.clientX - rect.left - rect.width  / 2) / k + cx,
        gy: (e.clientY - rect.top  - rect.height / 2) / k + cy,
      };
    };

    const onMove = (e: MouseEvent) => {
      const { gx, gy } = toGraph(e);
      const hit = findNodeAt(gx, gy);
      if (hit?.id !== hoveredId.current) {
        handleNodeHover(hit);
        canvas.style.cursor = hit ? 'pointer' : 'default';
      }
    };

    const onLeave = () => {
      if (hoveredId.current) { handleNodeHover(null); canvas.style.cursor = 'default'; }
    };

    const onClick = (e: MouseEvent) => {
      const { gx, gy } = toGraph(e);
      const hit = findNodeAt(gx, gy);
      if (hit) handleNodeClick(hit as unknown as object);
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
    };
  }, [findNodeAt, handleNodeHover, handleNodeClick]);

  // ── Node canvas renderer ──────────────────────────────────────────────────
  const nodeCanvasObject = useCallback((raw: object, ctx: CanvasRenderingContext2D) => {
    const node = raw as LiveNode & { x?: number; y?: number };
    if (!isFinite(node.x ?? NaN) || !isFinite(node.y ?? NaN)) return;
    const x = node.x as number, y = node.y as number;
    const { energy, activity, state, age, id, tier, emotion, emotionIntensity, faction } = node;
    const now      = Date.now();
    const phase    = nodePhase(id);
    const isHovered = id === hoveredId.current;

    const breathe = Math.sin(now / 900 + phase) * 0.7;
    let r = 3 + (energy / 100) * 5 + (activity / 100) * 3.5 + breathe;
    if (tier === 2) r += 1.2;
    if (tier === 3) r += 2.5;
    if (emotion === "fearful"  && emotionIntensity > 0.2) r *= 1 - emotionIntensity * 0.22;
    if (emotion === "angry"    && emotionIntensity > 0.3) r += Math.sin(now / 70 + phase * 5) * emotionIntensity * 1.2;
    if (isHovered) r *= 1.25;

    const ageTint = Math.min(age / 600, 1);
    let tierCore: string, tierGlow: string;
    if (tier === 3) {
      if      (state === "excited")  { tierCore = "#fffde0"; tierGlow = "#ffd700"; }
      else if (state === "decaying") { tierCore = "#8b4000"; tierGlow = "#4a2000"; }
      else { tierCore = lerpRGB(255,215,0, 255,160,30, ageTint * 0.6); tierGlow = "#ff9900"; }
    } else if (tier === 2) {
      if      (state === "excited")  { tierCore = "#e0fffc"; tierGlow = "#00ced1"; }
      else if (state === "decaying") { tierCore = "#3a0078"; tierGlow = "#1a003a"; }
      else { tierCore = lerpRGB(0,206,209, 32,178,170, ageTint * 0.5); tierGlow = "#009090"; }
    } else {
      if      (state === "excited")  { tierCore = "#ddeeff"; tierGlow = "#8ab0ff"; }
      else if (state === "decaying") { tierCore = "#5530a0"; tierGlow = "#2a1560"; }
      else { tierCore = lerpRGB(124,158,255, 255,170,85, ageTint); tierGlow = "#2a4aaa"; }
    }

    const emo = EMOTION[emotion];
    const glowColor = (emotionIntensity > 0.25 && emo.glow) ? emo.glow : tierGlow;

    ctx.save();
    if (activity >= 10) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur  = 5 + (activity / 100) * 20 + (isHovered ? 10 : 0) + emotionIntensity * 8;
    }
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, tierCore);
    grad.addColorStop(1, tierGlow);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();

    if (emotionIntensity > 0.15 && emo.core) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.65, emotionIntensity * 0.7);
      ctx.fillStyle   = emo.core;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (emotion === "surprised" && emotionIntensity > 0.4) {
      const sR    = r + emotionIntensity * 38;
      const sAlpha = (emotionIntensity - 0.4) / 0.6 * 0.7;
      ctx.save();
      ctx.strokeStyle = `rgba(220,240,255,${sAlpha})`;
      ctx.lineWidth   = 2;
      ctx.shadowColor = "#aaccff"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x, y, sR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    if (energy >= 20) {
      const coronaR = r * 1.9 + Math.sin(now / 1400 + phase * 1.3) * 1.2;
      ctx.save();
      ctx.strokeStyle = `rgba(100,150,255,${(energy / 100) * 0.12})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(x, y, coronaR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    if (tier >= 2) {
      const evolveR = r * 2.5 + Math.sin(now / 1100 + phase * 1.4) * 1.3;
      ctx.save();
      ctx.strokeStyle = tier === 3 ? "rgba(255,215,0,0.30)" : "rgba(0,210,210,0.28)";
      ctx.lineWidth   = 1.0;
      ctx.shadowColor = tier === 3 ? "#ffd700" : "#00ced1"; ctx.shadowBlur = 5;
      ctx.beginPath(); ctx.arc(x, y, evolveR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    if (tier === 3) {
      const apexR = r * 3.8 + Math.sin(now / 1900 + phase * 0.7) * 2;
      ctx.save();
      ctx.strokeStyle = "rgba(255,200,50,0.14)"; ctx.lineWidth = 0.7;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(x, y, apexR, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }

    // Faction dashed ring — colour from the dynamic palette
    const factionColor = getFactionColor(faction);
    const factionR = r + (tier === 3 ? 14 : tier === 2 ? 9 : 5);
    ctx.save();
    ctx.strokeStyle = factionColor + "66";
    ctx.lineWidth   = faction >= 4 ? 1.2 : 0.7; // new factions slightly bolder
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.arc(x, y, factionR, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    const ringStart = rippleRings.current.get(id);
    if (ringStart !== undefined && now >= ringStart) {
      const progress = (now - ringStart) / RIPPLE_DURATION;
      if (progress < 1) {
        ctx.save();
        ctx.strokeStyle = `rgba(140,180,255,${(1 - progress) * 0.75})`;
        ctx.lineWidth   = 1.4;
        ctx.shadowColor = "#7ca8ff"; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(x, y, r + progress * 24, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else { rippleRings.current.delete(id); }
    }
  }, []);

  // ── Pointer hit area ──────────────────────────────────────────────────────
  const nodePointerAreaPaint = useCallback((raw: object, color: string, ctx: CanvasRenderingContext2D) => {
    const node = raw as LiveNode & { x?: number; y?: number };
    if (!isFinite(node.x ?? NaN) || !isFinite(node.y ?? NaN)) return;
    const { energy, activity, tier, emotion, emotionIntensity } = node;
    let r = 3 + (energy / 100) * 5 + (activity / 100) * 3.5;
    if (tier === 2) r += 1.2;
    if (tier === 3) r += 2.5;
    if (emotion === "fearful" && emotionIntensity > 0.2) r *= (1 - emotionIntensity * 0.22);
    r = Math.max(r, 8);
    ctx.beginPath();
    ctx.arc(node.x as number, node.y as number, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  // ── Death rings ───────────────────────────────────────────────────────────
  const onRenderFramePost = useCallback((ctx: CanvasRenderingContext2D) => {
    const now = Date.now();
    for (const [id, ring] of deathRings.current) {
      const progress = (now - ring.start) / DEATH_RING_DURATION;
      if (progress >= 1) { deathRings.current.delete(id); continue; }
      ctx.save();
      ctx.strokeStyle = `rgba(180,120,255,${(1 - progress) * 0.9})`;
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = "rgba(150,80,255,0.8)"; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r + progress * 40, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }, []);

  // ── Link colour ───────────────────────────────────────────────────────────
  const linkColor = useCallback((link: object) => {
    const l = link as {
      source: LiveNode | string;
      target: LiveNode | string;
      lastFlow?: number;
    };
    const src = typeof l.source === "object" ? l.source as LiveNode : null;
    const tgt = typeof l.target === "object" ? l.target as LiveNode : null;
    const sE  = src?.energy ?? 50;
    const tE  = tgt?.energy ?? 50;
    const sameFaction = src && tgt && src.faction === tgt.faction;
    const flow  = Math.abs(sE - tE) / 100;
    let alpha   = 0.10 + flow * 0.40;

    const age = Date.now() - (l.lastFlow ?? 0);
    if (age < 350) {
      const fp = 1 - age / 350;
      alpha = Math.min(1, alpha + fp * 0.45);
      if (!sameFaction) {
        return `rgba(${Math.round(200+fp*55)},${Math.round(70)},${Math.round(50)},${alpha.toFixed(2)})`;
      }
      return `rgba(${Math.round(74+(80-74)*fp)},${Math.round(180+(220-180)*fp)},${Math.round(120+(180-120)*fp)},${alpha.toFixed(2)})`;
    }
    return `rgba(74,112,204,${alpha.toFixed(2)})`;
  }, []);

  const linkWidth = useCallback((link: object) =>
    ((link as { strength?: number }).strength ?? 1.0) * 0.7, []);

  // ── Derive live faction list for legend ───────────────────────────────────
  const factions: FactionEntry[] = (() => {
    const counts = new Map<number, number>();
    for (const n of graphData.nodes) counts.set(n.faction, (counts.get(n.faction) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, count]) => ({ id, count }));
  })();

  return (
    <>
      <Legend
        nodeCount={graphData.nodes.length}
        factions={factions}
        recentEvents={recentFactionEvents}
      />
      {hoveredStats && <NodeTooltip stats={hoveredStats} />}
      <div ref={wrapperRef}>
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          backgroundColor="#0b1020"
          d3AlphaDecay={0}
          d3VelocityDecay={0.25}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          onRenderFramePost={onRenderFramePost}
          onZoom={({ k, x, y }: { k: number; x: number; y: number }) => { zoomRef.current = { k, x, y }; }}
          width={window.innerWidth}
          height={window.innerHeight}
        />
      </div>
    </>
  );
}
