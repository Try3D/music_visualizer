#!/usr/bin/env python3
"""
Advanced Sonic DNA Extractor
Extracts deep audio features and creates genetic fingerprints for music tracks
"""

import numpy as np
import librosa
import librosa.display
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
import json
from pathlib import Path
import hashlib
from scipy import stats
from scipy.spatial.distance import cosine, euclidean
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')

@dataclass
class SonicDNA:
    """Represents the complete sonic genetic profile of a track"""
    
    # Core genetic sequences
    harmonic_genes: List[float]      # 12-dimensional chroma vector
    rhythmic_genes: List[float]      # Temporal pattern sequence
    timbral_genes: List[float]       # MFCC spectral characteristics
    textural_genes: List[float]      # Spectral contrast patterns
    dynamic_genes: List[float]       # Energy envelope variations
    
    # Derived characteristics
    tempo: float
    key_signature: str
    mode: str  # Major/Minor
    
    # Emotional coordinates
    valence: float      # Happy (1) vs Sad (-1)
    energy: float       # Energetic (1) vs Calm (0)
    complexity: float   # Complex (1) vs Simple (0)
    tension: float      # Tense (1) vs Relaxed (0)
    
    # Metadata
    track_id: str
    file_hash: str
    analysis_version: str = "1.0"
    
    def to_dict(self) -> Dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'SonicDNA':
        return cls(**data)
    
    def get_genetic_fingerprint(self) -> str:
        """Generate a compact string representation of the genetic code"""
        # Combine all genetic sequences
        combined = (
            self.harmonic_genes + self.rhythmic_genes + 
            self.timbral_genes + self.textural_genes + self.dynamic_genes
        )
        
        # Create hash-like representation
        fingerprint = hashlib.sha256(str(combined).encode()).hexdigest()[:16]
        return fingerprint
    
    def get_emotional_coordinates(self) -> Tuple[float, float, float, float]:
        """Get 4D emotional space coordinates"""
        return (self.valence, self.energy, self.complexity, self.tension)

