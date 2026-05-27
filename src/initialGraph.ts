import type { GraphData, LiveNode, LiveLink } from "./types";

function makeNode(id: string, energy = 60): LiveNode {
  return {
    id, energy, age: 0, activity: 0, state: "stable", tier: 1,
    aggression:  Math.random(),
    sociability: Math.random(),
    empathy:     Math.random(),
    emotion:          "neutral",
    emotionIntensity: 0,
    faction: Math.floor(Math.random() * 4),
  };
}

function makeLink(source: string, target: string): LiveLink {
  return { source, target, strength: 1.0, lastFlow: 0 };
}

export const INITIAL_GRAPH: GraphData = {
  nodes: [
    // Cluster A — high energy hub
    { ...makeNode("a1", 80), activity: 65 },
    makeNode("a2", 75),
    makeNode("a3", 70),
    makeNode("a4", 60),
    makeNode("a5", 65),

    // Cluster B — mid energy
    makeNode("b1", 55),
    makeNode("b2", 48),
    makeNode("b3", 42),
    makeNode("b4", 50),

    // Cluster C — low-mid, some may die
    makeNode("c1", 35),
    makeNode("c2", 45),
    makeNode("c3", 30),
  ],
  links: [
    // Cluster A (dense)
    makeLink("a1", "a2"),
    makeLink("a2", "a3"),
    makeLink("a3", "a4"),
    makeLink("a4", "a5"),
    makeLink("a5", "a1"),
    makeLink("a1", "a3"),

    // Cluster B (ring)
    makeLink("b1", "b2"),
    makeLink("b2", "b3"),
    makeLink("b3", "b4"),
    makeLink("b4", "b1"),

    // Cluster C (triangle)
    makeLink("c1", "c2"),
    makeLink("c2", "c3"),
    makeLink("c3", "c1"),

    // Cross-cluster bridges
    makeLink("a4", "b1"),
    makeLink("b3", "c2"),
  ],
};
