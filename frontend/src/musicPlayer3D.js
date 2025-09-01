import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export class MusicPlayer3D {
  constructor(containerId) {
    this.containerId = containerId;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.composer = null;
    this.bloomPass = null;
    this.tracks = [];
    this.musicSpheres = [];
    this.connectionLines = [];
    this.connections = [];
    this.clickedSpheres = new Set();
    this.activeConnections = new Map();
    this.currentTrack = null;
    this.selectedTracks = [];
    this.currentTrackIndex = -1;

    this.discoveryMode = "none";
    this.pathfindingState = {
      startTrack: null,
      endTrack: null,
      settingStart: false,
      settingEnd: false,
    };
    this.similarityContext = new Set();
    this.audio = new Audio();
    this.isPlaying = false;
    this.isMuted = false;
    this.previousVolume = 1.0;
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();

    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.bufferLength = 0;
    this.backgroundUniforms = null;

    this.audioAnalysis = {
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      treble: 0,
      overall: 0,
      bassKick: 0,
      beatDetected: false,
    };

    this.prevAudioAnalysis = {
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      treble: 0,
      overall: 0,
    };

    this.apiBase = "http://localhost:8000/api";

    this.setupAudioEvents();
    this.setupControlEvents();
    this.setupVisualLogging();
    this.loadSelectedTracks();

    this.vlog("[INIT] MusicPlayer3D initialized");
    this.vlog(`[API] API Base: ${this.apiBase}`);
  }

  setupVisualLogging() {
    const clearLogBtn = document.getElementById("clear-log-btn");
    if (clearLogBtn) {
      clearLogBtn.addEventListener("click", () => {
        this.clearVisualLog();
      });
    }
  }

  vlog(message, type = "info") {
    const logContent = document.getElementById("log-content");
    if (logContent) {
      const timestamp = new Date().toLocaleTimeString();
      const colors = {
        info: "#ccc",
        success: "#1DB954",
        warning: "#FFB84D",
        error: "#FF6B35",
        debug: "#888",
      };

      const logEntry = document.createElement("div");
      logEntry.style.color = colors[type] || "#ccc";
      logEntry.style.marginBottom = "2px";
      logEntry.innerHTML = `<span style="color: #666;">[${timestamp}]</span> ${message}`;

      logContent.appendChild(logEntry);

      logContent.scrollTop = logContent.scrollHeight;

      while (logContent.children.length > 50) {
        logContent.removeChild(logContent.firstChild);
      }
    }
  }

  clearVisualLog() {
    const logContent = document.getElementById("log-content");
    if (logContent) {
      logContent.innerHTML = "";
    }
  }

  async init() {
    await this.loadTracks();
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();

    await new Promise((resolve) => setTimeout(resolve, 100));

    this.setupPostProcessing();
    this.setupControls();
    this.setupLights();
    this.createMusicSpheres();
    this.createConnections();
    this.setupEventListeners();

    if (this.selectedTracks.length > 0) {
      this.restoreVisualSelections();
    }

    window.musicPlayer = this;

    this.updateNavigationButtons();
    this.updatePlayButton();
    this.updateVolumeButton();
    this.updateDiscoveryUI();

    await new Promise((resolve) => setTimeout(resolve, 100));

    this.animate();
  }

  async loadTracks() {
    try {
      this.vlog("[TRACKS] Loading positioned tracks from API...");
      const response = await fetch(`${this.apiBase}/tracks/positioned`, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
      });
      if (!response.ok) {
        this.vlog(
          `[WARN] Positioned tracks not available (${response.status}), falling back to regular tracks`,
          "warning",
        );
        const fallbackResponse = await fetch(`${this.apiBase}/tracks`, {
          method: "GET",
          mode: "cors",
          credentials: "omit",
        });
        if (!fallbackResponse.ok) {
          throw new Error(
            `Failed to load tracks: ${fallbackResponse.status} ${fallbackResponse.statusText}`,
          );
        }
        const fallbackData = await fallbackResponse.json();

        const tracks = Array.isArray(fallbackData)
          ? fallbackData
          : fallbackData.tracks || [];
        this.tracks = tracks;
        this.trackPositions = null;
        this.connections = [];
        this.vlog(
          `[SUCCESS] Loaded ${this.tracks.length} tracks via fallback`,
          "success",
        );
        this.vlog(`[DEBUG] First track UUID: ${this.tracks[0]?.uuid}`, "debug");
      } else {
        const positionedData = await response.json();
        this.tracks = positionedData.tracks;
        this.trackPositions = positionedData.tracks;
        this.connections = positionedData.connections || [];
        this.vlog(
          `[SUCCESS] Loaded ${this.tracks.length} positioned tracks with ${this.connections.length} connections`,
          "success",
        );
        this.vlog(
          `[DEBUG] First positioned track UUID: ${this.tracks[0]?.uuid}`,
          "debug",
        );

        if (positionedData.metadata) {
          this.vlog(
            `[DATA] Metadata: ${positionedData.metadata.source}`,
            "debug",
          );
        }
      }
      this.vlog(
        `[SUCCESS] Total tracks loaded: ${this.tracks.length}`,
        "success",
      );

      this.updateTrackCountDisplay();
    } catch (error) {
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        this.vlog(
          "[ERROR] Network error - Failed to connect to API. Please check:",
          "error",
        );
        this.vlog(
          "[ERROR] 1. Is the backend server running on localhost:8000?",
          "error",
        );
        this.vlog("[ERROR] 2. Is CORS properly configured?", "error");
        this.vlog("[ERROR] 3. Are there any network/firewall issues?", "error");
      }
      throw new Error(
        `Failed to connect to music API. Please ensure the server is running on localhost:8000. Details: ${error.message}`,
      );
    }
  }

  updateTrackCountDisplay() {
    const galaxyInfo = document.getElementById("galaxy-info");
    if (galaxyInfo) {
      galaxyInfo.innerHTML = `
                <div style="font-size: 12px; color: #B3B3B3; line-height: 1.6;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <i data-lucide="bar-chart" style="width: 12px; height: 12px; color: #1DB954;"></i>
                        Total Tracks: <span style="color: #1DB954; font-weight: bold;">${this.tracks.length}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <i data-lucide="heart" style="width: 12px; height: 12px; color: #E91E63;"></i>
                        Selected Tracks: <span style="color: #E91E63; font-weight: bold;">${this.selectedTracks.length}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="network" style="width: 12px; height: 12px; color: #9C27B0;"></i>
                        Active Connections: <span style="color: #9C27B0; font-weight: bold;">${Array.from(this.activeConnections.values()).reduce((total, lines) => total + lines.length, 0)}</span>
                    </div>
                </div>
            `;
    }

    if (typeof lucide !== "undefined" && lucide.createIcons) {
      lucide.createIcons();
    }

    this.updateSelectedTracksList();
  }

  updateSelectedTracksList() {
    const selectedTracksContent = document.getElementById(
      "selected-tracks-list",
    );
    if (!selectedTracksContent) {
      return;
    }

    if (this.selectedTracks.length === 0) {
      selectedTracksContent.innerHTML = `
                <div style="text-align: center; color: #888; font-style: italic;">No tracks selected</div>
            `;
      return;
    }

    let tracksHTML = "";
    this.selectedTracks.forEach((track, index) => {
      let artist = "Unknown Artist";
      let title = "Unknown Track";

      if (track.metadata) {
        artist =
          track.metadata.artist_display || track.metadata.artist || artist;
        title =
          track.metadata.track_display || track.metadata.track_name || title;
      } else {
        const trackId = track.track_id || track.id;
        const parts = trackId.split("_");
        artist = (parts[0] || artist).replace(/_/g, " ");
        title = (parts[2] || parts[1] || title).replace(/_/g, " ");
      }

      const isCurrentTrack = index === this.currentTrackIndex;

      tracksHTML += `
                <div style="
                    padding: 8px; 
                    margin: 4px 0; 
                    border-radius: 4px; 
                    background: ${isCurrentTrack ? "rgba(29, 185, 84, 0.2)" : "rgba(255, 255, 255, 0.05)"};
                    border-left: 3px solid ${isCurrentTrack ? "#1DB954" : "transparent"};
                    cursor: pointer;
                    transition: background 0.3s ease;
                " onclick="window.musicPlayer?.playTrackByIndex?.(${index})">
                    <div style="font-weight: bold; color: ${isCurrentTrack ? "#1DB954" : "#FFFFFF"}; font-size: 11px;">
                        ${index + 1}. ${title}
                    </div>
                    <div style="color: #B3B3B3; font-size: 10px; margin-top: 2px;">
                        ${artist}
                    </div>
                </div>
            `;
    });

    selectedTracksContent.innerHTML = tracksHTML;

    this.updateNavigationButtons();

    this.selectedTracks.forEach((track, index) => {
      const trackId = track.track_id || track.uuid || track.id;
      const sphere = this.trackMap?.get(trackId);
      if (sphere && !sphere.material.userData.isSelected) {
        this.addBloomEffect(sphere);
        sphere.scale.set(1.3, 1.3, 1.3);
      }
    });

    this.showPlaylistConnections();
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x191414);

    this.createStarfield();
  }

  createStarfield() {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1000;
    const positions = new Float32Array(starCount * 3);
    const velocities = new Float32Array(starCount * 3);
    const originalPositions = new Float32Array(starCount * 3);
    const frequencies = new Float32Array(starCount);

    for (let i = 0; i < starCount * 3; i += 3) {
      const radius = 50 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;

      positions[i] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i + 2] = radius * Math.cos(phi);

      originalPositions[i] = positions[i];
      originalPositions[i + 1] = positions[i + 1];
      originalPositions[i + 2] = positions[i + 2];

      velocities[i] = (Math.random() - 0.5) * 0.02;
      velocities[i + 1] = (Math.random() - 0.5) * 0.02;
      velocities[i + 2] = (Math.random() - 0.5) * 0.02;

      frequencies[i / 3] = Math.floor(Math.random() * 128);
    }

    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    starGeometry.setAttribute(
      "velocity",
      new THREE.BufferAttribute(velocities, 3),
    );
    starGeometry.setAttribute(
      "originalPosition",
      new THREE.BufferAttribute(originalPositions, 3),
    );
    starGeometry.setAttribute(
      "frequency",
      new THREE.BufferAttribute(frequencies, 1),
    );

    const starMaterial = new THREE.PointsMaterial({
      color: 0xb3b3b3,
      size: 0.5,
      transparent: true,
      opacity: 0.8,
      vertexColors: false,
    });

    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.stars);

    this.starfield = {
      geometry: starGeometry,
      material: starMaterial,
      points: this.stars,
      baseOpacity: 0.8,
      baseSize: 0.5,
      positions: positions,
      originalPositions: originalPositions,
      velocities: velocities,
      frequencies: frequencies,
    };
  }

  setupCamera() {
    const container = document.getElementById(this.containerId);
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 30);
  }

  setupRenderer() {
    const container = document.getElementById(this.containerId);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    container.appendChild(this.renderer.domElement);
  }

  setupPostProcessing() {
    const container = document.getElementById(this.containerId);

    try {
      this.composer = new EffectComposer(this.renderer);

      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.3,
        0.2,
        2.0,
      );
      this.composer.addPass(this.bloomPass);

      const outputPass = new OutputPass();
      this.composer.addPass(outputPass);

      this.composer.render();
    } catch (error) {
      if (this.composer) {
        this.composer.dispose?.();
      }

      this.composer = null;
      this.bloomPass = null;
    }
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI;

    this.controls.enableZoom = true;
    this.controls.enableRotate = true;
    this.controls.enablePan = true;

    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(10, 10, 5);
    this.scene.add(directionalLight);
  }

  createMusicSpheres() {
    const maxSpheres = this.tracks.length;
    const baseRadius = 25;

    const sphereGeometry = new THREE.SphereGeometry(0.3, 16, 16);

    for (let i = 0; i < maxSpheres; i++) {
      const track = this.tracks[i];

      const advancedColor = this.getAdvancedTrackColor(track, i, maxSpheres);

      const material = new THREE.MeshStandardMaterial({
        color: advancedColor,
        metalness: 0.1,
        roughness: 0.3,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
        transparent: true,
        opacity: 0.9,
      });

      material.userData = {
        originalColor: advancedColor.clone(),
        emotionalColor: this.getEmotionalColor(track, i, maxSpheres),
        sonicColor: this.getSonicColor(track),
        hybridColor: this.getHybridColor(track, i, maxSpheres),
        isSelected: false,
        bloomIntensity: 0.0,
        colorMode: "emotional",
      };

      const sphere = new THREE.Mesh(sphereGeometry, material);

      if (
        track.position &&
        track.position.x !== undefined &&
        track.position.y !== undefined &&
        track.position.z !== undefined
      ) {
        sphere.position.x = track.position.x * 1.0;
        sphere.position.y = track.position.y * 1.0;
        sphere.position.z = track.position.z * 1.0;
      } else if (this.trackPositions && track.position) {
        sphere.position.x = track.position.x * 1.2;
        sphere.position.y = track.position.y * 1.2;
        sphere.position.z = track.position.z * 1.2;
      } else if (track.coordinates) {
        const coords = track.coordinates;

        sphere.position.x = (coords.valence * 2 - 1) * baseRadius * 1.5;
        sphere.position.y = coords.energy * baseRadius * 2 - baseRadius;
        sphere.position.z = coords.complexity * baseRadius * 2 - baseRadius;

        const tensionRadius = coords.tension * baseRadius * 0.5;
        const currentRadius = Math.sqrt(
          sphere.position.x ** 2 +
            sphere.position.y ** 2 +
            sphere.position.z ** 2,
        );
        if (currentRadius > 0) {
          const scale = (currentRadius + tensionRadius) / currentRadius;
          sphere.position.multiplyScalar(scale);
        }
      } else if (track.sonic_dna && track.sonic_dna.features) {
        const features = track.sonic_dna.features;
        sphere.position.x = (features.valence - 0.5) * baseRadius * 2.5;
        sphere.position.y = (features.energy - 0.5) * baseRadius * 2.5;
        sphere.position.z = (features.danceability - 0.5) * baseRadius * 2.5;
      } else {
        const phi = Math.PI * (3.0 - Math.sqrt(5.0));
        const y = 1 - (i / (maxSpheres - 1)) * 2;
        const radius_at_y = Math.sqrt(1 - y * y);

        const theta = phi * i;

        sphere.position.x = Math.cos(theta) * radius_at_y * baseRadius;
        sphere.position.y = y * baseRadius;
        sphere.position.z = Math.sin(theta) * radius_at_y * baseRadius;
      }

      sphere.userData = {
        track,
        originalColor: material.color.clone(),
        originalPosition: sphere.position.clone(),
        floatOffset: Math.random() * Math.PI * 2,
        pulseOffset: Math.random() * Math.PI * 2,
        energyLevel:
          track.coordinates?.energy || track.sonic_dna?.features?.energy || 0.5,
      };

      this.scene.add(sphere);
      this.musicSpheres.push(sphere);
    }

    this.updateTrackCountDisplay();
  }

  createConnections() {
    if (!this.connections || this.connections.length === 0) {
      return;
    }

    this.trackMap = new Map();
    this.musicSpheres.forEach((sphere) => {
      const trackId =
        sphere.userData.track.track_id || sphere.userData.track.id;
      if (trackId) {
        this.trackMap.set(trackId, sphere);
      }
    });
  }

  toggleSphereConnections(sphere, trackId) {
    if (this.clickedSpheres.has(trackId)) {
      this.removeConnectionsForSphere(trackId);
      this.clickedSpheres.delete(trackId);

      this.removeBloomEffect(sphere);
      sphere.scale.set(1, 1, 1);

      sphere.material.emissive.setHex(0x000000);
      sphere.material.emissiveIntensity = 0;

      this.removeFromSelectedTracks(trackId);
    } else {
      this.addConnectionsForSphere(trackId);
      this.clickedSpheres.add(trackId);

      this.addBloomEffect(sphere);
      sphere.scale.set(1.3, 1.3, 1.3);

      sphere.material.emissive.setHex(0x1db954);
      sphere.material.emissiveIntensity = 0.3;

      this.addToSelectedTracks(sphere.userData.track, trackId);

      this.playTrack(sphere.userData.track, sphere);
    }

    this.updateTrackCountDisplay();

    this.createClickWaveEffect(sphere);
  }

  createClickWaveEffect(sphere) {
    const trackId =
      sphere.userData.track.track_id ||
      sphere.userData.track.uuid ||
      sphere.userData.track.id;
    const isNowSelected = this.clickedSpheres.has(trackId);

    const originalEmissive = sphere.material.emissive.getHex();
    const originalEmissiveIntensity = sphere.material.emissiveIntensity;

    sphere.material.emissive.setHex(0x00ffff);
    sphere.material.emissiveIntensity = 1.0;

    let startTime = null;
    const duration = 400;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      sphere.material.emissiveIntensity = 1.0 * (1 - progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        if (isNowSelected) {
          sphere.material.emissive.setHex(0x1db954);
          sphere.material.emissiveIntensity = 0.3;
        } else {
          sphere.material.emissive.setHex(originalEmissive);
          sphere.material.emissiveIntensity = originalEmissiveIntensity;
        }
      }
    };

    requestAnimationFrame(animate);
  }

  addBloomEffect(sphere) {
    sphere.material.userData.isSelected = true;
    sphere.material.userData.bloomIntensity = 1.0;

    const originalColor =
      sphere.material.userData.originalColor ||
      sphere.userData.originalColor ||
      new THREE.Color(0x1db954);

    const bloomColor = originalColor.clone().multiplyScalar(1.8);
    sphere.material.color.copy(bloomColor);

    const emissiveColor = originalColor.clone().multiplyScalar(0.5);
    sphere.material.emissive.copy(emissiveColor);
    sphere.material.emissiveIntensity = 0.15;

    sphere.material.metalness = 0.0;
    sphere.material.roughness = 0.1;
    sphere.material.opacity = 1.0;

    sphere.scale.set(1.5, 1.5, 1.5);

    sphere.material.needsUpdate = true;
  }

  removeBloomEffect(sphere) {
    sphere.material.userData.isSelected = false;
    sphere.material.userData.bloomIntensity = 0.0;

    const originalColor =
      sphere.material.userData.originalColor ||
      sphere.userData.originalColor ||
      new THREE.Color(0x1db954);

    sphere.material.color.copy(originalColor);

    sphere.material.emissive.setHex(0x000000);
    sphere.material.emissiveIntensity = 0.0;

    sphere.material.metalness = 0.1;
    sphere.material.roughness = 0.3;
    sphere.material.opacity = 0.9;

    sphere.scale.set(1.0, 1.0, 1.0);

    sphere.material.needsUpdate = true;
  }

  addHoverEffect(sphere) {
    if (!sphere.material.userData.isSelected) {
      const originalColor =
        sphere.material.userData.originalColor ||
        sphere.userData.originalColor ||
        new THREE.Color(0x1db954);
      const hoverColor = originalColor.clone().multiplyScalar(1.8);

      sphere.material.color.copy(hoverColor);
      sphere.material.emissive.copy(originalColor.clone().multiplyScalar(0.3));
      sphere.material.emissiveIntensity = 0.2;
      sphere.scale.set(1.2, 1.2, 1.2);
      sphere.material.needsUpdate = true;
    }
  }

  removeHoverEffect(sphere) {
    if (!sphere.material.userData.isSelected) {
      const originalColor =
        sphere.material.userData.originalColor ||
        sphere.userData.originalColor ||
        new THREE.Color(0x1db954);

      sphere.material.color.copy(originalColor);
      sphere.material.emissive.setHex(0x000000);
      sphere.material.emissiveIntensity = 0.0;
      sphere.scale.set(1.0, 1.0, 1.0);
      sphere.material.needsUpdate = true;
    }
  }

  addConnectionsForSphere(trackId) {
    if (this.discoveryMode === "none") return;

    if (this.discoveryMode === "similar") {
      this.showSimilarTracks(trackId);
    }
  }

  showSimilarTracks(trackId) {
    if (!this.connections || !this.trackMap) return;

    const connectionLines = [];

    this.similarityContext.clear();
    this.similarityContext.add(trackId);

    this.connections.forEach((connection) => {
      if (connection.source === trackId || connection.target === trackId) {
        const sourceSphere = this.trackMap.get(connection.source);
        const targetSphere = this.trackMap.get(connection.target);

        if (sourceSphere && targetSphere) {
          const connectedTrack =
            connection.source === trackId
              ? connection.target
              : connection.source;
          this.similarityContext.add(connectedTrack);

          const points = [
            sourceSphere.position.clone(),
            targetSphere.position.clone(),
          ];
          const geometry = new THREE.BufferGeometry().setFromPoints(points);

          const strength = connection.weight || connection.similarity || 0.5;
          const material = new THREE.LineBasicMaterial({
            color: new THREE.Color(0x1db954),
            transparent: true,
            opacity: Math.min(strength * 0.8, 0.6),
            linewidth: 2,
          });

          const line = new THREE.Line(geometry, material);
          line.userData = {
            connection: connection,
            sourceTrack: connection.source,
            targetTrack: connection.target,
            isStatic: true,
          };

          this.scene.add(line);
          connectionLines.push(line);
        }
      }
    });

    this.activeConnections.set(trackId, connectionLines);
    this.updateDiscoveryUI();
  }

  showPlaylistConnections() {
    if (this.discoveryMode !== "none") return;

    const existingPlaylistLines = this.activeConnections.get("playlist");
    if (existingPlaylistLines) {
      existingPlaylistLines.forEach((line) => {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      });
    }

    if (this.selectedTracks.length < 2) {
      this.activeConnections.delete("playlist");
      return;
    }

    if (!this.trackMap) {
      return;
    }

    const connectionLines = [];

    for (let i = 0; i < this.selectedTracks.length - 1; i++) {
      const sourceTrack = this.selectedTracks[i];
      const targetTrack = this.selectedTracks[i + 1];

      const sourceTrackId =
        sourceTrack.track_id || sourceTrack.uuid || sourceTrack.id;
      const targetTrackId =
        targetTrack.track_id || targetTrack.uuid || targetTrack.id;

      const sourceSphere = this.trackMap.get(sourceTrackId);
      const targetSphere = this.trackMap.get(targetTrackId);

      if (sourceSphere && targetSphere) {
        const startPoint = sourceSphere.position.clone();
        const endPoint = targetSphere.position.clone();

        const midPoint = new THREE.Vector3().lerpVectors(
          startPoint,
          endPoint,
          0.5,
        );

        midPoint.y += 1.0;

        const curve = new THREE.QuadraticBezierCurve3(
          startPoint,
          midPoint,
          endPoint,
        );
        const points = curve.getPoints(20);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(0x1db954),
          transparent: true,
          opacity: 0.7,
          linewidth: 1.5,
        });

        const line = new THREE.Line(geometry, material);
        line.userData = {
          type: "playlistConnection",
          sourceTrack: sourceTrackId,
          targetTrack: targetTrackId,
          isStatic: true,
        };

        this.scene.add(line);
        connectionLines.push(line);
      }
    }

    this.activeConnections.set("playlist", connectionLines);
  }

  calculateVectorSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  calculateEmotionalSimilarity(track1, track2) {
    if (!track1.coordinates || !track2.coordinates) return 0;

    const coords1 = track1.coordinates;
    const coords2 = track2.coordinates;

    const diff = Math.sqrt(
      Math.pow(coords1.valence - coords2.valence, 2) +
        Math.pow(coords1.energy - coords2.energy, 2) +
        Math.pow(coords1.complexity - coords2.complexity, 2) +
        Math.pow(coords1.tension - coords2.tension, 2),
    );

    return Math.max(0, 1 - diff / 2);
  }

  removeConnectionsForSphere(trackId) {
    const connectionLines = this.activeConnections.get(trackId);
    if (connectionLines) {
      connectionLines.forEach((line) => {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      });
      this.activeConnections.delete(trackId);
    }
  }

  clearAllConnections() {
    this.activeConnections.forEach((connectionLines) => {
      connectionLines.forEach((line) => {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      });
    });
    this.activeConnections.clear();
    this.clickedSpheres.clear();

    this.musicSpheres.forEach((sphere) => {
      this.removeBloomEffect(sphere);
      sphere.scale.set(1, 1, 1);

      sphere.material.emissive.setHex(0x000000);
      sphere.material.emissiveIntensity = 0;
    });

    this.selectedTracks = [];
    this.currentTrackIndex = -1;
    this.saveSelectedTracks();

    this.updateTrackCountDisplay();
    this.updateSelectedTracksList();
  }

  clearConnectionsOnly() {
    const playlistConnections = this.activeConnections.get("playlist");

    this.activeConnections.forEach((connectionLines, key) => {
      if (key === "playlist") return;

      connectionLines.forEach((line) => {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      });
    });

    this.activeConnections.forEach((connectionLines, key) => {
      if (key !== "playlist") {
        this.activeConnections.delete(key);
      }
    });

    this.clickedSpheres.clear();

    this.musicSpheres.forEach((sphere) => {
      const trackId =
        sphere.userData.track.track_id ||
        sphere.userData.track.uuid ||
        sphere.userData.track.id;

      const isSelectedTrack = this.selectedTracks.some(
        (track) => (track.track_id || track.uuid || track.id) === trackId,
      );

      if (!isSelectedTrack) {
        this.removeBloomEffect(sphere);
        sphere.scale.set(1, 1, 1);
      }
    });

    this.selectedTracks.forEach((track) => {
      const trackId = track.track_id || track.uuid || track.id;
      this.clickedSpheres.add(trackId);
      const sphere = this.trackMap?.get(trackId);
      if (sphere) {
        this.addBloomEffect(sphere);
        sphere.scale.set(1.3, 1.3, 1.3);
      }
    });

    if (playlistConnections) {
      this.activeConnections.set("playlist", playlistConnections);
    }

    this.updateTrackCountDisplay();
  }

  loadSelectedTracks() {
    try {
      const saved = localStorage.getItem("musicPlayer_selectedTracks");
      if (saved) {
        this.selectedTracks = JSON.parse(saved);
      }
    } catch (error) {
      this.selectedTracks = [];
    }
  }

  saveSelectedTracks() {
    try {
      localStorage.setItem(
        "musicPlayer_selectedTracks",
        JSON.stringify(this.selectedTracks),
      );
    } catch (error) {}
  }

  restoreVisualSelections() {
    this.selectedTracks.forEach((trackData, index) => {
      const trackId = trackData.track_id || trackData.uuid || trackData.id;

      let sphere = null;

      if (this.trackMap && this.trackMap.has(trackId)) {
        sphere = this.trackMap.get(trackId);
      } else {
        sphere = this.musicSpheres?.find((s) => {
          const sphereTrackId =
            s.userData.track.track_id ||
            s.userData.track.uuid ||
            s.userData.track.id;
          return sphereTrackId === trackId;
        });
      }

      if (sphere) {
        this.clickedSpheres.add(trackId);
        this.addBloomEffect(sphere);
        sphere.scale.set(1.3, 1.3, 1.3);

        if (this.discoveryMode !== "none") {
          this.addConnectionsForSphere(trackId);
        }
      }
    });

    if (this.discoveryMode === "none") {
      this.showPlaylistConnections();
    }

    this.updateTrackCountDisplay();
  }

  addToSelectedTracks(track, trackId) {
    const existing = this.selectedTracks.findIndex(
      (t) => (t.track_id || t.id) === trackId,
    );
    if (existing === -1) {
      this.selectedTracks.push(track);
      this.currentTrackIndex = this.selectedTracks.length - 1;
      this.saveSelectedTracks();
      this.updateSelectedTracksList();

      this.createPlaylistFlow();
    } else {
      this.currentTrackIndex = existing;
      this.updateSelectedTracksList();
    }
  }

  removeFromSelectedTracks(trackId) {
    const index = this.selectedTracks.findIndex(
      (t) => (t.track_id || t.id) === trackId,
    );
    if (index !== -1) {
      this.selectedTracks.splice(index, 1);

      if (this.currentTrackIndex >= index) {
        this.currentTrackIndex = Math.max(0, this.currentTrackIndex - 1);
      }
      if (this.selectedTracks.length === 0) {
        this.currentTrackIndex = -1;
      }

      this.saveSelectedTracks();
      this.updateSelectedTracksList();

      this.createPlaylistFlow();

      if (this.discoveryMode === "none") {
        this.showPlaylistConnections();
      }
    }
  }

  clearAllSelectedTracks() {
    this.selectedTracks = [];
    this.currentTrackIndex = -1;
    this.saveSelectedTracks();
    this.clearAllConnections();

    this.createPlaylistFlow();

    this.updateSelectedTracksList();
  }

  playNext() {
    if (this.selectedTracks.length === 0) {
      return;
    }

    if (this.currentTrackIndex === -1) {
      this.currentTrackIndex = 0;
    } else {
      this.currentTrackIndex =
        (this.currentTrackIndex + 1) % this.selectedTracks.length;
    }

    this.playTrackByIndex(this.currentTrackIndex);
  }

  playPrevious() {
    if (this.selectedTracks.length === 0) {
      return;
    }

    if (this.currentTrackIndex === -1) {
      this.currentTrackIndex = this.selectedTracks.length - 1;
    } else {
      this.currentTrackIndex =
        this.currentTrackIndex <= 0
          ? this.selectedTracks.length - 1
          : this.currentTrackIndex - 1;
    }

    this.playTrackByIndex(this.currentTrackIndex);
  }

  playTrackByIndex(index) {
    if (index < 0 || index >= this.selectedTracks.length) return;

    const track = this.selectedTracks[index];
    const trackId = track.track_id || track.id;
    const sphere = this.trackMap?.get(trackId);

    this.currentTrackIndex = index;

    this.updateSelectedTracksList();

    if (sphere) {
      this.playTrack(track, sphere);
    } else {
      this.playTrack(track, null);
    }
  }

  getAdvancedTrackColor(track, trackIndex, totalTracks) {
    if (track.emotional_color) {
      const color = track.emotional_color;
      return new THREE.Color(
        Math.max(0, Math.min(255, color.r || 0)) / 255,
        Math.max(0, Math.min(255, color.g || 0)) / 255,
        Math.max(0, Math.min(255, color.b || 0)) / 255,
      );
    }

    if (track.color) {
      const color = track.color;
      return new THREE.Color(
        Math.max(0, Math.min(255, color.r || 0)) / 255,
        Math.max(0, Math.min(255, color.g || 0)) / 255,
        Math.max(0, Math.min(255, color.b || 0)) / 255,
      );
    }

    return this.getEmotionalColor(track, trackIndex, totalTracks);
  }

  getEmotionalColor(track, trackIndex, totalTracks) {
    if (trackIndex !== undefined && totalTracks > 1) {
      let hue = ((trackIndex * 360) / totalTracks) % 360;

      if (track.coordinates) {
        const coords = track.coordinates;
        const valenceOffset = (coords.valence + 0.2) * 15;
        const energyOffset = (coords.energy - 0.5) * 12;
        const complexityOffset = (coords.complexity - 0.5) * 8;
        hue = (hue + valenceOffset + energyOffset + complexityOffset) % 360;
      }

      const hslToRgb = (h, s, l) => {
        h /= 360;
        s /= 100;
        l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => {
          const k = (n + h * 12) % 12;
          return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        };
        return [f(0), f(8), f(4)];
      };

      const [r, g, b] = hslToRgb(hue, 85, 65);
      return new THREE.Color(r, g, b);
    }

    return new THREE.Color(0xff69b4);
  }

  getSonicColor(track) {
    if (track.sonic_color) {
      const color = track.sonic_color;
      return new THREE.Color(
        Math.max(0, Math.min(255, color.r || 120)) / 255,
        Math.max(0, Math.min(255, color.g || 120)) / 255,
        Math.max(0, Math.min(255, color.b || 120)) / 255,
      );
    }

    if (track.metadata && track.metadata.genetic_fingerprint) {
      const fingerprint = track.metadata.genetic_fingerprint;
      const hash = this.hashCode(fingerprint);

      const red = ((hash & 0xff0000) >> 16) / 255;
      const green = ((hash & 0x00ff00) >> 8) / 255;
      const blue = (hash & 0x0000ff) / 255;

      return new THREE.Color(
        Math.max(0.2, red),
        Math.max(0.2, green),
        Math.max(0.2, blue),
      );
    }

    return new THREE.Color(0.7, 0.7, 0.7);
  }

  getHybridColor(track, trackIndex, totalTracks) {
    if (track.hybrid_color) {
      const color = track.hybrid_color;
      return new THREE.Color(
        Math.max(0, Math.min(255, color.r || 120)) / 255,
        Math.max(0, Math.min(255, color.g || 120)) / 255,
        Math.max(0, Math.min(255, color.b || 120)) / 255,
      );
    }

    const emotional = this.getEmotionalColor(track, trackIndex, totalTracks);
    const sonic = this.getSonicColor(track);

    return new THREE.Color(
      (emotional.r + sonic.r) / 2,
      (emotional.g + sonic.g) / 2,
      (emotional.b + sonic.b) / 2,
    );
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  switchColorMode(mode) {
    this.musicSpheres.forEach((sphere, index) => {
      const track = sphere.userData.track;
      let newColor;

      switch (mode) {
        case "sonic":
          newColor = this.getSonicColor(track);
          break;
        case "hybrid":
          newColor = this.getHybridColor(
            track,
            index,
            this.musicSpheres.length,
          );
          break;
        case "emotional":
        default:
          newColor = this.getEmotionalColor(
            track,
            index,
            this.musicSpheres.length,
          );
          break;
      }

      sphere.material.color.copy(newColor);
      sphere.material.userData.originalColor = newColor.clone();
      sphere.material.userData.colorMode = mode;
      sphere.material.needsUpdate = true;

      sphere.userData.originalColor = newColor.clone();
    });
  }

  setupEventListeners() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener("click", this.onCanvasClick.bind(this));
    canvas.addEventListener("mousemove", this.onCanvasMouseMove.bind(this));
    window.addEventListener("resize", this.onWindowResize.bind(this));
    window.addEventListener("keydown", this.onKeyDown.bind(this));
  }

  onCanvasClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.musicSpheres);

    if (intersects.length > 0) {
      const clickedSphere = intersects[0].object;
      const trackId =
        clickedSphere.userData.track.track_id ||
        clickedSphere.userData.track.uuid ||
        clickedSphere.userData.track.id;

      if (this.discoveryMode === "pathfinding") {
        if (this.pathfindingState.settingStart) {
          this.pathfindingState.startTrack = trackId;
          this.pathfindingState.settingStart = false;
          this.updateDiscoveryUI();
          return;
        } else if (this.pathfindingState.settingEnd) {
          this.pathfindingState.endTrack = trackId;
          this.pathfindingState.settingEnd = false;
          this.updateDiscoveryUI();
          return;
        }
      }

      this.toggleSphereConnections(clickedSphere, trackId);
    }
  }

  onCanvasMouseMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.musicSpheres);

    this.musicSpheres.forEach((sphere) => {
      if (!sphere.material.userData.isSelected) {
        this.removeHoverEffect(sphere);
      }
    });

    if (intersects.length > 0) {
      const hoveredSphere = intersects[0].object;
      this.addHoverEffect(hoveredSphere);
      document.body.style.cursor = "pointer";
    } else {
      document.body.style.cursor = "default";
    }
  }

  onWindowResize() {
    const container = document.getElementById(this.containerId);
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);

    if (this.composer) {
      this.composer.setSize(container.clientWidth, container.clientHeight);
    }

    this.controls.update();
  }

  onKeyDown(event) {
    if (event.key === "c" || event.key === "C") {
      this.clearAllConnections();
    }

    if (event.key === "Escape") {
      this.clearAllConnections();
    }

    if (event.key === " ") {
      event.preventDefault();

      if (this.currentTrack) {
        if (this.isPlaying) {
          this.audio.pause();
          this.isPlaying = false;
        } else {
          if (this.audioContext && this.audioContext.state === "suspended") {
            this.audioContext.resume();
          }
          this.audio.play();
          this.isPlaying = true;
        }
        this.updatePlayButton();
      }
    }
  }

  async playTrack(track, sphere) {
    try {
      const trackUUID = track.uuid;
      const trackId = track.track_id || track.uuid || "unknown";

      let displayName = trackId;
      if (track.metadata) {
        const artist =
          track.metadata.artist_display || track.metadata.artist || "Unknown";
        const title =
          track.metadata.track_display ||
          track.metadata.track_name ||
          "Unknown";
        displayName = `${artist} - ${title}`;
      }

      if (!trackUUID) {
        throw new Error(`Track UUID not available for: ${displayName}`);
      }

      if (this.currentTrack && this.currentTrack.sphere) {
        const prevTrackId =
          this.currentTrack.track.track_id || this.currentTrack.track.uuid;
        if (this.clickedSpheres.has(prevTrackId)) {
          this.addBloomEffect(this.currentTrack.sphere);
        } else {
          this.removeBloomEffect(this.currentTrack.sphere);
        }
      }

      this.updateTrackInfo(track);

      this.currentTrack = { track, sphere: sphere || null };

      try {
        if (!trackUUID || trackUUID.trim() === "") {
          throw new Error(
            `Invalid UUID: "${trackUUID}" for track: ${displayName}`,
          );
        }

        if (!this.audio.paused) {
          this.audio.pause();
        }

        if (this.audio.src && this.audio.src.startsWith("blob:")) {
          URL.revokeObjectURL(this.audio.src);
        }

        let audioUrl = null;
        let audioBlob = null;

        try {
          const getUrl = `${this.apiBase}/uuid/${encodeURIComponent(trackUUID.trim())}/audio`;

          const getResponse = await fetch(getUrl, {
            method: "GET",
            headers: {
              Accept: "audio/*",
              "Cache-Control": "no-cache",
            },
          });

          if (getResponse.ok) {
            audioBlob = await getResponse.blob();
            audioUrl = URL.createObjectURL(audioBlob);
          }
        } catch (getError) {
          console.warn(`⚠️ GET request error:`, getError);
        }

        if (!audioUrl) {
          try {
            const postUrl = `${this.apiBase}/uuid/audio`;

            const postResponse = await fetch(postUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "audio/*",
              },
              body: JSON.stringify({
                uuid: trackUUID.trim(),
                track_uuid: trackUUID.trim(),
              }),
            });

            if (postResponse.ok) {
              audioBlob = await postResponse.blob();
              audioUrl = URL.createObjectURL(audioBlob);
            } else {
              console.error(
                `POST request failed: ${postResponse.status} ${postResponse.statusText}`,
              );
              const errorText = await postResponse.text();
              console.error(`POST error details:`, errorText);
            }
          } catch (postError) {
            console.error(`POST request error:`, postError);
          }
        }

        if (!audioUrl) {
          throw new Error(
            `Failed to load audio from both GET and POST methods for UUID: ${trackUUID}`,
          );
        }

        this.audio.src = audioUrl;
        this.audio.currentTime = 0;

        const handleAudioError = (event) => {
          this.audio.removeEventListener("error", handleAudioError);
          throw new Error(`Failed to load audio for: ${displayName}`);
        };

        this.audio.addEventListener("error", handleAudioError, { once: true });

        this.audio.load();

        await new Promise((resolve, reject) => {
          const onCanPlay = () => {
            this.audio.removeEventListener("canplay", onCanPlay);
            this.audio.removeEventListener("error", onError);
            resolve();
          };

          const onError = (event) => {
            this.audio.removeEventListener("canplay", onCanPlay);
            this.audio.removeEventListener("error", onError);
            reject(new Error(`Audio loading failed for: ${displayName}`));
          };

          this.audio.addEventListener("canplay", onCanPlay, { once: true });
          this.audio.addEventListener("error", onError, { once: true });
        });

        await this.audio.play();
        this.isPlaying = true;
        this.updatePlayButton();

        if (!this.audioContext) {
          this.setupAudioAnalysis();
        }

        if (sphere) {
          sphere.material.emissive.setHex(0x1db954);
          sphere.material.emissiveIntensity = 0.3;
        }
      } catch (audioError) {
        this.showAudioError(trackId, audioError);

        this.isPlaying = false;
        this.updatePlayButton();

        if (sphere) {
          sphere.material.emissive.setHex(0xff6b35);
          sphere.material.emissiveIntensity = 0.3;
        }
      }
    } catch (error) {
      this.showAudioError(track.track_id || track.uuid, error);
    }
  }

  showAudioError(trackId, error) {
    const notification = document.createElement("div");
    notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(40, 40, 40, 0.95);
            color: #FF6B35;
            padding: 16px 24px;
            border-radius: 8px;
            border: 1px solid #FF6B35;
            z-index: 1000;
            font-size: 14px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            backdrop-filter: blur(10px);
        `;
    notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Audio Playback Issue</div>
            <div style="margin-bottom: 8px;">Track: ${trackId}</div>
            <div style="font-size: 12px; opacity: 0.8;">Check console for details</div>
        `;

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  truncateText(text, maxLength = 35) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  formatTrackTitle(track) {
    if (track.metadata) {
      const metadata = track.metadata;
      const title =
        metadata.track_display || metadata.track_name || "Unknown Track";
      return this.truncateText(title, 35);
    } else {
      const trackId = track.track_id || track.id;
      const parts = trackId.split("_");
      let title = parts.slice(2).join(" ") || "Unknown Track";

      title = title.replace(/^\d+\.\s*/, "");
      title = title.replace(/\.(mp3|flac|wav|m4a)$/i, "");
      return this.truncateText(title, 35);
    }
  }

  formatArtistName(track) {
    if (track.metadata) {
      const metadata = track.metadata;
      const artist =
        metadata.artist_display || metadata.artist || "Unknown Artist";
      return this.truncateText(artist, 25);
    } else {
      const trackId = track.track_id || track.id;
      const parts = trackId.split("_");
      const artist = parts[0] || "Unknown Artist";
      return this.truncateText(artist, 25);
    }
  }

  updateTrackInfo(track) {
    const titleElement = document.getElementById("track-title");
    const artistElement = document.getElementById("track-artist");

    if (titleElement && artistElement) {
      const title = this.formatTrackTitle(track);
      const artist = this.formatArtistName(track);

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

  setupAudioAnalysis() {
    try {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();

      const source = this.audioContext.createMediaElementSource(this.audio);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(this.bufferLength);

      this.audioAnalysis = {
        bass: 0,
        lowMid: 0,
        mid: 0,
        highMid: 0,
        treble: 0,
        overall: 0,
        bassKick: 0,
        beatDetected: false,
      };
    } catch (error) {
      console.warn("🎵 Audio analysis setup failed:", error);
    }
  }

  analyzeAudio() {
    if (!this.analyser || !this.dataArray || !this.isPlaying) {
      return;
    }

    this.analyser.getByteFrequencyData(this.dataArray);

    let bassSum = 0,
      lowMidSum = 0,
      midSum = 0,
      highMidSum = 0,
      trebleSum = 0;
    let bassCount = 0,
      lowMidCount = 0,
      midCount = 0,
      highMidCount = 0,
      trebleCount = 0;
    let overallSum = 0;

    for (let i = 0; i < this.bufferLength; i++) {
      const value = this.dataArray[i] / 255.0;
      overallSum += value;

      if (i <= 4) {
        bassSum += value;
        bassCount++;
      } else if (i <= 15) {
        lowMidSum += value;
        lowMidCount++;
      } else if (i <= 40) {
        midSum += value;
        midCount++;
      } else if (i <= 80) {
        highMidSum += value;
        highMidCount++;
      } else {
        trebleSum += value;
        trebleCount++;
      }
    }

    const rawBass = bassCount > 0 ? bassSum / bassCount : 0;
    const rawLowMid = lowMidCount > 0 ? lowMidSum / lowMidCount : 0;
    const rawMid = midCount > 0 ? midSum / midCount : 0;
    const rawHighMid = highMidCount > 0 ? highMidSum / highMidCount : 0;
    const rawTreble = trebleCount > 0 ? trebleSum / trebleCount : 0;
    const rawOverall = overallSum / this.bufferLength;

    const smoothing = 0.7;
    this.audioAnalysis.bass =
      this.prevAudioAnalysis.bass * smoothing + rawBass * (1 - smoothing);
    this.audioAnalysis.lowMid =
      this.prevAudioAnalysis.lowMid * smoothing + rawLowMid * (1 - smoothing);
    this.audioAnalysis.mid =
      this.prevAudioAnalysis.mid * smoothing + rawMid * (1 - smoothing);
    this.audioAnalysis.highMid =
      this.prevAudioAnalysis.highMid * smoothing + rawHighMid * (1 - smoothing);
    this.audioAnalysis.treble =
      this.prevAudioAnalysis.treble * smoothing + rawTreble * (1 - smoothing);
    this.audioAnalysis.overall =
      this.prevAudioAnalysis.overall * smoothing + rawOverall * (1 - smoothing);

    this.prevAudioAnalysis.bass = this.audioAnalysis.bass;
    this.prevAudioAnalysis.lowMid = this.audioAnalysis.lowMid;
    this.prevAudioAnalysis.mid = this.audioAnalysis.mid;
    this.prevAudioAnalysis.highMid = this.audioAnalysis.highMid;
    this.prevAudioAnalysis.treble = this.audioAnalysis.treble;
    this.prevAudioAnalysis.overall = this.audioAnalysis.overall;

    const bassIncrease = rawBass - this.prevAudioAnalysis.bass;
    this.audioAnalysis.bassKick = Math.max(0, bassIncrease * 3);

    this.audioAnalysis.beatDetected =
      this.audioAnalysis.bass > 0.6 && bassIncrease > 0.08;
  }

  animateAudioReactiveParticles() {
    if (!this.starfield || !this.audioAnalysis || !this.isPlaying) {
      return;
    }

    const time = Date.now() * 0.001;
    const positions = this.starfield.positions;
    const originalPositions = this.starfield.originalPositions;
    const velocities = this.starfield.velocities;
    const frequencies = this.starfield.frequencies;

    const {
      bass,
      lowMid,
      mid,
      highMid,
      treble,
      overall,
      bassKick,
      beatDetected,
    } = this.audioAnalysis;

    for (let i = 0; i < positions.length; i += 3) {
      const particleIndex = i / 3;
      const freqBin = Math.floor(frequencies[particleIndex]);

      const freqIntensity = this.dataArray
        ? this.dataArray[freqBin] / 255.0
        : 0;

      const origX = originalPositions[i];
      const origY = originalPositions[i + 1];
      const origZ = originalPositions[i + 2];

      let scalePercentage = 100;

      if (freqBin <= 4) {
        const bassIntensity = bass * freqIntensity;
        const bassKickBoost = bassKick * freqIntensity;

        scalePercentage = 70 + bassIntensity * 60 + bassKickBoost * 20;
      } else if (freqBin <= 15) {
        const lowMidIntensity = lowMid * freqIntensity;

        scalePercentage = 80 + lowMidIntensity * 50;
      } else if (freqBin <= 40) {
        const midIntensity = mid * freqIntensity;

        scalePercentage = 85 + midIntensity * 40;
      } else if (freqBin <= 80) {
        const highMidIntensity = highMid * freqIntensity;

        scalePercentage = 90 + highMidIntensity * 30;
      } else {
        const trebleIntensity = treble * freqIntensity;

        scalePercentage = 95 + trebleIntensity * 20;
      }

      if (beatDetected) {
        const burstBoost = 15 + Math.random() * 10;
        scalePercentage += burstBoost;
      }

      const globalModifier = 0.9 + overall * 0.2;
      scalePercentage *= globalModifier;

      const scaleFactor = scalePercentage / 100.0;

      positions[i] = origX * scaleFactor;
      positions[i + 1] = origY * scaleFactor;
      positions[i + 2] = origZ * scaleFactor;
    }

    this.starfield.geometry.attributes.position.needsUpdate = true;

    this.starfield.material.opacity =
      this.starfield.baseOpacity + overall * 0.3;
    this.starfield.material.size =
      this.starfield.baseSize + overall * 1.0 + bassKick * 2.0;

    const hue =
      (bass * 0.0 + lowMid * 0.1 + mid * 0.3 + highMid * 0.6 + treble * 0.9) %
      1.0;
    this.starfield.material.color.setHSL(
      hue,
      0.5 + overall * 0.5,
      0.5 + overall * 0.3,
    );
  }

  animateConstellationMeshes() {
    if (!this.activeConnections || this.activeConnections.size === 0) return;

    const time = Date.now() * 0.001;
    const { bass, mid, treble, overall, beatDetected } =
      this.audioAnalysis || {};

    this.activeConnections.forEach((meshes, trackId) => {
      if (trackId === "path") return;

      meshes.forEach((meshGroup) => {
        if (meshGroup.userData && meshGroup.userData.isStatic) return;

        this.animateConstellationGroup(meshGroup, time, {
          bass,
          mid,
          treble,
          overall,
          beatDetected,
        });
      });
    });
  }

  animateConstellationGroup(meshGroup, time, audioData) {
    if (!meshGroup || !meshGroup.userData) return;

    if (!meshGroup.userData.animationState) {
      meshGroup.userData.animationState = {
        rotationSpeed: 0.5 + Math.random() * 1.5,
        pulseOffset: Math.random() * Math.PI * 2,
        floatOffset: Math.random() * Math.PI * 2,
        originalScale: meshGroup.scale.clone(),
      };
    }

    const state = meshGroup.userData.animationState;
    const audioIntensity = audioData.overall || 0;
    const bassIntensity = audioData.bass || 0;
    const midIntensity = audioData.mid || 0;

    meshGroup.traverse((child) => {
      if (child.isMesh || child.isLine) {
        if (child.material && child.material.color) {
          const baseRotationSpeed =
            state.rotationSpeed * (1 + audioIntensity * 2);

          if (child.material.color.getHex() === 0x4a90e2) {
            child.rotation.x += baseRotationSpeed * 0.04;
            child.rotation.y += baseRotationSpeed * 0.06;

            const pulseFactor =
              1 + Math.sin(time * 8 + state.pulseOffset) * 0.2 * bassIntensity;
            child.scale.setScalar(pulseFactor);
          } else if (child.material.color.getHex() === 0xe2a54a) {
            child.rotation.z += baseRotationSpeed * 0.08;

            if (audioData.beatDetected) {
              child.scale.setScalar(1.4);
              setTimeout(() => {
                if (child.scale) child.scale.setScalar(1.0);
              }, 80);
            }
          } else if (child.material.color.getHex() === 0xe24a90) {
            if (child.userData && child.userData.originalPosition) {
              const floatOffset = child.userData.floatOffset || 0;
              const floatSpeed = child.userData.floatSpeed || 1;

              const floatAmount =
                Math.sin(time * (floatSpeed * 3) + floatOffset) *
                1.0 *
                midIntensity;
              child.position.copy(child.userData.originalPosition);
              child.position.y += floatAmount;
            }

            if (child.material.emissive) {
              const emissiveIntensity =
                0.2 + Math.sin(time * 6) * 0.4 * audioIntensity;
              child.material.emissiveIntensity = emissiveIntensity;
            }
          } else if (child.material.color.getHex() === 0x4ae290) {
            const parent = child.parent;
            if (parent && parent.isGroup) {
              parent.rotation.y += baseRotationSpeed * 0.03;

              const breatheFactor =
                1 + Math.sin(time * 4) * 0.25 * audioIntensity;
              parent.scale.set(breatheFactor, 1, breatheFactor);
            }
          } else if (
            child.material.color &&
            child.material.color.getHex() === 0x9a4ae2
          ) {
            const tunnelPulse =
              1 + Math.sin(time * 5 + state.pulseOffset) * 0.3 * bassIntensity;
            child.scale.x = tunnelPulse;
            child.scale.z = tunnelPulse;

            child.rotation.y += baseRotationSpeed * 0.04;
          }
        }

        if (child.material && child.material.emissive) {
          const baseEmissive = child.material.emissiveIntensity || 0.2;
          const glowPulse = Math.sin(time * 12) * 0.15 * audioIntensity;
          child.material.emissiveIntensity = Math.max(
            0,
            baseEmissive + glowPulse,
          );
        }

        if (audioData.beatDetected) {
          if (child.material && child.material.opacity) {
            const originalOpacity = child.material.opacity;
            child.material.opacity = Math.min(1, originalOpacity * 1.5);

            setTimeout(() => {
              if (child.material) {
                child.material.opacity = originalOpacity;
              }
            }, 150);
          }
        }
      }
    });

    const groupFloat =
      Math.sin(time * 2 + state.floatOffset) * 0.2 * audioIntensity;
    meshGroup.position.y += groupFloat * 0.2;

    const breatheScale = 1 + Math.sin(time * 3.5) * 0.1 * audioIntensity;
    meshGroup.scale.multiplyScalar(
      breatheScale / meshGroup.userData.lastBreathScale || 1,
    );
    meshGroup.userData.lastBreathScale = breatheScale;
  }

  createPlaylistFlow() {
    try {
      if (this.playlistFlow) {
        this.scene.remove(this.playlistFlow);
        this.disposeConstellationMesh(this.playlistFlow);
      }

      if (this.selectedTracks.length < 2) {
        this.playlistFlow = null;
        return;
      }

      const flowGroup = new THREE.Group();
      const trackPositions = [];

      this.selectedTracks.forEach((track, index) => {
        const trackId = track.track_id || track.uuid || track.id;
        const sphere = this.trackMap?.get(trackId);

        if (sphere) {
          trackPositions.push({
            position: sphere.position.clone(),
            track: track,
            index: index,
            sphere: sphere,
          });
        }
      });

      if (trackPositions.length < 2) return;

      const flowPath = this.createGravitationalPath(trackPositions);
      if (!flowPath || flowPath.length === 0) {
        return;
      }

      const flowParticles = this.createFlowParticles(flowPath);
      if (flowParticles) {
        flowGroup.add(flowParticles);
      }

      const simpleConnection = this.createSimpleFlowConnection(trackPositions);
      if (simpleConnection) {
        flowGroup.add(simpleConnection);
      }

      flowGroup.userData = {
        path: flowPath,
        trackPositions: trackPositions,
        particles: flowParticles,
        tube: simpleConnection,
        animationOffset: 0,
      };

      this.playlistFlow = flowGroup;
      this.scene.add(this.playlistFlow);
    } catch (error) {
      if (this.playlistFlow) {
        this.scene.remove(this.playlistFlow);
        this.playlistFlow = null;
      }
    }
  }

  createSimpleFlowConnection(trackPositions) {
    try {
      const connectionGroup = new THREE.Group();

      for (let i = 0; i < trackPositions.length - 1; i++) {
        const startPos = trackPositions[i].position;
        const endPos = trackPositions[i + 1].position;

        const points = [startPos, endPos];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(0x1db954),
          transparent: true,
          opacity: 0.6,
          linewidth: 3,
        });

        const line = new THREE.Line(geometry, material);
        line.userData = { type: "flowConnection", segmentIndex: i };
        connectionGroup.add(line);
      }

      return connectionGroup;
    } catch (error) {
      return null;
    }
  }

  createGravitationalPath(trackPositions) {
    try {
      const path = [];
      const segments = 20;

      const positions = trackPositions.map((tp) => tp.position);

      for (let i = 0; i < positions.length - 1; i++) {
        const startPos = positions[i];
        const endPos = positions[i + 1];

        for (let j = 0; j <= segments; j++) {
          const t = j / segments;
          const point = new THREE.Vector3().lerpVectors(startPos, endPos, t);

          const curveHeight = Math.sin(t * Math.PI) * 1.0;
          point.y += curveHeight;

          path.push({
            position: point,
            trackIndex: i + t,
            flow: t,
            segment: i,
          });
        }
      }

      return path;
    } catch (error) {
      return [];
    }
  }

  applyGravitationalForces(trackPositions) {
    const adjusted = trackPositions.map((tp) => ({
      ...tp,
      originalPosition: tp.position.clone(),
      adjustedPosition: tp.position.clone(),
    }));

    const iterations = 3;
    const forceStrength = 2.0;

    for (let iter = 0; iter < iterations; iter++) {
      adjusted.forEach((trackA, indexA) => {
        const totalForce = new THREE.Vector3();

        adjusted.forEach((trackB, indexB) => {
          if (indexA !== indexB) {
            const similarity = this.calculateTrackSimilarity(
              trackA.track,
              trackB.track,
            );
            const distance = trackA.adjustedPosition.distanceTo(
              trackB.adjustedPosition,
            );

            if (similarity > 0.3 && distance > 1) {
              const direction = new THREE.Vector3()
                .subVectors(trackB.adjustedPosition, trackA.adjustedPosition)
                .normalize();

              const force = direction.multiplyScalar(
                (similarity * forceStrength) / distance,
              );
              totalForce.add(force);
            }
          }
        });

        trackA.adjustedPosition.add(totalForce.multiplyScalar(0.1));

        const maxDeviation = 5;
        const deviation = trackA.adjustedPosition.distanceTo(
          trackA.originalPosition,
        );
        if (deviation > maxDeviation) {
          const direction = new THREE.Vector3()
            .subVectors(trackA.adjustedPosition, trackA.originalPosition)
            .normalize();
          trackA.adjustedPosition
            .copy(trackA.originalPosition)
            .add(direction.multiplyScalar(maxDeviation));
        }
      });
    }

    return adjusted.map((tp) => tp.adjustedPosition);
  }

  generateControlPoints(startPos, endPos, allPositions, currentIndex) {
    const points = [];

    if (currentIndex > 0) {
      points.push(allPositions[currentIndex - 1]);
    } else {
      points.push(startPos.clone().add(new THREE.Vector3(-2, 0, 0)));
    }

    points.push(startPos);
    points.push(endPos);

    if (currentIndex + 2 < allPositions.length) {
      points.push(allPositions[currentIndex + 2]);
    } else {
      points.push(endPos.clone().add(new THREE.Vector3(2, 0, 0)));
    }

    return points;
  }

  catmullRomSpline(points, t) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const p3 = points[3];

    const t2 = t * t;
    const t3 = t2 * t;

    const result = new THREE.Vector3();

    result.x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

    result.y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

    result.z =
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);

    return result;
  }

  createFlowTube(flowPath, trackPositions) {
    if (flowPath.length < 2) return new THREE.Group();

    const tubeGroup = new THREE.Group();
    const pathPoints = flowPath.map((fp) => fp.position);

    const curve = new THREE.CatmullRomCurve3(pathPoints);
    const tubeGeometry = new THREE.TubeGeometry(
      curve,
      pathPoints.length,
      0.2,
      8,
      false,
    );

    const tubeMaterial = this.createFlowMaterial(trackPositions);

    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.userData = { type: "flowTube" };

    tubeGroup.add(tube);
    return tubeGroup;
  }

  createFlowMaterial(trackPositions) {
    const colors = trackPositions.map((tp, index) => {
      if (tp.track.coordinates) {
        const coords = tp.track.coordinates;

        const hue = (coords.valence + 1) * 0.5 * 0.3 + coords.energy * 0.7;
        const saturation = 0.7 + coords.complexity * 0.3;
        const lightness = 0.4 + coords.tension * 0.4;

        return new THREE.Color().setHSL(hue, saturation, lightness);
      }
      return new THREE.Color(0x1db954);
    });

    const avgColor = new THREE.Color(0, 0, 0);
    colors.forEach((color) => avgColor.add(color));
    avgColor.multiplyScalar(1 / colors.length);

    return new THREE.MeshPhongMaterial({
      color: avgColor,
      transparent: true,
      opacity: 0.6,
      emissive: avgColor.clone().multiplyScalar(0.3),
      emissiveIntensity: 0.4,
      side: THREE.DoubleSide,
    });
  }

  createFlowParticles(flowPath) {
    try {
      const particleGroup = new THREE.Group();
      const particleCount = Math.min(50, Math.max(10, flowPath.length));

      const particleGeometry = new THREE.SphereGeometry(0.08, 8, 8);

      for (let i = 0; i < particleCount; i++) {
        const pathIndex = Math.floor((i / particleCount) * flowPath.length);
        const pathPoint = flowPath[Math.min(pathIndex, flowPath.length - 1)];

        if (!pathPoint || !pathPoint.position) continue;

        const particleMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color(0x1db954),
          transparent: true,
          opacity: 0.8,
        });

        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.copy(pathPoint.position);

        particle.userData = {
          flowIndex: i / particleCount,
          pathIndex: pathIndex,
          speed: 0.5 + Math.random() * 0.5,
          offset: Math.random() * Math.PI * 2,
        };

        particleGroup.add(particle);
      }

      return particleGroup;
    } catch (error) {
      return new THREE.Group();
    }
  }

  calculateTrackSimilarity(track1, track2) {
    let similarity = 0;
    let factors = 0;

    if (track1.coordinates && track2.coordinates) {
      const emotionalSim = this.calculateEmotionalSimilarity(track1, track2);
      similarity += emotionalSim * 0.4;
      factors += 0.4;
    }

    if (track1.sonic_dna && track2.sonic_dna) {
      const harmonicSim = this.calculateVectorSimilarity(
        track1.sonic_dna.harmonic_genes || [],
        track2.sonic_dna.harmonic_genes || [],
      );
      const rhythmicSim = this.calculateVectorSimilarity(
        track1.sonic_dna.rhythmic_genes || [],
        track2.sonic_dna.rhythmic_genes || [],
      );

      similarity += harmonicSim * 0.3 + rhythmicSim * 0.3;
      factors += 0.6;
    }

    return factors > 0 ? similarity / factors : 0.5;
  }

  animatePlaylistFlow() {
    try {
      if (!this.playlistFlow || !this.playlistFlow.userData) return;

      const time = Date.now() * 0.001;
      const audioData = this.audioAnalysis || {};
      const flowData = this.playlistFlow.userData;

      if (flowData.particles && flowData.particles.children) {
        flowData.particles.children.forEach((particle, index) => {
          if (particle && particle.userData) {
            const floatOffset = Math.sin(time + particle.userData.offset) * 0.2;
            particle.position.y += floatOffset * 0.1;

            const scale =
              1 + Math.sin(time * 2 + particle.userData.offset) * 0.1;
            particle.scale.setScalar(scale);
          }
        });
      }

      if (flowData.tube && flowData.tube.children) {
        flowData.tube.children.forEach((line) => {
          if (line.material) {
            const pulse = 0.6 + Math.sin(time * 3) * 0.2;
            line.material.opacity = pulse;
          }
        });
      }

      flowData.animationOffset += 0.01;
    } catch (error) {}
  }

  animateFlowParticles(particleGroup, flowPath, time, audioData) {
    const audioIntensity = audioData.overall || 0;
    const bassIntensity = audioData.bass || 0;

    particleGroup.children.forEach((particle, index) => {
      const userData = particle.userData;
      if (!userData) return;

      const speed = userData.speed * (1 + audioIntensity * 2);
      userData.flowIndex += speed * 0.005;

      if (userData.flowIndex >= 1) {
        userData.flowIndex = 0;
      }

      const pathIndex = Math.floor(userData.flowIndex * flowPath.length);
      const safeIndex = Math.min(pathIndex, flowPath.length - 1);

      if (flowPath[safeIndex]) {
        const basePosition = flowPath[safeIndex].position.clone();

        const flowOffset = Math.sin(time * 2 + userData.offset) * 0.3;
        const perpendicular = new THREE.Vector3(
          Math.sin(userData.offset),
          Math.cos(userData.offset * 0.7),
          Math.cos(userData.offset),
        ).multiplyScalar(flowOffset);

        particle.position.copy(basePosition).add(perpendicular);

        const scale =
          1 + Math.sin(time * 4 + userData.offset) * 0.3 * bassIntensity;
        particle.scale.setScalar(scale);

        if (particle.material.emissive) {
          particle.material.emissiveIntensity = 0.3 + audioIntensity * 0.5;
        }
      }
    });
  }

  animateFlowTube(tubeGroup, time, audioData) {
    const audioIntensity = audioData.overall || 0;
    const midIntensity = audioData.mid || 0;

    tubeGroup.children.forEach((tube) => {
      if (tube.userData.type === "flowTube") {
        const pulseFactor = 1 + Math.sin(time * 3) * 0.2 * audioIntensity;
        tube.scale.set(pulseFactor, 1, pulseFactor);

        if (tube.material.emissive) {
          tube.material.emissiveIntensity = 0.4 + midIntensity * 0.6;
        }

        tube.rotation.y += 0.002 * (1 + audioIntensity);
      }
    });
  }

  setupAudioEvents() {
    this.audio.addEventListener("timeupdate", () => {
      if (this.audio.duration) {
        const progress = (this.audio.currentTime / this.audio.duration) * 100;
        const progressBar = document.getElementById("progress-bar");
        if (progressBar) {
          progressBar.value = progress;
        }

        const currentTime = this.formatTime(this.audio.currentTime);
        const totalTime = this.formatTime(this.audio.duration);
        const timeDisplay = document.getElementById("time-display");
        if (timeDisplay) {
          timeDisplay.textContent = `${currentTime} / ${totalTime}`;
        }
      }
    });

    this.audio.addEventListener("ended", () => {
      this.isPlaying = false;
      this.updatePlayButton();

      if (this.currentTrack && this.currentTrack.sphere) {
        const trackId =
          this.currentTrack.track.track_id || this.currentTrack.track.uuid;
        if (this.clickedSpheres.has(trackId)) {
          this.addBloomEffect(this.currentTrack.sphere);
        } else {
          this.currentTrack.sphere.material.emissive.setHex(0x000000);
          this.currentTrack.sphere.material.emissiveIntensity = 0;
        }
      }

      if (this.selectedTracks.length > 1) {
        this.playNext();
      }
    });

    this.audio.addEventListener("error", (error) => {
      console.error("🎵 Audio error:", error);
      this.isPlaying = false;
      this.updatePlayButton();
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      this.updatePlayButton();
    });

    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      this.updatePlayButton();
    });

    this.updateVolumeButton();
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  setupControlEvents() {
    const playPauseBtn = document.getElementById("play-pause");
    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", () => {
        if (this.currentTrack) {
          if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
          } else {
            if (this.audioContext && this.audioContext.state === "suspended") {
              this.audioContext.resume();
            }
            this.audio.play();
            this.isPlaying = true;
          }
          this.updatePlayButton();
        }
      });
    }

    const prevBtn = document.getElementById("prev-btn");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        this.playPrevious();
      });

      prevBtn.addEventListener("mouseenter", () => {
        if (this.selectedTracks.length > 0) {
          prevBtn.style.color = "#1DB954";
        }
      });
      prevBtn.addEventListener("mouseleave", () => {
        prevBtn.style.color =
          this.selectedTracks.length > 0 ? "#FFFFFF" : "#B3B3B3";
      });
    }

    const nextBtn = document.getElementById("next-btn");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        this.playNext();
      });

      nextBtn.addEventListener("mouseenter", () => {
        if (this.selectedTracks.length > 0) {
          nextBtn.style.color = "#1DB954";
        }
      });
      nextBtn.addEventListener("mouseleave", () => {
        nextBtn.style.color =
          this.selectedTracks.length > 0 ? "#FFFFFF" : "#B3B3B3";
      });
    }

    const volumeBtn = document.getElementById("volume-btn");
    if (volumeBtn) {
      volumeBtn.addEventListener("click", () => {
        this.toggleMute();
      });
    }

    const progressBar = document.getElementById("progress-bar");
    if (progressBar) {
      progressBar.addEventListener("input", (e) => {
        if (this.audio.duration) {
          this.audio.currentTime = (e.target.value / 100) * this.audio.duration;
        }
      });
    }

    this.setupDiscoveryControls();
  }

  setupDiscoveryControls() {
    const findSimilarBtn = document.getElementById("find-similar-btn");
    if (findSimilarBtn) {
      findSimilarBtn.addEventListener("click", () => {
        this.toggleSimilarMode();
      });
    }

    const setStartBtn = document.getElementById("set-start-btn");
    if (setStartBtn) {
      setStartBtn.addEventListener("click", () => {
        this.setPathfindingMode("start");
      });
    }

    const setEndBtn = document.getElementById("set-end-btn");
    if (setEndBtn) {
      setEndBtn.addEventListener("click", () => {
        this.setPathfindingMode("end");
      });
    }

    const findPathBtn = document.getElementById("find-path-btn");
    if (findPathBtn) {
      findPathBtn.addEventListener("click", () => {
        this.findShortestPath();
      });
    }

    const addSimilarBtn = document.getElementById("add-similar-btn");
    if (addSimilarBtn) {
      addSimilarBtn.addEventListener("click", () => {
        this.addSimilarTracksToPlaylist();
      });
    }
  }

  toggleSimilarMode() {
    if (this.discoveryMode === "similar") {
      this.discoveryMode = "none";

      this.clearConnectionsOnly();
      this.similarityContext.clear();

      this.showPlaylistConnections();
      this.updateDiscoveryUI();
    } else {
      this.discoveryMode = "similar";
      this.pathfindingState = {
        startTrack: null,
        endTrack: null,
        settingStart: false,
        settingEnd: false,
      };

      this.clearConnectionsOnly();
      this.similarityContext.clear();
      this.updateDiscoveryUI();
    }
  }

  setPathfindingMode(type) {
    this.discoveryMode = "pathfinding";

    this.clearConnectionsOnly();

    if (type === "start") {
      this.pathfindingState.settingStart = true;
      this.pathfindingState.settingEnd = false;
    } else if (type === "end") {
      this.pathfindingState.settingStart = false;
      this.pathfindingState.settingEnd = true;
    }

    this.updateDiscoveryUI();
  }

  findShortestPath() {
    if (!this.pathfindingState.startTrack || !this.pathfindingState.endTrack) {
      console.warn("Both start and end tracks must be set");
      return;
    }

    this.clearConnectionsOnly();

    const path = this.calculateShortestPath(
      this.pathfindingState.startTrack,
      this.pathfindingState.endTrack,
    );
    if (path && path.length > 1) {
      this.showPath(path);
      this.addPathToPlaylist(path);
      this.updateDiscoveryStatus(
        `Found path with ${path.length} tracks - now playing`,
      );
    } else {
      const startConnected = this.connections.some(
        (c) =>
          c.source === this.pathfindingState.startTrack ||
          c.target === this.pathfindingState.startTrack,
      );
      const endConnected = this.connections.some(
        (c) =>
          c.source === this.pathfindingState.endTrack ||
          c.target === this.pathfindingState.endTrack,
      );

      if (!startConnected || !endConnected) {
        this.updateDiscoveryStatus(
          "One or both tracks are not connected to the musical network",
        );
      } else {
        this.updateDiscoveryStatus(
          "No efficient path found between tracks (they may be too dissimilar)",
        );
      }
    }
  }

  addPathToPlaylist(path) {
    let addedCount = 0;
    path.forEach((trackId) => {
      const track = this.tracks.find(
        (t) => (t.track_id || t.uuid || t.id) === trackId,
      );
      if (track) {
        const existing = this.selectedTracks.findIndex(
          (t) => (t.track_id || t.uuid || t.id) === trackId,
        );
        if (existing === -1) {
          this.selectedTracks.push(track);
          addedCount++;

          const sphere = this.trackMap?.get(trackId);
          if (sphere) {
            this.clickedSpheres.add(trackId);
            this.addBloomEffect(sphere);
            sphere.scale.set(1.3, 1.3, 1.3);
          }
        }
      }
    });

    if (this.currentTrackIndex === -1 && this.selectedTracks.length > 0) {
      const firstPathTrackId = path[0];
      const firstPathTrackIndex = this.selectedTracks.findIndex(
        (t) => (t.track_id || t.uuid || t.id) === firstPathTrackId,
      );
      if (firstPathTrackIndex !== -1) {
        this.currentTrackIndex = firstPathTrackIndex;
      } else {
        this.currentTrackIndex = 0;
      }

      this.playTrackByIndex(this.currentTrackIndex);
    } else if (addedCount > 0) {
      const firstPathTrackId = path[0];
      const firstPathTrackIndex = this.selectedTracks.findIndex(
        (t) => (t.track_id || t.uuid || t.id) === firstPathTrackId,
      );
      if (
        firstPathTrackIndex !== -1 &&
        firstPathTrackIndex !== this.currentTrackIndex
      ) {
        this.currentTrackIndex = firstPathTrackIndex;
        this.playTrackByIndex(this.currentTrackIndex);
      }
    }

    this.saveSelectedTracks();
    this.updateSelectedTracksList();
    this.updateTrackCountDisplay();

    if (this.discoveryMode === "none") {
      this.showPlaylistConnections();
    }
  }

  addSimilarTracksToPlaylist() {
    if (this.similarityContext.size === 0) {
      return;
    }

    const tracksToAdd = [];
    this.similarityContext.forEach((trackId) => {
      const track = this.tracks.find(
        (t) => (t.track_id || t.uuid || t.id) === trackId,
      );
      if (track) {
        tracksToAdd.push(track);
      }
    });

    if (tracksToAdd.length === 0) {
      return;
    }

    let addedCount = 0;
    tracksToAdd.forEach((track) => {
      const trackId = track.track_id || track.uuid || track.id;

      const existing = this.selectedTracks.findIndex(
        (t) => (t.track_id || t.uuid || t.id) === trackId,
      );
      if (existing === -1) {
        this.selectedTracks.push(track);
        addedCount++;

        const sphere = this.trackMap?.get(trackId);
        if (sphere) {
          this.clickedSpheres.add(trackId);
          this.addBloomEffect(sphere);
          sphere.scale.set(1.3, 1.3, 1.3);
        }
      }
    });

    if (this.currentTrackIndex === -1 && this.selectedTracks.length > 0) {
      this.currentTrackIndex = 0;
    }

    this.saveSelectedTracks();
    this.updateSelectedTracksList();
    this.updateTrackCountDisplay();
    this.updateDiscoveryUI();

    if (this.discoveryMode === "none") {
      this.showPlaylistConnections();
    }

    this.updateDiscoveryStatus(
      `Added ${addedCount} similar tracks to playlist`,
    );
  }

  calculateShortestPath(startTrackId, endTrackId) {
    if (!this.connections || !this.trackMap) return null;

    const graph = new Map();
    this.tracks.forEach((track) => {
      const trackId = track.track_id || track.uuid || track.id;
      graph.set(trackId, []);
    });

    this.connections.forEach((connection) => {
      if (graph.has(connection.source) && graph.has(connection.target)) {
        graph.get(connection.source).push({
          target: connection.target,
          weight: connection.weight || connection.similarity || 0.5,
        });
        graph.get(connection.target).push({
          target: connection.source,
          weight: connection.weight || connection.similarity || 0.5,
        });
      }
    });

    const distances = new Map();
    const previous = new Map();
    const pathLengths = new Map();
    const visited = new Set();

    this.tracks.forEach((track) => {
      const trackId = track.track_id || track.uuid || track.id;
      distances.set(trackId, trackId === startTrackId ? 0 : Infinity);
      previous.set(trackId, null);
      pathLengths.set(trackId, trackId === startTrackId ? 0 : Infinity);
    });

    const targetPathLength = 10;
    const maxPathLength = 25;

    while (true) {
      let current = null;
      let smallestDistance = Infinity;

      for (const [trackId, distance] of distances) {
        if (!visited.has(trackId) && distance < smallestDistance) {
          smallestDistance = distance;
          current = trackId;
        }
      }

      if (current === null || smallestDistance === Infinity) break;

      if (current === endTrackId) break;

      if (pathLengths.get(current) >= maxPathLength) {
        visited.add(current);
        continue;
      }

      visited.add(current);

      const neighbors = graph.get(current) || [];
      neighbors.forEach((neighbor) => {
        if (!visited.has(neighbor.target)) {
          const currentPathLength = pathLengths.get(current);
          const newPathLength = currentPathLength + 1;

          if (newPathLength > maxPathLength) return;

          const baseDistance = 1 - neighbor.weight;

          const lengthDeviation = Math.abs(newPathLength - targetPathLength);
          const lengthPenalty = lengthDeviation * 0.5;

          const longPathPenalty =
            newPathLength > targetPathLength
              ? (newPathLength - targetPathLength) * 0.3
              : 0;

          const distance =
            distances.get(current) +
            baseDistance +
            lengthPenalty +
            longPathPenalty;

          if (distance < distances.get(neighbor.target)) {
            distances.set(neighbor.target, distance);
            previous.set(neighbor.target, current);
            pathLengths.set(neighbor.target, newPathLength);
          }
        }
      });
    }

    const path = [];
    let current = endTrackId;

    while (current !== null) {
      path.unshift(current);
      current = previous.get(current);
    }

    if (
      path.length > 1 &&
      path[0] === startTrackId &&
      path.length <= maxPathLength + 1
    ) {
      return path;
    }

    return null;
  }

  showPath(path) {
    const connectionLines = [];

    const pathLength = path.length;

    const startColor = new THREE.Color(0x1db954);
    const endColor = new THREE.Color(0x9a4ae2);

    for (let i = 0; i < path.length - 1; i++) {
      const sourceSphere = this.trackMap.get(path[i]);
      const targetSphere = this.trackMap.get(path[i + 1]);

      if (sourceSphere && targetSphere) {
        const points = [
          sourceSphere.position.clone(),
          targetSphere.position.clone(),
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const t = pathLength > 1 ? i / (pathLength - 1) : 0;
        const lineColor = new THREE.Color().lerpColors(startColor, endColor, t);

        let opacity, width;
        if (pathLength <= 5) {
          opacity = 0.9;
          width = 3;
        } else if (pathLength <= 10) {
          opacity = 0.8;
          width = 2.5;
        } else if (pathLength <= 15) {
          opacity = 0.7;
          width = 2;
        } else {
          opacity = 0.6;
          width = 1.5;
        }

        const material = new THREE.LineBasicMaterial({
          color: lineColor,
          transparent: true,
          opacity: opacity,
          linewidth: width,
        });

        const line = new THREE.Line(geometry, material);
        line.userData = {
          type: "pathLine",
          isStatic: true,
          pathIndex: i,
          pathLength: pathLength,
        };
        this.scene.add(line);
        connectionLines.push(line);
      }
    }

    this.activeConnections.set("path", connectionLines);
  }

  updateDiscoveryUI() {
    const findSimilarBtn = document.getElementById("find-similar-btn");
    const addSimilarBtn = document.getElementById("add-similar-btn");
    const setStartBtn = document.getElementById("set-start-btn");
    const setEndBtn = document.getElementById("set-end-btn");
    const findPathBtn = document.getElementById("find-path-btn");

    if (findSimilarBtn) {
      if (this.discoveryMode === "similar") {
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
      if (this.discoveryMode === "similar" && this.similarityContext.size > 1) {
        addSimilarBtn.style.display = "block";
        addSimilarBtn.innerHTML = `<i data-lucide="plus" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></i>Add ${this.similarityContext.size} Similar Tracks`;
      } else {
        addSimilarBtn.style.display = "none";
      }
    }

    if (setStartBtn) {
      if (this.pathfindingState.settingStart) {
        setStartBtn.style.background = "#FFB84D";
        setStartBtn.style.borderColor = "#FFB84D";
        setStartBtn.style.color = "white";
        setStartBtn.textContent = "Click a track...";
      } else if (this.pathfindingState.startTrack) {
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
      if (this.pathfindingState.settingEnd) {
        setEndBtn.style.background = "#FFB84D";
        setEndBtn.style.borderColor = "#FFB84D";
        setEndBtn.style.color = "white";
        setEndBtn.textContent = "Click a track...";
      } else if (this.pathfindingState.endTrack) {
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
        this.pathfindingState.startTrack && this.pathfindingState.endTrack;
      findPathBtn.disabled = !canFindPath;
      findPathBtn.style.opacity = canFindPath ? "1" : "0.5";
      findPathBtn.style.cursor = canFindPath ? "pointer" : "not-allowed";

      if (canFindPath) {
        findPathBtn.style.background = "#9A4AE2";
        findPathBtn.style.borderColor = "#9A4AE2";
        findPathBtn.style.color = "white";
      }
    }

    if (this.discoveryMode === "none") {
      this.updateDiscoveryStatus(
        "Select tracks to discover musical connections",
      );
    } else if (this.discoveryMode === "pathfinding") {
      if (this.pathfindingState.settingStart) {
        this.updateDiscoveryStatus("Click a track to set as start point");
      } else if (this.pathfindingState.settingEnd) {
        this.updateDiscoveryStatus("Click a track to set as end point");
      } else if (
        this.pathfindingState.startTrack &&
        this.pathfindingState.endTrack
      ) {
        this.updateDiscoveryStatus("Ready to find shortest path");
      }
    }

    if (typeof lucide !== "undefined" && lucide.createIcons) {
      lucide.createIcons();
    }
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
      if (this.isPlaying) {
        playPauseBtn.innerHTML =
          '<i data-lucide="pause" style="width: 20px; height: 20px; margin-left: 0px;"></i>';
      } else {
        playPauseBtn.innerHTML =
          '<i data-lucide="play" style="width: 20px; height: 20px; margin-left: 2px;"></i>';
      }

      this.refreshLucideIcons();
    }
  }

  refreshLucideIcons() {
    if (typeof lucide !== "undefined" && lucide.createIcons) {
      try {
        setTimeout(() => {
          lucide.createIcons();
        }, 10);
      } catch (error) {
        console.warn("Error refreshing Lucide icons:", error);
      }
    }
  }

  toggleMute() {
    if (this.isMuted) {
      this.audio.volume = this.previousVolume;
      this.isMuted = false;
    } else {
      this.previousVolume = this.audio.volume;
      this.audio.volume = 0;
      this.isMuted = true;
    }
    this.updateVolumeButton();
  }

  updateVolumeButton() {
    const volumeBtn = document.getElementById("volume-btn");
    if (volumeBtn) {
      if (this.isMuted) {
        volumeBtn.innerHTML =
          '<i data-lucide="volume-x" style="width: 18px; height: 18px;"></i>';
        volumeBtn.style.color = "#FF6B35";
      } else {
        volumeBtn.innerHTML =
          '<i data-lucide="volume-2" style="width: 18px; height: 18px;"></i>';
        volumeBtn.style.color = "#B3B3B3";
      }

      this.refreshLucideIcons();
    }
  }

  updateNavigationButtons() {
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");

    const hasPlaylist = this.selectedTracks.length > 0;

    if (prevBtn) {
      prevBtn.style.color = hasPlaylist ? "#FFFFFF" : "#B3B3B3";
      prevBtn.style.opacity = hasPlaylist ? "1" : "0.5";
      prevBtn.style.cursor = hasPlaylist ? "pointer" : "not-allowed";
      prevBtn.title = hasPlaylist
        ? `Previous track (${this.selectedTracks.length} in playlist)`
        : "No tracks in playlist";
    }

    if (nextBtn) {
      nextBtn.style.color = hasPlaylist ? "#FFFFFF" : "#B3B3B3";
      nextBtn.style.opacity = hasPlaylist ? "1" : "0.5";
      nextBtn.style.cursor = hasPlaylist ? "pointer" : "not-allowed";
      nextBtn.title = hasPlaylist
        ? `Next track (${this.selectedTracks.length} in playlist)`
        : "No tracks in playlist";
    }
  }

  async testAudioSystem() {
    this.vlog("🔧 Testing audio system...", "info");

    if (!this.tracks || this.tracks.length === 0) {
      this.vlog("❌ No tracks loaded", "error");
      alert("No tracks loaded yet. Please wait for tracks to load.");
      return;
    }

    const testTrack = this.tracks.find(
      (track) => track.uuid && track.uuid.trim() !== "",
    );

    if (!testTrack) {
      this.vlog("❌ No tracks with valid UUIDs found", "error");
      alert("No tracks with valid UUIDs found");
      return;
    }

    this.vlog(
      `🔧 Testing with track: ${testTrack.metadata?.track_display || testTrack.track_id}`,
      "info",
    );
    this.vlog(`🔧 UUID: ${testTrack.uuid}`, "debug");

    try {
      const audioUrl = `${this.apiBase}/uuid/${encodeURIComponent(testTrack.uuid)}/audio`;
      this.vlog(`🔧 Testing URL: ${audioUrl}`, "debug");

      const response = await fetch(audioUrl, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
      });
      this.vlog(`🔧 Response status: ${response.status}`, "debug");

      if (response.ok) {
        this.vlog("✅ Audio endpoint test successful!", "success");
        alert(
          `✅ Audio system working!\nTested track: ${testTrack.metadata?.track_display || testTrack.track_id}\nUUID: ${testTrack.uuid}`,
        );
      } else {
        this.vlog(
          `❌ Audio endpoint test failed: ${response.status} ${response.statusText}`,
          "error",
        );
        alert(
          `❌ Audio endpoint failed: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      this.vlog(`❌ Audio test error: ${error.message}`, "error");
      alert(`❌ Audio test error: ${error.message}`);
    }
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));

    this.controls.update();

    this.analyzeAudio();

    this.animateAudioReactiveParticles();

    this.animateConstellationMeshes();

    this.animatePlaylistFlow();

    this.connectionLines.forEach((line) => {
      if (line.userData.source && line.userData.target) {
        const points = [
          line.userData.source.position.clone(),
          line.userData.target.position.clone(),
        ];
        line.geometry.setFromPoints(points);
      }
    });

    const playlistConnections = this.activeConnections.get("playlist");
    if (playlistConnections) {
      playlistConnections.forEach((line) => {
        if (line.userData.sourceTrack && line.userData.targetTrack) {
          const sourceSphere = this.trackMap.get(line.userData.sourceTrack);
          const targetSphere = this.trackMap.get(line.userData.targetTrack);

          if (sourceSphere && targetSphere) {
            const startPoint = sourceSphere.position.clone();
            const endPoint = targetSphere.position.clone();

            const midPoint = new THREE.Vector3().lerpVectors(
              startPoint,
              endPoint,
              0.5,
            );

            midPoint.y += 1.0;

            const curve = new THREE.QuadraticBezierCurve3(
              startPoint,
              midPoint,
              endPoint,
            );
            const points = curve.getPoints(20);
            line.geometry.setFromPoints(points);
          }
        }
      });
    }

    try {
      if (this.composer && this.bloomPass) {
        const selectedCount =
          this.selectedTracks.length > 0
            ? this.selectedTracks.length
            : this.clickedSpheres.size;
        const audioIntensity = this.audioAnalysis
          ? this.audioAnalysis.overall * 0.5
          : 0;
        if (selectedCount > 0) {
          this.bloomPass.strength = Math.min(
            0.6,
            0.3 + selectedCount * 0.05 + audioIntensity,
          );
          this.bloomPass.radius =
            0.2 + selectedCount * 0.02 + audioIntensity * 0.05;
        } else {
          this.bloomPass.strength = 0.3 + audioIntensity * 0.1;
          this.bloomPass.radius = 0.2 + audioIntensity * 0.02;
        }

        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (error) {
      try {
        this.renderer.render(this.scene, this.camera);
      } catch (fallbackError) {
        console.error("Fallback render error:", fallbackError);
      }
    }
  }
}