class SonicDNAExtractor:
    """Advanced audio feature extraction for genetic analysis"""
    
    def __init__(self, sample_rate: int = 22050, hop_length: int = 512):
        self.sample_rate = sample_rate
        self.hop_length = hop_length
        self.frame_length = hop_length * 2
        
        # Musical key detection
        self.chromatic_scale = ['C', 'C#', 'D', 'D#', 'E', 'F', 
                               'F#', 'G', 'G#', 'A', 'A#', 'B']
        
        # Major/minor profile templates (Krumhansl-Schmuckler)
        self.major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 
                                      2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        self.minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 
                                      2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    
    def load_audio(self, filepath: str) -> Tuple[np.ndarray, float]:
        """Load audio file and return samples + duration"""
        try:
            y, sr = librosa.load(filepath, sr=self.sample_rate)
            duration = len(y) / sr
            return y, duration
        except Exception as e:
            raise Exception(f"Error loading audio file {filepath}: {e}")
    
    def extract_harmonic_genes(self, y: np.ndarray) -> List[float]:
        """Extract 12-dimensional harmonic genetic sequence"""
        # Separate harmonic content
        y_harmonic = librosa.effects.harmonic(y)
        
        # Compute chroma features (12-dimensional harmonic content)
        chroma = librosa.feature.chroma_stft(
            y=y_harmonic, sr=self.sample_rate, hop_length=self.hop_length
        )
        
        # Average chroma across time to get characteristic harmonic profile
        harmonic_genes = np.mean(chroma, axis=1).tolist()
        
        # Normalize to create consistent genetic representation
        harmonic_genes = (np.array(harmonic_genes) / np.sum(harmonic_genes)).tolist()
        
        return harmonic_genes
    
    def extract_rhythmic_genes(self, y: np.ndarray) -> List[float]:
        """Extract rhythmic pattern genetic sequence"""
        # Compute onset strength function
        onset_env = librosa.onset.onset_strength(
            y=y, sr=self.sample_rate, hop_length=self.hop_length
        )
        
        # Extract tempo and beat positions
        tempo, beats = librosa.beat.beat_track(
            onset_envelope=onset_env, sr=self.sample_rate, hop_length=self.hop_length
        )
        
        # Create rhythmic pattern from beat intervals
        if len(beats) > 1:
            beat_intervals = np.diff(beats)
            # Normalize and quantize to create genetic sequence
            rhythmic_pattern = np.histogram(beat_intervals, bins=8)[0]
            rhythmic_genes = (rhythmic_pattern / np.sum(rhythmic_pattern)).tolist()
        else:
            rhythmic_genes = [0.125] * 8  # Default uniform pattern
        
        return rhythmic_genes
    
    def extract_timbral_genes(self, y: np.ndarray) -> List[float]:
        """Extract timbral characteristic genetic sequence (MFCC)"""
        # Compute MFCC (Mel-frequency cepstral coefficients)
        mfcc = librosa.feature.mfcc(
            y=y, sr=self.sample_rate, n_mfcc=13, hop_length=self.hop_length
        )
        
        # Use mean MFCC values as timbral genetic signature
        timbral_genes = np.mean(mfcc, axis=1).tolist()
        
        # Normalize for consistent representation
        scaler = StandardScaler()
        timbral_genes = scaler.fit_transform(np.array(timbral_genes).reshape(-1, 1)).flatten().tolist()
        
        return timbral_genes
    
    def extract_textural_genes(self, y: np.ndarray) -> List[float]:
        """Extract spectral texture genetic sequence"""
        # Compute spectral contrast (brightness/darkness across frequency bands)
        contrast = librosa.feature.spectral_contrast(
            y=y, sr=self.sample_rate, hop_length=self.hop_length, n_bands=6
        )
        
        # Use mean contrast values as textural genetic signature
        textural_genes = np.mean(contrast, axis=1).tolist()
        
        return textural_genes
    
    def extract_dynamic_genes(self, y: np.ndarray) -> List[float]:
        """Extract energy dynamics genetic sequence"""
        # Compute RMS energy
        rms = librosa.feature.rms(y=y, hop_length=self.hop_length)[0]
        
        # Compute spectral rolloff (frequency below which 85% of energy is contained)
        rolloff = librosa.feature.spectral_rolloff(
            y=y, sr=self.sample_rate, hop_length=self.hop_length
        )[0]
        
        # Create dynamic pattern from energy variations
        # Quantize energy levels into bins
        energy_hist = np.histogram(rms, bins=8)[0]
        rolloff_hist = np.histogram(rolloff, bins=8)[0]
        
        # Combine energy and frequency dynamics
        dynamic_pattern = np.concatenate([energy_hist, rolloff_hist])
        dynamic_genes = (dynamic_pattern / np.sum(dynamic_pattern)).tolist()
        
        return dynamic_genes
    
    def detect_key_and_mode(self, harmonic_genes: List[float]) -> Tuple[str, str]:
        """Detect musical key and mode using Krumhansl-Schmuckler algorithm"""
        chroma_vector = np.array(harmonic_genes)
        
        # Correlate with major and minor profiles for each key
        key_scores = []
        
        for i in range(12):
            # Rotate profiles to test each key
            major_rotated = np.roll(self.major_profile, i)
            minor_rotated = np.roll(self.minor_profile, i)
            
            # Calculate correlation
            major_corr = np.corrcoef(chroma_vector, major_rotated)[0, 1]
            minor_corr = np.corrcoef(chroma_vector, minor_rotated)[0, 1]
            
            key_scores.append({
                'key': self.chromatic_scale[i],
                'major_score': major_corr if not np.isnan(major_corr) else 0,
                'minor_score': minor_corr if not np.isnan(minor_corr) else 0
            })
        
        # Find best key and mode
        best_major = max(key_scores, key=lambda x: x['major_score'])
        best_minor = max(key_scores, key=lambda x: x['minor_score'])
        
        if best_major['major_score'] > best_minor['minor_score']:
            return best_major['key'], 'Major'
        else:
            return best_minor['key'], 'Minor'
    
    def calculate_emotional_coordinates(self, y: np.ndarray, 
                                      harmonic_genes: List[float],
                                      dynamic_genes: List[float]) -> Tuple[float, float, float, float]:
        """Calculate 4D emotional space coordinates"""
        
        # 1. Valence (Happy vs Sad)
        # Based on major/minor tendency and brightness
        major_weight = np.sum(np.array(harmonic_genes)[[0, 2, 4, 5, 7, 9, 11]])  # Major scale degrees
        minor_weight = np.sum(np.array(harmonic_genes)[[0, 2, 3, 5, 7, 8, 10]])  # Minor scale degrees
        
        spectral_centroid = np.mean(librosa.feature.spectral_centroid(
            y=y, sr=self.sample_rate
        ))
        brightness = (spectral_centroid - 1000) / 3000  # Normalize around typical range
        
        valence = (major_weight - minor_weight) + brightness * 0.3
        valence = np.clip(valence, -1, 1)
        
        # 2. Energy (Energetic vs Calm)
        rms_energy = np.mean(librosa.feature.rms(y=y))
        tempo = librosa.beat.tempo(y=y, sr=self.sample_rate)[0]
        
        energy = (rms_energy * 10) + ((tempo - 120) / 60)  # Normalize around 120 BPM
        energy = np.clip(energy, 0, 1)
        
        # 3. Complexity (Complex vs Simple)
        spectral_bandwidth = np.mean(librosa.feature.spectral_bandwidth(
            y=y, sr=self.sample_rate
        ))
        zero_crossing_rate = np.mean(librosa.feature.zero_crossing_rate(y))
        
        complexity = (spectral_bandwidth / 4000) + (zero_crossing_rate * 2)
        complexity = np.clip(complexity, 0, 1)
        
        # 4. Tension (Tense vs Relaxed)
        # Based on dissonance and dynamic range
        harmonic_entropy = -np.sum(np.array(harmonic_genes) * np.log2(np.array(harmonic_genes) + 1e-10))
        dynamic_range = np.std(dynamic_genes[:8])  # Energy variation
        
        tension = (harmonic_entropy / 4) + dynamic_range
        tension = np.clip(tension, 0, 1)
        
        return float(valence), float(energy), float(complexity), float(tension)
    
    def extract_sonic_dna(self, filepath: str, track_id: Optional[str] = None) -> SonicDNA:
        """Extract complete sonic DNA profile from audio file"""
        
        print(f"🧬 Extracting sonic DNA from: {Path(filepath).name}")
        
        # Load audio
        y, duration = self.load_audio(filepath)
        
        # Generate track ID if not provided
        if track_id is None:
            track_id = hashlib.md5(filepath.encode()).hexdigest()[:8]
        
        # Calculate file hash for change detection
        file_hash = hashlib.md5(str(y).encode()).hexdigest()[:16]
        
        # Extract genetic sequences
        print("  🧬 Extracting harmonic genes...")
        harmonic_genes = self.extract_harmonic_genes(y)
        
        print("  🥁 Extracting rhythmic genes...")
        rhythmic_genes = self.extract_rhythmic_genes(y)
        
        print("  🎨 Extracting timbral genes...")
        timbral_genes = self.extract_timbral_genes(y)
        
        print("  ✨ Extracting textural genes...")
        textural_genes = self.extract_textural_genes(y)
        
        print("  ⚡ Extracting dynamic genes...")
        dynamic_genes = self.extract_dynamic_genes(y)
        
        # Detect musical characteristics
        print("  🎼 Detecting key and mode...")
        key_signature, mode = self.detect_key_and_mode(harmonic_genes)
        
        # Extract tempo
        tempo = float(librosa.beat.tempo(y=y, sr=self.sample_rate)[0])
        
        # Calculate emotional coordinates
        print("  😊 Mapping emotional coordinates...")
        valence, energy, complexity, tension = self.calculate_emotional_coordinates(
            y, harmonic_genes, dynamic_genes
        )
        
        # Create SonicDNA object
        sonic_dna = SonicDNA(
            harmonic_genes=harmonic_genes,
            rhythmic_genes=rhythmic_genes,
            timbral_genes=timbral_genes,
            textural_genes=textural_genes,
            dynamic_genes=dynamic_genes,
            tempo=tempo,
            key_signature=key_signature,
            mode=mode,
            valence=valence,
            energy=energy,
            complexity=complexity,
            tension=tension,
            track_id=track_id,
            file_hash=file_hash
        )
        
        print(f"  ✅ DNA extracted: {key_signature} {mode}, {tempo:.1f} BPM")
        print(f"     Emotional coords: V={valence:.2f}, E={energy:.2f}, C={complexity:.2f}, T={tension:.2f}")
        
        return sonic_dna

