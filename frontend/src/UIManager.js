import * as THREE from "three";

export class UIManager {
  constructor(musicPlayer) {
    this.musicPlayer = musicPlayer;
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
  }

  setupEventListeners() {
    const canvas = this.musicPlayer.renderer.domElement;

    canvas.addEventListener("click", this.onCanvasClick.bind(this));
    canvas.addEventListener("mousemove", this.onCanvasMouseMove.bind(this));
    window.addEventListener("resize", this.onWindowResize.bind(this));
    window.addEventListener("keydown", this.onKeyDown.bind(this));
  }

  onCanvasClick(event) {
    const rect = this.musicPlayer.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.musicPlayer.camera);
    const intersects = this.raycaster.intersectObjects(this.musicPlayer.musicSpheres);

    if (intersects.length > 0) {
      const clickedSphere = intersects[0].object;
      const trackId =
        clickedSphere.userData.track.track_id ||
        clickedSphere.userData.track.uuid ||
        clickedSphere.userData.track.id;

      if (this.musicPlayer.discoveryMode === "pathfinding") {
        if (this.musicPlayer.pathfindingState.settingStart) {
          this.musicPlayer.pathfindingState.startTrack = trackId;
          this.musicPlayer.pathfindingState.settingStart = false;
          this.updateDiscoveryUI();
          return;
        } else if (this.musicPlayer.pathfindingState.settingEnd) {
          this.musicPlayer.pathfindingState.endTrack = trackId;
          this.musicPlayer.pathfindingState.settingEnd = false;
          this.updateDiscoveryUI();
          return;
        }
      }

      this.musicPlayer.connectionManager.toggleSphereConnections(clickedSphere, trackId);
    }
  }

  onCanvasMouseMove(event) {
    const rect = this.musicPlayer.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.musicPlayer.camera);
    const intersects = this.raycaster.intersectObjects(this.musicPlayer.musicSpheres);

    this.musicPlayer.musicSpheres.forEach((sphere) => {
      if (!sphere.material.userData.isSelected) {
        this.musicPlayer.visualEffects.removeHoverEffect(sphere);
      }
    });

    if (intersects.length > 0) {
      const hoveredSphere = intersects[0].object;
      this.musicPlayer.visualEffects.addHoverEffect(hoveredSphere);
      document.body.style.cursor = "pointer";
    } else {
      document.body.style.cursor = "default";
    }
  }

  onWindowResize() {
    const container = document.getElementById(this.musicPlayer.containerId);
    this.musicPlayer.camera.aspect = container.clientWidth / container.clientHeight;
    this.musicPlayer.camera.updateProjectionMatrix();
    this.musicPlayer.renderer.setSize(container.clientWidth, container.clientHeight);

    if (this.musicPlayer.composer) {
      this.musicPlayer.composer.setSize(container.clientWidth, container.clientHeight);
    }

    this.musicPlayer.controls.update();
  }

  onKeyDown(event) {
    if (event.key === "c" || event.key === "C") {
      this.musicPlayer.connectionManager.clearAllConnections();
    }

    if (event.key === "Escape") {
      this.musicPlayer.connectionManager.clearAllConnections();
    }

    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      if (this.musicPlayer.currentTrack) {
        if (this.musicPlayer.isPlaying) {
          this.musicPlayer.audio.pause();
          this.musicPlayer.isPlaying = false;
        } else {
          if (this.musicPlayer.audioContext && this.musicPlayer.audioContext.state === "suspended") {
            this.musicPlayer.audioContext.resume();
          }
          this.musicPlayer.audio.play();
          this.musicPlayer.isPlaying = true;
        }
        this.updatePlayButton();
      }
    }
  }

  setupControlEvents() {
    const playPauseBtn = document.getElementById("play-pause");
    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", () => {
        if (this.musicPlayer.currentTrack) {
          if (this.musicPlayer.isPlaying) {
            this.musicPlayer.audio.pause();
            this.musicPlayer.isPlaying = false;
          } else {
            if (this.musicPlayer.audioContext && this.musicPlayer.audioContext.state === "suspended") {
              this.musicPlayer.audioContext.resume();
            }
            this.musicPlayer.audio.play();
            this.musicPlayer.isPlaying = true;
          }
          this.updatePlayButton();
        }
      });
    }

    const prevBtn = document.getElementById("prev-btn");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        this.musicPlayer.trackManager.playPrevious();
      });

      prevBtn.addEventListener("mouseenter", () => {
        if (this.musicPlayer.selectedTracks.length > 0) {
          prevBtn.style.color = "#1DB954";
        }
      });
      prevBtn.addEventListener("mouseleave", () => {
        prevBtn.style.color =
          this.musicPlayer.selectedTracks.length > 0 ? "#FFFFFF" : "#B3B3B3";
      });
    }

    const nextBtn = document.getElementById("next-btn");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        this.musicPlayer.trackManager.playNext();
      });

      nextBtn.addEventListener("mouseenter", () => {
        if (this.musicPlayer.selectedTracks.length > 0) {
          nextBtn.style.color = "#1DB954";
        }
      });
      nextBtn.addEventListener("mouseleave", () => {
        nextBtn.style.color =
          this.musicPlayer.selectedTracks.length > 0 ? "#FFFFFF" : "#B3B3B3";
      });
    }

    const volumeBtn = document.getElementById("volume-btn");
    if (volumeBtn) {
      volumeBtn.addEventListener("click", () => {
        this.musicPlayer.audioManager.toggleMute();
      });
    }

    const progressBar = document.getElementById("progress-bar");
    if (progressBar) {
      progressBar.addEventListener("input", (e) => {
        if (this.musicPlayer.audio.duration) {
          this.musicPlayer.audio.currentTime = (e.target.value / 100) * this.musicPlayer.audio.duration;
        }
      });
    }

    this.setupDiscoveryControls();
  }

  setupDiscoveryControls() {
    const findSimilarBtn = document.getElementById("find-similar-btn");
    if (findSimilarBtn) {
      findSimilarBtn.addEventListener("click", () => {
        this.musicPlayer.discoveryEngine.toggleSimilarMode();
      });
    }

    const setStartBtn = document.getElementById("set-start-btn");
    if (setStartBtn) {
      setStartBtn.addEventListener("click", () => {
        this.musicPlayer.discoveryEngine.setPathfindingMode("start");
      });
    }

    const setEndBtn = document.getElementById("set-end-btn");
    if (setEndBtn) {
      setEndBtn.addEventListener("click", () => {
        this.musicPlayer.discoveryEngine.setPathfindingMode("end");
      });
    }

    const findPathBtn = document.getElementById("find-path-btn");
    if (findPathBtn) {
      findPathBtn.addEventListener("click", () => {
        this.musicPlayer.discoveryEngine.findShortestPath();
      });
    }

    const addSimilarBtn = document.getElementById("add-similar-btn");
    if (addSimilarBtn) {
      addSimilarBtn.addEventListener("click", () => {
        this.musicPlayer.discoveryEngine.addSimilarTracksToPlaylist();
      });
    }
  }

  updateTrackInfo(track) {
    const titleElement = document.getElementById("track-title");
    const artistElement = document.getElementById("track-artist");

    if (titleElement && artistElement) {
      const title = this.musicPlayer.utilities.formatTrackTitle(track);
      const artist = this.musicPlayer.utilities.formatArtistName(track);

      titleElement.textContent = title;
      titleElement.title =
        track.metadata?.track_display ||
        track.metadata?.track_name ||
        track.track_id ||
        track.id;

      artistElement.textContent = artist;
      artistElement.title =
        track.metadata?.artist_display || track.metadata?.artist || "";
    }
  }

  updateDiscoveryUI() {
    const findSimilarBtn = document.getElementById("find-similar-btn");
    const addSimilarBtn = document.getElementById("add-similar-btn");
    const setStartBtn = document.getElementById("set-start-btn");
    const setEndBtn = document.getElementById("set-end-btn");
    const findPathBtn = document.getElementById("find-path-btn");

    if (findSimilarBtn) {
      if (this.musicPlayer.discoveryMode === "similar") {
        findSimilarBtn.style.background = "#1ed760";
        findSimilarBtn.textContent = "✓ Similar Mode Active";
        this.updateDiscoveryStatus("Click tracks to find similar songs");
      } else {
        findSimilarBtn.style.background = "#1DB954";
        findSimilarBtn.innerHTML =
          '<i data-lucide="shuffle" style="width: 14px; height: 14px; margin-right: 6px; vertical-align: middle;"></i>Find Similar Songs';
      }
    }

    if (addSimilarBtn) {
      if (this.musicPlayer.discoveryMode === "similar" && this.musicPlayer.similarityContext.size > 1) {
        addSimilarBtn.style.display = "block";
        addSimilarBtn.innerHTML = `<i data-lucide="plus" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></i>Add ${this.musicPlayer.similarityContext.size} Similar Tracks`;
      } else {
        addSimilarBtn.style.display = "none";
      }
    }

    if (setStartBtn) {
      if (this.musicPlayer.pathfindingState.settingStart) {
        setStartBtn.style.background = "#FFB84D";
        setStartBtn.style.borderColor = "#FFB84D";
        setStartBtn.style.color = "white";
        setStartBtn.textContent = "Click a track...";
      } else if (this.musicPlayer.pathfindingState.startTrack) {
        setStartBtn.style.background = "#1DB954";
        setStartBtn.style.borderColor = "#1DB954";
        setStartBtn.style.color = "white";
        setStartBtn.textContent = "✓ Start Set";
      } else {
        setStartBtn.style.background = "transparent";
        setStartBtn.style.borderColor = "#666";
        setStartBtn.style.color = "#B3B3B3";
        setStartBtn.innerHTML =
          '<i data-lucide="play" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></i>Set Start Track';
      }
    }

    if (setEndBtn) {
      if (this.musicPlayer.pathfindingState.settingEnd) {
        setEndBtn.style.background = "#FFB84D";
        setEndBtn.style.borderColor = "#FFB84D";
        setEndBtn.style.color = "white";
        setEndBtn.textContent = "Click a track...";
      } else if (this.musicPlayer.pathfindingState.endTrack) {
        setEndBtn.style.background = "#1DB954";
        setEndBtn.style.borderColor = "#1DB954";
        setEndBtn.style.color = "white";
        setEndBtn.textContent = "✓ End Set";
      } else {
        setEndBtn.style.background = "transparent";
        setEndBtn.style.borderColor = "#666";
        setEndBtn.style.color = "#B3B3B3";
        setEndBtn.innerHTML =
          '<i data-lucide="flag" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></i>Set End Track';
      }
    }

    if (findPathBtn) {
      const canFindPath =
        this.musicPlayer.pathfindingState.startTrack && this.musicPlayer.pathfindingState.endTrack;
      findPathBtn.disabled = !canFindPath;
      findPathBtn.style.opacity = canFindPath ? "1" : "0.5";
      findPathBtn.style.cursor = canFindPath ? "pointer" : "not-allowed";

      if (canFindPath) {
        findPathBtn.style.background = "#9A4AE2";
        findPathBtn.style.borderColor = "#9A4AE2";
        findPathBtn.style.color = "white";
      }
    }

    if (this.musicPlayer.discoveryMode === "none") {
      this.updateDiscoveryStatus(
        "Select tracks to discover musical connections",
      );
    } else if (this.musicPlayer.discoveryMode === "pathfinding") {
      if (this.musicPlayer.pathfindingState.settingStart) {
        this.updateDiscoveryStatus("Click a track to set as start point");
      } else if (this.musicPlayer.pathfindingState.settingEnd) {
        this.updateDiscoveryStatus("Click a track to set as end point");
      } else if (
        this.musicPlayer.pathfindingState.startTrack &&
        this.musicPlayer.pathfindingState.endTrack
      ) {
        this.updateDiscoveryStatus("Ready to find shortest path");
      }
    }

    this.musicPlayer.utilities.refreshLucideIcons();
  }

  updateDiscoveryStatus(message) {
    const statusElement = document.getElementById("discovery-status");
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  updatePlayButton() {
    const playPauseBtn = document.getElementById("play-pause");
    if (playPauseBtn) {
      if (this.musicPlayer.isPlaying) {
        playPauseBtn.innerHTML =
          '<i data-lucide="pause" style="width: 20px; height: 20px; margin-left: 0px;"></i>';
      } else {
        playPauseBtn.innerHTML =
          '<i data-lucide="play" style="width: 20px; height: 20px; margin-left: 2px;"></i>';
      }

      this.musicPlayer.utilities.refreshLucideIcons();
    }
  }

  updateVolumeButton() {
    const volumeBtn = document.getElementById("volume-btn");
    if (volumeBtn) {
      if (this.musicPlayer.isMuted) {
        volumeBtn.innerHTML =
          '<i data-lucide="volume-x" style="width: 18px; height: 18px;"></i>';
        volumeBtn.style.color = "#FF6B35";
      } else {
        volumeBtn.innerHTML =
          '<i data-lucide="volume-2" style="width: 18px; height: 18px;"></i>';
        volumeBtn.style.color = "#B3B3B3";
      }

      this.musicPlayer.utilities.refreshLucideIcons();
    }
  }

  updateNavigationButtons() {
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");

    const hasPlaylist = this.musicPlayer.selectedTracks.length > 0;

    if (prevBtn) {
      prevBtn.style.color = hasPlaylist ? "#FFFFFF" : "#B3B3B3";
      prevBtn.style.opacity = hasPlaylist ? "1" : "0.5";
      prevBtn.style.cursor = hasPlaylist ? "pointer" : "not-allowed";
      prevBtn.title = hasPlaylist
        ? `Previous track (${this.musicPlayer.selectedTracks.length} in playlist)`
        : "No tracks in playlist";
    }

    if (nextBtn) {
      nextBtn.style.color = hasPlaylist ? "#FFFFFF" : "#B3B3B3";
      nextBtn.style.opacity = hasPlaylist ? "1" : "0.5";
      nextBtn.style.cursor = hasPlaylist ? "pointer" : "not-allowed";
      nextBtn.title = hasPlaylist
        ? `Next track (${this.musicPlayer.selectedTracks.length} in playlist)`
        : "No tracks in playlist";
    }
  }

  updateSelectedTracksList() {
    const selectedTracksContent = document.getElementById(
      "selected-tracks-list",
    );
    if (!selectedTracksContent) {
      return;
    }

    if (this.musicPlayer.selectedTracks.length === 0) {
      selectedTracksContent.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #b3b3b3;">
          <i data-lucide="music" style="width: 24px; height: 24px; margin-bottom: 8px; display: block; margin: 0 auto 8px;"></i>
          No tracks selected
        </div>
      `;
      if (typeof lucide !== "undefined" && lucide.createIcons) {
        lucide.createIcons();
      }
      return;
    }

    const tracksHTML = this.musicPlayer.selectedTracks
      .map((track, index) => {
        const trackId = track.track_id || track.uuid || track.id;
        const title = this.musicPlayer.utilities.formatTrackTitle(track);
        const artist = this.musicPlayer.utilities.formatArtistName(track);
        const isCurrentTrack = index === this.musicPlayer.currentTrackIndex;

        return `
          <div class="selected-track-item ${isCurrentTrack ? "current" : ""}" 
               data-track-id="${trackId}" 
               data-index="${index}">
            <div class="track-info">
              <div class="track-number">${index + 1}</div>
              <div class="track-details">
                <div class="track-title">${title}</div>
                <div class="track-artist">${artist}</div>
              </div>
            </div>
            <div class="track-actions">
              <button class="play-track-btn" data-index="${index}" title="Play this track">
                <i data-lucide="${isCurrentTrack && this.musicPlayer.isPlaying ? "pause" : "play"}" 
                   style="width: 16px; height: 16px;"></i>
              </button>
              <button class="remove-track-btn" data-track-id="${trackId}" title="Remove from playlist">
                <i data-lucide="x" style="width: 16px; height: 16px;"></i>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    selectedTracksContent.innerHTML = tracksHTML;

    this.updateNavigationButtons();

    this.musicPlayer.selectedTracks.forEach((track, index) => {
      const trackId = track.track_id || track.uuid || track.id;
      const sphere = this.musicPlayer.trackMap?.get(trackId);
      if (sphere && !sphere.material.userData.isSelected) {
        this.musicPlayer.visualEffects.addBloomEffect(sphere);
        sphere.scale.set(1.3, 1.3, 1.3);
      }
    });

    this.musicPlayer.connectionManager.showPlaylistConnections();

    // Add event listeners for the new buttons
    selectedTracksContent.querySelectorAll('.play-track-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        this.musicPlayer.trackManager.playTrackByIndex(index);
      });
    });

    selectedTracksContent.querySelectorAll('.remove-track-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.trackId;
        this.musicPlayer.trackManager.removeFromSelectedTracks(trackId);
      });
    });

    this.musicPlayer.utilities.refreshLucideIcons();
  }

}