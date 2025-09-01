import * as THREE from 'three';

/**
 * VisualEffects class handles all visual effects for the music player 3D visualization
 * Extracted from musicPlayer3D.js to improve code organization and maintainability
 */
class VisualEffects {
  constructor(musicPlayer) {
    this.musicPlayer = musicPlayer;
    // Provide convenient access to musicPlayer properties
    this.scene = musicPlayer.scene;
    this.tracks = musicPlayer.tracks;
    this.musicSpheres = musicPlayer.musicSpheres;
    this.trackMap = musicPlayer.trackMap;
    this.clickedSpheres = musicPlayer.clickedSpheres;
    this.audioAnalysis = musicPlayer.audioAnalysis;
    this.isPlaying = musicPlayer.isPlaying;
    this.dataArray = musicPlayer.dataArray;
    this.activeConnections = musicPlayer.activeConnections;
  }

  /**
   * Creates the music spheres representing tracks in 3D space
   */
  createMusicSpheres() {
    const maxSpheres = this.musicPlayer.tracks.length;
    const baseRadius = 25;

    const sphereGeometry = new THREE.SphereGeometry(0.3, 16, 16);

    for (let i = 0; i < maxSpheres; i++) {
      const track = this.musicPlayer.tracks[i];

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
      } else if (this.musicPlayer.trackPositions && track.position) {
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

      this.musicPlayer.scene.add(sphere);
      this.musicPlayer.musicSpheres.push(sphere);
    }

    this.musicPlayer.trackManager.updateTrackCountDisplay();
  }

  /**
   * Creates the animated starfield background
   */
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

    this.musicPlayer.stars = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.musicPlayer.stars);

    this.musicPlayer.starfield = {
      geometry: starGeometry,
      material: starMaterial,
      points: this.musicPlayer.stars,
      baseOpacity: 0.8,
      baseSize: 0.5,
      positions: positions,
      originalPositions: originalPositions,
      velocities: velocities,
      frequencies: frequencies,
    };
  }

  /**
   * Adds bloom effect to a sphere (for selected tracks)
   */
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

  /**
   * Removes bloom effect from a sphere
   */
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

  /**
   * Adds hover effect to a sphere (when mouse hovers over it)
   */
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

  /**
   * Removes hover effect from a sphere
   */
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

  /**
   * Creates a click wave effect on a sphere when clicked
   */
  createClickWaveEffect(sphere) {
    const trackId =
      sphere.userData.track.track_id ||
      sphere.userData.track.uuid ||
      sphere.userData.track.id;
    const isNowSelected = this.musicPlayer.clickedSpheres.has(trackId);

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

  /**
   * Animates audio reactive particles (starfield)
   */
  animateAudioReactiveParticles() {
    if (!this.musicPlayer.starfield || !this.audioAnalysis || !this.isPlaying) {
      return;
    }

    const time = Date.now() * 0.001;
    const positions = this.musicPlayer.starfield.positions;
    const originalPositions = this.musicPlayer.starfield.originalPositions;
    const velocities = this.musicPlayer.starfield.velocities;
    const frequencies = this.musicPlayer.starfield.frequencies;

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

    this.musicPlayer.starfield.geometry.attributes.position.needsUpdate = true;

    this.musicPlayer.starfield.material.opacity =
      this.musicPlayer.starfield.baseOpacity + overall * 0.3;
    this.musicPlayer.starfield.material.size =
      this.musicPlayer.starfield.baseSize + overall * 1.0 + bassKick * 2.0;

    const hue =
      (bass * 0.0 + lowMid * 0.1 + mid * 0.3 + highMid * 0.6 + treble * 0.9) %
      1.0;
    this.musicPlayer.starfield.material.color.setHSL(
      hue,
      0.5 + overall * 0.5,
      0.5 + overall * 0.3,
    );
  }

  /**
   * Animates constellation meshes based on audio data
   */
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

  /**
   * Animates a specific constellation group based on audio data
   */
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

  // Helper methods for color calculations

  /**
   * Gets advanced track color based on available color data
   */
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

  /**
   * Gets emotional color based on track coordinates and index
   */
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

  /**
   * Gets sonic color based on track's genetic fingerprint
   */
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

  /**
   * Gets hybrid color by blending emotional and sonic colors
   */
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

  /**
   * Generates a hash code from a string (used for sonic color generation)
   */
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Updates references to musicPlayer properties
   * Call this method if the musicPlayer instance changes
   */
  updateReferences() {
    this.scene = this.musicPlayer.scene;
    this.tracks = this.musicPlayer.tracks;
    this.musicSpheres = this.musicPlayer.musicSpheres;
    this.trackMap = this.musicPlayer.trackMap;
    this.clickedSpheres = this.musicPlayer.clickedSpheres;
    this.audioAnalysis = this.musicPlayer.audioAnalysis;
    this.isPlaying = this.musicPlayer.isPlaying;
    this.dataArray = this.musicPlayer.dataArray;
    this.activeConnections = this.musicPlayer.activeConnections;
  }
}

export default VisualEffects;