class SonicDNADatabase:
    """Database for storing and retrieving sonic DNA profiles"""
    
    def __init__(self, db_path: str = "data/sonic_dna"):
        self.db_path = Path(db_path)
        self.db_path.mkdir(parents=True, exist_ok=True)
        self.dna_file = self.db_path / "sonic_dna_profiles.json"
        
        # Load existing profiles
        self.profiles = self._load_profiles()
    
    def _load_profiles(self) -> Dict[str, SonicDNA]:
        """Load DNA profiles from file"""
        if self.dna_file.exists():
            try:
                with open(self.dna_file, 'r') as f:
                    data = json.load(f)
                    return {
                        track_id: SonicDNA.from_dict(profile) 
                        for track_id, profile in data.items()
                    }
            except Exception as e:
                print(f"⚠️  Error loading DNA profiles: {e}")
                return {}
        return {}
    
    def _save_profiles(self):
        """Save DNA profiles to file"""
        try:
            data = {
                track_id: profile.to_dict() 
                for track_id, profile in self.profiles.items()
            }
            with open(self.dna_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"⚠️  Error saving DNA profiles: {e}")
    
    def store_dna(self, sonic_dna: SonicDNA):
        """Store a sonic DNA profile"""
        self.profiles[sonic_dna.track_id] = sonic_dna
        self._save_profiles()
    
    def get_dna(self, track_id: str) -> Optional[SonicDNA]:
        """Retrieve a sonic DNA profile"""
        return self.profiles.get(track_id)
    
    def get_all_profiles(self) -> List[SonicDNA]:
        """Get all DNA profiles"""
        return list(self.profiles.values())
    
    def calculate_genetic_similarity(self, dna1: SonicDNA, dna2: SonicDNA) -> float:
        """Calculate genetic similarity between two DNA profiles"""
        
        # Calculate similarity for each genetic component
        harmonic_sim = 1 - cosine(dna1.harmonic_genes, dna2.harmonic_genes)
        rhythmic_sim = 1 - cosine(dna1.rhythmic_genes, dna2.rhythmic_genes)
        timbral_sim = 1 - cosine(dna1.timbral_genes, dna2.timbral_genes)
        textural_sim = 1 - cosine(dna1.textural_genes, dna2.textural_genes)
        dynamic_sim = 1 - cosine(dna1.dynamic_genes, dna2.dynamic_genes)
        
        # Weighted combination (harmony and rhythm are most important)
        genetic_similarity = (
            harmonic_sim * 0.35 +    # Harmonic content is crucial
            rhythmic_sim * 0.25 +    # Rhythm creates the groove
            timbral_sim * 0.20 +     # Timbre provides character
            textural_sim * 0.10 +    # Texture adds dimension
            dynamic_sim * 0.10       # Dynamics provide energy
        )
        
        return max(0, genetic_similarity)  # Ensure non-negative
    
    def find_genetic_relatives(self, target_dna: SonicDNA, top_k: int = 10) -> List[Tuple[SonicDNA, float]]:
        """Find tracks with similar genetic makeup"""
        similarities = []
        
        for profile in self.profiles.values():
            if profile.track_id != target_dna.track_id:
                similarity = self.calculate_genetic_similarity(target_dna, profile)
                similarities.append((profile, similarity))
        
        # Sort by similarity and return top k
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]
    
    def get_statistics(self) -> Dict:
        """Get database statistics"""
        if not self.profiles:
            return {}
        
        profiles = list(self.profiles.values())
        
        return {
            'total_profiles': len(profiles),
            'avg_tempo': np.mean([p.tempo for p in profiles]),
            'tempo_range': (min(p.tempo for p in profiles), max(p.tempo for p in profiles)),
            'key_distribution': self._get_key_distribution(profiles),
            'mode_distribution': self._get_mode_distribution(profiles),
            'emotional_ranges': {
                'valence': (min(p.valence for p in profiles), max(p.valence for p in profiles)),
                'energy': (min(p.energy for p in profiles), max(p.energy for p in profiles)),
                'complexity': (min(p.complexity for p in profiles), max(p.complexity for p in profiles)),
                'tension': (min(p.tension for p in profiles), max(p.tension for p in profiles))
            }
        }
    
    def _get_key_distribution(self, profiles: List[SonicDNA]) -> Dict[str, int]:
        """Get distribution of musical keys"""
        key_counts = {}
        for profile in profiles:
            key = profile.key_signature
            key_counts[key] = key_counts.get(key, 0) + 1
        return key_counts
    
    def _get_mode_distribution(self, profiles: List[SonicDNA]) -> Dict[str, int]:
        """Get distribution of major/minor modes"""
        mode_counts = {}
        for profile in profiles:
            mode = profile.mode
            mode_counts[mode] = mode_counts.get(mode, 0) + 1
        return mode_counts

