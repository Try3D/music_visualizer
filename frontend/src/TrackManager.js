/**
 * TrackManager - Handles all track-related operations for the music player
 * This class manages track loading, selection, playback control, and persistence
 */
class TrackManager {
  constructor(musicPlayer) {
    this.musicPlayer = musicPlayer;
  }

  async loadTracks() {
    try {
      this.musicPlayer.utilities.vlog("[TRACKS] Loading positioned tracks from API...");
      const response = await fetch(
        `${this.musicPlayer.apiBase}/tracks/positioned`,
        {
          method: "GET",
          mode: "cors",
          credentials: "omit",
        },
      );
      if (!response.ok) {
        this.musicPlayer.utilities.vlog(
          `[WARN] Positioned tracks not available (${response.status}), falling back to regular tracks`,
          "warning",
        );
        const fallbackResponse = await fetch(
          `${this.musicPlayer.apiBase}/tracks`,
          {
            method: "GET",
            mode: "cors",
            credentials: "omit",
          },
        );
        if (!fallbackResponse.ok) {
          throw new Error(
            `Failed to load tracks: ${fallbackResponse.status} ${fallbackResponse.statusText}`,
          );
        }
        const fallbackData = await fallbackResponse.json();

        const tracks = Array.isArray(fallbackData)
          ? fallbackData
          : fallbackData.tracks || [];
        this.musicPlayer.tracks = tracks;
        this.musicPlayer.trackPositions = null;
        this.musicPlayer.connections = [];
        this.musicPlayer.utilities.vlog(
          `[SUCCESS] Loaded ${this.musicPlayer.tracks.length} tracks via fallback`,
          "success",
        );
        this.musicPlayer.utilities.vlog(
          `[DEBUG] First track UUID: ${this.musicPlayer.tracks[0]?.uuid}`,
          "debug",
        );
      } else {
        const positionedData = await response.json();
        this.musicPlayer.tracks = positionedData.tracks;
        this.musicPlayer.trackPositions = positionedData.tracks;
        this.musicPlayer.connections = positionedData.connections || [];
        this.musicPlayer.utilities.vlog(
          `[SUCCESS] Loaded ${this.musicPlayer.tracks.length} positioned tracks with ${this.musicPlayer.connections.length} connections`,
          "success",
        );
        this.musicPlayer.utilities.vlog(
          `[DEBUG] First positioned track UUID: ${this.musicPlayer.tracks[0]?.uuid}`,
          "debug",
        );

        if (positionedData.metadata) {
          this.musicPlayer.utilities.vlog(
            `[DATA] Metadata: ${positionedData.metadata.source}`,
            "debug",
          );
        }
      }
      this.musicPlayer.utilities.vlog(
        `[SUCCESS] Total tracks loaded: ${this.musicPlayer.tracks.length}`,
        "success",
      );

      this.updateTrackCountDisplay();
    } catch (error) {
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        this.musicPlayer.utilities.vlog(
          "[ERROR] Network error - Failed to connect to API. Please check:",
          "error",
        );
        this.musicPlayer.utilities.vlog(
          "[ERROR] 1. Is the backend server running on localhost:8000?",
          "error",
        );
        this.musicPlayer.utilities.vlog(
          "[ERROR] 2. Is CORS properly configured?",
          "error",
        );
        this.musicPlayer.utilities.vlog(
          "[ERROR] 3. Are there any network/firewall issues?",
          "error",
        );
      }
      throw new Error(
        `Failed to connect to music API. Please ensure the server is running on localhost:8000. Details: ${error.message}`,
      );
    }
  }

  playNext() {
    if (this.musicPlayer.selectedTracks.length === 0) {
      return;
    }

    if (this.musicPlayer.currentTrackIndex === -1) {
      this.musicPlayer.currentTrackIndex = 0;
    } else {
      this.musicPlayer.currentTrackIndex =
        (this.musicPlayer.currentTrackIndex + 1) %
        this.musicPlayer.selectedTracks.length;
    }

    this.playTrackByIndex(this.musicPlayer.currentTrackIndex);
  }

  playPrevious() {
    if (this.musicPlayer.selectedTracks.length === 0) {
      return;
    }

    if (this.musicPlayer.currentTrackIndex === -1) {
      this.musicPlayer.currentTrackIndex =
        this.musicPlayer.selectedTracks.length - 1;
    } else {
      this.musicPlayer.currentTrackIndex =
        this.musicPlayer.currentTrackIndex <= 0
          ? this.musicPlayer.selectedTracks.length - 1
          : this.musicPlayer.currentTrackIndex - 1;
    }

    this.playTrackByIndex(this.musicPlayer.currentTrackIndex);
  }

  playTrackByIndex(index) {
    if (index < 0 || index >= this.musicPlayer.selectedTracks.length) return;

    const track = this.musicPlayer.selectedTracks[index];
    const trackId = track.track_id || track.id;
    const sphere = this.musicPlayer.trackMap?.get(trackId);

    this.musicPlayer.currentTrackIndex = index;

    this.musicPlayer.uiManager.updateSelectedTracksList();

    if (sphere) {
      this.musicPlayer.audioManager.playTrack(track, sphere);
    } else {
      this.musicPlayer.audioManager.playTrack(track, null);
    }
  }

  addToSelectedTracks(track, trackId) {
    const existing = this.musicPlayer.selectedTracks.findIndex(
      (t) => (t.track_id || t.id) === trackId,
    );
    if (existing === -1) {
      this.musicPlayer.selectedTracks.push(track);
      this.musicPlayer.currentTrackIndex =
        this.musicPlayer.selectedTracks.length - 1;
      this.saveSelectedTracks();
      this.musicPlayer.uiManager.updateSelectedTracksList();

      this.musicPlayer.flowSystem.createPlaylistFlow();
    } else {
      this.musicPlayer.currentTrackIndex = existing;
      this.musicPlayer.uiManager.updateSelectedTracksList();
    }
  }

  removeFromSelectedTracks(trackId) {
    const index = this.musicPlayer.selectedTracks.findIndex(
      (t) => (t.track_id || t.id) === trackId,
    );
    if (index !== -1) {
      this.musicPlayer.selectedTracks.splice(index, 1);

      if (this.musicPlayer.currentTrackIndex >= index) {
        this.musicPlayer.currentTrackIndex = Math.max(
          0,
          this.musicPlayer.currentTrackIndex - 1,
        );
      }
      if (this.musicPlayer.selectedTracks.length === 0) {
        this.musicPlayer.currentTrackIndex = -1;
      }

      this.saveSelectedTracks();
      this.musicPlayer.uiManager.updateSelectedTracksList();

      this.musicPlayer.flowSystem.createPlaylistFlow();

      if (this.musicPlayer.discoveryMode === "none") {
        this.musicPlayer.connectionManager.showPlaylistConnections();
      }
    }
  }

  clearAllSelectedTracks() {
    this.musicPlayer.selectedTracks = [];
    this.musicPlayer.currentTrackIndex = -1;
    this.saveSelectedTracks();
    this.musicPlayer.connectionManager.clearAllConnections();

    this.musicPlayer.flowSystem.createPlaylistFlow();

    this.musicPlayer.uiManager.updateSelectedTracksList();
  }

  loadSelectedTracks() {
    try {
      const saved = localStorage.getItem("musicPlayer_selectedTracks");
      if (saved) {
        this.musicPlayer.selectedTracks = JSON.parse(saved);
      }
    } catch (error) {
      this.musicPlayer.selectedTracks = [];
    }
  }

  saveSelectedTracks() {
    try {
      localStorage.setItem(
        "musicPlayer_selectedTracks",
        JSON.stringify(this.musicPlayer.selectedTracks),
      );
    } catch (error) {}
  }

  restoreVisualSelections() {
    this.musicPlayer.selectedTracks.forEach((trackData, index) => {
      const trackId = trackData.track_id || trackData.uuid || trackData.id;

      let sphere = null;

      if (this.musicPlayer.trackMap && this.musicPlayer.trackMap.has(trackId)) {
        sphere = this.musicPlayer.trackMap.get(trackId);
      } else {
        sphere = this.musicPlayer.musicSpheres?.find((s) => {
          const sphereTrackId =
            s.userData.track.track_id ||
            s.userData.track.uuid ||
            s.userData.track.id;
          return sphereTrackId === trackId;
        });
      }

      if (sphere) {
        this.musicPlayer.clickedSpheres.add(trackId);
        this.musicPlayer.visualEffects.addBloomEffect(sphere);
        sphere.scale.set(1.3, 1.3, 1.3);

        if (this.musicPlayer.discoveryMode !== "none") {
          this.musicPlayer.addConnectionsForSphere(trackId);
        }
      }
    });

    if (this.musicPlayer.discoveryMode === "none") {
      this.musicPlayer.connectionManager.showPlaylistConnections();
    }

    this.updateTrackCountDisplay();
  }

  updateTrackCountDisplay() {
    const galaxyInfo = document.getElementById("galaxy-info");
    if (galaxyInfo) {
      galaxyInfo.innerHTML = `
                <div style="font-size: 12px; color: #B3B3B3; line-height: 1.6;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <i data-lucide="bar-chart" style="width: 12px; height: 12px; color: #1DB954;"></i>
                        Total Tracks: <span style="color: #1DB954; font-weight: bold;">${this.musicPlayer.tracks.length}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <i data-lucide="heart" style="width: 12px; height: 12px; color: #E91E63;"></i>
                        Selected Tracks: <span style="color: #E91E63; font-weight: bold;">${this.musicPlayer.selectedTracks.length}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="network" style="width: 12px; height: 12px; color: #9C27B0;"></i>
                        Active Connections: <span style="color: #9C27B0; font-weight: bold;">${Array.from(this.musicPlayer.activeConnections.values()).reduce((total, lines) => total + lines.length, 0)}</span>
                    </div>
                </div>
            `;
    }

    if (typeof lucide !== "undefined" && lucide.createIcons) {
      lucide.createIcons();
    }

    this.musicPlayer.uiManager.updateSelectedTracksList();
  }
}

export default TrackManager;

