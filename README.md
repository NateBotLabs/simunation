<div align="center">

# ◉ SIMUNATION

## A real-time neural network life simulation

*Nodes are born, evolve, fight, cooperate, feel emotions, form factions, declare independence, and die — endlessly.*

---

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)

</div>

---

## What Is This?

Simunation is an **agent-based life simulation** rendered as a force-directed graph. Every node on screen is a living entity with its own energy, age, personality, emotional state, and political allegiance. The graph topology — who is connected to whom — is the social fabric of the world. Links are relationships, and those relationships are the medium through which energy, influence, and violence flow.

There is no objective. No win condition. Just a self-sustaining ecosystem that you can nudge, disrupt, or destroy with a click.

The simulation runs on a **600ms clock tick**. Every tick, every node simultaneously loses energy, ages, fights or cooperates with its neighbors, potentially gives birth to a child, and may die. Between ticks the canvas rerenders every animation frame, so nodes breathe, glow, and react in real time.

---

## Built With

| Technology | Role |
|---|---|
| **React 18** | UI, state management, component lifecycle |
| **TypeScript** | Full type safety across simulation, renderer, and graph data |
| **Vite** | Dev server and production bundler |
| **react-force-graph-2d** | Canvas-based force-directed graph renderer |
| **D3 Force** | Physics simulation — charge, link, attraction, thermal noise |

The simulation engine (`simulation.ts`) is pure TypeScript with no framework dependencies — it mutates graph state in-place and returns structural diffs. The React layer consumes those diffs to drive re-renders and canvas animations.

---

## How To Run

```bash
git clone https://github.com/nathan6552/simunation
cd simunation
npm install
npm run dev
```

Then open `http://localhost:5173`.

---

## The Simulation

### Energy & Physics

Energy is the lifeforce of every node. It is the single most important number in the simulation. Nodes with no energy die.

Each tick, several forces act on a node's energy simultaneously:

- **Decay** — nodes lose energy every tick. The rate depends on tier (T1 loses the most, T3 the least).
- **Diffusion** — energy flows passively between connected nodes toward equilibrium. A node with 80 energy connected to one with 20 will slowly equalise with it. The diffusion coefficient is `0.12` — gentle enough to be interesting, strong enough to matter.
- **Breath** — a small random fluctuation each tick (`±2.0`) so nodes never feel mechanically deterministic.
- **Crowding penalty** — nodes with more than 4 neighbors suffer an extra energy drain per additional connection. Dense clusters are costly to maintain.
- **Heartbeat** — every 15 ticks, the 3 highest-energy nodes in the world receive a boost (`+10 energy, +35 activity`). This rewards successful nodes and keeps the simulation from collapsing.
- **Random spark** — each tick has a 10% chance of randomly picking one node anywhere in the world and giving it a small energy jolt. Chaos by design.

Activity (arousal level) decays by 25% each tick and is replenished by neighbor influence. A highly active neighborhood keeps nearby nodes excited.

---

### Evolution Tiers

Nodes evolve as they age. Each tier unlock changes their appearance, physics, and behavior.

| Tier | Age Threshold | Colour | Decay Rate | Birth Rate | Notes |
|:----:|:-------------:|--------|:----------:|:----------:|-------|
| **I** | 0 – 149 | Blue `#6080ee` | 0.12 / tick | 1 in 10 | Default state. Highest decay, lowest birth rate. |
| **II** | 150 – 399 | Teal `#00ced1` | 0.08 / tick | 1 in 8 | Evolved. More efficient, more reproductive. |
| **III** | 400+ | Gold `#ffd700` | 0.05 / tick | 1 in 6 | Apex predator. Lowest decay, highest birth rate — but probabilistic death begins. |

**Tier III death** is not from energy depletion. Each tick, a T3 node has a small but growing chance of dying regardless of its energy level. The probability is `1.2% + (age - 400) × 0.04%`, capped at **10% per tick**. Old T3 nodes are living on borrowed time.

