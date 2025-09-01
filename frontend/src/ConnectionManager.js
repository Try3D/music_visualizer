import * as THREE from "three";

export class ConnectionManager {
  constructor(musicPlayer3D) {
    this.musicPlayer = musicPlayer3D;
  }

  // Get references to the musicPlayer's properties for cleaner code
  get scene() {
    return this.musicPlayer.scene;
  }

  get connections() {
    return this.musicPlayer.connections;
  }

  get trackMap() {
    return this.musicPlayer.trackMap;
  }

  set trackMap(value) {
    this.musicPlayer.trackMap = value;
  }

  get musicSpheres() {
    return this.musicPlayer.musicSpheres;
  }

  get activeConnections() {
    return this.musicPlayer.activeConnections;
  }

  get clickedSpheres() {
    return this.musicPlayer.clickedSpheres;
  }

  get selectedTracks() {
    return this.musicPlayer.selectedTracks;
  }

  set selectedTracks(value) {
    this.musicPlayer.selectedTracks = value;
  }

  get currentTrackIndex() {
    return this.musicPlayer.currentTrackIndex;
  }

  set currentTrackIndex(value) {
    this.musicPlayer.currentTrackIndex = value;
  }

  get discoveryMode() {
    return this.musicPlayer.discoveryMode;
  }

  get similarityContext() {
    return this.musicPlayer.similarityContext;
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

      this.musicPlayer.visualEffects.removeBloomEffect(sphere);
      sphere.scale.set(1, 1, 1);

      sphere.material.emissive.setHex(0x000000);
      sphere.material.emissiveIntensity = 0;

      this.musicPlayer.trackManager.removeFromSelectedTracks(trackId);
    } else {
      this.addConnectionsForSphere(trackId);
      this.clickedSpheres.add(trackId);

      this.musicPlayer.visualEffects.addBloomEffect(sphere);
      sphere.scale.set(1.3, 1.3, 1.3);

      sphere.material.emissive.setHex(0x1db954);
      sphere.material.emissiveIntensity = 0.3;

      this.musicPlayer.trackManager.addToSelectedTracks(sphere.userData.track, trackId);

      this.musicPlayer.audioManager.playTrack(sphere.userData.track, sphere);
    }

    this.musicPlayer.trackManager.updateTrackCountDisplay();

    this.musicPlayer.visualEffects.createClickWaveEffect(sphere);
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
    this.musicPlayer.uiManager.updateDiscoveryUI();
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
      this.musicPlayer.visualEffects.removeBloomEffect(sphere);
      sphere.scale.set(1, 1, 1);

      sphere.material.emissive.setHex(0x000000);
      sphere.material.emissiveIntensity = 0;
    });

    this.selectedTracks = [];
    this.currentTrackIndex = -1;
    this.musicPlayer.trackManager.saveSelectedTracks();

    this.musicPlayer.trackManager.updateTrackCountDisplay();
    this.musicPlayer.uiManager.updateSelectedTracksList();
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
        this.musicPlayer.visualEffects.removeBloomEffect(sphere);
        sphere.scale.set(1, 1, 1);
      }
    });

    this.selectedTracks.forEach((track) => {
      const trackId = track.track_id || track.uuid || track.id;
      this.clickedSpheres.add(trackId);
      const sphere = this.trackMap?.get(trackId);
      if (sphere) {
        this.musicPlayer.visualEffects.addBloomEffect(sphere);
        sphere.scale.set(1.3, 1.3, 1.3);
      }
    });
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
}