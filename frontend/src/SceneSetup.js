import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export class SceneSetup {
  constructor(musicPlayer3D) {
    this.musicPlayer = musicPlayer3D;
  }

  setupScene() {
    this.musicPlayer.scene = new THREE.Scene();
    this.musicPlayer.scene.background = new THREE.Color(0x191414);

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

    this.musicPlayer.stars = new THREE.Points(starGeometry, starMaterial);
    this.musicPlayer.scene.add(this.musicPlayer.stars);

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

  setupCamera() {
    const container = document.getElementById(this.musicPlayer.containerId);
    this.musicPlayer.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.musicPlayer.camera.position.set(0, 0, 30);
  }

  setupRenderer() {
    const container = document.getElementById(this.musicPlayer.containerId);
    this.musicPlayer.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.musicPlayer.renderer.setSize(container.clientWidth, container.clientHeight);
    this.musicPlayer.renderer.setPixelRatio(window.devicePixelRatio);
    this.musicPlayer.renderer.toneMapping = THREE.ReinhardToneMapping;
    container.appendChild(this.musicPlayer.renderer.domElement);
  }

  setupPostProcessing() {
    const container = document.getElementById(this.musicPlayer.containerId);

    try {
      this.musicPlayer.composer = new EffectComposer(this.musicPlayer.renderer);

      const renderPass = new RenderPass(this.musicPlayer.scene, this.musicPlayer.camera);
      this.musicPlayer.composer.addPass(renderPass);

      this.musicPlayer.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.3,
        0.2,
        2.0,
      );
      this.musicPlayer.composer.addPass(this.musicPlayer.bloomPass);

      const outputPass = new OutputPass();
      this.musicPlayer.composer.addPass(outputPass);

      this.musicPlayer.composer.render();
    } catch (error) {
      if (this.musicPlayer.composer) {
        this.musicPlayer.composer.dispose?.();
      }

      this.musicPlayer.composer = null;
      this.musicPlayer.bloomPass = null;
    }
  }

  setupControls() {
    this.musicPlayer.controls = new OrbitControls(this.musicPlayer.camera, this.musicPlayer.renderer.domElement);

    this.musicPlayer.controls.enableDamping = true;
    this.musicPlayer.controls.dampingFactor = 0.05;
    this.musicPlayer.controls.screenSpacePanning = false;
    this.musicPlayer.controls.minDistance = 10;
    this.musicPlayer.controls.maxDistance = 100;
    this.musicPlayer.controls.maxPolarAngle = Math.PI;

    this.musicPlayer.controls.enableZoom = true;
    this.musicPlayer.controls.enableRotate = true;
    this.musicPlayer.controls.enablePan = true;

    this.musicPlayer.controls.target.set(0, 0, 0);
    this.musicPlayer.controls.update();
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.musicPlayer.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(10, 10, 5);
    this.musicPlayer.scene.add(directionalLight);
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
}