When a **T3 node dies**, it goes **supernova** — it blasts `+28 energy` and `+55 activity` to every directly connected neighbor, and sets their emotion to `surprised`. A dying apex node feeds the next generation.

---

### Personality

Every node is born with three traits, set at birth and **inherited with mutation** from its parent (±35% random variation). These are not cosmetic — they actively drive behavior every tick.

| Trait | Range | Effect |
|-------|:-----:|--------|
| **Aggression** | 0 – 1 | Probability of attacking a rival-faction neighbor each tick. High aggression = frequent draining attacks. |
| **Sociability** | 0 – 1 | Probability of sharing energy with a weaker same-faction neighbor. High sociability = active altruism. |
| **Empathy** | 0 – 1 | How readily the node "catches" emotions from neighbors. High empathy = emotional contagion. |

Personality also interacts with emotion modifiers:

- An **angry** node attacks 50% more often but helps 30% less.
- A **fearful** node attacks at only 25% of its normal rate.
- A **happy** node helps 50% more and attacks 30% less.
- A **disgusted** node almost completely stops helping allies (15% of normal rate).

This means personality and emotional state compound. A naturally aggressive node that gets attacked will become angry — and then become *more* aggressive — creating a feedback loop.

---

### Factions

Every node belongs to a **faction** — a political group. Factions determine who you fight and who you help.

| ID | Default Colour | Origin |
|:--:|----------------|--------|
| **F0** | Blue `#4488ff` | Starter faction |
| **F1** | Orange `#ff6633` | Starter faction |
| **F2** | Green `#44cc66` | Starter faction |
| **F3** | Purple `#cc44ff` | Starter faction |
| **F4+** | Generated | Player-founded (★) |

#### Combat

Each tick, an aggressive node scans its neighbors. If any are from a **rival faction**, it may attack one:

```
damage = aggression × (energy / 100) × 7

target.energy   -= damage
target.activity += damage × 0.8     ← target is alarmed
attacker.energy += damage × 0.25    ← small energy return for the attacker
```

The attacking link briefly flashes **red/orange** in the visual.

#### Cooperation

Each tick, a social node scans its neighbors. If any **same-faction** ally has significantly less energy, it may share:

```
share = sociability × 4

node.energy    -= share × 0.5       ← sharing costs the giver half
ally.energy    += share             ← ally gains the full amount
```

The link flashes **blue/green** during energy flow.

#### Defection

A node may defect (switch factions) when any of these conditions are met:

- **Isolated** — no same-faction neighbors, surrounded by at least 2 others
- **Desperate** — energy below 22
- **Surrounded** — more than 80% of neighbors are enemies and there are at least 3 of them

When defection triggers (0.8% chance per node per tick when conditions are met), the node joins whichever rival faction has the most representatives among its neighbors. It becomes `surprised`.

#### Founding a New Faction

A powerful T3 node with **aggression > 0.70** and **energy > 62** has a **0.4% chance per tick** of declaring independence. When it does:

1. It is assigned a new faction ID (4, 5, 6, …) and a generated color.
2. It becomes `surprised` at high intensity.
3. Each neighboring same-faction ally has a `sociability × 55%` chance of following — they join the new faction and become `happy`.
4. The new faction appears in the legend with a **★** marker.
5. A `"★ F4 declared independence"` event is logged in the Faction Events panel.

#### Dissolution

When the last member of a faction dies or defects in a single tick, the faction is destroyed. A `"✕ F2 dissolved"` event is logged in the panel and the faction disappears from the legend.

---

### Emotions

Emotions are updated every tick based on what happened to the node. They influence behavior and visually change the node's color.

