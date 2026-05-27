export type NodeState = "stable" | "excited" | "decaying";
export type NodeTier  = 1 | 2 | 3;
export type Emotion   = "neutral" | "happy" | "angry" | "sad" | "fearful" | "disgusted" | "surprised";

export type LiveNode = {
  id: string;
  energy: number;
  age: number;
  activity: number;
  state: NodeState;
  tier: NodeTier;
  // Personality — set at birth, inherited+mutated from parent
  aggression:  number;       // 0–1: likelihood of attacking rival-faction neighbours
  sociability: number;       // 0–1: likelihood of helping same-faction neighbours
  empathy:     number;       // 0–1: how readily emotions transfer from neighbours
  // Emotional state — dynamic, updated every tick
  emotion:          Emotion;
  emotionIntensity: number;  // 0–1
  // Faction — inherited from parent, can defect or found a new one
  faction: number;
  x?: number;
  y?: number;
};

export type LiveLink = {
  source: string | LiveNode;
  target: string | LiveNode;
  strength: number;
  lastFlow: number;
};

export type GraphData = {
  nodes: LiveNode[];
  links: LiveLink[];
};
