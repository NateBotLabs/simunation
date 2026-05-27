import type { GraphData, LiveNode, LiveLink, Emotion } from "./types";

export const TICK_MS = 600;

const DECAY_RATE          = 0.12;
const DIFFUSION           = 0.12;
const ACTIVITY_FADE       = 0.25;
const BREATH_AMPLITUDE    = 2.0;
const EXCITED_THRESHOLD   = 40;
const DECAY_THRESHOLD     = 25;
const DEATH_ENERGY        = 10;
const DEATH_MAX_NEIGHBORS = 1;
const BIRTH_ENERGY        = 58;
const BIRTH_CONNECTIONS   = 2;
const HEARTBEAT_INTERVAL  = 15;
const EVOLVE_TIER2        = 150;
const EVOLVE_TIER3        = 400;
const MIN_NODES           = 8;

const T3_DEATH_BASE = 0.012;
const T3_DEATH_RATE = 0.0004;
const T3_DEATH_MAX  = 0.10;

// Faction dynamics
const DEFECT_PROB  = 0.008; // 0.8% per node per tick
const SPLIT_PROB   = 0.004; // 0.4% per eligible T3 node per tick

let tickCount      = 0;
let _nextFactionId = 4; // 0–3 are the four starter factions

export type FactionEvent = {
  type: "created" | "destroyed";
  factionId: number;
  byNodeId?: string;
};

// ── Colour palette (shared with App.tsx) ─────────────────────────────────────

const BASE_COLORS = ["#4488ff", "#ff6633", "#44cc66", "#cc44ff"];

export function getFactionColor(id: number): string {
  if (id < BASE_COLORS.length) return BASE_COLORS[id];
  // Spread new faction hues around the wheel, starting near teal
  const hue = ((id - 4) * 53 + 170) % 360;
  return `hsl(${hue}, 80%, 62%)`;
}

// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

const getId = (ref: unknown): string =>
  ref !== null && typeof ref === "object" ? (ref as { id: string }).id : String(ref);

function activeFactionPool(graph: GraphData): number[] {
  return [...new Set(graph.nodes.map(n => n.faction))];
}

// ── Personality helpers ───────────────────────────────────────────────────────

function randPersonality(factionPool: number[] = [0, 1, 2, 3]) {
  return {
    aggression:  Math.random(),
    sociability: Math.random(),
    empathy:     Math.random(),
    faction: factionPool[Math.floor(Math.random() * factionPool.length)],
  };
}

function inheritPersonality(parent: LiveNode, factionPool: number[]) {
  const mut = (v: number) => Math.max(0, Math.min(1, v + (Math.random() - 0.5) * 0.35));
  const faction =
    Math.random() < 0.08
      ? factionPool[Math.floor(Math.random() * factionPool.length)]
      : parent.faction;
  return {
    aggression:  mut(parent.aggression),
    sociability: mut(parent.sociability),
    empathy:     mut(parent.empathy),
    faction,
  };
}

// ── Emotion update ────────────────────────────────────────────────────────────