| Emotion | Trigger | Visual | Behavior Effect |
|---------|---------|--------|-----------------|
| **Neutral** | Default | No overlay | Normal |
| **Happy** | Received energy from an ally; high energy + high activity | Green tint | +50% helping, -30% attacking |
| **Angry** | Attacked (aggression > 0.55) | Red tint + vibration | +50% attacking, -60% helping |
| **Sad** | Low energy; T3 with age well past 400 | Dark blue tint | -60% helping |
| **Fearful** | Attacked (aggression ≤ 0.55) | Yellow tint + shrink | -75% attacking |
| **Disgusted** | Aggressive node surrounded by >70% enemies | Olive tint | -85% helping |
| **Surprised** | Supernova hit; defected; founded a faction | White burst ring | None |

**Emotional contagion** — if a node's empathy is above 0.35, and a neighbor has strong emotion (intensity > 0.45), there is a `empathy × 25%` chance per tick that the node catches that neighbor's emotion. Sadness, anger, and happiness all spread through the network.

Emotion intensity decays by 18% each tick. When intensity falls below 0.08, the node returns to neutral.

---

### Reproduction

A node reproduces when all of the following are true:

1. It has at least **2 links** (minimum viable cluster)
2. The **cluster average energy** (node + all its neighbors) exceeds **58**
3. A random roll clears the birth chance (T1: 1/10, T2: 1/8, T3: 1/6 per tick)

When a node is born:

- It spawns near its parent's position with a small random offset.
- It inherits the parent's personality traits, each mutated by ±35%.
- It inherits the parent's faction — with an **8% chance** of randomly switching to any existing faction instead.
- It starts with energy `62 + (tier - 1) × 8 + random(0, 15)` — T3 parents birth stronger children.
- It starts connected to its parent and one of its parent's neighbors.

At most **one birth occurs per tick** (the first qualifying node wins). This prevents population explosions.

#### Rescue System

If the population falls below **8 nodes**, an emergency rescue triggers:

- All surviving nodes receive `+20 energy` and `+30 activity`.
- New nodes are spawned in a ring around the surviving cluster, connected to each other and to the nearest survivor.
- Rescue nodes spawn with `surprised` emotion at high intensity — they arrive alarmed.

This prevents total extinction and ensures the simulation always recovers.

---

### The Ripple

The ripple is what happens when you **click a node**. It sends a wave of energy and excitement outward through the graph, hop by hop, decaying with distance.

**Immediate effect on the clicked node:**
```
energy   += 30
activity += 65
```

**Wave propagation** (`strength = 55`, `hops = 3`, decay = `×0.55` per hop):

| Hop | Strength Received | Activity Gained | Energy Gained |
|:---:|:-----------------:|:---------------:|:-------------:|
| 1 | ≈ 30.3 | ≈ 30.3 | ≈ 9.1 |
| 2 | ≈ 16.6 | ≈ 16.6 | ≈ 5.0 |
| 3 | ≈ 9.1 | ≈ 9.1 | ≈ 2.7 |

The ripple ring animation is **staggered** — each hop's visual ring starts `130ms` later than the previous, so you see the wave travel through the network in real time rather than all nodes lighting up simultaneously. Nodes can only be visited once per ripple — the wave fades at dead ends.

The ripple respects graph topology. A dense cluster lights up almost simultaneously. A chain of singly-connected nodes passes the wave along link by link until it runs out of strength.

**Double-clicking** removes the node and severs all its links instantly.

---

### Link Memory

Links are not static. Each link tracks **strength** (0.3 – 2.5) based on how much energy has flowed through it:

- If the energy difference between two connected nodes exceeds 25%, the link gains `+0.02` strength.
- Otherwise it slowly weakens by `−0.005` per tick.

Link thickness in the visual reflects this strength. Heavily trafficked links become visually prominent; unused links become thin and ghostly.

---

## Visual Language

Every visual property encodes live simulation state.