if __name__ == "__main__":
    # Test the DNA extractor on our sample tracks
    extractor = SonicDNAExtractor()
    database = SonicDNADatabase()
    
    # Find sample tracks
    sample_dir = Path("data/sample_tracks")
    audio_files = []
    for ext in ['.flac', '.mp3', '.wav', '.m4a']:
        audio_files.extend(sample_dir.rglob(f"*{ext}"))
    
    # Filter out problematic files (._* files)
    audio_files = [f for f in audio_files if not f.name.startswith('._')]
    
    print(f"🧬 Processing {len(audio_files)} audio files for DNA extraction...")
    
    # Extract DNA from each file
    for audio_file in audio_files:
        try:
            # Create track ID from path
            track_id = f"{audio_file.parent.parent.name}_{audio_file.parent.name}_{audio_file.stem}"
            
            # Extract DNA
            sonic_dna = extractor.extract_sonic_dna(str(audio_file), track_id)
            
            # Store in database
            database.store_dna(sonic_dna)
            
            print(f"  💾 Stored DNA for: {track_id}")
            
        except Exception as e:
            print(f"  ❌ Error processing {audio_file}: {e}")
            continue
    
    # Display database statistics
    print(f"\n📊 Sonic DNA Database Statistics:")
    stats = database.get_statistics()
    for key, value in stats.items():
        print(f"  {key}: {value}")
    
    # Demonstrate genetic similarity
    profiles = database.get_all_profiles()
    if len(profiles) >= 2:
        print(f"\n🧬 Genetic Similarity Examples:")
        target_dna = profiles[0]
        relatives = database.find_genetic_relatives(target_dna, top_k=3)
        
        print(f"Target: {target_dna.track_id}")
        print(f"Genetic relatives:")
        for relative_dna, similarity in relatives:
            print(f"  {relative_dna.track_id}: {similarity:.3f} similarity")