function computeEmotion(
  node: LiveNode,
  neighbors: LiveNode[],
  wasAttacked: boolean,
  wasHelped: boolean,
): { emotion: Emotion; emotionIntensity: number } {
  let emotion   = node.emotion;
  let intensity = node.emotionIntensity * 0.82;

  if (wasAttacked) {
    emotion   = node.aggression > 0.55 ? "angry" : "fearful";
    intensity = Math.min(1, intensity + 0.55);
    return { emotion, emotionIntensity: intensity };
  }
  if (wasHelped) {
    emotion   = "happy";
    intensity = Math.min(1, intensity + 0.45);
    return { emotion, emotionIntensity: intensity };
  }

  if (node.energy < 20) {
    emotion   = node.aggression > 0.6 ? "angry" : "sad";
    intensity = Math.min(1, Math.max(intensity, (20 - node.energy) / 20 * 0.75));
  } else if (node.energy > 72 && node.activity > 45) {
    if (emotion === "neutral" || emotion === "happy") {
      emotion   = "happy";
      intensity = Math.min(1, intensity + 0.08);
    }
  }

  if (node.tier === 3 && node.age > EVOLVE_TIER3 + 80) {
    if (emotion === "neutral" || emotion === "happy") {
      emotion   = "sad";
      intensity = Math.min(1, intensity + 0.12);
    }
  }

  if (node.empathy > 0.35 && neighbors.length > 0) {
    const strongest = neighbors.reduce(
      (best, n) => n.emotionIntensity > best.emotionIntensity ? n : best,
      neighbors[0],
    );
    if (strongest.emotionIntensity > 0.45 && Math.random() < node.empathy * 0.25) {
      emotion   = strongest.emotion;
      intensity = Math.min(1, intensity + strongest.emotionIntensity * node.empathy * 0.4);
    }
  }

  if (node.aggression > 0.7 && neighbors.length > 2) {
    const enemyRatio = neighbors.filter(n => n.faction !== node.faction).length / neighbors.length;
    if (enemyRatio > 0.7 && Math.random() < 0.08) {
      emotion   = "disgusted";
      intensity = Math.min(1, intensity + 0.3);
    }
  }

  if (intensity < 0.08) emotion = "neutral";
  return { emotion, emotionIntensity: intensity };
}

// ── Public helpers ────────────────────────────────────────────────────────────

export function getNeighborIds(nodeId: string, links: GraphData["links"]): string[] {
  const result: string[] = [];
  for (const l of links) {
    const s = getId(l.source);
    const t = getId(l.target);
    if (s === nodeId) result.push(t);
    else if (t === nodeId) result.push(s);
  }
  return result;
}

// ── Main tick ─────────────────────────────────────────────────────────────────

