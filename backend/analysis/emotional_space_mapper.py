#!/usr/bin/env python3
"""
Emotional Space Mapping Algorithm
Maps songs into multi-dimensional emotional space and creates journey paths
"""

import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import json
from pathlib import Path
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler
from scipy.spatial.distance import euclidean
import networkx as nx
import warnings

warnings.filterwarnings("ignore")
try:
    import umap

    UMAP_AVAILABLE = True
except ImportError:
    print("⚠️  UMAP not available, falling back to t-SNE")
    UMAP_AVAILABLE = False
import sys

sys.path.append(".")
from src.analysis.sonic_dna_extractor import SonicDNADatabase


@dataclass
class EmotionalCoordinate:
    """Represents a point in emotional space"""

    valence: float
    energy: float
    complexity: float
    tension: float

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def to_array(self) -> np.ndarray:
        return np.array([self.valence, self.energy, self.complexity, self.tension])

    def to_position_array(self) -> np.ndarray:
        """Get 3D position coordinates"""
        return np.array([self.x, self.y, self.z])

    def distance_to(self, other: "EmotionalCoordinate") -> float:
        return euclidean(self.to_array(), other.to_array())

    def position_distance_to(self, other: "EmotionalCoordinate") -> float:
        """Distance in 3D semantic space"""
        return euclidean(self.to_position_array(), other.to_position_array())

    def to_dict(self) -> Dict:
        return {
            "valence": self.valence,
            "energy": self.energy,
            "complexity": self.complexity,
            "tension": self.tension,
            "x": self.x,
            "y": self.y,
            "z": self.z,
        }


@dataclass
class EmotionalJourneyPoint:
    """A point along an emotional journey"""

    coordinate: EmotionalCoordinate
    track_id: Optional[str] = None
    timestamp: float = 0.0
    transition_type: str = "smooth"


