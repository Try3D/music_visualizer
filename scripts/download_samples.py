#!/usr/bin/env python3
"""
Sample music downloader for sonic analysis
Downloads diverse tracks from the music server for testing
"""

import os
import requests
import urllib.parse
from pathlib import Path
import re

BASE_URL = "https://vader.tail96aa.ts.net"
SAMPLE_DIR = Path("data/sample_tracks")

# Diverse sample selection for testing different genres/styles
SAMPLE_TRACKS = [
    "Daft Punk/Discovery/",
    "Coldplay/",
    "John Mayer/",
    "Tame Impala/",
    "Sleep Token/",
    "Laufey/",
    "Mitski/",
    "Hozier/",
]

def get_directory_listing(url):
    """Get directory listing from server"""
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def extract_items_from_listing(html_content):
    """Extract file/directory names from HTML directory listing"""
    import re
    items = []
    
    # Extract href values from anchor tags
    href_pattern = r'<a href="([^"]+)"[^>]*>([^<]+)</a>'
    matches = re.findall(href_pattern, html_content)
    
    for href, display_name in matches:
        # Skip parent directory links and hidden files
        if href in ['..', '.'] or href.startswith('.'):
            continue
        
        # If it's a directory (ends with /) or looks like an artist name
        if href.endswith('/') or (not '.' in href and len(href) > 1):
            # Clean up the name
            clean_name = urllib.parse.unquote(href).rstrip('/')
            if not clean_name.startswith('._') and clean_name:
                items.append(clean_name)
    
    return items

def download_file(url, local_path):
    """Download a file from URL to local path"""
    try:
        print(f"Downloading: {url}")
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        
        with open(local_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"✓ Downloaded: {local_path}")
        return True
    except Exception as e:
        print(f"✗ Error downloading {url}: {e}")
        return False

def explore_and_download(artist_path, max_files=2):
    """Explore artist directory and download sample tracks"""
    artist_url = f"{BASE_URL}/{urllib.parse.quote(artist_path)}"
    
    # Get artist directory listing
    content = get_directory_listing(artist_url)
    if not content:
        return
    
    # Look for albums
    albums = extract_items_from_listing(content)
    
    downloaded = 0
    for album in albums[:2]:  # Max 2 albums per artist
        if downloaded >= max_files:
            break
            
        album_url = f"{artist_url}/{urllib.parse.quote(album)}/"
        album_content = get_directory_listing(album_url)
        
        if album_content:
            # Extract track files
            track_pattern = r'<a href="([^"]+\.(mp3|flac|wav|m4a))"[^>]*>([^<]+)</a>'
            track_matches = re.findall(track_pattern, album_content, re.IGNORECASE)
            
            # Download first track from each album
            for href, ext, display_name in track_matches[:1]:
                if downloaded >= max_files:
                    break
                    
                track_url = f"{album_url}{href}"
                
                # Create local path maintaining structure
                local_path = SAMPLE_DIR / artist_path / album / urllib.parse.unquote(href)
                
                if download_file(track_url, local_path):
                    downloaded += 1

def main():
    """Download sample tracks for analysis"""
    print("🎵 Downloading sample tracks for sonic analysis...")
    
    # Create sample directory
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    
    # Get main directory listing first
    main_content = get_directory_listing(BASE_URL)
    if not main_content:
        print("❌ Could not access music server")
        return
    
    # Extract artist directories
    artists = extract_items_from_listing(main_content)
    
    print(f"Found {len(artists)} artists on server")
    print("Available artists:", artists[:10])
    
    # Download samples from diverse artists (use exact names from server)
    target_artists = artists[:8]  # Take first 8 artists for variety
    
    for artist in target_artists:
        print(f"\n🎼 Processing: {artist}")
        explore_and_download(artist, max_files=2)
    
    print("\n✅ Sample download complete!")
    print(f"📁 Tracks saved to: {SAMPLE_DIR.absolute()}")

if __name__ == "__main__":
    main()