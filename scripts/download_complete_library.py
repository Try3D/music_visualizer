#!/usr/bin/env python3
"""
Complete music library downloader for sonic analysis
Downloads ALL available tracks from the music server for comprehensive analysis
"""

import asyncio
import os
import requests
import urllib.parse
from pathlib import Path
import re
import time
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

BASE_URL = "https://vader.tail96aa.ts.net"
LIBRARY_DIR = Path("data/complete_library")
DOWNLOAD_LOG = Path("data/download_log.json")
MAX_WORKERS = 8
AUDIO_EXTENSIONS = {".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac", ".wma"}


download_stats = {"total_files": 0, "downloaded": 0, "failed": 0, "skipped": 0}
stats_lock = threading.Lock()


def update_stats(stat_type, increment=1):
    """Thread-safe statistics update"""
    with stats_lock:
        download_stats[stat_type] += increment


def save_download_log(log_data):
    """Save download progress to JSON file"""
    DOWNLOAD_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(DOWNLOAD_LOG, "w") as f:
        json.dump(log_data, f, indent=2)


def load_download_log():
    """Load existing download log"""
    if DOWNLOAD_LOG.exists():
        try:
            with open(DOWNLOAD_LOG, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}


def get_directory_listing(url, retries=3):
    """Get directory listing from server with retry logic"""
    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            return response.text
        except Exception as e:
            if attempt == retries - 1:
                print(f"Error fetching {url} after {retries} attempts: {e}")
                return None
            time.sleep(1)


def extract_items_from_listing(html_content):
    """Extract file/directory names from HTML directory listing"""
    items = []

    href_pattern = r'<a href="([^"]+)"[^>]*>([^<]+)</a>'
    matches = re.findall(href_pattern, html_content)

    for href, _ in matches:
        if href in ["..", "."] or href.startswith(".") or href.startswith("._"):
            continue

        clean_name = urllib.parse.unquote(href).rstrip("/")
        if clean_name and not clean_name.startswith("._"):
            items.append((clean_name, href))

    return items


def is_audio_file(filename):
    """Check if file is an audio file"""
    return Path(filename).suffix.lower() in AUDIO_EXTENSIONS