export function runTick(graph: GraphData): {
  diedIds: string[];
  bornNode: LiveNode | null;
  bornLink: LiveLink | null;
  factionEvents: FactionEvent[];
} {
  tickCount++;
  const nodeMap       = new Map(graph.nodes.map(n => [n.id, n]));
  const diedIds: string[]       = [];
  let bornNode: LiveNode | null = null;
  let bornLink: LiveLink | null = null;
  const factionEvents: FactionEvent[] = [];

  // Snapshot which factions exist before this tick (for destruction detection)
  const factionsAtStart = new Set(graph.nodes.map(n => n.faction));

  // --- Heartbeat ---
  if (tickCount >= HEARTBEAT_INTERVAL) {
    tickCount = 0;
    const sorted = [...graph.nodes].sort((a, b) => b.energy - a.energy);
    for (const n of sorted.slice(0, Math.min(3, sorted.length))) {
      n.energy   = clamp(n.energy   + 10);
      n.activity = clamp(n.activity + 35);
    }
  }

  // --- Random spark ---
  if (Math.random() < 0.10 && graph.nodes.length > 0) {
    const pick = graph.nodes[Math.floor(Math.random() * graph.nodes.length)];
    pick.energy   = clamp(pick.energy   + 6 + Math.random() * 8);
    pick.activity = clamp(pick.activity + 8 + Math.random() * 8);
  }

  // --- Link strength memory ---
  for (const link of graph.links) {
    const s = nodeMap.get(getId(link.source));
    const t = nodeMap.get(getId(link.target));
    if (!s || !t) continue;
    const flow = Math.abs(s.energy - t.energy) / 100;
    if (flow > 0.25) link.strength = Math.min(2.5, link.strength + 0.02);
    else             link.strength = Math.max(0.3,  link.strength - 0.005);
    if (flow > 0.3)  link.lastFlow = Date.now();
  }

  // --- Energy physics ---
  for (const node of graph.nodes) {
    const neighborIds = getNeighborIds(node.id, graph.links);
    const neighbors   = neighborIds.map(id => nodeMap.get(id)).filter(Boolean) as LiveNode[];

    let neighborInfluence = 0;
    if (neighbors.length > 0) {
      const avg = neighbors.reduce((s, n) => s + n.energy, 0) / neighbors.length;
      neighborInfluence = (avg - node.energy) * DIFFUSION;
    }

    const crowdingPenalty = Math.max(0, neighbors.length - 4) * 0.5;
    const breath          = (Math.random() - 0.5) * 2 * BREATH_AMPLITUDE;

    node.tier = node.age >= EVOLVE_TIER3 ? 3 : node.age >= EVOLVE_TIER2 ? 2 : 1;
    const tierDecay = node.tier === 3 ? 0.05 : node.tier === 2 ? 0.08 : DECAY_RATE;

    node.energy   = clamp(node.energy - tierDecay + neighborInfluence + breath - crowdingPenalty);
    node.activity = clamp(node.activity * (1 - ACTIVITY_FADE));

    if (neighbors.length > 0) {
      node.activity = clamp(
        node.activity + neighbors.reduce((s, n) => s + n.activity, 0) / neighbors.length * 0.15,
      );
    }

    node.state = node.activity > EXCITED_THRESHOLD ? "excited"
               : node.energy  < DECAY_THRESHOLD    ? "decaying"
               : "stable";

    node.age++;
  }

  // --- Combat & cooperation ---
  const attackedSet = new Set<string>();
  const helpedSet   = new Set<string>();

  for (const node of graph.nodes) {
    const neighborIds = getNeighborIds(node.id, graph.links);
    const neighbors   = neighborIds.map(id => nodeMap.get(id)).filter(Boolean) as LiveNode[];
    if (neighbors.length === 0) continue;

    const aggrMod = node.emotion === "angry"   ? 1.5
                  : node.emotion === "fearful"  ? 0.25
                  : node.emotion === "happy"    ? 0.7
                  : 1.0;
    const socMod  = node.emotion === "happy"    ? 1.5
                  : node.emotion === "sad"       ? 0.4
                  : node.emotion === "disgusted" ? 0.15
                  : 1.0;

    if (node.aggression > 0.35 && Math.random() < node.aggression * 0.12 * aggrMod) {
      const enemies = neighbors.filter(n => n.faction !== node.faction);
      if (enemies.length > 0) {
        const target = enemies[Math.floor(Math.random() * enemies.length)];
        const power  = node.aggression * (node.energy / 100) * 7;
        target.energy   = clamp(target.energy   - power);
        target.activity = clamp(target.activity + power * 0.8);
        node.energy     = clamp(node.energy     + power * 0.25);
        node.activity   = clamp(node.activity   + power);
        attackedSet.add(target.id);
        for (const link of graph.links) {
          const sid = getId(link.source), tid = getId(link.target);
          if ((sid === node.id && tid === target.id) || (tid === node.id && sid === target.id)) {
            link.lastFlow = Date.now();
          }
        }
      }
    }

    if (node.sociability > 0.35 && node.energy > 40 && Math.random() < node.sociability * 0.14 * socMod) {
      const allies = neighbors.filter(n => n.faction === node.faction && n.energy < node.energy - 10);
      if (allies.length > 0) {
        const target = allies[Math.floor(Math.random() * allies.length)];
        const share  = node.sociability * 4 * socMod;
        node.energy     = clamp(node.energy     - share * 0.5);
        target.energy   = clamp(target.energy   + share);
        target.activity = clamp(target.activity + share * 0.4);
        helpedSet.add(target.id);
      }
    }
  }

  // --- Emotion update ---
  for (const node of graph.nodes) {
    const neighborIds = getNeighborIds(node.id, graph.links);
    const neighbors   = neighborIds.map(id => nodeMap.get(id)).filter(Boolean) as LiveNode[];
    const result = computeEmotion(node, neighbors, attackedSet.has(node.id), helpedSet.has(node.id));
    node.emotion          = result.emotion;
    node.emotionIntensity = result.emotionIntensity;
  }

  // --- Faction dynamics ────────────────────────────────────────────────────

  // Defection: isolated or desperate nodes switch to the dominant neighbour faction
  for (const node of graph.nodes) {
    if (Math.random() > DEFECT_PROB) continue;
    const neighborIds = getNeighborIds(node.id, graph.links);
    const neighbors   = neighborIds.map(id => nodeMap.get(id)).filter(Boolean) as LiveNode[];
    if (neighbors.length === 0) continue;

    const sameCount  = neighbors.filter(n => n.faction === node.faction).length;
    const enemyRatio = (neighbors.length - sameCount) / neighbors.length;
    const desperate  = node.energy < 22;
    const surrounded = enemyRatio >= 0.80 && neighbors.length >= 3;
    const isolated   = sameCount === 0 && neighbors.length >= 2;

    if (desperate || surrounded || isolated) {
      // Tally neighbour factions; pick the plurality
      const tally = new Map<number, number>();
      for (const n of neighbors) {
        if (n.faction !== node.faction)
          tally.set(n.faction, (tally.get(n.faction) ?? 0) + 1);
      }
      let target = node.faction;
      let best   = 0;
      for (const [f, c] of tally) if (c > best) { target = f; best = c; }

      if (target !== node.faction) {
        node.faction          = target;
        node.emotion          = "surprised";
        node.emotionIntensity = Math.min(1, node.emotionIntensity + 0.45);
      }
    }
  }

  // Faction creation: a powerful T3 node can declare independence
  let splitDone = false;
  for (const node of graph.nodes) {
    if (splitDone) break;
    if (node.tier !== 3 || node.aggression <= 0.70 || node.energy <= 62) continue;
    if (Math.random() > SPLIT_PROB) continue;

    const oldFaction  = node.faction;
    const newFaction  = _nextFactionId++;
    node.faction      = newFaction;
    node.emotion      = "surprised";
    node.emotionIntensity = Math.min(1, node.emotionIntensity + 0.8);
    factionEvents.push({ type: "created", factionId: newFaction, byNodeId: node.id });
    splitDone = true;

    // Rally neighbouring allies into the new faction
    const neighborIds = getNeighborIds(node.id, graph.links);
    const neighbors   = neighborIds.map(id => nodeMap.get(id)).filter(Boolean) as LiveNode[];
    for (const n of neighbors) {
      if (n.faction === oldFaction && Math.random() < n.sociability * 0.55) {
        n.faction          = newFaction;
        n.emotion          = "happy";
        n.emotionIntensity = Math.min(1, n.emotionIntensity + 0.4);
      }
    }
  }

  // --- Death ---
  const supernovaMap = new Map<string, LiveNode[]>();

  for (const node of graph.nodes) {
    const neighborIds   = getNeighborIds(node.id, graph.links);
    const neighborCount = neighborIds.length;
    const naturalDeath  = node.energy < DEATH_ENERGY && neighborCount <= DEATH_MAX_NEIGHBORS;

    let t3Death = false;
    if (node.tier === 3) {
      const t3Age  = Math.max(0, node.age - EVOLVE_TIER3);
      const deathP = Math.min(T3_DEATH_MAX, T3_DEATH_BASE + t3Age * T3_DEATH_RATE);
      t3Death = Math.random() < deathP;
    }

    if (naturalDeath || t3Death) {
      diedIds.push(node.id);
      if (t3Death) {
        const nbrs = neighborIds.map(id => nodeMap.get(id)).filter(Boolean) as LiveNode[];
        supernovaMap.set(node.id, nbrs);
      }
    }
  }

  for (const [, nbrs] of supernovaMap) {
    for (const n of nbrs) {
      n.energy           = clamp(n.energy   + 28);
      n.activity         = clamp(n.activity + 55);
      n.emotion          = "surprised";
      n.emotionIntensity = Math.min(1, n.emotionIntensity + 0.85);
    }
  }

  if (diedIds.length > 0) {
    const dead = new Set(diedIds);
    for (let i = graph.nodes.length - 1; i >= 0; i--) {
      if (dead.has(graph.nodes[i].id)) graph.nodes.splice(i, 1);
    }
    for (let i = graph.links.length - 1; i >= 0; i--) {
      const l = graph.links[i];
      if (dead.has(getId(l.source)) || dead.has(getId(l.target))) graph.links.splice(i, 1);
    }
  }

  // Detect faction destruction (factions that existed before the tick but are now empty)
  const factionsAfter = new Set(graph.nodes.map(n => n.faction));
  for (const f of factionsAtStart) {
    if (!factionsAfter.has(f)) {
      factionEvents.push({ type: "destroyed", factionId: f });
    }
  }

  // --- Birth ---
  const fPool = activeFactionPool(graph);
  for (const node of graph.nodes) {
    const neighborIds = getNeighborIds(node.id, graph.links);
    if (neighborIds.length < BIRTH_CONNECTIONS) continue;

    const neighbors  = neighborIds.map(id => nodeMap.get(id)).filter(Boolean) as LiveNode[];
    const clusterAvg = (node.energy + neighbors.reduce((s, n) => s + n.energy, 0)) / (neighbors.length + 1);
    const birthChance = node.tier === 3 ? 1 / 6 : node.tier === 2 ? 1 / 8 : 1 / 10;

    if (clusterAvg > BIRTH_ENERGY && Math.random() < birthChance) {
      const newId  = `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const persona = inheritPersonality(node, fPool);
      bornNode = {
        id:              newId,
        energy:          62 + (node.tier - 1) * 8 + Math.random() * 15,
        age:             0,
        activity:        40,
        state:           "stable",
        tier:            1,
        emotion:         "neutral",
        emotionIntensity: 0,
        ...persona,
        x: (node.x ?? 0) + (Math.random() - 0.5) * 40,
        y: (node.y ?? 0) + (Math.random() - 0.5) * 40,
      };
      graph.nodes.push(bornNode);
      bornLink = { source: node, target: bornNode, strength: 1.0, lastFlow: 0 };
      graph.links.push(bornLink);
      const second = neighbors[Math.floor(Math.random() * neighbors.length)];
      if (second) graph.links.push({ source: second, target: bornNode, strength: 1.0, lastFlow: 0 });
      break;
    }
  }

  // --- Rescue ---
  if (graph.nodes.length < MIN_NODES) {
    const needed  = MIN_NODES - graph.nodes.length;
    const cx = graph.nodes.reduce((s, n) => s + (n.x ?? 0), 0) / Math.max(1, graph.nodes.length);
    const cy = graph.nodes.reduce((s, n) => s + (n.y ?? 0), 0) / Math.max(1, graph.nodes.length);
    const pool = activeFactionPool(graph).length > 0 ? activeFactionPool(graph) : [0, 1, 2, 3];

    for (const n of graph.nodes) { n.energy = clamp(n.energy + 20); n.activity = clamp(n.activity + 30); }

    const rescueNodes: LiveNode[] = [];
    for (let i = 0; i < needed; i++) {
      const angle = (i / needed) * Math.PI * 2;
      const rn: LiveNode = {
        id:              `r_${Date.now()}_${i}`,
        energy:          72 + Math.random() * 15,
        age:             0,
        activity:        60,
        state:           "stable",
        tier:            1,
        emotion:         "surprised",
        emotionIntensity: 0.8,
        ...randPersonality(pool),
        x: cx + Math.cos(angle) * (80 + Math.random() * 30),
        y: cy + Math.sin(angle) * (80 + Math.random() * 30),
      };
      rescueNodes.push(rn);
      graph.nodes.push(rn);
      if (!bornNode) bornNode = rn;
    }

    for (let i = 0; i < rescueNodes.length; i++) {
      graph.links.push({
        source: rescueNodes[i], target: rescueNodes[(i + 1) % rescueNodes.length],
        strength: 1.5, lastFlow: Date.now(),
      });
    }
    const survivor = graph.nodes.find(n => !rescueNodes.includes(n));
    if (survivor) graph.links.push({ source: survivor, target: rescueNodes[0], strength: 1.0, lastFlow: Date.now() });
  }

  return { diedIds, bornNode, bornLink, factionEvents };
}
