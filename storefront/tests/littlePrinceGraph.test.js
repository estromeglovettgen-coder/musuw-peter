import assert from "node:assert/strict";
import test from "node:test";
import {
  LITTLE_PRINCE_GRAPH_VIEW,
  createLittlePrinceGraph,
} from "../src/data/littlePrinceGraph.js";

const REQUIRED_CATEGORIES = [
  "character",
  "chapter-event",
  "place",
  "theme",
  "symbol",
  "relation",
  "summary",
];

test("the Little Prince demo deterministically represents the complete book at knowledge-graph scale", () => {
  for (const locale of ["en", "zh"]) {
    const graph = createLittlePrinceGraph(locale);
    const again = createLittlePrinceGraph(locale);

    assert.deepEqual(graph, again);
    assert.ok(graph.nodes.length >= 300, `${locale} graph must contain hundreds of meaningful nodes`);
    assert.ok(graph.nodes.length <= 450, `${locale} graph must stay bounded for the storefront renderer`);
    assert.ok(graph.edges.length >= graph.nodes.length, `${locale} graph must be connected densely enough to read as a graph`);
    assert.equal(graph.nodes.filter((node) => node.kind === "chapter").length, 27);
    assert.equal(graph.nodes.filter((node) => node.kind === "event").length, 81);
    assert.deepEqual(
      graph.nodes.slice(0, 28).map((node) => node.slug),
      ["summary:book", ...Array.from({ length: 27 }, (_, index) => `chapter:${String(index + 1).padStart(2, "0")}`)],
      `${locale} progression must reuse the vault's breadth-first creation order`,
    );
    assert.deepEqual([...new Set(graph.nodes.map((node) => node.page_type))].sort(), [...REQUIRED_CATEGORIES].sort());

    const slugs = new Set(graph.nodes.map((node) => node.slug));
    assert.equal(slugs.size, graph.nodes.length, `${locale} node slugs must be unique`);
    assert.ok(graph.nodes.every((node) => node.title.trim().length > 0));
    assert.ok(new Set(graph.nodes.map((node) => node.title)).size >= graph.nodes.length * 0.95, `${locale} titles must not be repeated filler`);

    const degree = new Map(graph.nodes.map((node) => [node.slug, 0]));
    const edgeKeys = new Set();
    for (const edge of graph.edges) {
      assert.ok(slugs.has(edge.source), `unknown edge source: ${edge.source}`);
      assert.ok(slugs.has(edge.target), `unknown edge target: ${edge.target}`);
      assert.notEqual(edge.source, edge.target, "self-links do not add useful demo structure");
      const key = `${edge.source}\u0000${edge.target}`;
      assert.ok(!edgeKeys.has(key), `duplicate edge: ${key}`);
      edgeKeys.add(key);
      degree.set(edge.source, degree.get(edge.source) + 1);
      degree.set(edge.target, degree.get(edge.target) + 1);
    }
    assert.ok([...degree.values()].every((value) => value > 0), `${locale} graph must not contain orphan filler nodes`);
    assert.ok(graph.nodes.every((node) => node.link_count === degree.get(node.slug)), `${locale} link counts must match the rendered topology`);
  }
});

test("the storefront graph starts at the imported Obsidian scale in the full graph viewport", () => {
  assert.ok(LITTLE_PRINCE_GRAPH_VIEW.initialScale > 0.2);
  assert.ok(LITTLE_PRINCE_GRAPH_VIEW.initialScale <= 0.6);
  assert.ok(LITTLE_PRINCE_GRAPH_VIEW.fitRightInset >= 100);
  assert.ok(LITTLE_PRINCE_GRAPH_VIEW.nodeSizeMultiplier < 1);
  assert.equal("canvasScale" in LITTLE_PRINCE_GRAPH_VIEW, false);
  assert.equal(LITTLE_PRINCE_GRAPH_VIEW.initialScale, 0.55);
  assert.equal(LITTLE_PRINCE_GRAPH_VIEW.progressionTimeScale, 2);
  assert.equal(LITTLE_PRINCE_GRAPH_VIEW.progressionAccelerationStartNode, 15);
  assert.equal(LITTLE_PRINCE_GRAPH_VIEW.progressionAccelerationEndNode, 100);
  assert.equal(LITTLE_PRINCE_GRAPH_VIEW.progressionMaxTimeScale, 10);
});
