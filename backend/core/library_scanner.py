#!/usr/bin/env python3
"""
Core music library scanner and metadata extractor
Handles file discovery, basic metadata extraction, and audio loading
"""

import json
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import re
from dataclasses import dataclass, asdict
from mutagen import File as MutagenFile
from mutagen.id3 import ID3NoHeaderError


@dataclass
class TrackMetadata:
    """Represents metadata for a single track"""

    filepath: str
    filename: str
    artist: str
    album: str
    title: str
    track_number: Optional[int]
    duration: Optional[float]
    genre: Optional[str]
    year: Optional[int]
    file_format: str
    file_size: int
    file_hash: str

    def to_dict(self) -> Dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict) -> "TrackMetadata":
        return cls(**data)


class MusicLibraryScanner:
    """Scans music directories and extracts metadata"""

    SUPPORTED_FORMATS = {".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac"}

    def __init__(self, cache_dir: str = "data/cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_file = self.cache_dir / "metadata_cache.json"
        self.tracks: List[TrackMetadata] = []

        self._load_cache()

    def _load_cache(self):
        """Load cached metadata if available"""
        if self.cache_file.exists():
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    cache_data = json.load(f)
                    self.tracks = [
                        TrackMetadata.from_dict(track) for track in cache_data
                    ]
                print(f"📁 Loaded {len(self.tracks)} tracks from cache")
            except Exception as e:
                print(f"⚠️  Error loading cache: {e}")
                self.tracks = []

    def _save_cache(self):
        """Save metadata to cache"""
        try:
            cache_data = [track.to_dict() for track in self.tracks]
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(cache_data, f, indent=2, ensure_ascii=False)
            print(f"💾 Saved {len(self.tracks)} tracks to cache")
        except Exception as e:
            print(f"⚠️  Error saving cache: {e}")

    def _calculate_file_hash(self, filepath: str) -> str:
        """Calculate MD5 hash of file for change detection"""
        hash_md5 = hashlib.md5()
        try:
            with open(filepath, "rb") as f:
                chunk = f.read(65536)
                hash_md5.update(chunk)
                f.seek(-65536, 2)
                chunk = f.read(65536)
                hash_md5.update(chunk)
        except Exception:
            with open(filepath, "rb") as f:
                hash_md5.update(f.read())
        return hash_md5.hexdigest()

    def _extract_metadata_from_path(
        self, filepath: str
    ) -> Tuple[str, str, str, Optional[int]]:
        """Extract artist, album, title from file path using the pattern"""
        path = Path(filepath)

        parts = path.parts

        if len(parts) >= 3:
            artist = parts[-3]
            album = parts[-2]

            stem = path.stem

            track_match = re.match(r"^(\d+)[\.\-\s]+(.+)$", stem)
            if track_match:
                track_number = int(track_match.group(1))
                title = track_match.group(2).strip()
            else:
                track_number = None
                title = stem

            return artist, album, title, track_number
        else:
            return "Unknown Artist", "Unknown Album", path.stem, None

    def _extract_metadata_from_tags(self, filepath: str) -> Dict:
        """Extract metadata from audio file tags"""
        try:
            audio_file = MutagenFile(filepath)
            if audio_file is None:
                return {}

            metadata = {}

            tag_mappings = {
                "artist": ["TPE1", "ARTIST", "\xa9ART", "ALBUMARTIST"],
                "album": ["TALB", "ALBUM", "\xa9alb"],
                "title": ["TIT2", "TITLE", "\xa9nam"],
                "genre": ["TCON", "GENRE", "\xa9gen"],
                "year": ["TDRC", "DATE", "\xa9day", "YEAR"],
                "track": ["TRCK", "TRACKNUMBER", "trkn"],
            }

            for field, possible_tags in tag_mappings.items():
                for tag in possible_tags:
                    if tag in audio_file:
                        value = audio_file[tag]
                        if isinstance(value, list) and value:
                            value = value[0]
                        metadata[field] = str(value)
                        break

            if hasattr(audio_file, "info") and audio_file.info:
                metadata["duration"] = audio_file.info.length

            return metadata

        except (ID3NoHeaderError, Exception) as e:
            print(f"⚠️  Could not read tags from {filepath}: {e}")
            return {}

    def _is_file_cached_and_current(self, filepath: str) -> bool:
        """Check if file is already cached and hasn't changed"""
        file_hash = self._calculate_file_hash(filepath)

        for track in self.tracks:
            if track.filepath == filepath and track.file_hash == file_hash:
                return True
        return False

    def scan_directory(
        self, music_dir: str, force_rescan: bool = False
    ) -> List[TrackMetadata]:
        """Scan a directory for music files and extract metadata"""
        music_path = Path(music_dir)

        if not music_path.exists():
            print(f"❌ Directory does not exist: {music_dir}")
            return []

        print(f"🔍 Scanning music directory: {music_dir}")

        audio_files = []
        for ext in self.SUPPORTED_FORMATS:
            audio_files.extend(music_path.rglob(f"*{ext}"))

        print(f"📁 Found {len(audio_files)} audio files")

        if force_rescan:
            self.tracks = []

        new_tracks = []
        updated_count = 0

        for audio_file in audio_files:
            filepath = str(audio_file)

            if not force_rescan and self._is_file_cached_and_current(filepath):
                continue

            try:
                artist, album, title, track_number = self._extract_metadata_from_path(
                    filepath
                )

                tag_metadata = self._extract_metadata_from_tags(filepath)

                final_artist = tag_metadata.get("artist", artist)
                final_album = tag_metadata.get("album", album)
                final_title = tag_metadata.get("title", title)
                final_track_number = track_number

                if "track" in tag_metadata:
                    try:
                        track_str = tag_metadata["track"].split("/")[0]
                        final_track_number = int(track_str)
                    except (ValueError, AttributeError):
                        pass

                year = None
                if "year" in tag_metadata:
                    try:
                        year_str = tag_metadata["year"][:4]
                        year = int(year_str)
                    except (ValueError, AttributeError):
                        pass

                track_metadata = TrackMetadata(
                    filepath=filepath,
                    filename=audio_file.name,
                    artist=final_artist,
                    album=final_album,
                    title=final_title,
                    track_number=final_track_number,
                    duration=tag_metadata.get("duration"),
                    genre=tag_metadata.get("genre"),
                    year=year,
                    file_format=audio_file.suffix.lower(),
                    file_size=audio_file.stat().st_size,
                    file_hash=self._calculate_file_hash(filepath),
                )

                self.tracks = [t for t in self.tracks if t.filepath != filepath]

                self.tracks.append(track_metadata)
                new_tracks.append(track_metadata)
                updated_count += 1

                if updated_count % 10 == 0:
                    print(f"  📊 Processed {updated_count} files...")

            except Exception as e:
                print(f"⚠️  Error processing {filepath}: {e}")
                continue

        print(f"✅ Scan complete! Updated {updated_count} tracks")
        print(f"📊 Total tracks in library: {len(self.tracks)}")

        self._save_cache()

        return new_tracks

    def get_tracks(self) -> List[TrackMetadata]:
        """Get all tracks in the library"""
        return self.tracks

    def get_tracks_by_artist(self, artist: str) -> List[TrackMetadata]:
        """Get all tracks by a specific artist"""
        return [
            track for track in self.tracks if track.artist.lower() == artist.lower()
        ]

    def get_tracks_by_album(self, album: str) -> List[TrackMetadata]:
        """Get all tracks from a specific album"""
        return [track for track in self.tracks if track.album.lower() == album.lower()]

    def get_tracks_by_genre(self, genre: str) -> List[TrackMetadata]:
        """Get all tracks of a specific genre"""
        return [
            track
            for track in self.tracks
            if track.genre and track.genre.lower() == genre.lower()
        ]

    def search_tracks(self, query: str) -> List[TrackMetadata]:
        """Search tracks by artist, album, or title"""
        query = query.lower()
        results = []

        for track in self.tracks:
            if (
                query in track.artist.lower()
                or query in track.album.lower()
                or query in track.title.lower()
            ):
                results.append(track)

        return results

    def get_library_stats(self) -> Dict:
        """Get statistics about the music library"""
        if not self.tracks:
            return {}

        total_duration = sum(track.duration for track in self.tracks if track.duration)
        total_size = sum(track.file_size for track in self.tracks)

        artists = set(track.artist for track in self.tracks)
        albums = set(f"{track.artist} - {track.album}" for track in self.tracks)
        genres = set(track.genre for track in self.tracks if track.genre)
        formats = set(track.file_format for track in self.tracks)

        return {
            "total_tracks": len(self.tracks),
            "total_duration_hours": total_duration / 3600 if total_duration else 0,
            "total_size_gb": total_size / (1024**3),
            "unique_artists": len(artists),
            "unique_albums": len(albums),
            "unique_genres": len(genres),
            "file_formats": list(formats),
            "artists": sorted(list(artists)),
            "genres": sorted(list(genres)),
        }


if __name__ == "__main__":
    scanner = MusicLibraryScanner()
    tracks = scanner.scan_directory("data/sample_tracks")

    print("\n📊 Library Statistics:")
    stats = scanner.get_library_stats()
    for key, value in stats.items():
        if key not in ["artists", "genres"]:
            print(f"  {key}: {value}")

    print(f"\n🎵 Sample tracks:")
    for track in tracks[:5]:
        print(f"  {track.artist} - {track.title} ({track.album})")