class EmotionalSpaceMapper:
    """Maps music into emotional space and creates journey paths"""

    def __init__(self, dna_database: SonicDNADatabase):
        self.dna_database = dna_database
        self.emotional_graph = nx.Graph()
        self.coordinate_cache = {}

        self._build_emotional_space()

    def _build_emotional_space(self):
        """Build emotional space from DNA database with semantic positioning"""
        profiles = self.dna_database.get_all_profiles()

        print(f"🗺️  Building emotional space from {len(profiles)} tracks...")

        if len(profiles) == 0:
            print("⚠️  No tracks available for emotional mapping")
            return

        print(f"🎵 Processing all {len(profiles)} tracks for emotional mapping")

        emotional_coordinates = []
        full_features = []
        track_ids = []

        for profile in profiles:
            coord = EmotionalCoordinate(
                valence=float(profile.valence),
                energy=float(profile.energy),
                complexity=float(profile.complexity),
                tension=float(profile.tension),
            )
            emotional_coordinates.append(coord.to_array())
            track_ids.append(profile.track_id)

            features = [
                float(profile.valence),
                float(profile.energy),
                float(profile.complexity),
                float(profile.tension),
                float(profile.tempo) / 200.0,
            ]

            if hasattr(profile, "harmonic_genes") and profile.harmonic_genes:
                features.extend([float(x) for x in profile.harmonic_genes[:12]])

            if hasattr(profile, "timbral_genes") and profile.timbral_genes:
                features.extend([float(x) for x in profile.timbral_genes[:13]])

            if hasattr(profile, "textural_genes") and profile.textural_genes:
                features.extend([float(x) for x in profile.textural_genes[:7]])

            if hasattr(profile, "dynamic_genes") and profile.dynamic_genes:
                features.extend([float(x) for x in profile.dynamic_genes[:10]])

            if hasattr(profile, "rhythmic_genes") and profile.rhythmic_genes:
                features.extend([float(x) for x in profile.rhythmic_genes[:8]])

            full_features.append(features)

        semantic_positions = self._compute_semantic_positions(full_features)

        for i, track_id in enumerate(track_ids):
            coord = EmotionalCoordinate(
                valence=float(emotional_coordinates[i][0]),
                energy=float(emotional_coordinates[i][1]),
                complexity=float(emotional_coordinates[i][2]),
                tension=float(emotional_coordinates[i][3]),
                x=float(semantic_positions[i][0]),
                y=float(semantic_positions[i][1]),
                z=float(semantic_positions[i][2]),
            )
            self.coordinate_cache[track_id] = coord

        self._build_emotional_graph(track_ids, emotional_coordinates)

        print(
            f"  ✅ Built emotional graph with {len(track_ids)} nodes and {self.emotional_graph.number_of_edges()} edges"
        )

    def _build_feature_vector(self, dna_profile):
        """Build feature vector for dimensionality reduction."""
        features = [
            dna_profile.valence,
            dna_profile.energy,
            dna_profile.complexity,
            dna_profile.tension,
            dna_profile.tempo / 200.0,
        ]

        if hasattr(dna_profile, "harmonic_genes") and dna_profile.harmonic_genes:
            features.extend(dna_profile.harmonic_genes[:12])

        if hasattr(dna_profile, "timbral_genes") and dna_profile.timbral_genes:
            features.extend(dna_profile.timbral_genes[:13])

        if hasattr(dna_profile, "textural_genes") and dna_profile.textural_genes:
            features.extend(dna_profile.textural_genes[:7])

        if hasattr(dna_profile, "dynamic_genes") and dna_profile.dynamic_genes:
            features.extend(dna_profile.dynamic_genes[:10])

        if hasattr(dna_profile, "rhythmic_genes") and dna_profile.rhythmic_genes:
            features.extend(dna_profile.rhythmic_genes[:8])

        max_features = 60
        while len(features) < max_features:
            features.append(0.0)

        return features[:max_features]

    def _compute_semantic_positions(self, features: List[List[float]]) -> np.ndarray:
        """Compute 3D semantic positions using dimensionality reduction"""
        features_array = np.array(features)

        print(
            f"🧠 Computing semantic positions from {features_array.shape[1]} features..."
        )

        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features_array)

        if UMAP_AVAILABLE and len(features) > 15:
            print("🎯 Using UMAP for semantic positioning...")
            reducer = umap.UMAP(
                n_components=3,
                n_neighbors=min(15, len(features) // 3),
                min_dist=0.1,
                metric="euclidean",
                random_state=42,
            )
            positions_3d = reducer.fit_transform(features_scaled)
        else:
            print("🎯 Using t-SNE for semantic positioning...")
            if len(features) > 3:
                if features_array.shape[1] > 50:
                    pca = PCA(n_components=50)
                    features_scaled = pca.fit_transform(features_scaled)

                tsne = TSNE(
                    n_components=3,
                    perplexity=min(30, len(features) // 4),
                    random_state=42,
                    init="pca",
                    learning_rate="auto",
                )
                positions_3d = tsne.fit_transform(features_scaled)
            else:
                print("⚠️  Too few samples for t-SNE, using PCA...")
                pca = PCA(n_components=min(3, len(features), features_array.shape[1]))
                positions_3d = pca.fit_transform(features_scaled)

                if positions_3d.shape[1] < 3:
                    padding = np.zeros(
                        (positions_3d.shape[0], 3 - positions_3d.shape[1])
                    )
                    positions_3d = np.hstack([positions_3d, padding])

        positions_3d = self._scale_positions(positions_3d)

        print(
            f"✅ Computed semantic positions with range: X[{positions_3d[:, 0].min():.1f}, {positions_3d[:, 0].max():.1f}], Y[{positions_3d[:, 1].min():.1f}, {positions_3d[:, 1].max():.1f}], Z[{positions_3d[:, 2].min():.1f}, {positions_3d[:, 2].max():.1f}]"
        )

        return positions_3d

    def _scale_positions(
        self, positions: np.ndarray, scale_range: float = 25.0
    ) -> np.ndarray:
        """Scale positions to a reasonable range for 3D visualization"""

        positions_centered = positions - positions.mean(axis=0)

        max_range = np.max(np.abs(positions_centered))
        if max_range > 0:
            positions_scaled = positions_centered * (scale_range / max_range)
        else:
            positions_scaled = positions_centered

        return positions_scaled

    def _build_emotional_graph(
        self, track_ids: List[str], coordinates: List[np.ndarray]
    ):
        """Build graph of emotional relationships"""

        for i, track_id in enumerate(track_ids):
            self.emotional_graph.add_node(track_id, coordinate=coordinates[i])

        similarity_threshold = 0.3

        for i, track_id1 in enumerate(track_ids):
            for j, track_id2 in enumerate(track_ids[i + 1 :], i + 1):
                distance = euclidean(coordinates[i], coordinates[j])

                if distance < similarity_threshold and distance > 1e-6:
                    weight = 1.0 / (distance + 1e-6)
                    self.emotional_graph.add_edge(track_id1, track_id2, weight=weight)

    def get_coordinate(self, track_id: str) -> Optional[EmotionalCoordinate]:
        """Get emotional coordinate for a track"""
        return self.coordinate_cache.get(track_id)

    def find_nearest_tracks(
        self, target_coord: EmotionalCoordinate, k: int = 5
    ) -> List[Tuple[str, float]]:
        """Find k nearest tracks to a target emotional coordinate"""
        distances = []

        for track_id, coord in self.coordinate_cache.items():
            distance = target_coord.distance_to(coord)
            distances.append((track_id, distance))

        distances.sort(key=lambda x: x[1])
        return distances[:k]

    def find_emotional_path(
        self, start_track: str, end_track: str, max_steps: int = 10
    ) -> List[str]:
        """Find path between two tracks through emotional space using graph traversal"""

        if (
            start_track not in self.emotional_graph
            or end_track not in self.emotional_graph
        ):
            return [start_track, end_track]

        try:
            path = nx.shortest_path(
                self.emotional_graph, start_track, end_track, weight="weight"
            )

            if len(path) > max_steps:
                indices = np.linspace(0, len(path) - 1, max_steps, dtype=int)
                path = [path[i] for i in indices]

            return path

        except nx.NetworkXNoPath:
            return self._create_interpolated_path(start_track, end_track, max_steps)

    def _create_interpolated_path(
        self, start_track: str, end_track: str, max_steps: int = 10
    ) -> List[str]:
        """Create interpolated path when no graph path exists"""

        start_coord = self.get_coordinate(start_track)
        end_coord = self.get_coordinate(end_track)

        if not start_coord or not end_coord:
            return [start_track, end_track]

        path_tracks = [start_track]

        for i in range(1, max_steps - 1):
            t = i / (max_steps - 1)

            interp_coord = EmotionalCoordinate(
                valence=start_coord.valence
                + t * (end_coord.valence - start_coord.valence),
                energy=start_coord.energy + t * (end_coord.energy - start_coord.energy),
                complexity=start_coord.complexity
                + t * (end_coord.complexity - start_coord.complexity),
                tension=start_coord.tension
                + t * (end_coord.tension - start_coord.tension),
            )

            nearest_tracks = self.find_nearest_tracks(interp_coord, k=1)
            if nearest_tracks:
                nearest_track = nearest_tracks[0][0]
                if nearest_track not in path_tracks:
                    path_tracks.append(nearest_track)

        path_tracks.append(end_track)
        return path_tracks

    def create_emotional_journey(
        self,
        start_track: str,
        end_track: str,
        waypoints: List[EmotionalCoordinate] = None,
        journey_duration: float = 60.0,
    ) -> List[EmotionalJourneyPoint]:
        """Create a complete emotional journey with timing"""

        path_tracks = self.find_emotional_path(start_track, end_track)

        if waypoints:
            path_tracks = self._incorporate_waypoints(path_tracks, waypoints)

        journey_points = []
        total_tracks = len(path_tracks)

        for i, track_id in enumerate(path_tracks):
            coord = self.get_coordinate(track_id)
            if coord:
                timestamp = (i / (total_tracks - 1)) * journey_duration

                if i == 0:
                    transition_type = "start"
                elif i == total_tracks - 1:
                    transition_type = "end"
                elif self._is_bridge_track(track_id, path_tracks):
                    transition_type = "bridge"
                else:
                    transition_type = "smooth"

                journey_point = EmotionalJourneyPoint(
                    coordinate=coord,
                    track_id=track_id,
                    timestamp=timestamp,
                    transition_type=transition_type,
                )
                journey_points.append(journey_point)

        return journey_points

    def _incorporate_waypoints(
        self, path_tracks: List[str], waypoints: List[EmotionalCoordinate]
    ) -> List[str]:
        """Incorporate waypoints into the journey path"""

        enhanced_path = [path_tracks[0]]

        for waypoint in waypoints:
            nearest_tracks = self.find_nearest_tracks(waypoint, k=1)
            if nearest_tracks:
                waypoint_track = nearest_tracks[0][0]
                if waypoint_track not in enhanced_path:
                    enhanced_path.append(waypoint_track)

        enhanced_path.append(path_tracks[-1])
        return enhanced_path

    def _is_bridge_track(self, track_id: str, path: List[str]) -> bool:
        """Determine if a track serves as a bridge between different emotional regions"""
        track_index = path.index(track_id)

        if track_index == 0 or track_index == len(path) - 1:
            return False

        prev_coord = self.get_coordinate(path[track_index - 1])
        curr_coord = self.get_coordinate(track_id)
        next_coord = self.get_coordinate(path[track_index + 1])

        if not all([prev_coord, curr_coord, next_coord]):
            return False

        prev_to_curr = prev_coord.distance_to(curr_coord)
        curr_to_next = curr_coord.distance_to(next_coord)
        prev_to_next = prev_coord.distance_to(next_coord)

        bridge_threshold = 0.7
        return (prev_to_curr + curr_to_next) < (prev_to_next * bridge_threshold)

    def analyze_emotional_clusters(self) -> Dict:
        """Analyze emotional clustering in the space"""
        coordinates = np.array(
            [coord.to_array() for coord in self.coordinate_cache.values()]
        )
        track_ids = list(self.coordinate_cache.keys())

        if len(coordinates) < 2:
            return {}

        pca = PCA(n_components=min(4, len(coordinates)))
        pca_coords = pca.fit_transform(coordinates)

        from sklearn.cluster import KMeans

        n_clusters = min(5, len(coordinates))
        if n_clusters > 1:
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            cluster_labels = kmeans.fit_predict(coordinates)

            clusters = {}
            for i in range(n_clusters):
                cluster_tracks = [
                    track_ids[j] for j, label in enumerate(cluster_labels) if label == i
                ]
                cluster_center = kmeans.cluster_centers_[i]

                clusters[f"cluster_{i}"] = {
                    "tracks": cluster_tracks,
                    "center": EmotionalCoordinate(*cluster_center),
                    "size": len(cluster_tracks),
                }
        else:
            clusters = {}

        return {
            "pca_explained_variance": pca.explained_variance_ratio_.tolist(),
            "pca_coordinates": pca_coords.tolist(),
            "clusters": clusters,
            "total_tracks": len(track_ids),
        }

    def get_emotional_statistics(self) -> Dict:
        """Get statistics about the emotional space"""
        if not self.coordinate_cache:
            return {}

        coordinates = np.array(
            [coord.to_array() for coord in self.coordinate_cache.values()]
        )

        return {
            "emotional_ranges": {
                "valence": {
                    "min": float(coordinates[:, 0].min()),
                    "max": float(coordinates[:, 0].max()),
                    "mean": float(coordinates[:, 0].mean()),
                },
                "energy": {
                    "min": float(coordinates[:, 1].min()),
                    "max": float(coordinates[:, 1].max()),
                    "mean": float(coordinates[:, 1].mean()),
                },
                "complexity": {
                    "min": float(coordinates[:, 2].min()),
                    "max": float(coordinates[:, 2].max()),
                    "mean": float(coordinates[:, 2].mean()),
                },
                "tension": {
                    "min": float(coordinates[:, 3].min()),
                    "max": float(coordinates[:, 3].max()),
                    "mean": float(coordinates[:, 3].mean()),
                },
            },
            "emotional_center": {
                "valence": float(coordinates[:, 0].mean()),
                "energy": float(coordinates[:, 1].mean()),
                "complexity": float(coordinates[:, 2].mean()),
                "tension": float(coordinates[:, 3].mean()),
            },
            "emotional_spread": {
                "valence": float(coordinates[:, 0].std()),
                "energy": float(coordinates[:, 1].std()),
                "complexity": float(coordinates[:, 2].std()),
                "tension": float(coordinates[:, 3].std()),
            },
        }

    def export_visualization_data(
        self, output_file: str = "data/emotional_space_data.json"
    ):
        """Export data for 3D visualization"""

        visualization_data = {
            "tracks": [],
            "connections": [],
            "clusters": {},
            "statistics": self.get_emotional_statistics(),
        }

        track_ids = list(self.coordinate_cache.keys())
        total_tracks = len(track_ids)

        for track_index, (track_id, coord) in enumerate(self.coordinate_cache.items()):
            dna_profile = self.dna_database.get_dna(track_id)

            track_data = {
                "id": track_id,
                "track_id": track_id,
                "coordinates": {
                    "valence": float(coord.valence),
                    "energy": float(coord.energy),
                    "complexity": float(coord.complexity),
                    "tension": float(coord.tension),
                },
                "position": {
                    "x": float(coord.x),
                    "y": float(coord.y),
                    "z": float(coord.z),
                },
                "metadata": {},
            }

            if dna_profile:
                key_value = 0
                if dna_profile.key_signature is not None:
                    if isinstance(dna_profile.key_signature, (int, float)):
                        key_value = int(dna_profile.key_signature)
                    else:
                        key_map = {
                            "C": 0,
                            "C#": 1,
                            "Db": 1,
                            "D": 2,
                            "D#": 3,
                            "Eb": 3,
                            "E": 4,
                            "F": 5,
                            "F#": 6,
                            "Gb": 6,
                            "G": 7,
                            "G#": 8,
                            "Ab": 8,
                            "A": 9,
                            "A#": 10,
                            "Bb": 10,
                            "B": 11,
                        }
                        key_value = key_map.get(str(dna_profile.key_signature), 0)

                mode_value = 0
                if dna_profile.mode is not None:
                    if isinstance(dna_profile.mode, (int, float)):
                        mode_value = int(dna_profile.mode)
                    else:
                        mode_map = {
                            "Major": 1,
                            "major": 1,
                            "MAJOR": 1,
                            "Minor": 0,
                            "minor": 0,
                            "MINOR": 0,
                        }
                        mode_value = mode_map.get(str(dna_profile.mode), 0)

                track_data["metadata"] = {
                    "tempo": float(dna_profile.tempo),
                    "key": key_value,
                    "key_name": str(dna_profile.key_signature)
                    if dna_profile.key_signature is not None
                    else "C",
                    "mode": mode_value,
                    "mode_name": str(dna_profile.mode)
                    if dna_profile.mode is not None
                    else "Major",
                    "genetic_fingerprint": dna_profile.get_genetic_fingerprint(),
                }

                emotional_color = self._calculate_emotional_color(
                    coord, track_index, total_tracks
                )
                track_data["emotional_color"] = emotional_color

                if (
                    hasattr(dna_profile, "harmonic_genes")
                    and dna_profile.harmonic_genes
                ):
                    sonic_color = self._calculate_sonic_color(
                        dna_profile.harmonic_genes
                    )
                    track_data["sonic_color"] = sonic_color
                else:
                    track_data["sonic_color"] = self._calculate_sonic_color()

                hybrid_color = {
                    "r": int((emotional_color["r"] + sonic_color["r"]) / 2),
                    "g": int((emotional_color["g"] + sonic_color["g"]) / 2),
                    "b": int((emotional_color["b"] + sonic_color["b"]) / 2),
                    "a": emotional_color.get("a", 255),
                }
                track_data["hybrid_color"] = hybrid_color

                track_data["color"] = emotional_color

            visualization_data["tracks"].append(track_data)

        connections_exported = 0
        max_connections = 20000

        edges_with_weights = [
            (edge[0], edge[1], edge[2].get("weight", 1.0))
            for edge in self.emotional_graph.edges(data=True)
        ]
        edges_with_weights.sort(key=lambda x: x[2], reverse=True)

        for track1, track2, weight in edges_with_weights[:max_connections]:
            coord1 = self.get_coordinate(track1)
            coord2 = self.get_coordinate(track2)

            if coord1 and coord2:
                connection = {
                    "source": track1,
                    "target": track2,
                    "weight": float(weight),
                    "distance": float(coord1.distance_to(coord2)),
                }
                visualization_data["connections"].append(connection)
                connections_exported += 1

        print(
            f"📊 Exported {connections_exported} strongest connections (out of {self.emotional_graph.number_of_edges()} total)"
        )

        cluster_analysis = self.analyze_emotional_clusters()
        visualization_data["clusters"] = cluster_analysis

        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        def convert_numpy_types(obj):
            if isinstance(obj, dict):
                return {k: convert_numpy_types(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_numpy_types(item) for item in obj]
            elif isinstance(obj, EmotionalCoordinate):
                return obj.to_dict()
            elif isinstance(obj, np.integer):
                return int(obj)
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            else:
                return obj

        visualization_data = convert_numpy_types(visualization_data)

        with open(output_path, "w") as f:
            json.dump(visualization_data, f, indent=2)

        print(f"📊 Exported visualization data to {output_path}")
        return visualization_data

    def _calculate_sonic_color(
        self, harmonic_genes: List[float] = None
    ) -> Dict[str, int]:
        """Convert harmonic content to RGB color"""

        if harmonic_genes and len(harmonic_genes) >= 12:
            harmonic_array = np.array(harmonic_genes[:12])

            if harmonic_array.max() > harmonic_array.min():
                harmonic_array = (harmonic_array - harmonic_array.min()) / (
                    harmonic_array.max() - harmonic_array.min()
                )

            red = int(255 * np.sum(harmonic_array[0:4]) / 4.0)
            green = int(255 * np.sum(harmonic_array[4:8]) / 4.0)
            blue = int(255 * np.sum(harmonic_array[8:12]) / 4.0)

            red = max(50, min(255, red))
            green = max(50, min(255, green))
            blue = max(50, min(255, blue))

            return {"r": red, "g": green, "b": blue}
        else:
            return {"r": 120, "g": 120, "b": 120}

    def _calculate_emotional_color(
        self,
        coord: EmotionalCoordinate,
        track_index: int = None,
        total_tracks: int = None,
    ) -> Dict[str, int]:
        """Ranking-based color system - every track gets a unique vibrant color"""

        if track_index is not None and total_tracks is not None and total_tracks > 1:
            hue = (track_index * 360 / total_tracks) % 360

            valence_offset = (coord.valence + 0.2) * 10
            energy_offset = (coord.energy - 0.5) * 8
            hue = (hue + valence_offset + energy_offset) % 360

            import colorsys

            r, g, b = colorsys.hls_to_rgb(hue / 360, 0.65, 0.85)

            red = int(r * 255)
            green = int(g * 255)
            blue = int(b * 255)

        else:
            red, green, blue = 255, 180, 200

        alpha = 255

        return {"r": red, "g": green, "b": blue, "a": alpha}

    def generate_3d_layout(self) -> Dict:
        """Generate 3D positions for tracks using force-directed layout based on relationships"""
        import networkx as nx

        if len(self.emotional_graph.nodes()) == 0:
            return {"tracks": [], "connections": []}

        print(
            f"🎯 Generating 3D layout for {len(self.emotional_graph.nodes())} tracks..."
        )

        try:
            pos_3d = nx.spring_layout(
                self.emotional_graph,
                dim=3,
                k=3.0,
                iterations=100,
                weight="weight",
            )
        except:
            pos_2d = nx.spring_layout(
                self.emotional_graph, k=3.0, iterations=100, weight="weight"
            )
            pos_3d = {}
            for node, (x, y) in pos_2d.items():
                coord = self.get_coordinate(node)
                z = coord.complexity * 10 if coord else 0
                pos_3d[node] = np.array([x * 20, y * 20, z])

        scale_factor = 15.0
        positioned_tracks = []

        for track_id, position in pos_3d.items():
            coord = self.get_coordinate(track_id)
            dna_profile = self.dna_database.get_dna(track_id)

            if coord and dna_profile:
                track_data = {
                    "track_id": track_id,
                    "position": {
                        "x": float(position[0] * scale_factor),
                        "y": float(position[1] * scale_factor),
                        "z": float(position[2] * scale_factor)
                        if len(position) > 2
                        else float(coord.complexity * scale_factor),
                    },
                    "emotional_coordinates": coord.to_dict(),
                    "sonic_dna": {
                        "features": {
                            "valence": coord.valence,
                            "energy": coord.energy,
                            "danceability": coord.complexity,
                            "tempo": dna_profile.tempo,
                            "key": dna_profile.key_signature,
                            "mode": dna_profile.mode,
                        },
                        "genetic_fingerprint": dna_profile.get_genetic_fingerprint(),
                    },
                    "emotional_color": self._calculate_emotional_color(coord),
                    "sonic_color": self._calculate_sonic_color(
                        dna_profile.harmonic_genes
                        if hasattr(dna_profile, "harmonic_genes")
                        else None
                    ),
                    "color": self._calculate_emotional_color(
                        coord, track_index, total_tracks
                    ),
                }
                positioned_tracks.append(track_data)

        connections = []
        for edge in self.emotional_graph.edges(data=True):
            source, target, data = edge
            if source in pos_3d and target in pos_3d:
                connection = {
                    "source": source,
                    "target": target,
                    "weight": data.get("weight", 1.0),
                    "strength": min(data.get("weight", 1.0), 5.0),
                }
                connections.append(connection)

        result = {
            "tracks": positioned_tracks,
            "connections": connections,
            "layout_info": {
                "algorithm": "force_directed_3d",
                "node_count": len(positioned_tracks),
                "edge_count": len(connections),
                "scale_factor": scale_factor,
            },
        }

        print(
            f"✅ Generated 3D layout with {len(positioned_tracks)} positioned tracks and {len(connections)} connections"
        )
        return result


if __name__ == "__main__":
    print("🗺️  Testing Emotional Space Mapper...")

    dna_db = SonicDNADatabase()

    if not dna_db.get_all_profiles():
        print("⚠️  No DNA profiles found. Run sonic_dna_extractor.py first.")
        exit(1)

    mapper = EmotionalSpaceMapper(dna_db)

    profiles = dna_db.get_all_profiles()
    track_ids = [profile.track_id for profile in profiles[:5]]

    print(f"\n🎵 Available tracks:")
    for i, track_id in enumerate(track_ids):
        coord = mapper.get_coordinate(track_id)
        if coord:
            print(f"  {i + 1}. {track_id}")
            print(
                f"     Emotional: V={coord.valence:.2f}, E={coord.energy:.2f}, C={coord.complexity:.2f}, T={coord.tension:.2f}"
            )

    if len(track_ids) >= 2:
        start_track = track_ids[0]
        end_track = track_ids[-1]

        print(f"\n🚀 Creating emotional journey:")
        print(f"  From: {start_track}")
        print(f"  To: {end_track}")

        journey = mapper.create_emotional_journey(
            start_track, end_track, journey_duration=45.0
        )

        print(f"\n🛤️  Journey path ({len(journey)} steps):")
        for point in journey:
            print(
                f"  {point.timestamp:.1f}s: {point.track_id} ({point.transition_type})"
            )
            coord = point.coordinate
            print(
                f"         Emotional: V={coord.valence:.2f}, E={coord.energy:.2f}, C={coord.complexity:.2f}, T={coord.tension:.2f}"
            )

    print(f"\n📊 Emotional Space Statistics:")
    stats = mapper.get_emotional_statistics()
    for category, data in stats.items():
        print(f"  {category}: {data}")

    print(f"\n💾 Exporting visualization data...")
    viz_data = mapper.export_visualization_data()
    print(
        f"  ✅ Exported {len(viz_data['tracks'])} tracks and {len(viz_data['connections'])} connections"
    )

