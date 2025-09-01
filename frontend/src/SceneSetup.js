import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export class SceneSetup {
    constructor(containerId) {
        this.containerId = containerId
        this.scene = null
        this.camera = null
        this.renderer = null
        this.controls = null
        this.composer = null
        this.bloomPass = null
        this.starfield = null
        this.stars = null
    }

    setupScene() {
        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x191414) // Spotify black
        
        // Add audio-reactive starfield background
        this.createStarfield()
    }

    createStarfield() {
        const starGeometry = new THREE.BufferGeometry()
        const starCount = 1000
        const positions = new Float32Array(starCount * 3)
        const velocities = new Float32Array(starCount * 3)
        const originalPositions = new Float32Array(starCount * 3)
        const frequencies = new Float32Array(starCount) // Each particle responds to a frequency band
        
        for (let i = 0; i < starCount * 3; i += 3) {
            // Initial positions - distributed in layers for better frequency response
            const radius = 50 + Math.random() * 100
            const theta = Math.random() * Math.PI * 2
            const phi = Math.random() * Math.PI
            
            positions[i] = radius * Math.sin(phi) * Math.cos(theta)
            positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta)
            positions[i + 2] = radius * Math.cos(phi)
            
            // Store original positions for oscillation reference
            originalPositions[i] = positions[i]
            originalPositions[i + 1] = positions[i + 1]
            originalPositions[i + 2] = positions[i + 2]
            
            // Random velocities for dynamic movement
            velocities[i] = (Math.random() - 0.5) * 0.02
            velocities[i + 1] = (Math.random() - 0.5) * 0.02
            velocities[i + 2] = (Math.random() - 0.5) * 0.02
            
            // Assign frequency band for each particle (0-127 for 128 frequency bins)
            frequencies[i / 3] = Math.floor(Math.random() * 128)
        }
        
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        starGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3))
        starGeometry.setAttribute('originalPosition', new THREE.BufferAttribute(originalPositions, 3))
        starGeometry.setAttribute('frequency', new THREE.BufferAttribute(frequencies, 1))
        
        const starMaterial = new THREE.PointsMaterial({
            color: 0xB3B3B3,
            size: 0.5,
            transparent: true,
            opacity: 0.8,
            vertexColors: false
        })
        
        this.stars = new THREE.Points(starGeometry, starMaterial)
        this.scene.add(this.stars)
        
        // Store references for audio-reactive animation
        this.starfield = {
            geometry: starGeometry,
            material: starMaterial,
            points: this.stars,
            baseOpacity: 0.8,
            baseSize: 0.5,
            positions: positions,
            originalPositions: originalPositions,
            velocities: velocities,
            frequencies: frequencies
        }
        
        console.log('[STARFIELD] Audio-reactive starfield created with 1000 particles')
    }

    setupCamera() {
        const container = document.getElementById(this.containerId)
        this.camera = new THREE.PerspectiveCamera(
            75,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        )
        this.camera.position.set(0, 0, 30)
    }

    setupRenderer() {
        const container = document.getElementById(this.containerId)
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.renderer.toneMapping = THREE.ReinhardToneMapping
        container.appendChild(this.renderer.domElement)
    }

    setupPostProcessing() {
        const container = document.getElementById(this.containerId)
        
        try {
            // Create effect composer
            this.composer = new EffectComposer(this.renderer)
            
            // Add render pass
            const renderPass = new RenderPass(this.scene, this.camera)
            this.composer.addPass(renderPass)
            
            // Add bloom pass with high threshold so only very bright objects bloom
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(container.clientWidth, container.clientHeight),
                0.3, // strength - much lower
                0.2, // radius - smaller
                2.0  // HIGHER threshold - only very bright objects bloom
            )
            this.composer.addPass(this.bloomPass)
            
            // Add output pass for tone mapping
            const outputPass = new OutputPass()
            this.composer.addPass(outputPass)
            
            // Test render to ensure no uniform errors
            this.composer.render()
            
            console.log('[SUCCESS] Post-processing setup completed successfully')
        } catch (error) {
            console.error('[ERROR] Error setting up post-processing:', error)
            console.log('[FALLBACK] Falling back to basic rendering without post-processing')
            
            // Clean up failed composer
            if (this.composer) {
                this.composer.dispose?.()
            }
            
            this.composer = null
            this.bloomPass = null
        }
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        
        // Configure controls
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.05
        this.controls.screenSpacePanning = false
        this.controls.minDistance = 10
        this.controls.maxDistance = 100
        this.controls.maxPolarAngle = Math.PI
        
        // Enable zoom and rotation
        this.controls.enableZoom = true
        this.controls.enableRotate = true
        this.controls.enablePan = true
        
        // Set initial position
        this.controls.target.set(0, 0, 0)
        this.controls.update()
    }

    setupLights() {
        // WHITE LIGHTS ONLY - NO GREEN TINTING!
        const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6) // Pure white, higher intensity
        this.scene.add(ambientLight)

        const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.4) // Pure white
        directionalLight.position.set(10, 10, 5)
        this.scene.add(directionalLight)

        // Remove the green point light completely
        // const pointLight = new THREE.PointLight(0x1DB954, 0.6, 100)
        // pointLight.position.set(0, 0, 10)
        // this.scene.add(pointLight)
    }

    onWindowResize() {
        const container = document.getElementById(this.containerId)
        if (!container) return
        
        this.camera.aspect = container.clientWidth / container.clientHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        
        if (this.composer) {
            this.composer.setSize(container.clientWidth, container.clientHeight)
        }
    }

    getStarfield() {
        return this.starfield
    }

    getScene() {
        return this.scene
    }

    getCamera() {
        return this.camera
    }

    getRenderer() {
        return this.renderer
    }

    getControls() {
        return this.controls
    }

    getComposer() {
        return this.composer
    }

    getBloomPass() {
        return this.bloomPass
    }
}