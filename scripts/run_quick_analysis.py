#!/usr/bin/env python3
"""
Quick Sonic DNA Analysis Pipeline
Processes a subset of tracks for testing
"""

import sys
import os
sys.path.append('.')
sys.path.append('./src')

import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from tqdm import tqdm
import warnings
warnings.filterwarnings('ignore')

from src.core.library_scanner import MusicLibraryScanner
from src.analysis.sonic_dna_extractor import SonicDNAExtractor, SonicDNADatabase
from src.analysis.emotional_space_mapper import EmotionalSpaceMapper

def extract_track_dna(track_info):
    """
    Worker function for parallel DNA extraction
    """
    filepath, track_id = track_info
    
    try:
        # Create extractor for this process
        extractor = SonicDNAExtractor()
        
        # Extract DNA
        sonic_dna = extractor.extract_sonic_dna(filepath, track_id=track_id)
        
        return {'success': True, 'data': sonic_dna, 'track_id': track_id}
        
    except Exception as e:
        return {'success': False, 'error': str(e), 'track_id': track_id, 'filepath': filepath}

class QuickAnalyzer:
    """Quick analysis pipeline for testing"""
    
    def __init__(self, library_path: str = "data/complete_library", max_tracks: int = 20):
        self.library_path = Path(library_path)
        self.max_tracks = max_tracks
        self.output_dir = Path("analysis_results")
        self.output_dir.mkdir(exist_ok=True)
        
        # Initialize components
        self.scanner = MusicLibraryScanner()
        self.dna_database = SonicDNADatabase()
        self.space_mapper = None
        
        print(f"🔬 Initialized quick analyzer for: {self.library_path}")
        print(f"📊 Will process up to {max_tracks} tracks")
    
    def step1_scan_library(self):
        """Step 1: Scan the music library"""
        print("\n" + "="*60)
        print("🔍 STEP 1: Quick Library Scan")
        print("="*60)
        
        tracks = self.scanner.scan_directory(str(self.library_path), force_rescan=False)
        all_tracks = self.scanner.get_tracks()
        
        # Limit to max_tracks for quick testing
        test_tracks = all_tracks[:self.max_tracks]
        
        # Get statistics
        stats = self.scanner.get_library_stats()
        
        print(f"\n📊 Library Statistics:")
        print(f"   Total tracks: {stats['total_tracks']}")
        print(f"   Testing on: {len(test_tracks)} tracks")
        print(f"   Artists: {len(set(t.artist for t in test_tracks))}")
        print(f"   Albums: {len(set(f'{t.artist} - {t.album}' for t in test_tracks))}")
        
        return test_tracks
    
    def step2_extract_sonic_dna(self, tracks):
        """Step 2: Extract sonic DNA from tracks using parallel processing"""
        print("\n" + "="*60)
        print("🧬 STEP 2: Extracting Sonic DNA (Parallel)")
        print("="*60)
        
        processed_count = 0
        error_count = 0
        
        print(f"🎵 Processing {len(tracks)} audio files...")
        
        # Prepare track info for parallel processing
        track_infos = []
        for track in tracks:
            track_id = f"{track.artist}_{track.album}_{track.title}".replace(" ", "_").replace("/", "_")
            track_infos.append((track.filepath, track_id))
        
        # Determine number of processes (use fewer for testing)
        num_processes = min(mp.cpu_count(), len(track_infos), 4)  # Limit to 4 processes
        print(f"🚀 Using {num_processes} parallel processes")
        
        # Process tracks in parallel
        with ProcessPoolExecutor(max_workers=num_processes) as executor:
            # Submit all jobs
            future_to_track = {
                executor.submit(extract_track_dna, track_info): track_info 
                for track_info in track_infos
            }
            
            # Process results as they complete
            for future in tqdm(as_completed(future_to_track), total=len(track_infos), desc="Extracting DNA"):
                result = future.result()
                
                if result['success']:
                    # Store in database
                    self.dna_database.store_dna(result['data'])
                    processed_count += 1
                    
                    # Print progress for first few
                    if processed_count <= 5:
                        dna = result['data']
                        print(f"   ✅ {result['track_id']}: {dna.key_signature} {dna.mode}, {dna.tempo:.1f} BPM")
                        
                else:
                    print(f"   ❌ Error processing {result['track_id']}: {result['error']}")
                    error_count += 1
        
        print(f"\n✅ DNA Extraction Complete!")
        print(f"   Processed: {processed_count}")
        print(f"   Errors: {error_count}")
        if processed_count + error_count > 0:
            print(f"   Success rate: {(processed_count/(processed_count+error_count))*100:.1f}%")
        
        return processed_count
    
    def step3_map_emotional_space(self):
        """Step 3: Map tracks to emotional space"""
        print("\n" + "="*60)
        print("🌌 STEP 3: Mapping Emotional Space")
        print("="*60)
        
        # Initialize emotional space mapper
        self.space_mapper = EmotionalSpaceMapper(self.dna_database)
        
        # Get all tracks that have been processed
        all_profiles = self.dna_database.get_all_profiles()
        mapped_count = len(all_profiles)
        
        print(f"✅ Mapped {mapped_count} tracks to emotional space")
        
        # Export visualization data
        viz_data = self.space_mapper.export_visualization_data()
        
        print(f"💾 Saved emotional space data for visualization")
        print(f"   Tracks: {len(viz_data['tracks'])}")
        print(f"   Connections: {len(viz_data['connections'])}")
        
        # Print some sample tracks
        if viz_data['tracks']:
            print(f"\n🎵 Sample tracks in emotional space:")
            for i, track in enumerate(viz_data['tracks'][:5]):
                coords = track['coordinates']
                print(f"   {i+1}. {track['id']}")
                print(f"      V={coords['valence']:.2f}, E={coords['energy']:.2f}, C={coords['complexity']:.2f}")
        
        return viz_data
    
    def run_quick_analysis(self):
        """Run the complete quick analysis pipeline"""
        print("🚀 Starting Quick Sonic DNA Analysis...")
        
        try:
            # Step 1: Scan library
            tracks = self.step1_scan_library()
            
            if not tracks:
                print("❌ No tracks found!")
                return
            
            # Step 2: Extract DNA
            processed_count = self.step2_extract_sonic_dna(tracks)
            
            if processed_count == 0:
                print("❌ No tracks processed successfully!")
                return
            
            # Step 3: Map emotional space
            viz_data = self.step3_map_emotional_space()
            
            print(f"\n🎉 Quick analysis complete!")
            print(f"   📊 Processed {processed_count} tracks")
            print(f"   🌌 Mapped to emotional space")
            print(f"   📁 Data saved to: data/emotional_space_data.json")
            print(f"\n🔥 Ready to start the visualization server!")
            
        except Exception as e:
            print(f"❌ Analysis failed: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    # Run quick analysis on subset of tracks
    analyzer = QuickAnalyzer(max_tracks=30)  # Process 30 tracks for testing
    analyzer.run_quick_analysis()
