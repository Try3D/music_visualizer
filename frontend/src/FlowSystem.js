import * as THREE from "three";

export class FlowSystem {
  constructor(musicPlayer3D) {
    this.musicPlayer = musicPlayer3D;
    this.playlistFlow = null;
  }

  // Get references to needed properties from the main instance
  get scene() {
    return this.musicPlayer.scene;
  }

  get selectedTracks() {
    return this.musicPlayer.selectedTracks;
  }

  get trackMap() {
    return this.musicPlayer.trackMap;
  }

  get audioAnalysis() {
    return this.musicPlayer.audioAnalysis;
  }

  createPlaylistFlow() {
    try {
      if (this.playlistFlow) {
        this.scene.remove(this.playlistFlow);
        this.disposeConstellationMesh(this.playlistFlow);
      }
      
      // Also clean up the main instance's reference
      if (this.musicPlayer.playlistFlow) {
        this.musicPlayer.playlistFlow = null;
      }

      if (this.selectedTracks.length < 2) {
        this.playlistFlow = null;
        this.musicPlayer.playlistFlow = null;
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
        this.playlistFlow = null;
        this.musicPlayer.playlistFlow = null;
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
      this.musicPlayer.playlistFlow = flowGroup; // Keep main instance in sync
      this.scene.add(this.playlistFlow);
    } catch (error) {
      if (this.playlistFlow) {
        this.scene.remove(this.playlistFlow);
        this.playlistFlow = null;
        this.musicPlayer.playlistFlow = null;
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
            const similarity = this.musicPlayer.calculateTrackSimilarity(
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


  // Utility method for properly disposing of THREE.js objects
  disposeConstellationMesh(object) {
    if (!object) return;

    // Recursively dispose of all children
    if (object.children && object.children.length > 0) {
      for (const child of object.children) {
        this.disposeConstellationMesh(child);
      }
    }

    // Dispose of geometry
    if (object.geometry) {
      object.geometry.dispose();
    }

    // Dispose of material(s)
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach(material => material.dispose());
      } else {
        object.material.dispose();
      }
    }

    // Dispose of texture(s)
    if (object.material && object.material.map) {
      object.material.map.dispose();
    }
  }

  // Method to clean up the flow system
  dispose() {
    if (this.playlistFlow) {
      this.scene.remove(this.playlistFlow);
      this.disposeConstellationMesh(this.playlistFlow);
      this.playlistFlow = null;
      this.musicPlayer.playlistFlow = null;
    }
  }
}