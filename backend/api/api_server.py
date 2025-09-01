#!/usr/bin/env python3
"""
FastAPI backend for Sonic DNA Analyzer
Serves visualization data and provides analysis endpoints
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
import uvicorn
import json
from pathlib import Path
import sys
import os
import mimetypes
import time
from typing import Optional
from urllib.parse import unquote

# Add src to path for imports
import sys

sys.path.append(".")
sys.path.append("..")

from src.analysis.sonic_dna_extractor import SonicDNADatabase
from src.analysis.emotional_space_mapper import EmotionalSpaceMapper
from src.core.track_uuid_manager import get_uuid_manager

app = FastAPI(
    title="Sonic DNA Analyzer API",
    description="API for music analysis and visualization",
    version="1.0.0",
)

# Enable CORS for frontend with explicit configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=False,  # Set to False when using wildcard origins
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],  # Expose all headers to frontend
)

# Global instances
dna_database = None
space_mapper = None
uuid_manager = None
uuid_file_mapping = None


def load_uuid_file_mapping():
    """Load the UUID to file path mapping"""
    global uuid_file_mapping
    # Use absolute path relative to the project root
    project_root = Path(__file__).parent.parent.parent
    mapping_path = project_root / "data/uuid_file_mapping.json"
    if mapping_path.exists():
        with open(mapping_path, "r") as f:
            uuid_file_mapping = json.load(f)
        print(f"✅ Loaded {len(uuid_file_mapping)} UUID-to-file mappings")
    else:
        print(f"❌ UUID file mapping not found at: {mapping_path}")
        uuid_file_mapping = {}


@app.on_event("startup")
async def startup_event():
    """Initialize the services"""
    global dna_database, space_mapper, uuid_manager

    try:
        print("� Starting up API services...")

        # Initialize services
        dna_database = SonicDNADatabase("data/sonic_dna")
        print(f"✅ DNA Database loaded with {len(dna_database.profiles)} profiles")

        # Initialize the space mapper with DNA database
        if dna_database and len(dna_database.profiles) > 0:
            space_mapper = EmotionalSpaceMapper(dna_database)
            print(
                f"✅ Space Mapper initialized with {len(space_mapper.coordinate_cache)} coordinate mappings"
            )
        else:
            space_mapper = None
            print(f"⚠️ Space Mapper skipped - no DNA profiles available")

        uuid_manager = get_uuid_manager()
        print(f"✅ UUID Manager loaded with {len(uuid_manager.uuid_to_track)} UUIDs")

        # Load UUID file mapping
        load_uuid_file_mapping()

        print("🚀 All services initialized successfully!")

    except Exception as e:
        print(f"❌ Error during startup: {e}")
        import traceback

        traceback.print_exc()


@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Sonic DNA Analyzer API", "status": "running"}


@app.get("/api/galaxy-data")
async def get_galaxy_data():
    """Get visualization data for the emotional galaxy"""
    if not space_mapper:
        raise HTTPException(status_code=404, detail="No analysis data available")

    try:
        # Export fresh visualization data
        viz_data = space_mapper.export_visualization_data()

        # Add UUIDs and metadata to each track from UUID manager
        if uuid_manager and "tracks" in viz_data:
            for track in viz_data["tracks"]:
                track_id = track.get("track_id") or track.get("id")
                if track_id:
                    track_uuid = uuid_manager.get_or_create_uuid(track_id)
                    track_metadata = uuid_manager.get_metadata(track_uuid)

                    # Add UUID and enhanced metadata
                    track["uuid"] = track_uuid
                    if track_metadata:
                        # Merge existing metadata with UUID metadata
                        if "metadata" not in track:
                            track["metadata"] = {}
                        track["metadata"].update(track_metadata)

        # Add count information for debugging
        track_count = len(viz_data.get("tracks", []))
        edge_count = len(viz_data.get("connections", []))

        print(f"📊 Galaxy data: {track_count} tracks, {edge_count} connections")

        # Add metadata to the response
        viz_data["metadata"] = {
            "total_tracks": track_count,
            "total_connections": edge_count,
            "dna_profiles_count": len(dna_database.get_all_profiles())
            if dna_database
            else 0,
            "timestamp": time.time(),
        }

        return viz_data
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error generating visualization data: {str(e)}"
        )


@app.get("/api/tracks")
async def get_tracks():
    """Get all track metadata with UUIDs"""
    if not dna_database or not uuid_manager:
        raise HTTPException(status_code=404, detail="Database not initialized")

    profiles = dna_database.get_all_profiles()
    track_data = []

    for profile in profiles:
        track_dict = profile.to_dict()
        track_uuid = uuid_manager.get_or_create_uuid(profile.track_id)
        track_metadata = uuid_manager.get_metadata(track_uuid)

        # Add UUID and enhanced metadata
        track_dict["uuid"] = track_uuid
        track_dict["metadata"] = track_metadata

        track_data.append(track_dict)

    print(f"📊 Returning {len(track_data)} tracks with UUIDs from DNA database")

    return {
        "tracks": track_data,
        "count": len(track_data),
        "metadata": {
            "total_dna_profiles": len(profiles),
            "total_uuids": len(uuid_manager.get_all_uuids()),
            "source": "dna_database_with_uuids",
        },
    }


@app.get("/api/tracks/positioned")
async def get_positioned_tracks():
    """Get all tracks with their emotional space positions"""
    if not space_mapper:
        raise HTTPException(status_code=404, detail="Space mapper not available")

    try:
        # Export fresh visualization data
        viz_data = space_mapper.export_visualization_data()

        # Add UUIDs and metadata to each track from UUID manager
        if uuid_manager and "tracks" in viz_data:
            for track in viz_data["tracks"]:
                track_id = track.get("track_id") or track.get("id")
                if track_id:
                    track_uuid = uuid_manager.get_or_create_uuid(track_id)
                    track_metadata = uuid_manager.get_metadata(track_uuid)

                    # Add UUID and enhanced metadata
                    track["uuid"] = track_uuid
                    if track_metadata:
                        # Merge existing metadata with UUID metadata
                        if "metadata" not in track:
                            track["metadata"] = {}
                        track["metadata"].update(track_metadata)

        # Add count information for debugging
        track_count = len(viz_data.get("tracks", []))
        edge_count = len(viz_data.get("connections", []))

        print(f"📊 Positioned tracks: {track_count} tracks, {edge_count} connections")

        # Add metadata to the response
        viz_data["metadata"] = {
            "total_tracks": track_count,
            "total_connections": edge_count,
            "dna_profiles_count": len(dna_database.get_all_profiles())
            if dna_database
            else 0,
            "source": "space_mapper_with_uuids",
            "timestamp": time.time(),
        }

        return viz_data
    except Exception as e:
        print(f"❌ Error in get_positioned_tracks: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error loading positioned tracks: {str(e)}"
        )


@app.get("/api/counts")
async def get_counts():
    """Get detailed count information for debugging"""
    counts = {}

    # DNA database counts
    if dna_database:
        counts["dna_profiles"] = len(dna_database.get_all_profiles())

    # Emotional space data counts
    emotional_data_path = (
        Path(__file__).parent.parent.parent / "data" / "emotional_space_data.json"
    )
    if emotional_data_path.exists():
        try:
            with open(emotional_data_path, "r") as f:
                emotional_data = json.load(f)
            counts["emotional_space_tracks"] = len(emotional_data.get("tracks", []))
            counts["emotional_space_connections"] = len(
                emotional_data.get("connections", [])
            )
        except Exception as e:
            counts["emotional_space_error"] = str(e)

    # Space mapper counts
    if space_mapper:
        try:
            viz_data = space_mapper.export_visualization_data()
            counts["space_mapper_tracks"] = len(viz_data.get("tracks", []))
            counts["space_mapper_connections"] = len(viz_data.get("connections", []))
        except Exception as e:
            counts["space_mapper_error"] = str(e)

    # File system counts
    complete_library_path = (
        Path(__file__).parent.parent.parent / "data" / "complete_library"
    )
    if complete_library_path.exists():
        flac_files = list(complete_library_path.rglob("*.flac"))
        counts["filesystem_flac_files"] = len(flac_files)

    return counts


def normalize_string(s: str) -> str:
    """Normalize a string for comparison by removing special chars and spaces"""
    import re

    # Remove special characters, spaces, and convert to lowercase
    normalized = re.sub(r"[^\w\s]", "", s.lower())
    normalized = re.sub(r"\s+", "", normalized)
    return normalized


def find_audio_file(track_id: str, base_path: Path) -> Optional[Path]:
    """Find audio file with robust matching"""
    print(f"🔎 find_audio_file called with track_id: '{track_id}'")

    # Check DNA database for matches
    matched_dna_track = None
    if dna_database and hasattr(dna_database, "profiles"):
        # First try exact match
        if track_id in dna_database.profiles:
            print(f"✅ Found exact match in DNA database: {track_id}")
            matched_dna_track = track_id
        else:
            # Try normalized match
            track_norm = normalize_string(track_id)
            for db_key in dna_database.profiles.keys():
                if normalize_string(db_key) == track_norm:
                    print(f"✅ Found normalized match in DNA database: {db_key}")
                    matched_dna_track = db_key
                    break

            # Try partial match for international characters
            if not matched_dna_track:
                track_parts = track_id.split("_")
                if len(track_parts) >= 3:
                    for db_key in dna_database.profiles.keys():
                        db_parts = db_key.split("_")
                        if len(db_parts) >= 3:
                            # Compare track names (last parts)
                            input_track = "_".join(track_parts[2:])
                            dna_track = "_".join(db_parts[2:])

                            if (
                                normalize_string(input_track)
                                == normalize_string(dna_track)
                                or normalize_string(input_track)
                                in normalize_string(dna_track)
                                or normalize_string(dna_track)
                                in normalize_string(input_track)
                            ):
                                print(
                                    f"✅ Found partial track match in DNA database: {db_key}"
                                )
                                matched_dna_track = db_key
                                break

    # Use matched DNA track if found
    if matched_dna_track:
        track_id = matched_dna_track
        print(f"✅ Using DNA match: {track_id}")

    # Parse track ID format: "Artist_Album_Track"
    # Handle cases where artist names might contain underscores
    parts = track_id.split("_")
    if len(parts) < 3:
        print(
            f"❌ Invalid track_id format, expected 'Artist_Album_Track', got: '{track_id}'"
        )
        return None

    # Smart parsing: try different combinations to find the right split
    parsing_strategies = []

    # Strategy 1: Split by first 2 underscores (original approach)
    artist_v1 = parts[0]
    album_v1 = parts[1]
    track_name_v1 = "_".join(parts[2:])
    parsing_strategies.append(
        (artist_v1, album_v1, track_name_v1, "first_two_underscores")
    )

    # Strategy 2: If first part looks like "The", combine with second part
    if len(parts) >= 4 and parts[0] in ["The", "A", "An"]:
        artist_v2 = f"{parts[0]} {parts[1]}"
        album_v2 = parts[2]
        track_name_v2 = "_".join(parts[3:])
        parsing_strategies.append(
            (artist_v2, album_v2, track_name_v2, "the_prefix_handling")
        )

    # Strategy 3: Try common multi-word artist patterns
    if len(parts) >= 4:
        # Check for patterns like "Artist Name_Album_Track"
        for split_point in [2, 3]:  # Try splitting after 2nd or 3rd word
            if split_point < len(parts):
                artist_v3 = " ".join(parts[:split_point])
                if split_point + 1 < len(parts):
                    album_v3 = parts[split_point]
                    track_name_v3 = "_".join(parts[split_point + 1 :])
                    parsing_strategies.append(
                        (artist_v3, album_v3, track_name_v3, f"split_at_{split_point}")
                    )

    # Try each parsing strategy
    for strategy_idx, (
        artist_attempt,
        album_attempt,
        track_attempt,
        strategy_name,
    ) in enumerate(parsing_strategies):
        print(
            f"🎯 Strategy {strategy_idx + 1} ({strategy_name}): Artist='{artist_attempt}', Album='{album_attempt}', Track='{track_attempt}'"
        )

        # Method 1: Direct path matching
        artist_path = base_path / artist_attempt
        print(f"📁 Checking artist path: {artist_path}")
        print(f"📁 Artist path exists: {artist_path.exists()}")

        if artist_path.exists():
            album_path = artist_path / album_attempt
            print(f"📁 Checking album path: {album_path}")
            print(f"📁 Album path exists: {album_path.exists()}")

            if album_path.exists():
                print(f"📁 Listing files in album directory:")
                try:
                    files = list(album_path.glob("*.flac"))
                    print(f"📁 Found {len(files)} FLAC files:")
                    for i, file in enumerate(files[:5]):  # Show first 5
                        print(f"  {i + 1}. {file.name}")
                    if len(files) > 5:
                        print(f"  ... and {len(files) - 5} more")

                    # Look for exact or partial matches
                    for file in files:
                        file_stem = file.stem
                        print(
                            f"🔍 Comparing track_name='{track_attempt}' with file_stem='{file_stem}'"
                        )

                        # Normalize both for comparison
                        track_norm = normalize_string(track_attempt)
                        file_norm = normalize_string(file_stem)

                        # Multiple matching strategies
                        if (
                            track_attempt == file_stem  # Exact match
                            or track_attempt in file_stem  # Track in file
                            or file_stem in track_attempt  # File in track
                            or track_norm == file_norm  # Normalized exact
                            or track_norm in file_norm  # Normalized substring
                            or file_norm in track_norm  # File norm in track norm
                            or track_attempt.replace("_", " ")
                            in file_stem  # Replace underscores with spaces
                            or file_stem.replace(" ", "_")
                            in track_attempt  # Replace spaces with underscores
                            or normalize_string(track_attempt.replace("_", " "))
                            == file_norm  # Underscore to space + normalize
                            or normalize_string(file_stem.replace(" ", "_"))
                            == track_norm
                        ):  # Space to underscore + normalize
                            print(f"✅ Found match: {file}")
                            return file
                except Exception as e:
                    print(f"❌ Error listing album directory: {e}")
                    continue

    print(f"🔎 Direct path matching failed for all strategies, trying fuzzy search...")

    # Fall back to first strategy for fuzzy search
    artist, album, track_name = parsing_strategies[0][:3]

    # Method 2: Fuzzy search across entire library
    track_normalized = normalize_string(track_name)
    artist_normalized = normalize_string(artist)
    album_normalized = normalize_string(album)

    print(f"🔍 Normalized search terms:")
    print(f"  track: '{track_normalized}'")
    print(f"  artist: '{artist_normalized}'")
    print(f"  album: '{album_normalized}'")

    search_count = 0
    for root, dirs, files in os.walk(base_path):
        root_path = Path(root)
        search_count += 1

        if search_count <= 3:  # Debug first few directories
            print(f"🔍 Searching directory {search_count}: {root_path}")

        # Check if we're in the right artist/album vicinity
        root_normalized = normalize_string(str(root_path))
        if artist_normalized in root_normalized or album_normalized in root_normalized:
            print(f"🎯 Found relevant directory: {root_path}")

            for file in files:
                if file.endswith((".flac", ".mp3", ".wav", ".m4a", ".ogg")):
                    file_path = root_path / file
                    file_stem = Path(file).stem
                    file_normalized = normalize_string(file_stem)

                    # Fuzzy matching
                    if (
                        track_normalized in file_normalized
                        or file_normalized in track_normalized
                        or len(set(track_normalized) & set(file_normalized))
                        > len(track_normalized) * 0.6
                    ):
                        print(f"✅ Found fuzzy match: {file_path}")
                        return file_path

    print(f"❌ No audio file found after searching {search_count} directories")

    # Method 3: Last resort - search by track name only across all artist directories
    print(f"🔍 Last resort: searching by track name only: '{track_name}'")
    for root, dirs, files in os.walk(base_path):
        root_path = Path(root)

        # Only search in directories that contain the artist name
        if artist_normalized in normalize_string(str(root_path)):
            for file in files:
                if file.endswith((".flac", ".mp3", ".wav", ".m4a", ".ogg")):
                    file_path = root_path / file
                    file_stem = Path(file).stem
                    file_normalized = normalize_string(file_stem)

                    # Very fuzzy matching on track name only
                    track_words = set(track_normalized.split())
                    file_words = set(file_normalized.split())

                    # If at least 60% of track words are in the file name
                    if (
                        track_words
                        and len(track_words & file_words) >= len(track_words) * 0.6
                    ):
                        print(f"✅ Found last resort match: {file_path}")
                        return file_path

    print(f"❌ No audio file found after exhaustive search")
    return None


@app.get("/api/uuid/{track_uuid}/audio")
async def get_track_audio_by_uuid(track_uuid: str):
    """Serve audio file for a track using UUID (recommended endpoint)"""
    if not uuid_manager:
        raise HTTPException(status_code=404, detail="UUID manager not initialized")

    if not uuid_file_mapping:
        raise HTTPException(status_code=404, detail="UUID file mapping not loaded")

    print(f"🎵 GET /api/uuid/{track_uuid}/audio")

    # Use direct UUID to file mapping first
    audio_file_path = uuid_file_mapping.get(track_uuid)

    if audio_file_path and Path(audio_file_path).exists():
        print(f"✅ Found audio file via direct mapping: {audio_file_path}")
        audio_file = Path(audio_file_path)

        # Return file response with appropriate headers
        return FileResponse(
            path=str(audio_file),
            media_type="audio/flac" if audio_file.suffix == ".flac" else "audio/mpeg",
            filename=audio_file.name,
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
                "X-Track-UUID": track_uuid,
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        )

    # Fallback to original method if not in direct mapping
    print(f"⚠️  UUID {track_uuid} not found in direct mapping, trying fallback...")

    # Get original track ID from UUID
    track_id = uuid_manager.get_track_id(track_uuid)
    if not track_id:
        raise HTTPException(
            status_code=404, detail=f"Track not found for UUID: {track_uuid}"
        )

    print(f"🔍 UUID {track_uuid} maps to track_id: {track_id}")

    # Get metadata for additional file info
    metadata = uuid_manager.get_metadata(track_uuid)
    audio_file_path = metadata.get("audio_file_path") if metadata else None

    # Base path for audio files
    base_path = Path(__file__).parent.parent.parent / "data" / "complete_library"

    # Use robust file finding
    audio_file = find_audio_file(track_id, base_path)

    if not audio_file or not audio_file.exists():
        print(f"❌ No audio file found for UUID {track_uuid} (track_id: {track_id})")
        raise HTTPException(
            status_code=404, detail=f"Audio file not found for track UUID: {track_uuid}"
        )

    print(f"✅ Found audio file via fallback: {audio_file}")

    # Return file response with appropriate headers
    return FileResponse(
        path=str(audio_file),
        media_type="audio/flac" if audio_file.suffix == ".flac" else "audio/mpeg",
        filename=audio_file.name,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
            "X-Track-UUID": track_uuid,
            "X-Track-ID": track_id,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@app.post("/api/uuid/audio")
async def get_track_audio_by_uuid_post(request_data: dict):
    """POST endpoint for audio streaming with request body"""
    track_uuid = request_data.get("uuid") or request_data.get("track_uuid")

    if not track_uuid:
        raise HTTPException(status_code=400, detail="UUID required in request body")

    if not uuid_manager:
        raise HTTPException(status_code=404, detail="UUID manager not initialized")

    if not uuid_file_mapping:
        raise HTTPException(status_code=404, detail="UUID file mapping not loaded")

    print(f"🎵 POST /api/uuid/audio with UUID: {track_uuid}")

    # Use direct UUID to file mapping first
    audio_file_path = uuid_file_mapping.get(track_uuid)

    if audio_file_path and Path(audio_file_path).exists():
        print(f"✅ Found audio file via direct mapping: {audio_file_path}")
        audio_file = Path(audio_file_path)

        # Return file response with CORS headers
        return FileResponse(
            path=str(audio_file),
            media_type="audio/flac" if audio_file.suffix == ".flac" else "audio/mpeg",
            filename=audio_file.name,
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
                "X-Track-UUID": track_uuid,
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        )

    # Fallback to original method if not in direct mapping
    print(f"⚠️  UUID {track_uuid} not found in direct mapping, trying fallback...")

    # Get original track ID from UUID
    track_id = uuid_manager.get_track_id(track_uuid)
    if not track_id:
        raise HTTPException(
            status_code=404, detail=f"Track not found for UUID: {track_uuid}"
        )

    print(f"🔍 UUID {track_uuid} maps to track_id: {track_id}")

    # Base path for audio files
    base_path = Path(__file__).parent.parent.parent / "data" / "complete_library"

    # Use robust file finding
    audio_file = find_audio_file(track_id, base_path)

    if not audio_file or not audio_file.exists():
        print(f"❌ No audio file found for UUID {track_uuid} (track_id: {track_id})")
        raise HTTPException(
            status_code=404, detail=f"Audio file not found for track UUID: {track_uuid}"
        )

    print(f"✅ Found audio file via fallback: {audio_file}")

    # Return file response with CORS headers
    return FileResponse(
        path=str(audio_file),
        media_type="audio/flac" if audio_file.suffix == ".flac" else "audio/mpeg",
        filename=audio_file.name,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
            "X-Track-UUID": track_uuid,
            "X-Track-ID": track_id,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@app.get("/api/uuid/{track_uuid}")
async def get_track_by_uuid(track_uuid: str):
    """Get specific track data by UUID"""
    if not uuid_manager or not dna_database:
        raise HTTPException(status_code=404, detail="Services not initialized")

    # Get original track ID from UUID
    track_id = uuid_manager.get_track_id(track_uuid)
    if not track_id:
        raise HTTPException(
            status_code=404, detail=f"Track not found for UUID: {track_uuid}"
        )

    profile = dna_database.get_dna(track_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Track profile not found")

    track_data = profile.to_dict()
    metadata = uuid_manager.get_metadata(track_uuid)

    # Add UUID and metadata
    track_data["uuid"] = track_uuid
    track_data["metadata"] = metadata
    track_data["audio_url"] = f"/api/uuid/{track_uuid}/audio"

    return track_data


@app.get("/api/search")
async def search_tracks(q: str):
    """Search tracks by artist, album, or track name"""
    if not uuid_manager:
        raise HTTPException(status_code=404, detail="UUID manager not initialized")

    results = uuid_manager.find_by_partial_match(q)

    search_results = []
    for track_uuid, track_id, metadata in results:
        # Get DNA profile if available
        profile_data = {}
        if dna_database:
            profile = dna_database.get_dna(track_id)
            if profile:
                profile_data = profile.to_dict()

        search_results.append(
            {
                "uuid": track_uuid,
                "track_id": track_id,
                "metadata": metadata,
                "profile": profile_data,
                "audio_url": f"/api/uuid/{track_uuid}/audio",
            }
        )

    return {"query": q, "results": search_results, "count": len(search_results)}


@app.get("/api/track/{track_id}/audio")
async def get_track_audio(track_id: str):
    """Serve audio file for a track (legacy GET endpoint)"""
    # Decode URL-encoded track ID
    track_id = unquote(track_id)

    # Base path for audio files (only complete_library, not samples)
    base_path = Path(__file__).parent.parent.parent / "data" / "complete_library"

    # Use robust file finding
    audio_file = find_audio_file(track_id, base_path)

    if not audio_file or not audio_file.exists():
        raise HTTPException(
            status_code=404, detail=f"Audio file not found for track: {track_id}"
        )

    # Return file response with appropriate headers
    return FileResponse(
        path=str(audio_file),
        media_type="audio/flac" if audio_file.suffix == ".flac" else "audio/mpeg",
        filename=audio_file.name,
        headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"},
    )


@app.get("/api/tracks/{track_id}")
async def get_track(track_id: str):
    """Get specific track data"""
    if not dna_database:
        raise HTTPException(status_code=404, detail="Database not initialized")

    # Decode URL-encoded track ID
    track_id = unquote(track_id)

    profile = dna_database.get_dna(track_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Track not found")

    track_data = profile.to_dict()

    # Add audio URL if available
    track_data["audio_url"] = f"/api/track/{track_id}/audio"

    return track_data


@app.get("/api/similarity/{track_id}")
async def get_similar_tracks(track_id: str, limit: int = 10):
    """Get tracks similar to the specified track"""
    if not dna_database:
        raise HTTPException(status_code=404, detail="Database not initialized")

    target_profile = dna_database.get_dna(track_id)
    if not target_profile:
        raise HTTPException(status_code=404, detail="Track not found")

    relatives = dna_database.find_genetic_relatives(target_profile, top_k=limit)

    return [
        {"track": relative.to_dict(), "similarity": similarity}
        for relative, similarity in relatives
    ]


@app.post("/api/journey")
async def create_journey(journey_request: dict):
    """Create an emotional journey between tracks"""
    if not space_mapper:
        raise HTTPException(status_code=404, detail="Space mapper not available")

    start_track = journey_request.get("start_track")
    end_track = journey_request.get("end_track")
    duration = journey_request.get("duration", 60.0)

    if not start_track or not end_track:
        raise HTTPException(status_code=400, detail="Start and end tracks required")

    try:
        journey = space_mapper.create_emotional_journey(
            start_track, end_track, journey_duration=duration
        )

        journey_data = []
        for point in journey:
            journey_data.append(
                {
                    "track_id": point.track_id,
                    "timestamp": point.timestamp,
                    "transition_type": point.transition_type,
                    "coordinates": point.coordinate.to_dict(),
                }
            )

        return {
            "start_track": start_track,
            "end_track": end_track,
            "duration": duration,
            "path": journey_data,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating journey: {str(e)}")


@app.get("/api/statistics")
async def get_statistics():
    """Get database and emotional space statistics"""
    stats = {}

    if dna_database:
        stats["dna_database"] = dna_database.get_statistics()

    if space_mapper:
        stats["emotional_space"] = space_mapper.get_emotional_statistics()
        stats["clusters"] = space_mapper.analyze_emotional_clusters()

    return stats


@app.get("/api/filter")
async def filter_tracks(
    valence: float = None,
    energy: float = None,
    complexity: float = None,
    tolerance: float = 0.3,
):
    """Filter tracks by emotional coordinates"""
    if not space_mapper:
        raise HTTPException(status_code=404, detail="Space mapper not available")

    filtered_tracks = []

    for track_id, coord in space_mapper.coordinate_cache.items():
        include = True

        if valence is not None:
            if abs(coord.valence - valence) > tolerance:
                include = False

        if energy is not None:
            if abs(coord.energy - energy) > tolerance:
                include = False

        if complexity is not None:
            if abs(coord.complexity - complexity) > tolerance:
                include = False

        if include:
            profile = dna_database.get_dna(track_id)
            if profile:
                filtered_tracks.append(
                    {"track": profile.to_dict(), "coordinates": coord.to_dict()}
                )

    return filtered_tracks


@app.get("/visualizer", response_class=HTMLResponse)
async def serve_visualizer():
    """Serve the main visualizer page"""
    webapp_path = Path("webapp/dist/index.html")
    if webapp_path.exists():
        return webapp_path.read_text()
    else:
        raise HTTPException(
            status_code=404,
            detail="Webapp not found. Please run 'npm run build' in the webapp directory.",
        )


if __name__ == "__main__":
    uvicorn.run(
        "api_server:app", host="0.0.0.0", port=8000, reload=True, log_level="info"
    )

