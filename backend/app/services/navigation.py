"""Indoor navigation: building graph, Dijkstra routing, spoken turn-by-turn steps, AprilTag localization.

A place's graph (JSON):
  nodes: [{"id", "name", "aliases": [...], "apriltag": int|null, "landmark": str|null}]
  edges: [{"from", "to", "distance_m", "heading_deg"}]   # heading: compass bearing walking from -> to
Edges are walkable both ways (reverse heading = heading + 180).
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image
from rapidfuzz import fuzz, process


@dataclass
class Leg:
    to: str
    distance_m: float
    heading_deg: float | None


def adjacency(graph: dict[str, Any]) -> dict[str, list[Leg]]:
    adj: dict[str, list[Leg]] = {n["id"]: [] for n in graph["nodes"]}
    for e in graph["edges"]:
        h = e.get("heading_deg")
        adj[e["from"]].append(Leg(e["to"], float(e["distance_m"]), h))
        adj[e["to"]].append(Leg(e["from"], float(e["distance_m"]), None if h is None else (h + 180) % 360))
    return adj


def shortest_path(graph: dict[str, Any], start: str, goal: str) -> list[tuple[str, Leg | None]] | None:
    adj = adjacency(graph)
    if start not in adj or goal not in adj:
        return None
    dist = {start: 0.0}
    prev: dict[str, tuple[str, Leg]] = {}
    pq = [(0.0, start)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == goal:
            break
        if d > dist.get(u, float("inf")):
            continue
        for leg in adj[u]:
            nd = d + leg.distance_m
            if nd < dist.get(leg.to, float("inf")):
                dist[leg.to] = nd
                prev[leg.to] = (u, leg)
                heapq.heappush(pq, (nd, leg.to))
    if goal != start and goal not in prev:
        return None
    path: list[tuple[str, Leg | None]] = []
    cur = goal
    while cur != start:
        u, leg = prev[cur]
        path.append((cur, leg))
        cur = u
    path.reverse()
    return [(start, None), *path]


def turn_phrase(prev_heading: float | None, heading: float | None) -> str:
    if prev_heading is None or heading is None:
        return "Walk"
    d = ((heading - prev_heading + 540) % 360) - 180
    if abs(d) < 25:
        return "Continue straight"
    if abs(d) > 150:
        return "Turn around and walk"
    side = "right" if d > 0 else "left"
    return f"Turn {'slightly ' if abs(d) < 60 else ''}{side} and walk"


def route_steps(graph: dict[str, Any], path: list[tuple[str, Leg | None]]) -> list[dict[str, Any]]:
    names = {n["id"]: n for n in graph["nodes"]}
    steps = []
    prev_heading: float | None = None
    for node_id, leg in path[1:]:
        assert leg is not None
        node = names[node_id]
        action = turn_phrase(prev_heading, leg.heading_deg)
        metres = round(leg.distance_m)
        landmark = node.get("landmark")
        text = f"{action} about {metres} metres to {node['name']}."
        if landmark:
            text += f" {landmark}"
        steps.append({"instruction": text, "distance_m": leg.distance_m, "heading_deg": leg.heading_deg, "node_id": node_id, "landmark": landmark})
        prev_heading = leg.heading_deg
    return steps


def resolve_node(graph: dict[str, Any], query: str) -> str | None:
    """Fuzzy match "the exit", "washroom", "room 302" to a node."""
    q = query.lower().strip()
    for n in graph["nodes"]:
        if q == n["id"].lower():
            return n["id"]
    choices: dict[str, str] = {}
    for n in graph["nodes"]:
        choices[n["name"].lower()] = n["id"]
        for a in n.get("aliases", []):
            choices[a.lower()] = n["id"]
    match = process.extractOne(q, list(choices), scorer=fuzz.WRatio, score_cutoff=70)
    return choices[match[0]] if match else None


def detect_apriltags(img: Image.Image) -> list[int]:
    from pupil_apriltags import Detector

    gray = np.array(img.convert("L"))
    det = Detector(families="tag36h11", quad_decimate=1.5)
    return sorted({int(d.tag_id) for d in det.detect(gray) if d.decision_margin > 20})


DEMO_PLACE: dict[str, Any] = {
    "id": "campus-demo",
    "name": "Arts & Sciences Wing",
    "building": "Main Campus",
    "floor": "3rd Floor East",
    "graph": {
        "nodes": [
            {"id": "c302", "name": "Classroom 302", "aliases": ["room 302", "classroom", "my class"], "apriltag": 1, "landmark": None},
            {"id": "corr3e", "name": "East Corridor", "aliases": ["corridor", "hallway"], "apriltag": 2, "landmark": "A tactile strip runs along the right wall."},
            {"id": "lift3", "name": "Lift Lobby", "aliases": ["lift", "elevator"], "apriltag": 3, "landmark": "The lift call button is on the right of the doors."},
            {"id": "wc3", "name": "Washrooms", "aliases": ["washroom", "toilet", "restroom", "bathroom"], "apriltag": 4, "landmark": None},
            {"id": "stairs3", "name": "East Stairs", "aliases": ["stairs", "staircase"], "apriltag": 5, "landmark": "Stairs go down; the handrail is on the right."},
            {"id": "exit3", "name": "Main Exit", "aliases": ["exit", "way out", "main door"], "apriltag": 6, "landmark": "The exit door opens outwards."},
            {"id": "lib3", "name": "Library", "aliases": ["library", "reading room"], "apriltag": 7, "landmark": None},
        ],
        "edges": [
            {"from": "c302", "to": "corr3e", "distance_m": 8, "heading_deg": 90},
            {"from": "corr3e", "to": "lift3", "distance_m": 12, "heading_deg": 0},
            {"from": "corr3e", "to": "wc3", "distance_m": 6, "heading_deg": 180},
            {"from": "lift3", "to": "stairs3", "distance_m": 5, "heading_deg": 90},
            {"from": "lift3", "to": "exit3", "distance_m": 15, "heading_deg": 0},
            {"from": "stairs3", "to": "lib3", "distance_m": 10, "heading_deg": 90},
        ],
    },
}