def download_file(url, local_path, retries=3):
    """Download a file from URL to local path with retry logic"""
    for attempt in range(retries):
        try:
            response = requests.get(url, stream=True, timeout=60)
            response.raise_for_status()

            os.makedirs(os.path.dirname(local_path), exist_ok=True)

            total_size = int(response.headers.get("content-length", 0))
            downloaded_size = 0

            with open(local_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded_size += len(chunk)

            if total_size > 0 and downloaded_size != total_size:
                raise Exception(
                    f"Incomplete download: {downloaded_size}/{total_size} bytes"
                )

            print(
                f"✓ Downloaded: {local_path.name} ({downloaded_size / 1024 / 1024:.1f} MB)"
            )
            update_stats("downloaded")
            return True

        except Exception as e:
            if attempt == retries - 1:
                print(f"✗ Failed to download {url} after {retries} attempts: {e}")
                update_stats("failed")
                return False
            time.sleep(2**attempt)


def explore_directory_recursive(base_path, current_path="", download_log=None):
    """Recursively explore and catalog all directories and files"""
    if download_log is None:
        download_log = {}

    full_path = f"{current_path}" if current_path else ""
    url = f"{BASE_URL}/{urllib.parse.quote(full_path)}" if full_path else BASE_URL

    print(f"📁 Exploring: {full_path or 'root'}")

    content = get_directory_listing(url)
    if not content:
        return []

    items = extract_items_from_listing(content)
    download_tasks = []

    for item_name, href in items:
        if current_path:
            full_item_path = f"{current_path}/{item_name}"
        else:
            full_item_path = item_name

        if href.endswith("/"):
            sub_tasks = explore_directory_recursive(
                base_path, full_item_path, download_log
            )
            download_tasks.extend(sub_tasks)
        else:
            if is_audio_file(item_name):
                file_url = f"{BASE_URL}/{urllib.parse.quote(full_item_path)}"
                local_path = LIBRARY_DIR / full_item_path

                if (
                    str(local_path) in download_log.get("completed", [])
                    and local_path.exists()
                ):
                    print(f"⏭ Skipping (already downloaded): {item_name}")
                    update_stats("skipped")
                    continue

                download_tasks.append((file_url, local_path, full_item_path))
                update_stats("total_files")

    return download_tasks


def download_task(task):
    """Single download task for thread pool"""
    url, local_path, relative_path = task
    success = download_file(url, local_path)
    return (relative_path, success)


def main():
    """Download complete music library"""
    print("🎵 Starting COMPLETE music library download...")
    print(f"🌐 Server: {BASE_URL}")
    print(f"📁 Local directory: {LIBRARY_DIR.absolute()}")

    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)

    download_log = load_download_log()
    if not download_log:
        download_log = {
            "started": time.strftime("%Y-%m-%d %H:%M:%S"),
            "completed": [],
            "failed": [],
        }

    print("\n🔍 Discovering all files on server (this may take a while)...")

    download_tasks = explore_directory_recursive(LIBRARY_DIR, download_log=download_log)

    print(f"\n📊 Discovery complete!")
    print(f"Total audio files found: {len(download_tasks)}")
    print(f"Already downloaded: {download_stats['skipped']}")
    print(f"To download: {len(download_tasks)}")

    if not download_tasks:
        print("✅ All files already downloaded!")
        return

    print(f"\n⬇️ Starting downloads with {MAX_WORKERS} concurrent workers...")

    start_time = time.time()
    completed_files = []
    failed_files = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_task = {
            executor.submit(download_task, task): task for task in download_tasks
        }

        for future in as_completed(future_to_task):
            relative_path, success = future.result()

            if success:
                completed_files.append(relative_path)
                download_log["completed"].append(str(LIBRARY_DIR / relative_path))
            else:
                failed_files.append(relative_path)
                download_log["failed"].append(relative_path)

            if len(completed_files) % 10 == 0:
                download_log["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
                save_download_log(download_log)

            total_processed = len(completed_files) + len(failed_files)
            if total_processed % 5 == 0:
                print(
                    f"Progress: {total_processed}/{len(download_tasks)} files processed"
                )

    end_time = time.time()
    duration = end_time - start_time

    download_log["completed_time"] = time.strftime("%Y-%m-%d %H:%M:%S")
    download_log["duration_seconds"] = duration
    download_log["statistics"] = download_stats.copy()
    save_download_log(download_log)

    print(f"\n✅ Download complete!")
    print(f"📊 Final Statistics:")
    print(f"   Total files found: {download_stats['total_files']}")
    print(f"   Successfully downloaded: {download_stats['downloaded']}")
    print(f"   Already existed: {download_stats['skipped']}")
    print(f"   Failed downloads: {download_stats['failed']}")
    print(f"   Duration: {duration / 3600:.1f} hours")
    print(f"📁 Library saved to: {LIBRARY_DIR.absolute()}")
    print(f"📝 Download log: {DOWNLOAD_LOG.absolute()}")

    summary_file = LIBRARY_DIR / "download_summary.txt"
    with open(summary_file, "w") as f:
        f.write(f"Music Library Download Summary\n")
        f.write(f"===============================\n\n")
        f.write(f"Server: {BASE_URL}\n")
        f.write(f"Download completed: {download_log['completed_time']}\n")
        f.write(f"Duration: {duration / 3600:.1f} hours\n\n")
        f.write(f"Statistics:\n")
        f.write(f"  Total files: {download_stats['total_files']}\n")
        f.write(f"  Downloaded: {download_stats['downloaded']}\n")
        f.write(f"  Skipped (already existed): {download_stats['skipped']}\n")
        f.write(f"  Failed: {download_stats['failed']}\n\n")
        f.write(f"Failed files:\n")
        for failed in failed_files:
            f.write(f"  - {failed}\n")

    print(f"📄 Summary saved to: {summary_file}")


if __name__ == "__main__":
    asyncio.run(main())