| Visual | Encodes |
|--------|---------|
| **Node size** | Energy (larger = more energy) |
| **Glow intensity** | Activity level + emotion intensity |
| **Breathing pulse** | Each node has a unique phase derived from its ID hash, so pulses are unsynchronised |
| **Solid tier ring** | Evolution tier — teal (T2), gold (T3) |
| **Dashed outer ring** | Faction — color from the faction palette |
| **Thicker dashed ring** | Newly-founded faction (★) |
| **Red/orange link** | Recent combat between rival-faction nodes |
| **Blue/green link** | Recent energy sharing between allied nodes |
| **Purple expanding ring** | Node death animation |
| **White burst ring** | T3 supernova / surprised emotion |
| **Node shrink** | Fearful emotion |
| **Node vibration** | Angry emotion |

Color also encodes state within a tier:

| State | T1 Color | T2 Color | T3 Color |
|-------|----------|----------|----------|
| Stable | Blue → warm fade with age | Teal → seafoam | Gold → orange fade with age |
| Excited | Near-white | Pale cyan | Pale yellow-white |
| Decaying | Deep purple | Deep violet | Dark brown |

---

## Controls

| Input | Effect |
|-------|--------|
| **Click** | Boost node energy +30, activity +65. Sends a ripple 3 hops outward. |
| **Double-click** | Immediately remove the node and all its links. |
| **Hover** | Show the live stats panel (top-right) with vitals, emotion, and personality bars. |

---

## Architecture

```
src/
├── types.ts          — Shared type definitions (LiveNode, LiveLink, GraphData, Emotion, …)
├── initialGraph.ts   — Starting 12-node graph across three clusters
├── simulation.ts     — Tick engine: energy physics, combat, emotions, faction dynamics, birth/death
└── App.tsx           — ForceGraph2D renderer, canvas object painter, legend, tooltip, interaction
```

### Data flow

```
setInterval(600ms)
    └─▶ runTick(liveData)          ← mutates graph nodes/links in place
            └─▶ returns { diedIds, bornNode, factionEvents }
                    └─▶ React setState (structural diff only)
                            └─▶ ForceGraph2D re-renders
                                    └─▶ nodeCanvasObject() paints each node
                                    └─▶ onRenderFramePost() paints death rings
```

The simulation mutates the graph **in place** every tick. React only triggers a full re-render when the node/link list structurally changes (births, deaths). Visual properties like energy, activity, and emotion update the same objects in memory and are read directly by the canvas painter on the next animation frame — no intermediate React state involved.

### Hit Detection

`react-force-graph-2d` uses an offscreen shadow canvas for hover/click detection, throttled to 800ms. This causes nodes to be unresponsive after they move. Simunation replaces this entirely with **direct distance-based hit detection** on every `mousemove` event:

```typescript
// Convert screen coords to graph space using the current zoom transform
gx = (mouseX - canvasWidth/2) / k + graphCenterX
gy = (mouseY - canvasHeight/2) / k + graphCenterY

// Hit = nearest node within its visual radius + 6px padding
```

This makes every node instantly and accurately hoverable and clickable regardless of zoom level, pan position, or node velocity.

---

## Simulation Constants

| Constant | Value | Meaning |
|----------|:-----:|---------|
| `TICK_MS` | 600ms | Simulation step interval |
| `DECAY_RATE` | 0.12 | Energy lost per tick for T1 nodes |
| `DIFFUSION` | 0.12 | Fraction of energy difference exchanged between neighbors |
| `MIN_NODES` | 8 | Population below which rescue spawning triggers |
| `EVOLVE_TIER2` | 150 | Age at which T1 → T2 |
| `EVOLVE_TIER3` | 400 | Age at which T2 → T3 |
| `T3_DEATH_MAX` | 10% | Maximum per-tick death probability for T3 nodes |
| `BIRTH_ENERGY` | 58 | Minimum cluster average energy required for birth |
| `HEARTBEAT_INTERVAL` | 15 ticks | How often the top nodes receive a heartbeat boost |
| `DEFECT_PROB` | 0.8% | Per-node per-tick probability of defection check |
| `SPLIT_PROB` | 0.4% | Per-eligible-T3 per-tick probability of founding a faction |

---

<div align="center">

*Built by [Nathan Balogun](https://github.com/nathan6552)*

</div>
