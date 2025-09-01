#!/usr/bin/env python3
"""
Track UUID Manager
Manages unique UUID identifiers for tracks to solve URL encoding and identification issues
"""

import uuid
import json
from pathlib import Path
from typing import Dict, Optional, Tuple, List
import hashlib

class TrackUUIDManager:
    """Manages UUID mapping for tracks to solve identification issues"""
    
    def __init__(self, mapping_file: str = "data/track_uuid_mapping.json"):
        self.mapping_file = Path(mapping_file)
        self.uuid_to_track: Dict[str, str] = {}
        self.track_to_uuid: Dict[str, str] = {}
        self.track_metadata: Dict[str, Dict] = {}
        self.load_mapping()
    
    def load_mapping(self):
        """Load existing UUID mapping from file"""
        if self.mapping_file.exists():
            try:
                with open(self.mapping_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.uuid_to_track = data.get('uuid_to_track', {})
                    self.track_to_uuid = data.get('track_to_uuid', {})
                    self.track_metadata = data.get('track_metadata', {})
                print(f"✅ Loaded {len(self.uuid_to_track)} UUID mappings")
            except Exception as e:
                print(f"❌ Error loading UUID mapping: {e}")
                self._reset_mapping()
        else:
            print("📁 No existing UUID mapping found, creating new one")
            self._reset_mapping()
    
    def _reset_mapping(self):
        """Reset mapping to empty state"""
        self.uuid_to_track = {}
        self.track_to_uuid = {}
        self.track_metadata = {}
    
    def save_mapping(self):
        """Save UUID mapping to file"""
        try:
            # Ensure directory exists
            self.mapping_file.parent.mkdir(parents=True, exist_ok=True)
            
            data = {
                'uuid_to_track': self.uuid_to_track,
                'track_to_uuid': self.track_to_uuid,
                'track_metadata': self.track_metadata,
                'version': '1.0',
                'total_tracks': len(self.uuid_to_track)
            }
            
            with open(self.mapping_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            print(f"💾 Saved {len(self.uuid_to_track)} UUID mappings to {self.mapping_file}")
        except Exception as e:
            print(f"❌ Error saving UUID mapping: {e}")
    
    def get_or_create_uuid(self, track_id: str, audio_file_path: Optional[str] = None) -> str:
        """Get existing UUID for track or create new one"""
        if track_id in self.track_to_uuid:
            return self.track_to_uuid[track_id]
        
        # Generate new UUID
        track_uuid = str(uuid.uuid4())
        
        # Store mapping
        self.uuid_to_track[track_uuid] = track_id
        self.track_to_uuid[track_id] = track_uuid
        
        # Parse track info for metadata
        metadata = self._parse_track_info(track_id, audio_file_path)
        self.track_metadata[track_uuid] = metadata
        
        print(f"🆔 Created new UUID {track_uuid} for track {track_id}")
        return track_uuid
    
    def get_track_id(self, track_uuid: str) -> Optional[str]:
        """Get original track ID from UUID"""
        return self.uuid_to_track.get(track_uuid)
    
    def get_uuid(self, track_id: str) -> Optional[str]:
        """Get UUID from track ID"""
        return self.track_to_uuid.get(track_id)
    
    def get_metadata(self, track_uuid: str) -> Optional[Dict]:
        """Get track metadata from UUID"""
        return self.track_metadata.get(track_uuid)
    
    def _parse_track_info(self, track_id: str, audio_file_path: Optional[str] = None) -> Dict:
        """Parse track ID and file path to extract metadata"""
        # Parse track ID format: "Artist_Album_Track"
        parts = track_id.split('_')
        
        metadata = {
            'original_track_id': track_id,
            'audio_file_path': audio_file_path
        }
        
        if len(parts) >= 3:
            metadata['artist'] = parts[0]
            metadata['album'] = parts[1] 
            metadata['track_name'] = '_'.join(parts[2:])
        elif len(parts) == 2:
            metadata['artist'] = parts[0]
            metadata['track_name'] = parts[1]
            metadata['album'] = 'Unknown Album'
        else:
            metadata['artist'] = 'Unknown Artist'
            metadata['album'] = 'Unknown Album'
            metadata['track_name'] = track_id
        
        # Clean up names (replace underscores with spaces)
        metadata['artist_display'] = metadata['artist'].replace('_', ' ')
        metadata['album_display'] = metadata['album'].replace('_', ' ')
        metadata['track_display'] = metadata['track_name'].replace('_', ' ')
        
        # Generate content hash for integrity checking
        if audio_file_path:
            try:
                with open(audio_file_path, 'rb') as f:
                    # Read first 64KB for hash (fast but unique)
                    content = f.read(65536)
                    metadata['content_hash'] = hashlib.md5(content).hexdigest()
            except Exception as e:
                print(f"⚠️ Could not generate content hash: {e}")
                metadata['content_hash'] = None
        
        return metadata
    
    def update_from_dna_database(self, dna_database):
        """Update UUID mapping from existing DNA database"""
        print("🔄 Updating UUID mapping from DNA database...")
        
        updated_count = 0
        for track_id, profile in dna_database.profiles.items():
            if track_id not in self.track_to_uuid:
                self.get_or_create_uuid(track_id)
                updated_count += 1
        
        if updated_count > 0:
            self.save_mapping()
            print(f"✅ Added {updated_count} new UUID mappings")
        else:
            print("✅ All tracks already have UUID mappings")
    
    def get_all_uuids(self) -> Dict[str, str]:
        """Get all UUID to track_id mappings"""
        return self.uuid_to_track.copy()
    
    def get_all_track_ids(self) -> Dict[str, str]:
        """Get all track_id to UUID mappings"""
        return self.track_to_uuid.copy()
    
    def find_by_partial_match(self, search_term: str) -> List[Tuple[str, str, Dict]]:
        """Find tracks by partial matching of artist, album, or track name"""
        results = []
        search_lower = search_term.lower()
        
        for track_uuid, metadata in self.track_metadata.items():
            # Check if search term matches any part of the track info
            searchable_text = f"{metadata.get('artist_display', '')} {metadata.get('album_display', '')} {metadata.get('track_display', '')}".lower()
            
            if search_lower in searchable_text:
                track_id = self.uuid_to_track.get(track_uuid)
                results.append((track_uuid, track_id, metadata))
        
        return results
    
    def rebuild_mapping(self, dna_database=None, audio_base_path: Optional[Path] = None):
        """Rebuild the entire UUID mapping"""
        print("🔄 Rebuilding UUID mapping...")
        
        self._reset_mapping()
        
        if dna_database:
            self.update_from_dna_database(dna_database)
        
        # Optionally scan audio files directly
        if audio_base_path and audio_base_path.exists():
            print(f"📁 Scanning audio files in {audio_base_path}")
            for audio_file in audio_base_path.rglob("*.flac"):
                # Generate track ID from file path
                relative_path = audio_file.relative_to(audio_base_path)
                if len(relative_path.parts) >= 3:  # Artist/Album/Track.flac
                    track_id = f"{relative_path.parts[0]}_{relative_path.parts[1]}_{audio_file.stem}"
                    self.get_or_create_uuid(track_id, str(audio_file))
        
        self.save_mapping()
        print(f"✅ Rebuilt UUID mapping with {len(self.uuid_to_track)} tracks")

# Global instance
_uuid_manager = None

def get_uuid_manager() -> TrackUUIDManager:
    """Get global UUID manager instance"""
    global _uuid_manager
    if _uuid_manager is None:
        _uuid_manager = TrackUUIDManager()
    return _uuid_manager

if __name__ == "__main__":
    # Test the UUID manager
    manager = TrackUUIDManager()
    
    # Test track
    test_track = "Laufey_A_Night_At_The_Symphony_(Live_at_The_Symphony)_I_Wish_You_Love_(Live_at_The_Symphony)"
    test_uuid = manager.get_or_create_uuid(test_track)
    
    print(f"Track: {test_track}")
    print(f"UUID: {test_uuid}")
    print(f"Metadata: {manager.get_metadata(test_uuid)}")
    
    manager.save_mapping()
