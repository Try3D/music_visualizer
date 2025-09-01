import * as THREE from "three";

export class DiscoveryEngine {
  constructor(musicPlayer3D) {
    this.musicPlayer = musicPlayer3D;
  }

  // Get references to the musicPlayer3D properties and methods
  get scene() { return this.musicPlayer.scene; }
  get tracks() { return this.musicPlayer.tracks; }
  get connections() { return this.musicPlayer.connections; }
  get trackMap() { return this.musicPlayer.trackMap; }
  get selectedTracks() { return this.musicPlayer.selectedTracks; }
  get clickedSpheres() { return this.musicPlayer.clickedSpheres; }
  get activeConnections() { return this.musicPlayer.activeConnections; }
  get similarityContext() { return this.musicPlayer.similarityContext; }
  get discoveryMode() { return this.musicPlayer.discoveryMode; }
  set discoveryMode(value) { this.musicPlayer.discoveryMode = value; }
  get pathfindingState() { return this.musicPlayer.pathfindingState; }
  set pathfindingState(value) { this.musicPlayer.pathfindingState = value; }
  get currentTrackIndex() { return this.musicPlayer.currentTrackIndex; }
  set currentTrackIndex(value) { this.musicPlayer.currentTrackIndex = value; }

  toggleSimilarMode() {
    if (this.discoveryMode === "similar") {
      this.discoveryMode = "none";

      this.musicPlayer.connectionManager.clearConnectionsOnly();
      this.similarityContext.clear();

      this.musicPlayer.connectionManager.showPlaylistConnections();
      this.musicPlayer.uiManager.updateDiscoveryUI();
    } else {
      this.discoveryMode = "similar";
      this.pathfindingState = {
        startTrack: null,
        endTrack: null,
        settingStart: false,
        settingEnd: false,
      };

      this.musicPlayer.connectionManager.clearConnectionsOnly();
      this.similarityContext.clear();
      this.musicPlayer.uiManager.updateDiscoveryUI();
    }
  }

  setPathfindingMode(type) {
    this.discoveryMode = "pathfinding";

    this.musicPlayer.connectionManager.clearConnectionsOnly();

    if (type === "start") {
      this.pathfindingState.settingStart = true;
      this.pathfindingState.settingEnd = false;
    } else if (type === "end") {
      this.pathfindingState.settingStart = false;
      this.pathfindingState.settingEnd = true;
    }

    this.musicPlayer.uiManager.updateDiscoveryUI();
  }

  findShortestPath() {
    if (!this.pathfindingState.startTrack || !this.pathfindingState.endTrack) {
      console.warn("Both start and end tracks must be set");
      return;
    }

    this.musicPlayer.connectionManager.clearConnectionsOnly();

    const path = this.calculateShortestPath(
      this.pathfindingState.startTrack,
      this.pathfindingState.endTrack,
    );
    if (path && path.length > 1) {
      this.showPath(path);
      this.addPathToPlaylist(path);
      this.musicPlayer.uiManager.updateDiscoveryStatus(
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
        this.musicPlayer.uiManager.updateDiscoveryStatus(
          "One or both tracks are not connected to the musical network",
        );
      } else {
        this.musicPlayer.uiManager.updateDiscoveryStatus(
          "No efficient path found between tracks (they may be too dissimilar)",
        );
      }
    }
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
            this.musicPlayer.visualEffects.addBloomEffect(sphere);
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

      this.musicPlayer.trackManager.playTrackByIndex(this.currentTrackIndex);
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
        this.musicPlayer.trackManager.playTrackByIndex(this.currentTrackIndex);
      }
    }

    this.musicPlayer.trackManager.saveSelectedTracks();
    this.musicPlayer.uiManager.updateSelectedTracksList();
    this.musicPlayer.trackManager.updateTrackCountDisplay();

    if (this.discoveryMode === "none") {
      this.musicPlayer.connectionManager.showPlaylistConnections();
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
          this.musicPlayer.visualEffects.addBloomEffect(sphere);
          sphere.scale.set(1.3, 1.3, 1.3);
        }
      }
    });

    if (this.currentTrackIndex === -1 && this.selectedTracks.length > 0) {
      this.currentTrackIndex = 0;
    }

    this.musicPlayer.trackManager.saveSelectedTracks();
    this.musicPlayer.uiManager.updateSelectedTracksList();
    this.musicPlayer.trackManager.updateTrackCountDisplay();
    this.musicPlayer.uiManager.updateDiscoveryUI();

    if (this.discoveryMode === "none") {
      this.musicPlayer.connectionManager.showPlaylistConnections();
    }

    this.musicPlayer.uiManager.updateDiscoveryStatus(
      `Added ${addedCount} similar tracks to playlist`,
    );
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
}