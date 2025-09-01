#!/usr/bin/env python3
"""
Demo script to showcase the Sonic DNA Music Analyzer
"""

import sys
sys.path.append('.')

from src.analysis.sonic_dna_extractor import SonicDNADatabase, SonicDNAExtractor
from src.analysis.emotional_space_mapper import EmotionalSpaceMapper
import json
from pathlib import Path

def main():
    print("🧬 Sonic DNA Music Analyzer Demo")
    print("=" * 50)
    
    # Initialize components
    print("\n1️⃣ Loading DNA Database...")
    dna_db = SonicDNADatabase()
    profiles = dna_db.get_all_profiles()
    
    if not profiles:
        print("❌ No DNA profiles found. Please run sonic_dna_extractor.py first")
        return
    
    print(f"✅ Loaded {len(profiles)} DNA profiles")
    
    # Show some genetic analysis
    print("\n2️⃣ Genetic Analysis Examples:")
    for i, profile in enumerate(profiles[:3]):
        print(f"  🎵 {profile.track_id}")
        print(f"     DNA: {profile.get_genetic_fingerprint()}")
        print(f"     Key: {profile.key_signature} {profile.mode}")
        print(f"     Tempo: {profile.tempo:.1f} BPM")
        print(f"     Emotion: V={profile.valence:.2f}, E={profile.energy:.2f}, C={profile.complexity:.2f}")
        
        if i < len(profiles) - 1:
            # Show similarity to next track
            similarity = dna_db.calculate_genetic_similarity(profile, profiles[i+1])
            print(f"     🧬 Similarity to next track: {similarity:.3f}")
        print()
    
    # Emotional space analysis
    print("3️⃣ Emotional Space Mapping...")
    mapper = EmotionalSpaceMapper(dna_db)
    
    stats = mapper.get_emotional_statistics()
    print(f"  📊 Emotional center: V={stats['emotional_center']['valence']:.2f}, E={stats['emotional_center']['energy']:.2f}")
    print(f"  📈 Emotional spread: V={stats['emotional_spread']['valence']:.2f}, E={stats['emotional_spread']['energy']:.2f}")
    
    # Journey creation
    print("\n4️⃣ Emotional Journey Creation...")
    if len(profiles) >= 2:
        start_track = profiles[0].track_id
        end_track = profiles[-1].track_id
        
        print(f"  🚀 Creating journey from:")
        print(f"     Start: {start_track}")
        print(f"     End: {end_track}")
        
        journey = mapper.create_emotional_journey(start_track, end_track, journey_duration=30.0)
        
        print(f"  🛤️  Journey path ({len(journey)} steps):")
        for point in journey:
            print(f"     {point.timestamp:.1f}s: {point.track_id} ({point.transition_type})")
    
    # Visualization data export
    print("\n5️⃣ Exporting Visualization Data...")
    viz_data = mapper.export_visualization_data()
    
    print(f"  💾 Exported {len(viz_data['tracks'])} tracks for 3D visualization")
    print(f"  🔗 Generated {len(viz_data['connections'])} emotional connections")
    
    # Show some sonic colors
    print("\n6️⃣ Sonic Color Analysis:")
    for track in viz_data['tracks'][:3]:
        if 'sonic_color' in track:
            color = track['sonic_color']
            print(f"  🎨 {track['id']}")
            print(f"     Color: RGB({color['r']}, {color['g']}, {color['b']})")
    
    print("\n✅ Demo complete! Check out the 3D visualization at:")
    print("   🌐 http://localhost:8000/visualizer")
    print("   📚 API docs: http://localhost:8000/docs")

if __name__ == "__main__":
    main()