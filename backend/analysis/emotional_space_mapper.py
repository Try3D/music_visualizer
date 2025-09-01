#!/usr/bin/env python3
"""
Emotional Space Mapping Algorithm
Maps songs into multi-dimensional emotional space and creates journey paths
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import json
from pathlib import Path
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler
from scipy.spatial.distance import euclidean
from scipy.interpolate import interp1d
import networkx as nx
import warnings
warnings.filterwarnings('ignore')  # Suppress sklearn warnings
try:
    import umap
    UMAP_AVAILABLE = True
except ImportError:
    print("⚠️  UMAP not available, falling back to t-SNE")
    UMAP_AVAILABLE = False
import sys
sys.path.append('.')
from src.analysis.sonic_dna_extractor import SonicDNA, SonicDNADatabase

@dataclass
class EmotionalCoordinate:
    """Represents a point in emotional space"""
    valence: float      # Happy(+1) vs Sad(-1)
    energy: float       # Energetic(+1) vs Calm(0)  
    complexity: float   # Complex(+1) vs Simple(0)
    tension: float      # Tense(+1) vs Relaxed(0)
    
    # 3D semantic positioning coordinates
    x: float = 0.0      # Semantic X position
    y: float = 0.0      # Semantic Y position  
    z: float = 0.0      # Semantic Z position
    
    def to_array(self) -> np.ndarray:
        return np.array([self.valence, self.energy, self.complexity, self.tension])
    
    def to_position_array(self) -> np.ndarray:
        """Get 3D position coordinates"""
        return np.array([self.x, self.y, self.z])
    
    def distance_to(self, other: 'EmotionalCoordinate') -> float:
        return euclidean(self.to_array(), other.to_array())
    
    def position_distance_to(self, other: 'EmotionalCoordinate') -> float:
        """Distance in 3D semantic space"""
        return euclidean(self.to_position_array(), other.to_position_array())
    
    def to_dict(self) -> Dict:
        return {
            'valence': self.valence,
            'energy': self.energy, 
            'complexity': self.complexity,
            'tension': self.tension,
            'x': self.x,
            'y': self.y,
            'z': self.z
        }

@dataclass 
class EmotionalJourneyPoint:
    """A point along an emotional journey"""
    coordinate: EmotionalCoordinate
    track_id: Optional[str] = None
    timestamp: float = 0.0
    transition_type: str = "smooth"  # smooth, bridge, pivot
    
class EmotionalSpaceMapper:
    """Maps music into emotional space and creates journey paths"""
    
    def __init__(self, dna_database: SonicDNADatabase):
        self.dna_database = dna_database
        self.emotional_graph = nx.Graph()
        self.coordinate_cache = {}
        
        # Load or build the emotional space
        self._build_emotional_space()
    
    def _build_emotional_space(self):
        """Build emotional space from DNA database with semantic positioning"""
        profiles = self.dna_database.get_all_profiles()
        
        print(f"🗺️  Building emotional space from {len(profiles)} tracks...")
        
        if len(profiles) == 0:
            print("⚠️  No tracks available for emotional mapping")
            return
        
        print(f"🎵 Processing all {len(profiles)} tracks for emotional mapping")
        
        # Extract emotional coordinates and full sonic DNA features
        emotional_coordinates = []
        full_features = []
        track_ids = []
        
        for profile in profiles:
            # Emotional coordinates (original 4D)
            coord = EmotionalCoordinate(
                valence=float(profile.valence),
                energy=float(profile.energy),
                complexity=float(profile.complexity),
                tension=float(profile.tension)
            )
            emotional_coordinates.append(coord.to_array())
            track_ids.append(profile.track_id)
            
            # Full sonic DNA features for semantic positioning - using only available attributes
            features = [
                float(profile.valence), float(profile.energy), 
                float(profile.complexity), float(profile.tension),
                float(profile.tempo) / 200.0,  # Normalize tempo
            ]
            
            # Add harmonic genes (12-dimensional chroma)
            if hasattr(profile, 'harmonic_genes') and profile.harmonic_genes:
                features.extend([float(x) for x in profile.harmonic_genes[:12]])  # Convert to float
            
            # Add timbral genes (MFCC features)
            if hasattr(profile, 'timbral_genes') and profile.timbral_genes:
                features.extend([float(x) for x in profile.timbral_genes[:13]])  # Convert to float
            
            # Add textural genes (spectral contrast)
            if hasattr(profile, 'textural_genes') and profile.textural_genes:
                features.extend([float(x) for x in profile.textural_genes[:7]])   # Convert to float
            
            # Add dynamic genes (energy variations)
            if hasattr(profile, 'dynamic_genes') and profile.dynamic_genes:
                features.extend([float(x) for x in profile.dynamic_genes[:10]])  # Convert to float
            
            # Add rhythmic genes
            if hasattr(profile, 'rhythmic_genes') and profile.rhythmic_genes:
                features.extend([float(x) for x in profile.rhythmic_genes[:8]])   # Convert to float
            
            full_features.append(features)
        
        # Create semantic 3D positions using dimensionality reduction
        semantic_positions = self._compute_semantic_positions(full_features, track_ids)
        
        # Update coordinates with semantic positions
        for i, track_id in enumerate(track_ids):
            coord = EmotionalCoordinate(
                valence=float(emotional_coordinates[i][0]),
                energy=float(emotional_coordinates[i][1]),
                complexity=float(emotional_coordinates[i][2]),
                tension=float(emotional_coordinates[i][3]),
                x=float(semantic_positions[i][0]),
                y=float(semantic_positions[i][1]),
                z=float(semantic_positions[i][2])
            )
            self.coordinate_cache[track_id] = coord
        
        # Build graph of emotional relationships
        self._build_emotional_graph(track_ids, emotional_coordinates)
        
        print(f"  ✅ Built emotional graph with {len(track_ids)} nodes and {self.emotional_graph.number_of_edges()} edges")
    
    def _build_feature_vector(self, dna_profile):
        """Build feature vector for dimensionality reduction."""
        features = [
            dna_profile.valence, dna_profile.energy, 
            dna_profile.complexity, dna_profile.tension,
            dna_profile.tempo / 200.0,  # Normalize tempo
        ]
        
        # Add harmonic genes if available
        if hasattr(dna_profile, 'harmonic_genes') and dna_profile.harmonic_genes:
            features.extend(dna_profile.harmonic_genes[:12])
        
        # Add timbral genes if available  
        if hasattr(dna_profile, 'timbral_genes') and dna_profile.timbral_genes:
            features.extend(dna_profile.timbral_genes[:13])
        
        # Add textural genes if available
        if hasattr(dna_profile, 'textural_genes') and dna_profile.textural_genes:
            features.extend(dna_profile.textural_genes[:7])
        
        # Add dynamic genes if available
        if hasattr(dna_profile, 'dynamic_genes') and dna_profile.dynamic_genes:
            features.extend(dna_profile.dynamic_genes[:10])
        
        # Add rhythmic genes if available
        if hasattr(dna_profile, 'rhythmic_genes') and dna_profile.rhythmic_genes:
            features.extend(dna_profile.rhythmic_genes[:8])
        
        # Pad with zeros if needed to ensure consistent dimensionality
        max_features = 60  # 5 + 12 + 13 + 7 + 10 + 8 + some buffer
        while len(features) < max_features:
            features.append(0.0)
        
        return features[:max_features]  # Trim if too long

    def _compute_semantic_positions(self, features: List[List[float]], track_ids: List[str]) -> np.ndarray:
        """Compute 3D semantic positions using dimensionality reduction"""
        features_array = np.array(features)
        
        print(f"🧠 Computing semantic positions from {features_array.shape[1]} features...")
        
        # Standardize features
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features_array)
        
        # Use UMAP if available (better preservation of local and global structure)
        if UMAP_AVAILABLE and len(features) > 15:  # UMAP needs at least 15 samples
            print("🎯 Using UMAP for semantic positioning...")
            reducer = umap.UMAP(
                n_components=3,
                n_neighbors=min(15, len(features) // 3),
                min_dist=0.1,
                metric='euclidean',
                random_state=42
            )
            positions_3d = reducer.fit_transform(features_scaled)
        else:
            # Fall back to t-SNE
            print("🎯 Using t-SNE for semantic positioning...")
            if len(features) > 3:  # t-SNE needs more than 3 samples
                # First reduce to reasonable dimensionality with PCA if needed
                if features_array.shape[1] > 50:
                    pca = PCA(n_components=50)
                    features_scaled = pca.fit_transform(features_scaled)
                
                tsne = TSNE(
                    n_components=3,
                    perplexity=min(30, len(features) // 4),
                    random_state=42,
                    init='pca',
                    learning_rate='auto'
                )
                positions_3d = tsne.fit_transform(features_scaled)
            else:
                # Too few samples, use PCA
                print("⚠️  Too few samples for t-SNE, using PCA...")
                pca = PCA(n_components=min(3, len(features), features_array.shape[1]))
                positions_3d = pca.fit_transform(features_scaled)
                # Pad with zeros if needed
                if positions_3d.shape[1] < 3:
                    padding = np.zeros((positions_3d.shape[0], 3 - positions_3d.shape[1]))
                    positions_3d = np.hstack([positions_3d, padding])
        
        # Scale positions to reasonable range for 3D visualization
        positions_3d = self._scale_positions(positions_3d)
        
        print(f"✅ Computed semantic positions with range: X[{positions_3d[:,0].min():.1f}, {positions_3d[:,0].max():.1f}], Y[{positions_3d[:,1].min():.1f}, {positions_3d[:,1].max():.1f}], Z[{positions_3d[:,2].min():.1f}, {positions_3d[:,2].max():.1f}]")
        
        return positions_3d
    
    def _scale_positions(self, positions: np.ndarray, scale_range: float = 25.0) -> np.ndarray:
        """Scale positions to a reasonable range for 3D visualization"""
        # Center positions around origin
        positions_centered = positions - positions.mean(axis=0)
        
        # Scale to desired range
        max_range = np.max(np.abs(positions_centered))
        if max_range > 0:
            positions_scaled = positions_centered * (scale_range / max_range)
        else:
            positions_scaled = positions_centered
        
        return positions_scaled
    
    def _build_emotional_graph(self, track_ids: List[str], coordinates: List[np.ndarray]):
        """Build graph of emotional relationships"""
        
        # Add nodes to graph
        for i, track_id in enumerate(track_ids):
            self.emotional_graph.add_node(track_id, coordinate=coordinates[i])
        
        # Add edges between emotionally similar tracks
        similarity_threshold = 0.3  # Adjust based on dataset
        
        for i, track_id1 in enumerate(track_ids):
            for j, track_id2 in enumerate(track_ids[i+1:], i+1):
                distance = euclidean(coordinates[i], coordinates[j])
                
                if distance < similarity_threshold and distance > 1e-6:  # Avoid division by zero
                    weight = 1.0 / (distance + 1e-6)  # Add small epsilon to prevent division by zero
                    self.emotional_graph.add_edge(
                        track_id1, track_id2, weight=weight
                    )
    
    def get_coordinate(self, track_id: str) -> Optional[EmotionalCoordinate]:
        """Get emotional coordinate for a track"""
        return self.coordinate_cache.get(track_id)
    
    def find_nearest_tracks(self, target_coord: EmotionalCoordinate, k: int = 5) -> List[Tuple[str, float]]:
        """Find k nearest tracks to a target emotional coordinate"""
        distances = []
        
        for track_id, coord in self.coordinate_cache.items():
            distance = target_coord.distance_to(coord)
            distances.append((track_id, distance))
        
        # Sort by distance and return top k
        distances.sort(key=lambda x: x[1])
        return distances[:k]
    
    def find_emotional_path(self, start_track: str, end_track: str, 
                           max_steps: int = 10) -> List[str]:
        """Find path between two tracks through emotional space using graph traversal"""
        
        if start_track not in self.emotional_graph or end_track not in self.emotional_graph:
            return [start_track, end_track]  # Direct path if no graph connection
        
        try:
            # Use shortest path algorithm on emotional graph
            path = nx.shortest_path(
                self.emotional_graph, start_track, end_track, weight='weight'
            )
            
            # If path is too long, sample points
            if len(path) > max_steps:
                indices = np.linspace(0, len(path)-1, max_steps, dtype=int)
                path = [path[i] for i in indices]
            
            return path
            
        except nx.NetworkXNoPath:
            # If no path exists, create interpolated path
            return self._create_interpolated_path(start_track, end_track, max_steps)
    
    def _create_interpolated_path(self, start_track: str, end_track: str, 
                                max_steps: int = 10) -> List[str]:
        """Create interpolated path when no graph path exists"""
        
        start_coord = self.get_coordinate(start_track)
        end_coord = self.get_coordinate(end_track)
        
        if not start_coord or not end_coord:
            return [start_track, end_track]
        
        # Create interpolated coordinates
        path_tracks = [start_track]
        
        for i in range(1, max_steps - 1):
            t = i / (max_steps - 1)
            
            # Linear interpolation between start and end
            interp_coord = EmotionalCoordinate(
                valence=start_coord.valence + t * (end_coord.valence - start_coord.valence),
                energy=start_coord.energy + t * (end_coord.energy - start_coord.energy),
                complexity=start_coord.complexity + t * (end_coord.complexity - start_coord.complexity),
                tension=start_coord.tension + t * (end_coord.tension - start_coord.tension)
            )
            
            # Find nearest track to interpolated point
            nearest_tracks = self.find_nearest_tracks(interp_coord, k=1)
            if nearest_tracks:
                nearest_track = nearest_tracks[0][0]
                if nearest_track not in path_tracks:  # Avoid duplicates
                    path_tracks.append(nearest_track)
        
        path_tracks.append(end_track)
        return path_tracks
    
    def create_emotional_journey(self, start_track: str, end_track: str,
                               waypoints: List[EmotionalCoordinate] = None,
                               journey_duration: float = 60.0) -> List[EmotionalJourneyPoint]:
        """Create a complete emotional journey with timing"""
        
        # Get basic path
        path_tracks = self.find_emotional_path(start_track, end_track)
        
        # Add waypoint handling if provided
        if waypoints:
            path_tracks = self._incorporate_waypoints(path_tracks, waypoints)
        
        # Create journey points with timing
        journey_points = []
        total_tracks = len(path_tracks)
        
        for i, track_id in enumerate(path_tracks):
            coord = self.get_coordinate(track_id)
            if coord:
                timestamp = (i / (total_tracks - 1)) * journey_duration
                
                # Determine transition type
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
                    transition_type=transition_type
                )
                journey_points.append(journey_point)
        
        return journey_points
    
    def _incorporate_waypoints(self, path_tracks: List[str], 
                             waypoints: List[EmotionalCoordinate]) -> List[str]:
        """Incorporate waypoints into the journey path"""
        # For now, find nearest tracks to waypoints and insert them
        enhanced_path = [path_tracks[0]]  # Start with first track
        
        for waypoint in waypoints:
            nearest_tracks = self.find_nearest_tracks(waypoint, k=1)
            if nearest_tracks:
                waypoint_track = nearest_tracks[0][0]
                if waypoint_track not in enhanced_path:
                    enhanced_path.append(waypoint_track)
        
        enhanced_path.append(path_tracks[-1])  # End with last track
        return enhanced_path
    
    def _is_bridge_track(self, track_id: str, path: List[str]) -> bool:
        """Determine if a track serves as a bridge between different emotional regions"""
        track_index = path.index(track_id)
        
        if track_index == 0 or track_index == len(path) - 1:
            return False
        
        # Check if this track bridges significantly different emotional regions
        prev_coord = self.get_coordinate(path[track_index - 1])
        curr_coord = self.get_coordinate(track_id)
        next_coord = self.get_coordinate(path[track_index + 1])
        
        if not all([prev_coord, curr_coord, next_coord]):
            return False
        
        # Calculate distances
        prev_to_curr = prev_coord.distance_to(curr_coord)
        curr_to_next = curr_coord.distance_to(next_coord)
        prev_to_next = prev_coord.distance_to(next_coord)
        
        # Bridge if current track is significantly closer to both neighbors than they are to each other
        bridge_threshold = 0.7
        return (prev_to_curr + curr_to_next) < (prev_to_next * bridge_threshold)
    
    def analyze_emotional_clusters(self) -> Dict:
        """Analyze emotional clustering in the space"""
        coordinates = np.array([coord.to_array() for coord in self.coordinate_cache.values()])
        track_ids = list(self.coordinate_cache.keys())
        
        if len(coordinates) < 2:
            return {}
        
        # Use PCA for dimensionality analysis
        pca = PCA(n_components=min(4, len(coordinates)))
        pca_coords = pca.fit_transform(coordinates)
        
        # Find emotional clusters using simple k-means-like approach
        from sklearn.cluster import KMeans
        
        n_clusters = min(5, len(coordinates))
        if n_clusters > 1:
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            cluster_labels = kmeans.fit_predict(coordinates)
            
            # Analyze clusters
            clusters = {}
            for i in range(n_clusters):
                cluster_tracks = [track_ids[j] for j, label in enumerate(cluster_labels) if label == i]
                cluster_center = kmeans.cluster_centers_[i]
                
                clusters[f"cluster_{i}"] = {
                    'tracks': cluster_tracks,
                    'center': EmotionalCoordinate(*cluster_center),
                    'size': len(cluster_tracks)
                }
        else:
            clusters = {}
        
        return {
            'pca_explained_variance': pca.explained_variance_ratio_.tolist(),
            'pca_coordinates': pca_coords.tolist(),
            'clusters': clusters,
            'total_tracks': len(track_ids)
        }
    
    def get_emotional_statistics(self) -> Dict:
        """Get statistics about the emotional space"""
        if not self.coordinate_cache:
            return {}
        
        coordinates = np.array([coord.to_array() for coord in self.coordinate_cache.values()])
        
        return {
            'emotional_ranges': {
                'valence': {'min': float(coordinates[:, 0].min()), 'max': float(coordinates[:, 0].max()), 'mean': float(coordinates[:, 0].mean())},
                'energy': {'min': float(coordinates[:, 1].min()), 'max': float(coordinates[:, 1].max()), 'mean': float(coordinates[:, 1].mean())},
                'complexity': {'min': float(coordinates[:, 2].min()), 'max': float(coordinates[:, 2].max()), 'mean': float(coordinates[:, 2].mean())},
                'tension': {'min': float(coordinates[:, 3].min()), 'max': float(coordinates[:, 3].max()), 'mean': float(coordinates[:, 3].mean())}
            },
            'emotional_center': {
                'valence': float(coordinates[:, 0].mean()),
                'energy': float(coordinates[:, 1].mean()),
                'complexity': float(coordinates[:, 2].mean()),
                'tension': float(coordinates[:, 3].mean())
            },
            'emotional_spread': {
                'valence': float(coordinates[:, 0].std()),
                'energy': float(coordinates[:, 1].std()),
                'complexity': float(coordinates[:, 2].std()),
                'tension': float(coordinates[:, 3].std())
            }
        }
    
    def export_visualization_data(self, output_file: str = "data/emotional_space_data.json"):
        """Export data for 3D visualization"""
        
        # Prepare data for Three.js visualization
        visualization_data = {
            'tracks': [],
            'connections': [],
            'clusters': {},
            'statistics': self.get_emotional_statistics()
        }
        
        # Export track data with ranking-based colors
        track_ids = list(self.coordinate_cache.keys())
        total_tracks = len(track_ids)
        
        for track_index, (track_id, coord) in enumerate(self.coordinate_cache.items()):
            # Get additional track information
            dna_profile = self.dna_database.get_dna(track_id)
            
            track_data = {
                'id': track_id,
                'track_id': track_id,  # Ensure both formats for compatibility
                'coordinates': {
                    'valence': float(coord.valence),
                    'energy': float(coord.energy),
                    'complexity': float(coord.complexity),
                    'tension': float(coord.tension)
                },
                'position': {
                    'x': float(coord.x),
                    'y': float(coord.y),
                    'z': float(coord.z)
                },
                'metadata': {}
            }
            
            if dna_profile:
                # Handle key signature - convert string to number if needed
                key_value = 0
                if dna_profile.key_signature is not None:
                    if isinstance(dna_profile.key_signature, (int, float)):
                        key_value = int(dna_profile.key_signature)
                    else:
                        # Map string keys to numbers (C=0, C#=1, D=2, etc.)
                        key_map = {
                            'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 
                            'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 
                            'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
                        }
                        key_value = key_map.get(str(dna_profile.key_signature), 0)
                
                # Handle mode - convert string to number if needed
                mode_value = 0
                if dna_profile.mode is not None:
                    if isinstance(dna_profile.mode, (int, float)):
                        mode_value = int(dna_profile.mode)
                    else:
                        # Map string modes to numbers (Major=1, Minor=0)
                        mode_map = {
                            'Major': 1, 'major': 1, 'MAJOR': 1,
                            'Minor': 0, 'minor': 0, 'MINOR': 0
                        }
                        mode_value = mode_map.get(str(dna_profile.mode), 0)
                
                track_data['metadata'] = {
                    'tempo': float(dna_profile.tempo),
                    'key': key_value,
                    'key_name': str(dna_profile.key_signature) if dna_profile.key_signature is not None else 'C',
                    'mode': mode_value,
                    'mode_name': str(dna_profile.mode) if dna_profile.mode is not None else 'Major',
                    'genetic_fingerprint': dna_profile.get_genetic_fingerprint()
                }
                
                # Calculate colors from different sources
                # 1. Emotional color: ranking-based for maximum diversity
                emotional_color = self._calculate_emotional_color(coord, track_index, total_tracks)
                track_data['emotional_color'] = emotional_color
                
                # 2. Sonic color: from harmonic content (traditional RGB)
                if hasattr(dna_profile, 'harmonic_genes') and dna_profile.harmonic_genes:
                    sonic_color = self._calculate_sonic_color(dna_profile.harmonic_genes)
                    track_data['sonic_color'] = sonic_color
                else:
                    track_data['sonic_color'] = self._calculate_sonic_color()  # Default color
                
                # 3. Hybrid color: blend of emotional and sonic (for variety)
                hybrid_color = {
                    'r': int((emotional_color['r'] + sonic_color['r']) / 2),
                    'g': int((emotional_color['g'] + sonic_color['g']) / 2),
                    'b': int((emotional_color['b'] + sonic_color['b']) / 2),
                    'a': emotional_color.get('a', 255)
                }
                track_data['hybrid_color'] = hybrid_color
                
                # Default to emotional color for primary visualization
                track_data['color'] = emotional_color
            
            visualization_data['tracks'].append(track_data)
        
        # Export connection data (show more connections for richer visualization)
        connections_exported = 0
        max_connections = 20000  # Increased limit for richer visualization
        
        # Sort edges by weight (strongest first) and export only the top ones
        edges_with_weights = [(edge[0], edge[1], edge[2].get('weight', 1.0)) for edge in self.emotional_graph.edges(data=True)]
        edges_with_weights.sort(key=lambda x: x[2], reverse=True)
        
        for track1, track2, weight in edges_with_weights[:max_connections]:
            coord1 = self.get_coordinate(track1)
            coord2 = self.get_coordinate(track2)
            
            if coord1 and coord2:
                connection = {
                    'source': track1,
                    'target': track2,
                    'weight': float(weight),
                    'distance': float(coord1.distance_to(coord2))
                }
                visualization_data['connections'].append(connection)
                connections_exported += 1
        
        print(f"📊 Exported {connections_exported} strongest connections (out of {self.emotional_graph.number_of_edges()} total)")
        
        # Export cluster analysis
        cluster_analysis = self.analyze_emotional_clusters()
        visualization_data['clusters'] = cluster_analysis
        
        # Save to file
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Convert any remaining numpy types to native Python types
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
        
        with open(output_path, 'w') as f:
            json.dump(visualization_data, f, indent=2)
        
        print(f"📊 Exported visualization data to {output_path}")
        return visualization_data
    
    def _calculate_sonic_color(self, harmonic_genes: List[float] = None) -> Dict[str, int]:
        """Convert harmonic content to RGB color"""
        # Map the 12 harmonic components to color space
        # This is a creative interpretation: different frequencies → different colors
        
        if harmonic_genes and len(harmonic_genes) >= 12:
            harmonic_array = np.array(harmonic_genes[:12])  # Ensure we only use first 12
            
            # Normalize to 0-1 range
            if harmonic_array.max() > harmonic_array.min():
                harmonic_array = (harmonic_array - harmonic_array.min()) / (harmonic_array.max() - harmonic_array.min())
            
            # Map to RGB using creative frequency-to-wavelength analogy
            # Lower frequencies (0-4) → Red channel
            # Mid frequencies (4-8) → Green channel  
            # Higher frequencies (8-12) → Blue channel
            
            red = int(255 * np.sum(harmonic_array[0:4]) / 4.0)
            green = int(255 * np.sum(harmonic_array[4:8]) / 4.0)
            blue = int(255 * np.sum(harmonic_array[8:12]) / 4.0)
            
            # Ensure values are in valid range
            red = max(50, min(255, red))    # Minimum 50 to avoid pure black
            green = max(50, min(255, green))
            blue = max(50, min(255, blue))
            
            return {'r': red, 'g': green, 'b': blue}
        else:
            # Default color if no harmonic data
            return {'r': 120, 'g': 120, 'b': 120}
    
    def _calculate_emotional_color(self, coord: EmotionalCoordinate, track_index: int = None, total_tracks: int = None) -> Dict[str, int]:
        """Ranking-based color system - every track gets a unique vibrant color"""
        
        # PASTEL/WHITER COLORS - More appealing for unselected items
        if track_index is not None and total_tracks is not None and total_tracks > 1:
            # Distribute hues evenly across spectrum
            hue = (track_index * 360 / total_tracks) % 360
            
            # Add small variation based on emotional coordinates
            valence_offset = (coord.valence + 0.2) * 10
            energy_offset = (coord.energy - 0.5) * 8
            hue = (hue + valence_offset + energy_offset) % 360
            
            # Convert to RGB with higher saturation 
            import colorsys
            # More saturated but still appealing
            r, g, b = colorsys.hls_to_rgb(hue / 360, 0.65, 0.85)  # 85% saturation, 65% lightness
            
            # Convert to 0-255 range
            red = int(r * 255)
            green = int(g * 255) 
            blue = int(b * 255)
            
        else:
            # Fallback to appealing pink
            red, green, blue = 255, 180, 200
        
        # Full alpha for maximum impact
        alpha = 255
        
        return {'r': red, 'g': green, 'b': blue, 'a': alpha}
    
    def generate_3d_layout(self) -> Dict:
        """Generate 3D positions for tracks using force-directed layout based on relationships"""
        import networkx as nx
        
        if len(self.emotional_graph.nodes()) == 0:
            return {"tracks": [], "connections": []}
        
        print(f"🎯 Generating 3D layout for {len(self.emotional_graph.nodes())} tracks...")
        
        # Use spring layout with 3D positions
        # NetworkX spring_layout supports 3D with dim=3
        try:
            pos_3d = nx.spring_layout(
                self.emotional_graph, 
                dim=3,
                k=3.0,  # Optimal distance between nodes
                iterations=100,
                weight='weight'
            )
        except:
            # Fallback to 2D layout if 3D fails
            pos_2d = nx.spring_layout(self.emotional_graph, k=3.0, iterations=100, weight='weight')
            pos_3d = {}
            for node, (x, y) in pos_2d.items():
                # Add z-coordinate based on emotional complexity
                coord = self.get_coordinate(node)
                z = coord.complexity * 10 if coord else 0
                pos_3d[node] = np.array([x * 20, y * 20, z])
        
        # Scale positions to reasonable 3D space
        scale_factor = 15.0
        positioned_tracks = []
        
        for track_id, position in pos_3d.items():
            coord = self.get_coordinate(track_id)
            dna_profile = self.dna_database.get_dna(track_id)
            
            if coord and dna_profile:
                track_data = {
                    'track_id': track_id,
                    'position': {
                        'x': float(position[0] * scale_factor),
                        'y': float(position[1] * scale_factor), 
                        'z': float(position[2] * scale_factor) if len(position) > 2 else float(coord.complexity * scale_factor)
                    },
                    'emotional_coordinates': coord.to_dict(),
                    'sonic_dna': {
                        'features': {
                            'valence': coord.valence,
                            'energy': coord.energy,
                            'danceability': coord.complexity,  # Map complexity to danceability for compatibility
                            'tempo': dna_profile.tempo,
                            'key': dna_profile.key_signature,
                            'mode': dna_profile.mode
                        },
                        'genetic_fingerprint': dna_profile.get_genetic_fingerprint()
                    },
                    'emotional_color': self._calculate_emotional_color(coord),
                    'sonic_color': self._calculate_sonic_color(dna_profile.harmonic_genes if hasattr(dna_profile, 'harmonic_genes') else None),
                    'color': self._calculate_emotional_color(coord, track_index, total_tracks)  # Default to emotional color
                }
                positioned_tracks.append(track_data)
        
        # Generate connection data
        connections = []
        for edge in self.emotional_graph.edges(data=True):
            source, target, data = edge
            if source in pos_3d and target in pos_3d:
                connection = {
                    'source': source,
                    'target': target,
                    'weight': data.get('weight', 1.0),
                    'strength': min(data.get('weight', 1.0), 5.0)  # Cap for visualization
                }
                connections.append(connection)
        
        result = {
            'tracks': positioned_tracks,
            'connections': connections,
            'layout_info': {
                'algorithm': 'force_directed_3d',
                'node_count': len(positioned_tracks),
                'edge_count': len(connections),
                'scale_factor': scale_factor
            }
        }
        
        print(f"✅ Generated 3D layout with {len(positioned_tracks)} positioned tracks and {len(connections)} connections")
        return result

if __name__ == "__main__":
    # Test the emotional space mapper
    print("🗺️  Testing Emotional Space Mapper...")
    
    # Load DNA database
    dna_db = SonicDNADatabase()
    
    if not dna_db.get_all_profiles():
        print("⚠️  No DNA profiles found. Run sonic_dna_extractor.py first.")
        exit(1)
    
    # Create emotional space mapper
    mapper = EmotionalSpaceMapper(dna_db)
    
    # Get some example tracks
    profiles = dna_db.get_all_profiles()
    track_ids = [profile.track_id for profile in profiles[:5]]
    
    print(f"\n🎵 Available tracks:")
    for i, track_id in enumerate(track_ids):
        coord = mapper.get_coordinate(track_id)
        if coord:
            print(f"  {i+1}. {track_id}")
            print(f"     Emotional: V={coord.valence:.2f}, E={coord.energy:.2f}, C={coord.complexity:.2f}, T={coord.tension:.2f}")
    
    # Test journey creation
    if len(track_ids) >= 2:
        start_track = track_ids[0]
        end_track = track_ids[-1]
        
        print(f"\n🚀 Creating emotional journey:")
        print(f"  From: {start_track}")
        print(f"  To: {end_track}")
        
        journey = mapper.create_emotional_journey(start_track, end_track, journey_duration=45.0)
        
        print(f"\n🛤️  Journey path ({len(journey)} steps):")
        for point in journey:
            print(f"  {point.timestamp:.1f}s: {point.track_id} ({point.transition_type})")
            coord = point.coordinate
            print(f"         Emotional: V={coord.valence:.2f}, E={coord.energy:.2f}, C={coord.complexity:.2f}, T={coord.tension:.2f}")
    
    # Get emotional statistics
    print(f"\n📊 Emotional Space Statistics:")
    stats = mapper.get_emotional_statistics()
    for category, data in stats.items():
        print(f"  {category}: {data}")
    
    # Export visualization data
    print(f"\n💾 Exporting visualization data...")
    viz_data = mapper.export_visualization_data()
    print(f"  ✅ Exported {len(viz_data['tracks'])} tracks and {len(viz_data['connections'])} connections")