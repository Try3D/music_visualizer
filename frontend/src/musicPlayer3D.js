import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export class MusicPlayer3D {
    constructor(containerId) {
        this.containerId = containerId
        this.scene = null
        this.camera = null
        this.renderer = null
        this.controls = null
        this.composer = null
        this.bloomPass = null
        this.tracks = []
        this.musicSpheres = []
        this.connectionLines = []
        this.connections = []  // Store all connection data
        this.clickedSpheres = new Set()  // Track clicked spheres
        this.activeConnections = new Map()  // Track active connection lines by sphere
        this.currentTrack = null
        this.selectedTracks = []  // Ordered list of selected tracks for next/prev
        this.currentTrackIndex = -1  // Index in selectedTracks
        
        // Discovery mode state
        this.discoveryMode = 'none' // 'none', 'similar', 'pathfinding'
        this.pathfindingState = {
            startTrack: null,
            endTrack: null,
            settingStart: false,
            settingEnd: false
        }
        this.similarityContext = new Set() // Track connected tracks for similarity mode
        this.audio = new Audio()
        this.isPlaying = false
        this.isMuted = false
        this.previousVolume = 1.0  // Store volume before muting
        this.mouse = new THREE.Vector2()
        this.raycaster = new THREE.Raycaster()
        
        // Audio analysis for dynamic background
        this.audioContext = null
        this.analyser = null
        this.dataArray = null
        this.bufferLength = 0
        this.backgroundUniforms = null
        
        // Initialize audio analysis state with smoothing
        this.audioAnalysis = {
            bass: 0,
            lowMid: 0,
            mid: 0,
            highMid: 0,
            treble: 0,
            overall: 0,
            bassKick: 0,
            beatDetected: false
        }
        
        // Previous frame values for smoothing
        this.prevAudioAnalysis = {
            bass: 0,
            lowMid: 0,
            mid: 0,
            highMid: 0,
            treble: 0,
            overall: 0
        }
        
        this.apiBase = 'http://localhost:8000/api'
        
        this.setupAudioEvents()
        this.setupControlEvents()
        this.setupVisualLogging()
        this.loadSelectedTracks()
        
        // Initialize visual log
        this.vlog('[INIT] MusicPlayer3D initialized')
        this.vlog(`[API] API Base: ${this.apiBase}`)
    }

    setupVisualLogging() {
        // Clear log button
        const clearLogBtn = document.getElementById('clear-log-btn')
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => {
                this.clearVisualLog()
            })
        }
    }

    vlog(message, type = 'info') {
        // Add to visual log
        const logContent = document.getElementById('log-content')
        if (logContent) {
            const timestamp = new Date().toLocaleTimeString()
            const colors = {
                'info': '#ccc',
                'success': '#1DB954', 
                'warning': '#FFB84D',
                'error': '#FF6B35',
                'debug': '#888'
            }
            
            const logEntry = document.createElement('div')
            logEntry.style.color = colors[type] || '#ccc'
            logEntry.style.marginBottom = '2px'
            logEntry.innerHTML = `<span style="color: #666;">[${timestamp}]</span> ${message}`
            
            logContent.appendChild(logEntry)
            
            // Auto-scroll to bottom
            logContent.scrollTop = logContent.scrollHeight
            
            // Keep only last 50 entries
            while (logContent.children.length > 50) {
                logContent.removeChild(logContent.firstChild)
            }
        }
        
        // Also log to console
        console.log(message)
    }

    clearVisualLog() {
        const logContent = document.getElementById('log-content')
        if (logContent) {
            logContent.innerHTML = ''
        }
    }

    async init() {
        await this.loadTracks()
        this.setupScene()
        this.setupCamera()
        this.setupRenderer()
        
        // Add small delay to ensure renderer is ready
        await new Promise(resolve => setTimeout(resolve, 100))
        
        this.setupPostProcessing()
        this.setupControls()
        this.setupLights()
        this.createMusicSpheres()
        this.createConnections()
        this.setupEventListeners()
        
        // Restore visual selections after everything is initialized
        if (this.selectedTracks.length > 0) {
            console.log(`[RESTORE] Restoring ${this.selectedTracks.length} selected tracks from localStorage`)
            this.restoreVisualSelections()
        }
        
        // Make this instance globally accessible for HTML button callbacks
        window.musicPlayer = this
        
        // Initialize UI state
        this.updateNavigationButtons()
        this.updatePlayButton()
        this.updateVolumeButton()
        this.updateDiscoveryUI()
        
        // Ensure everything is properly initialized before starting animation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        this.animate()
    }

    async loadTracks() {
        try {
            this.vlog('[TRACKS] Loading positioned tracks from API...')
            const response = await fetch(`${this.apiBase}/tracks/positioned`)
            if (!response.ok) {
                this.vlog('[WARN] Positioned tracks not available, falling back to regular tracks', 'warning')
                const fallbackResponse = await fetch(`${this.apiBase}/tracks`)
                if (!fallbackResponse.ok) {
                    throw new Error(`Failed to load tracks: ${fallbackResponse.status}`)
                }
                const fallbackData = await fallbackResponse.json()
                // Handle both array format and object format from API
                const tracks = Array.isArray(fallbackData) ? fallbackData : fallbackData.tracks || []
                this.tracks = tracks
                this.trackPositions = null
                this.connections = []
                this.vlog(`[SUCCESS] Loaded ${this.tracks.length} tracks via fallback`, 'success')
                this.vlog(`[DEBUG] First track UUID: ${this.tracks[0]?.uuid}`, 'debug')
            } else {
                const positionedData = await response.json()
                this.tracks = positionedData.tracks
                this.trackPositions = positionedData.tracks
                this.connections = positionedData.connections || []
                this.vlog(`[SUCCESS] Loaded ${this.tracks.length} positioned tracks with ${this.connections.length} connections`, 'success')
                this.vlog(`[DEBUG] First positioned track UUID: ${this.tracks[0]?.uuid}`, 'debug')
                
                // Log metadata if available
                if (positionedData.metadata) {
                    this.vlog(`[DATA] Metadata: ${positionedData.metadata.source}`, 'debug')
                }
            }
            this.vlog(`[SUCCESS] Total tracks loaded: ${this.tracks.length}`, 'success')
            
            // Add count display to UI
            this.updateTrackCountDisplay()
            
        } catch (error) {
            console.error('[ERROR] Error loading tracks:', error)
            throw new Error('Failed to connect to music API. Please ensure the server is running on localhost:8000')
        }
    }

    updateTrackCountDisplay() {
        // Update Galaxy Info (Top Left) - Simplified to show only 3 items
        const galaxyInfo = document.getElementById('galaxy-info')
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
            `
        }
        
        // Re-initialize Lucide icons for the updated content
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons()
        }
        
        // Update Selected Tracks List (Bottom Left)
        this.updateSelectedTracksList()
    }
    
    updateSelectedTracksList() {
        const selectedTracksContent = document.getElementById('selected-tracks-list')
        if (!selectedTracksContent) {
            console.log('[WARN] selected-tracks-list element not found')
            return
        }
        
        console.log(`[UPDATE] Updating selected tracks list with ${this.selectedTracks.length} tracks`)
        
        if (this.selectedTracks.length === 0) {
            selectedTracksContent.innerHTML = `
                <div style="text-align: center; color: #888; font-style: italic;">No tracks selected</div>
            `
            return
        }
        
        let tracksHTML = ''
        this.selectedTracks.forEach((track, index) => {
            // Use UUID metadata for better display names
            let artist = 'Unknown Artist'
            let title = 'Unknown Track'
            
            if (track.metadata) {
                artist = track.metadata.artist_display || track.metadata.artist || artist
                title = track.metadata.track_display || track.metadata.track_name || title
            } else {
                // Fallback to parsing track_id
                const trackId = track.track_id || track.id
                const parts = trackId.split('_')
                artist = (parts[0] || artist).replace(/_/g, ' ')
                title = (parts[2] || parts[1] || title).replace(/_/g, ' ')
            }
            
            const isCurrentTrack = index === this.currentTrackIndex
            
            tracksHTML += `
                <div style="
                    padding: 8px; 
                    margin: 4px 0; 
                    border-radius: 4px; 
                    background: ${isCurrentTrack ? 'rgba(29, 185, 84, 0.2)' : 'rgba(255, 255, 255, 0.05)'};
                    border-left: 3px solid ${isCurrentTrack ? '#1DB954' : 'transparent'};
                    cursor: pointer;
                    transition: background 0.3s ease;
                " onclick="window.musicPlayer?.playTrackByIndex?.(${index})">
                    <div style="font-weight: bold; color: ${isCurrentTrack ? '#1DB954' : '#FFFFFF'}; font-size: 11px;">
                        ${index + 1}. ${title}
                    </div>
                    <div style="color: #B3B3B3; font-size: 10px; margin-top: 2px;">
                        ${artist}
                    </div>
                </div>
            `
        })
        
        selectedTracksContent.innerHTML = tracksHTML
        
        // Update navigation button states
        this.updateNavigationButtons()
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

    createMusicSpheres() {
        // ADVANCED EMOTIONAL GALAXY - Full 3D force-directed visualization
        const maxSpheres = this.tracks.length // Show all tracks for full galaxy
        const baseRadius = 25 // Larger radius for better distribution
        
                console.log(`[GALAXY] Creating advanced emotional galaxy with ALL ${maxSpheres} tracks (force-directed semantic positioning + advanced bloom)`)
        
        // Enhanced sphere parameters for visual impact
        const sphereGeometry = new THREE.SphereGeometry(0.3, 16, 16) // Larger, higher quality spheres
        
        for (let i = 0; i < maxSpheres; i++) {
            const track = this.tracks[i]
            
            // ADVANCED COLOR ALGORITHM - Use backend's sophisticated color system
            const advancedColor = this.getAdvancedTrackColor(track, i, maxSpheres)
            
            // USE ENHANCED MATERIAL FOR BLOOM EFFECTS
            const material = new THREE.MeshStandardMaterial({
                color: advancedColor,
                metalness: 0.1,
                roughness: 0.3,
                emissive: new THREE.Color(0x000000),
                emissiveIntensity: 0.0,
                transparent: true,
                opacity: 0.9
            })
            
            // Store advanced material properties for bloom system
            material.userData = {
                originalColor: advancedColor.clone(),
                emotionalColor: this.getEmotionalColor(track, i, maxSpheres),
                sonicColor: this.getSonicColor(track),
                hybridColor: this.getHybridColor(track, i, maxSpheres),
                isSelected: false,
                bloomIntensity: 0.0,
                colorMode: 'emotional' // emotional, sonic, hybrid
            }
            
            const sphere = new THREE.Mesh(sphereGeometry, material)
            
            // ADVANCED POSITIONING - Force-directed semantic space
            if (track.position && track.position.x !== undefined && track.position.y !== undefined && track.position.z !== undefined) {
                // FIRST PRIORITY: Use backend's precise x,y,z coordinate mapping EXACTLY
                sphere.position.x = track.position.x * 1.0 // Use exact coordinates without scaling
                sphere.position.y = track.position.y * 1.0
                sphere.position.z = track.position.z * 1.0
                
                if (i < 10) { // Debug first 10 positions
                    console.log(`EXACT COORDINATE positioned track ${track.track_id || track.id || 'unknown'} at (${sphere.position.x.toFixed(2)}, ${sphere.position.y.toFixed(2)}, ${sphere.position.z.toFixed(2)})`)
                }
            } else if (this.trackPositions && track.position) {
                // Use backend's sophisticated 3D semantic positioning
                sphere.position.x = track.position.x * 1.2 // Scale factor for better distribution
                sphere.position.y = track.position.y * 1.2
                sphere.position.z = track.position.z * 1.2
                
                if (i < 10) { // Debug first 10 positions
                    console.log(`[POSITION] Force-directed semantic position ${track.track_id || track.id || 'unknown'} at (${sphere.position.x.toFixed(1)}, ${sphere.position.y.toFixed(1)}, ${sphere.position.z.toFixed(1)})`)
                }
            } else if (track.coordinates) {
                // Advanced emotional space positioning (4D to 3D mapping)
                const coords = track.coordinates
                
                // Map 4D emotional space to 3D visualization space with advanced distribution
                sphere.position.x = (coords.valence * 2 - 1) * baseRadius * 1.5 // Valence: -baseRadius to +baseRadius
                sphere.position.y = (coords.energy) * baseRadius * 2 - baseRadius // Energy: -baseRadius to +baseRadius  
                sphere.position.z = (coords.complexity) * baseRadius * 2 - baseRadius // Complexity: -baseRadius to +baseRadius
                
                // Add tension as a radial displacement factor for 4D representation
                const tensionRadius = coords.tension * baseRadius * 0.5
                const currentRadius = Math.sqrt(sphere.position.x**2 + sphere.position.y**2 + sphere.position.z**2)
                if (currentRadius > 0) {
                    const scale = (currentRadius + tensionRadius) / currentRadius
                    sphere.position.multiplyScalar(scale)
                }
                
                if (i < 10) {
                    console.log(`[4D] 4D emotional positioned track ${track.track_id || track.id || 'unknown'} at (${sphere.position.x.toFixed(1)}, ${sphere.position.y.toFixed(1)}, ${sphere.position.z.toFixed(1)}) from V:${coords.valence.toFixed(2)}, E:${coords.energy.toFixed(2)}, C:${coords.complexity.toFixed(2)}, T:${coords.tension.toFixed(2)}`)
                }
            } else if (track.sonic_dna && track.sonic_dna.features) {
                // Legacy sonic DNA positioning with improved distribution
                const features = track.sonic_dna.features
                sphere.position.x = (features.valence - 0.5) * baseRadius * 2.5
                sphere.position.y = (features.energy - 0.5) * baseRadius * 2.5  
                sphere.position.z = (features.danceability - 0.5) * baseRadius * 2.5
                
                if (i < 10) {
                    console.log(`[DNA] Legacy sonic DNA positioned track ${track.track_id || track.id || 'unknown'} at (${sphere.position.x.toFixed(1)}, ${sphere.position.y.toFixed(1)}, ${sphere.position.z.toFixed(1)})`)
                }
            } else {
                // ADVANCED SPHERICAL DISTRIBUTION - Fibonacci sphere for optimal distribution
                const phi = Math.PI * (3.0 - Math.sqrt(5.0)) // Golden angle
                const y = 1 - (i / (maxSpheres - 1)) * 2 // y goes from 1 to -1
                const radius_at_y = Math.sqrt(1 - y * y)
                
                const theta = phi * i
                
                sphere.position.x = Math.cos(theta) * radius_at_y * baseRadius
                sphere.position.y = y * baseRadius
                sphere.position.z = Math.sin(theta) * radius_at_y * baseRadius
                
                if (i < 10) {
                    console.log(`[FIBONACCI] Fibonacci spherical positioned track ${track.track_id || track.id || 'unknown'} at (${sphere.position.x.toFixed(1)}, ${sphere.position.y.toFixed(1)}, ${sphere.position.z.toFixed(1)})`)
                }
            }
            
            // Store enhanced track data on sphere
            sphere.userData = { 
                track, 
                originalColor: material.color.clone(),
                originalPosition: sphere.position.clone(),
                floatOffset: Math.random() * Math.PI * 2,
                pulseOffset: Math.random() * Math.PI * 2,
                energyLevel: track.coordinates?.energy || track.sonic_dna?.features?.energy || 0.5
            }
            
            // Debug: Verify track has UUID when storing in userData
            if (!track.uuid) {
                console.warn(`[WARN] Track missing UUID when creating sphere:`, track.track_id, track)
            }
            
            this.scene.add(sphere)
            this.musicSpheres.push(sphere)
        }
        
        console.log(`[SUCCESS] Created advanced emotional galaxy with ${this.musicSpheres.length} spheres using sophisticated positioning algorithms`)
        
        // Update count display with final sphere count
        this.updateTrackCountDisplay()
    }

    createConnections() {
        // Don't create any connections initially - they'll be created on demand when spheres are clicked
        if (!this.connections || this.connections.length === 0) {
            console.log('[CONNECTION] No connection data available')
            return
        }

        console.log(`[CONNECTION] ${this.connections.length} connections loaded, will display on sphere click`)
        
        // Create a map for quick track lookup (used later for on-demand connection creation)
        this.trackMap = new Map()
        this.musicSpheres.forEach(sphere => {
            const trackId = sphere.userData.track.track_id || sphere.userData.track.id
            if (trackId) {
                this.trackMap.set(trackId, sphere)
            }
        })
        
        console.log(`[SUCCESS] Track map created with ${this.trackMap.size} tracks`)
    }

    toggleSphereConnections(sphere, trackId) {
        console.log(`[TARGET] Toggle sphere connections for track: ${trackId}`)
        console.log(`[STATUS] Currently clicked spheres: ${Array.from(this.clickedSpheres)}`)
        
        if (this.clickedSpheres.has(trackId)) {
            // Remove connections for this sphere
            this.removeConnectionsForSphere(trackId)
            this.clickedSpheres.delete(trackId)
            
            // Remove bloom effect
            this.removeBloomEffect(sphere)
            sphere.scale.set(1, 1, 1)
            
            // Remove from selected tracks
            this.removeFromSelectedTracks(trackId)
            
            console.log(`[REMOVE] Removed connections for track: ${trackId}`)
        } else {
            // Add connections for this sphere
            this.addConnectionsForSphere(trackId)
            this.clickedSpheres.add(trackId)
            
            // Add bloom effect
            this.addBloomEffect(sphere)
            sphere.scale.set(1.3, 1.3, 1.3)
            
            // Add to selected tracks 
            this.addToSelectedTracks(sphere.userData.track, trackId)
            
            // Auto-play the track via backend API
            this.playTrack(sphere.userData.track, sphere)
            
            console.log(`[ADD] Added connections for track: ${trackId}`)
        }
        
        // Update count display
        this.updateTrackCountDisplay()
    }

    addBloomEffect(sphere) {
        // ENHANCED BLOOM SYSTEM - More sophisticated visual effects
        sphere.material.userData.isSelected = true
        sphere.material.userData.bloomIntensity = 1.0 // Much lower intensity
        
        // Get original color from stored userData
        const originalColor = sphere.material.userData.originalColor || sphere.userData.originalColor || new THREE.Color(0x1DB954)
        
        // SUBTLE BLOOM ALGORITHM - Gentle enhancement
        
        // 1. Slight brightness boost for bloom threshold
        const bloomColor = originalColor.clone().multiplyScalar(1.8) // Much lower multiplier
        sphere.material.color.copy(bloomColor)
        
        // 2. Gentle emissive for subtle bloom
        const emissiveColor = originalColor.clone().multiplyScalar(0.5) // Much lower
        sphere.material.emissive.copy(emissiveColor)
        sphere.material.emissiveIntensity = 0.15 // Much lower intensity
        
        // 3. Material property enhancement
        sphere.material.metalness = 0.0 // Full non-metallic for better bloom
        sphere.material.roughness = 0.1 // Smooth surface for better light reflection
        sphere.material.opacity = 1.0 // Full opacity for selected items
        
        // 4. Visual scaling for emphasis
        sphere.scale.set(1.5, 1.5, 1.5) // Larger selected spheres
        
        // Force material update
        sphere.material.needsUpdate = true
        
        console.log(`[BLOOM] Subtle bloom applied to sphere with ${originalColor.getHexString()} → ${bloomColor.getHexString()}`)
    }

    removeBloomEffect(sphere) {
        // ENHANCED BLOOM REMOVAL - Restore to sophisticated base state
        sphere.material.userData.isSelected = false
        sphere.material.userData.bloomIntensity = 0.0
        
        // Get original color from stored userData
        const originalColor = sphere.material.userData.originalColor || sphere.userData.originalColor || new THREE.Color(0x1DB954)
        
        // 1. Restore original color
        sphere.material.color.copy(originalColor)
        
        // 2. Reset emissive properties
        sphere.material.emissive.setHex(0x000000)
        sphere.material.emissiveIntensity = 0.0
        
        // 3. Restore material properties
        sphere.material.metalness = 0.1 // Slight metallic
        sphere.material.roughness = 0.3 // Medium roughness
        sphere.material.opacity = 0.9 // Slight transparency for unselected
        
        // 4. Reset scale
        sphere.scale.set(1.0, 1.0, 1.0)
        
        // Force material update
        sphere.material.needsUpdate = true
    }

    // Enhanced hover effects
    addHoverEffect(sphere) {
        if (!sphere.material.userData.isSelected) {
            // Subtle hover enhancement
            const originalColor = sphere.material.userData.originalColor || sphere.userData.originalColor || new THREE.Color(0x1DB954)
            const hoverColor = originalColor.clone().multiplyScalar(1.8)
            
            sphere.material.color.copy(hoverColor)
            sphere.material.emissive.copy(originalColor.clone().multiplyScalar(0.3))
            sphere.material.emissiveIntensity = 0.2
            sphere.scale.set(1.2, 1.2, 1.2)
            sphere.material.needsUpdate = true
        }
    }

    removeHoverEffect(sphere) {
        if (!sphere.material.userData.isSelected) {
            // Restore non-selected state
            const originalColor = sphere.material.userData.originalColor || sphere.userData.originalColor || new THREE.Color(0x1DB954)
            
            sphere.material.color.copy(originalColor)
            sphere.material.emissive.setHex(0x000000)
            sphere.material.emissiveIntensity = 0.0
            sphere.scale.set(1.0, 1.0, 1.0)
            sphere.material.needsUpdate = true
        }
    }

    addConnectionsForSphere(trackId) {
        // Only add connections in discovery modes
        if (this.discoveryMode === 'none') return
        
        if (this.discoveryMode === 'similar') {
            this.showSimilarTracks(trackId)
        }
        // Pathfinding connections are handled separately
    }

    showSimilarTracks(trackId) {
        if (!this.connections || !this.trackMap) return
        
        const connectionLines = []
        
        // Clear and rebuild similarity context
        this.similarityContext.clear()
        this.similarityContext.add(trackId) // Add the source track
        
        // Find all connections involving this track
        this.connections.forEach(connection => {
            if (connection.source === trackId || connection.target === trackId) {
                const sourceSphere = this.trackMap.get(connection.source)
                const targetSphere = this.trackMap.get(connection.target)
                
                if (sourceSphere && targetSphere) {
                    // Add connected track to similarity context
                    const connectedTrack = connection.source === trackId ? connection.target : connection.source
                    this.similarityContext.add(connectedTrack)
                    
                    // Create simple line geometry
                    const points = [
                        sourceSphere.position.clone(),
                        targetSphere.position.clone()
                    ]
                    const geometry = new THREE.BufferGeometry().setFromPoints(points)
                    
                    // Line material based on connection strength
                    const strength = connection.weight || connection.similarity || 0.5
                    const material = new THREE.LineBasicMaterial({
                        color: new THREE.Color(0x1DB954),
                        transparent: true,
                        opacity: Math.min(strength * 0.8, 0.6),
                        linewidth: 2
                    })
                    
                    const line = new THREE.Line(geometry, material)
                    line.userData = {
                        connection: connection,
                        sourceTrack: connection.source,
                        targetTrack: connection.target,
                        isStatic: true
                    }
                    
                    this.scene.add(line)
                    connectionLines.push(line)
                }
            }
        })
        
        // Store the connection lines for this sphere
        this.activeConnections.set(trackId, connectionLines)
        this.updateDiscoveryUI() // Update UI to show the Add button
        
        console.log(`[SIMILAR] Created ${connectionLines.length} similarity connections for track ${trackId}`)
        console.log(`[SIMILAR] Found ${this.similarityContext.size} tracks in similarity context`)
    }

    calculateVectorSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0
        
        let dotProduct = 0
        let norm1 = 0
        let norm2 = 0
        
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i]
            norm1 += vec1[i] * vec1[i]
            norm2 += vec2[i] * vec2[i]
        }
        
        if (norm1 === 0 || norm2 === 0) return 0
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
    }

    calculateEmotionalSimilarity(track1, track2) {
        if (!track1.coordinates || !track2.coordinates) return 0
        
        const coords1 = track1.coordinates
        const coords2 = track2.coordinates
        
        const diff = Math.sqrt(
            Math.pow(coords1.valence - coords2.valence, 2) +
            Math.pow(coords1.energy - coords2.energy, 2) +
            Math.pow(coords1.complexity - coords2.complexity, 2) +
            Math.pow(coords1.tension - coords2.tension, 2)
        )
        
        return Math.max(0, 1 - diff / 2) // Normalize to 0-1
    }

        removeConnectionsForSphere(trackId) {
        const connectionLines = this.activeConnections.get(trackId)
        if (connectionLines) {
            connectionLines.forEach(line => {
                this.scene.remove(line)
                line.geometry.dispose()
                line.material.dispose()
            })
            this.activeConnections.delete(trackId)
        }
    }

    clearAllConnections() {
        // Remove all active connections
        this.activeConnections.forEach((connectionLines) => {
            connectionLines.forEach(line => {
                this.scene.remove(line)
                line.geometry.dispose()
                line.material.dispose()
            })
        })
        this.activeConnections.clear()
        this.clickedSpheres.clear()
        
        // Reset all sphere appearances and remove bloom
        this.musicSpheres.forEach(sphere => {
            this.removeBloomEffect(sphere)
            sphere.scale.set(1, 1, 1)
        })
        
        // Clear selected tracks
        this.selectedTracks = []
        this.currentTrackIndex = -1
        this.saveSelectedTracks()
        
        this.updateTrackCountDisplay()
        console.log('[CONNECTION] Cleared all connections')
    }

    // localStorage management for selected tracks
    loadSelectedTracks() {
        try {
            const saved = localStorage.getItem('musicPlayer_selectedTracks')
            if (saved) {
                this.selectedTracks = JSON.parse(saved)
                console.log(`[LOAD] Loaded ${this.selectedTracks.length} selected tracks from localStorage`)
            }
        } catch (error) {
            console.error('Error loading selected tracks:', error)
            this.selectedTracks = []
        }
    }

    saveSelectedTracks() {
        try {
            localStorage.setItem('musicPlayer_selectedTracks', JSON.stringify(this.selectedTracks))
        } catch (error) {
            console.error('Error saving selected tracks:', error)
        }
    }

    restoreVisualSelections() {
        console.log(`[RESTORE] Restoring visual selections for ${this.selectedTracks.length} tracks`)
        
        this.selectedTracks.forEach((trackData, index) => {
            // Try both track_id and uuid for compatibility
            const trackId = trackData.track_id || trackData.uuid || trackData.id
            
            console.log(`[RESTORE] Restoring selection ${index + 1}: ${trackId}`)
            
            // Find sphere using trackMap or by searching through musicSpheres
            let sphere = null
            
            if (this.trackMap && this.trackMap.has(trackId)) {
                sphere = this.trackMap.get(trackId)
                console.log(`[SUCCESS] Found sphere via trackMap for: ${trackId}`)
            } else {
                // Fallback: search through all spheres
                sphere = this.musicSpheres?.find(s => {
                    const sphereTrackId = s.userData.track.track_id || s.userData.track.uuid || s.userData.track.id
                    return sphereTrackId === trackId
                })
                
                if (sphere) {
                    console.log(`[SUCCESS] Found sphere via fallback search for: ${trackId}`)
                } else {
                    console.warn(`[WARNING] No sphere found for track: ${trackId}`)
                }
            }
            
            if (sphere) {
                this.clickedSpheres.add(trackId)
                this.addBloomEffect(sphere)
                sphere.scale.set(1.3, 1.3, 1.3)
                this.addConnectionsForSphere(trackId)
                console.log(`[VISUAL] Restored visual selection for: ${trackId}`)
            }
        })
        
        console.log(`[SUCCESS] Restored ${this.clickedSpheres.size} visual selections`)
        this.updateTrackCountDisplay()
    }

    addToSelectedTracks(track, trackId) {
        console.log(`[ADD] Adding track to selected tracks: ${trackId}`)
        console.log(`[COUNT] Current selected tracks count: ${this.selectedTracks.length}`)
        
        // Check if already selected
        const existing = this.selectedTracks.findIndex(t => (t.track_id || t.id) === trackId)
        if (existing === -1) {
            this.selectedTracks.push(track)
            this.currentTrackIndex = this.selectedTracks.length - 1
            this.saveSelectedTracks()
            this.updateSelectedTracksList()
            
            // Create/update playlist flow visualization
            this.createPlaylistFlow()
            
            console.log(`[SUCCESS] Added track to selection: ${trackId}, new count: ${this.selectedTracks.length}`)
        } else {
            // Track already exists, just update current index
            this.currentTrackIndex = existing
            this.updateSelectedTracksList()
            console.log(`[INFO] Track already selected, updated index: ${trackId}`)
        }
    }

    removeFromSelectedTracks(trackId) {
        const index = this.selectedTracks.findIndex(t => (t.track_id || t.id) === trackId)
        if (index !== -1) {
            this.selectedTracks.splice(index, 1)
            
            // Adjust current index
            if (this.currentTrackIndex >= index) {
                this.currentTrackIndex = Math.max(0, this.currentTrackIndex - 1)
            }
            if (this.selectedTracks.length === 0) {
                this.currentTrackIndex = -1
            }
            
            this.saveSelectedTracks()
            this.updateSelectedTracksList()
            
            // Update playlist flow visualization
            this.createPlaylistFlow()
        }
    }

    clearAllSelectedTracks() {
        this.selectedTracks = []
        this.currentTrackIndex = -1
        this.saveSelectedTracks()
        this.clearAllConnections()
        
        // Clear playlist flow visualization
        this.createPlaylistFlow()
        
        this.updateSelectedTracksList() // This will also update navigation buttons
        console.log('[CLEAR] Cleared all selected tracks')
    }

    // Next/Previous functionality with enhanced playlist management
    playNext() {
        if (this.selectedTracks.length === 0) {
            console.log('🚫 No tracks in playlist to play next')
            return
        }
        
        // If no track is currently playing, start from the beginning
        if (this.currentTrackIndex === -1) {
            console.log('🎵 Starting playlist from beginning')
            this.currentTrackIndex = 0
        } else {
            // Move to next track with looping
            this.currentTrackIndex = (this.currentTrackIndex + 1) % this.selectedTracks.length
            console.log(`🎵 Moving to next track: ${this.currentTrackIndex + 1}/${this.selectedTracks.length}`)
        }
        
        this.playTrackByIndex(this.currentTrackIndex)
    }

    playPrevious() {
        if (this.selectedTracks.length === 0) {
            console.log('🚫 No tracks in playlist to play previous')
            return
        }
        
        // If no track is currently playing, start from the end
        if (this.currentTrackIndex === -1) {
            console.log('🎵 Starting playlist from end')
            this.currentTrackIndex = this.selectedTracks.length - 1
        } else {
            // Move to previous track with looping
            this.currentTrackIndex = this.currentTrackIndex <= 0 
                ? this.selectedTracks.length - 1 
                : this.currentTrackIndex - 1
            console.log(`🎵 Moving to previous track: ${this.currentTrackIndex + 1}/${this.selectedTracks.length}`)
        }
        
        this.playTrackByIndex(this.currentTrackIndex)
    }

    playTrackByIndex(index) {
        if (index < 0 || index >= this.selectedTracks.length) return
        
        console.log(`🎯 Playing track by index: ${index}`)
        
        const track = this.selectedTracks[index]
        const trackId = track.track_id || track.id
        const sphere = this.trackMap?.get(trackId)
        
        // Update current track index
        this.currentTrackIndex = index
        
        // Update the UI to reflect the new current track
        this.updateSelectedTracksList()
        
        if (sphere) {
            // Call the proper backend playTrack method
            this.playTrack(track, sphere)
            console.log(`🎵 Playing track ${index + 1}/${this.selectedTracks.length}: ${trackId}`)
        } else {
            console.warn(`⚠️ Could not find sphere for track: ${trackId}`)
            // Still try to play without sphere reference
            this.playTrack(track, null)
        }
    }

    getAdvancedTrackColor(track, trackIndex, totalTracks) {
        // ADVANCED MULTI-SOURCE COLOR ALGORITHM - Use backend's sophisticated system
        
        // Priority 1: Use backend's pre-calculated emotional color (ranking-based for diversity)
        if (track.emotional_color) {
            const color = track.emotional_color
            return new THREE.Color(
                Math.max(0, Math.min(255, color.r || 0)) / 255,
                Math.max(0, Math.min(255, color.g || 0)) / 255,
                Math.max(0, Math.min(255, color.b || 0)) / 255
            )
        }
        
        // Priority 2: Use backend's direct color field
        if (track.color) {
            const color = track.color
            return new THREE.Color(
                Math.max(0, Math.min(255, color.r || 0)) / 255,
                Math.max(0, Math.min(255, color.g || 0)) / 255,
                Math.max(0, Math.min(255, color.b || 0)) / 255
            )
        }
        
        // Priority 3: Generate ranking-based emotional color (backend algorithm)
        return this.getEmotionalColor(track, trackIndex, totalTracks)
    }

    getEmotionalColor(track, trackIndex, totalTracks) {
        // RANKING-BASED EMOTIONAL COLOR - Every track gets unique vibrant color
        if (trackIndex !== undefined && totalTracks > 1) {
            // Distribute hues evenly across spectrum for maximum diversity
            let hue = (trackIndex * 360 / totalTracks) % 360
            
            // Add emotional coordinate variations
            if (track.coordinates) {
                const coords = track.coordinates
                const valenceOffset = (coords.valence + 0.2) * 15 // Stronger variation
                const energyOffset = (coords.energy - 0.5) * 12
                const complexityOffset = (coords.complexity - 0.5) * 8
                hue = (hue + valenceOffset + energyOffset + complexityOffset) % 360
            }
            
            // Convert HSL to RGB with appealing saturation/lightness
            const hslToRgb = (h, s, l) => {
                h /= 360; s /= 100; l /= 100
                const a = s * Math.min(l, 1 - l)
                const f = n => {
                    const k = (n + h * 12) % 12
                    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
                }
                return [f(0), f(8), f(4)]
            }
            
            // Higher saturation and optimal lightness for visual impact
            const [r, g, b] = hslToRgb(hue, 85, 65) // 85% saturation, 65% lightness
            return new THREE.Color(r, g, b)
        }
        
        // Fallback to appealing default
        return new THREE.Color(0xFF69B4) // Hot pink fallback
    }

    getSonicColor(track) {
        // SONIC COLOR - From harmonic content (frequency-to-color mapping)
        if (track.sonic_color) {
            const color = track.sonic_color
            return new THREE.Color(
                Math.max(0, Math.min(255, color.r || 120)) / 255,
                Math.max(0, Math.min(255, color.g || 120)) / 255,
                Math.max(0, Math.min(255, color.b || 120)) / 255
            )
        }
        
        // Generate from harmonic genes if available
        if (track.metadata && track.metadata.genetic_fingerprint) {
            // Use genetic fingerprint to generate sonic color
            const fingerprint = track.metadata.genetic_fingerprint
            const hash = this.hashCode(fingerprint)
            
            // Map hash to RGB (frequency spectrum analogy)
            const red = ((hash & 0xFF0000) >> 16) / 255
            const green = ((hash & 0x00FF00) >> 8) / 255  
            const blue = (hash & 0x0000FF) / 255
            
            // Ensure minimum brightness
            return new THREE.Color(
                Math.max(0.2, red),
                Math.max(0.2, green),
                Math.max(0.2, blue)
            )
        }
        
        // Fallback to neutral sonic color
        return new THREE.Color(0.7, 0.7, 0.7)
    }

    getHybridColor(track, trackIndex, totalTracks) {
        // HYBRID COLOR - Blend of emotional and sonic
        if (track.hybrid_color) {
            const color = track.hybrid_color
            return new THREE.Color(
                Math.max(0, Math.min(255, color.r || 120)) / 255,
                Math.max(0, Math.min(255, color.g || 120)) / 255,
                Math.max(0, Math.min(255, color.b || 120)) / 255
            )
        }
        
        // Generate hybrid by blending emotional and sonic
        const emotional = this.getEmotionalColor(track, trackIndex, totalTracks)
        const sonic = this.getSonicColor(track)
        
        return new THREE.Color(
            (emotional.r + sonic.r) / 2,
            (emotional.g + sonic.g) / 2,
            (emotional.b + sonic.b) / 2
        )
    }

    hashCode(str) {
        // Simple hash function for consistent color generation
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // Convert to 32bit integer
        }
        return Math.abs(hash)
    }

    // Enhanced color switching functionality
    switchColorMode(mode) {
        // mode: 'emotional', 'sonic', 'hybrid'
        console.log(`[COLOR] Switching to ${mode} color mode`)
        
        this.musicSpheres.forEach((sphere, index) => {
            const track = sphere.userData.track
            let newColor
            
            switch(mode) {
                case 'sonic':
                    newColor = this.getSonicColor(track)
                    break
                case 'hybrid':
                    newColor = this.getHybridColor(track, index, this.musicSpheres.length)
                    break
                case 'emotional':
                default:
                    newColor = this.getEmotionalColor(track, index, this.musicSpheres.length)
                    break
            }
            
            // Update material color
            sphere.material.color.copy(newColor)
            sphere.material.userData.originalColor = newColor.clone()
            sphere.material.userData.colorMode = mode
            sphere.material.needsUpdate = true
            
            // Update sphere userData
            sphere.userData.originalColor = newColor.clone()
        })
        
        console.log(`[SUCCESS] Switched all ${this.musicSpheres.length} spheres to ${mode} color mode`)
    }

    setupEventListeners() {
        const canvas = this.renderer.domElement
        
        canvas.addEventListener('click', this.onCanvasClick.bind(this))
        canvas.addEventListener('mousemove', this.onCanvasMouseMove.bind(this))
        window.addEventListener('resize', this.onWindowResize.bind(this))
        window.addEventListener('keydown', this.onKeyDown.bind(this))
    }

    onCanvasClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.raycaster.setFromCamera(this.mouse, this.camera)
        const intersects = this.raycaster.intersectObjects(this.musicSpheres)

        if (intersects.length > 0) {
            const clickedSphere = intersects[0].object
            const trackId = clickedSphere.userData.track.track_id || clickedSphere.userData.track.uuid || clickedSphere.userData.track.id
            
            // Handle pathfinding mode clicks
            if (this.discoveryMode === 'pathfinding') {
                if (this.pathfindingState.settingStart) {
                    this.pathfindingState.startTrack = trackId
                    this.pathfindingState.settingStart = false
                    this.updateDiscoveryUI()
                    console.log(`[PATH] Set start track: ${trackId}`)
                    return
                } else if (this.pathfindingState.settingEnd) {
                    this.pathfindingState.endTrack = trackId
                    this.pathfindingState.settingEnd = false
                    this.updateDiscoveryUI()
                    console.log(`[PATH] Set end track: ${trackId}`)
                    return
                }
            }
            
            // Normal click behavior - toggle clicked state and connections
            this.toggleSphereConnections(clickedSphere, trackId)
        }
    }

    onCanvasMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.raycaster.setFromCamera(this.mouse, this.camera)
        const intersects = this.raycaster.intersectObjects(this.musicSpheres)

        // ENHANCED HOVER SYSTEM - Reset all non-selected spheres to original state
        this.musicSpheres.forEach(sphere => {
            if (!sphere.material.userData.isSelected) {
                this.removeHoverEffect(sphere)
            }
        })

        // SOPHISTICATED HOVER EFFECTS - Apply enhanced hover to intersected sphere
        if (intersects.length > 0) {
            const hoveredSphere = intersects[0].object
            this.addHoverEffect(hoveredSphere)
            document.body.style.cursor = 'pointer'
        } else {
            document.body.style.cursor = 'default'
        }
    }

    onWindowResize() {
        const container = document.getElementById(this.containerId)
        this.camera.aspect = container.clientWidth / container.clientHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        
        // Update composer size too
        if (this.composer) {
            this.composer.setSize(container.clientWidth, container.clientHeight)
        }
        
        this.controls.update()
    }

    onKeyDown(event) {
        // Press 'C' to clear all connections
        if (event.key === 'c' || event.key === 'C') {
            this.clearAllConnections()
        }
        // Press 'Escape' to clear all connections
        if (event.key === 'Escape') {
            this.clearAllConnections()
        }
    }

    async playTrack(track, sphere) {
        try {
            // Robust UUID extraction and validation
            const trackUUID = track.uuid
            const trackId = track.track_id || track.uuid || 'unknown'
            
            // Get display name for logging
            let displayName = trackId
            if (track.metadata) {
                const artist = track.metadata.artist_display || track.metadata.artist || 'Unknown'
                const title = track.metadata.track_display || track.metadata.track_name || 'Unknown'
                displayName = `${artist} - ${title}`
            }
            
            console.log(`[PLAY] Playing: ${displayName}`)
            console.log(`[ID] Track ID: ${trackId}`)
            console.log(`[UUID] Using UUID: ${trackUUID}`)
            
            // Validate UUID before proceeding
            if (!trackUUID) {
                console.error('[ERROR] No UUID available for track:', track)
                throw new Error(`Track UUID not available for: ${displayName}`)
            }
            
            // Reset previous track sphere visual effects
            if (this.currentTrack && this.currentTrack.sphere) {
                // Reset previous sphere to original bloom state (if it was selected)
                const prevTrackId = this.currentTrack.track.track_id || this.currentTrack.track.uuid
                if (this.clickedSpheres.has(prevTrackId)) {
                    this.addBloomEffect(this.currentTrack.sphere) // Keep bloom for selected
                } else {
                    this.removeBloomEffect(this.currentTrack.sphere) // Remove if not selected
                }
            }
            
            // Update UI first
            this.updateTrackInfo(track)
            
            // Set current track (handle null sphere gracefully)
            this.currentTrack = { track, sphere: sphere || null }
            
            // Use UUID-based endpoint for reliable audio access
            try {
                console.log(`📡 Requesting audio for UUID: "${trackUUID}"`)
                console.log(`🔍 Track UUID type: ${typeof trackUUID}, length: ${trackUUID ? trackUUID.length : 'null'}`)
                
                // Validate UUID format (should be a proper UUID string)
                if (!trackUUID || trackUUID.trim() === '') {
                    throw new Error(`Invalid UUID: "${trackUUID}" for track: ${displayName}`)
                }
                
                // Stop current audio if playing
                if (!this.audio.paused) {
                    this.audio.pause()
                }
                
                // Clean up previous blob URL to prevent memory leaks
                if (this.audio.src && this.audio.src.startsWith('blob:')) {
                    URL.revokeObjectURL(this.audio.src)
                }
                
                // Try multiple methods to get the audio
                let audioUrl = null
                let audioBlob = null
                
                // Method 1: Try GET request first
                try {
                    const getUrl = `${this.apiBase}/uuid/${encodeURIComponent(trackUUID.trim())}/audio`
                    console.log(`🎵 Trying GET: ${getUrl}`)
                    
                    const getResponse = await fetch(getUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'audio/*',
                            'Cache-Control': 'no-cache'
                        }
                    })
                    
                    if (getResponse.ok) {
                        audioBlob = await getResponse.blob()
                        audioUrl = URL.createObjectURL(audioBlob)
                        console.log(`✅ GET request successful, blob size: ${audioBlob.size} bytes`)
                    } else {
                        console.warn(`⚠️ GET request failed: ${getResponse.status} ${getResponse.statusText}`)
                    }
                } catch (getError) {
                    console.warn(`⚠️ GET request error:`, getError)
                }
                
                // Method 2: Try POST request if GET failed
                if (!audioUrl) {
                    try {
                        const postUrl = `${this.apiBase}/uuid/audio`
                        console.log(`🎵 Trying POST: ${postUrl}`)
                        
                        const postResponse = await fetch(postUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'audio/*'
                            },
                            body: JSON.stringify({
                                uuid: trackUUID.trim(),
                                track_uuid: trackUUID.trim()
                            })
                        })
                        
                        if (postResponse.ok) {
                            audioBlob = await postResponse.blob()
                            audioUrl = URL.createObjectURL(audioBlob)
                            console.log(`✅ POST request successful, blob size: ${audioBlob.size} bytes`)
                        } else {
                            console.error(`❌ POST request failed: ${postResponse.status} ${postResponse.statusText}`)
                            const errorText = await postResponse.text()
                            console.error(`❌ POST error details:`, errorText)
                        }
                    } catch (postError) {
                        console.error(`❌ POST request error:`, postError)
                    }
                }
                
                // If both methods failed, throw error
                if (!audioUrl) {
                    throw new Error(`Failed to load audio from both GET and POST methods for UUID: ${trackUUID}`)
                }
                
                // Set new audio source and add error handling
                this.audio.src = audioUrl
                this.audio.currentTime = 0
                
                // Add error event listener for this specific track
                const handleAudioError = (event) => {
                    console.error(`❌ Audio loading failed for UUID ${trackUUID}:`, event)
                    console.error(`❌ Audio error details:`, this.audio.error)
                    this.audio.removeEventListener('error', handleAudioError)
                    throw new Error(`Failed to load audio for: ${displayName}`)
                }
                
                this.audio.addEventListener('error', handleAudioError, { once: true })
                
                // Load the audio
                this.audio.load()
                
                // Wait for audio to be ready and then play
                await new Promise((resolve, reject) => {
                    const onCanPlay = () => {
                        this.audio.removeEventListener('canplay', onCanPlay)
                        this.audio.removeEventListener('error', onError)
                        resolve()
                    }
                    
                    const onError = (event) => {
                        this.audio.removeEventListener('canplay', onCanPlay)
                        this.audio.removeEventListener('error', onError)
                        console.error(`❌ Audio failed to load for UUID ${trackUUID}:`, event)
                        reject(new Error(`Audio loading failed for: ${displayName}`))
                    }
                    
                    this.audio.addEventListener('canplay', onCanPlay, { once: true })
                    this.audio.addEventListener('error', onError, { once: true })
                })
                
                // Play the audio
                await this.audio.play()
                this.isPlaying = true
                this.updatePlayButton()
                
                // Setup audio analysis when playback starts
                if (!this.audioContext) {
                    this.setupAudioAnalysis()
                }
                
                console.log(`✅ Successfully started playing: ${trackId} (UUID: ${trackUUID})`)
                
                // Add extra visual emphasis for the currently playing track (only if sphere exists)
                if (sphere) {
                    sphere.material.emissive.setHex(0x1DB954) // Green glow
                    sphere.material.emissiveIntensity = 0.3
                }
                
            } catch (audioError) {
                console.warn('🎵 Audio playback failed, continuing with visual feedback:', audioError)
                
                // Show user feedback about audio issue
                this.showAudioError(trackId, audioError)
                
                // Continue with visual playback even if audio fails
                this.isPlaying = false
                this.updatePlayButton()
                
                // Still provide visual feedback (only if sphere exists)
                if (sphere) {
                    sphere.material.emissive.setHex(0xFF6B35) // Orange for error state
                    sphere.material.emissiveIntensity = 0.3
                }
            }
            
        } catch (error) {
            console.error('❌ Error in playTrack:', error)
            
            // Show error to user
            this.showAudioError(track.track_id || track.uuid, error)
        }
    }

    showAudioError(trackId, error) {
        // Create a temporary notification
        const notification = document.createElement('div')
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
        `
        notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Audio Playback Issue</div>
            <div style="margin-bottom: 8px;">Track: ${trackId}</div>
            <div style="font-size: 12px; opacity: 0.8;">Check console for details</div>
        `
        
        document.body.appendChild(notification)
        
        // Remove notification after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification)
            }
        }, 3000)
        
        console.error(`🎵 Audio error for track ${trackId}:`, error)
    }

    truncateText(text, maxLength = 35) {
        if (!text) return ''
        if (text.length <= maxLength) return text
        return text.substring(0, maxLength - 3) + '...'
    }

    formatTrackTitle(track) {
        if (track.metadata) {
            const metadata = track.metadata
            const title = metadata.track_display || metadata.track_name || 'Unknown Track'
            return this.truncateText(title, 35)
        } else {
            // Fallback to parsing track_id
            const trackId = track.track_id || track.id
            const parts = trackId.split('_')
            let title = parts.slice(2).join(' ') || 'Unknown Track'
            // Clean up common formatting
            title = title.replace(/^\d+\.\s*/, '') // Remove track numbers
            title = title.replace(/\.(mp3|flac|wav|m4a)$/i, '') // Remove file extensions
            return this.truncateText(title, 35)
        }
    }

    formatArtistName(track) {
        if (track.metadata) {
            const metadata = track.metadata
            const artist = metadata.artist_display || metadata.artist || 'Unknown Artist'
            return this.truncateText(artist, 25)
        } else {
            // Fallback to parsing track_id
            const trackId = track.track_id || track.id
            const parts = trackId.split('_')
            const artist = parts[0] || 'Unknown Artist'
            return this.truncateText(artist, 25)
        }
    }

    updateTrackInfo(track) {
        const titleElement = document.getElementById('track-title')
        const artistElement = document.getElementById('track-artist')
        
        if (titleElement && artistElement) {
            const title = this.formatTrackTitle(track)
            const artist = this.formatArtistName(track)
            
            titleElement.textContent = title
            titleElement.title = track.metadata?.track_display || track.metadata?.track_name || track.track_id || track.id // Full title on hover
            
            artistElement.textContent = artist
            artistElement.title = track.metadata?.artist_display || track.metadata?.artist || '' // Full artist on hover
            
            console.log(`🎵 Updated track info: "${title}" by "${artist}"`)
        }
    }

    setupAudioAnalysis() {
        try {
            // Create audio context and analyser
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
            this.analyser = this.audioContext.createAnalyser()
            
            // Connect audio element to analyser
            const source = this.audioContext.createMediaElementSource(this.audio)
            source.connect(this.analyser)
            this.analyser.connect(this.audioContext.destination)
            
            // Configure analyser for detailed frequency analysis
            this.analyser.fftSize = 256 // 128 frequency bins
            this.analyser.smoothingTimeConstant = 0.8 // Smooth transitions
            this.bufferLength = this.analyser.frequencyBinCount
            this.dataArray = new Uint8Array(this.bufferLength)
            
            // Audio analysis state
            this.audioAnalysis = {
                bass: 0,        // 0-4 bins (20-250 Hz)
                lowMid: 0,      // 5-15 bins (250-800 Hz)
                mid: 0,         // 16-40 bins (800-2500 Hz)
                highMid: 0,     // 41-80 bins (2500-8000 Hz)
                treble: 0,      // 81-127 bins (8000+ Hz)
                overall: 0,     // Overall RMS energy
                bassKick: 0,    // Bass kick detection
                beatDetected: false
            }
            
            console.log('🎵 Enhanced audio analysis setup complete')
        } catch (error) {
            console.warn('🎵 Audio analysis setup failed:', error)
        }
    }

    analyzeAudio() {
        if (!this.analyser || !this.dataArray || !this.isPlaying) {
            return
        }
        
        // Get frequency data
        this.analyser.getByteFrequencyData(this.dataArray)
        
        // Calculate frequency band averages
        let bassSum = 0, lowMidSum = 0, midSum = 0, highMidSum = 0, trebleSum = 0
        let bassCount = 0, lowMidCount = 0, midCount = 0, highMidCount = 0, trebleCount = 0
        let overallSum = 0
        
        for (let i = 0; i < this.bufferLength; i++) {
            const value = this.dataArray[i] / 255.0 // Normalize to 0-1
            overallSum += value
            
            if (i <= 4) { // Bass: 0-250 Hz
                bassSum += value
                bassCount++
            } else if (i <= 15) { // Low Mid: 250-800 Hz
                lowMidSum += value
                lowMidCount++
            } else if (i <= 40) { // Mid: 800-2500 Hz
                midSum += value
                midCount++
            } else if (i <= 80) { // High Mid: 2500-8000 Hz
                highMidSum += value
                highMidCount++
            } else { // Treble: 8000+ Hz
                trebleSum += value
                trebleCount++
            }
        }
        
        // Calculate raw values
        const rawBass = bassCount > 0 ? bassSum / bassCount : 0
        const rawLowMid = lowMidCount > 0 ? lowMidSum / lowMidCount : 0
        const rawMid = midCount > 0 ? midSum / midCount : 0
        const rawHighMid = highMidCount > 0 ? highMidSum / highMidCount : 0
        const rawTreble = trebleCount > 0 ? trebleSum / trebleCount : 0
        const rawOverall = overallSum / this.bufferLength
        
        // Smooth the values to reduce jittery motion (lerp with previous values)
        const smoothing = 0.7 // Higher = smoother but less responsive
        this.audioAnalysis.bass = this.prevAudioAnalysis.bass * smoothing + rawBass * (1 - smoothing)
        this.audioAnalysis.lowMid = this.prevAudioAnalysis.lowMid * smoothing + rawLowMid * (1 - smoothing)
        this.audioAnalysis.mid = this.prevAudioAnalysis.mid * smoothing + rawMid * (1 - smoothing)
        this.audioAnalysis.highMid = this.prevAudioAnalysis.highMid * smoothing + rawHighMid * (1 - smoothing)
        this.audioAnalysis.treble = this.prevAudioAnalysis.treble * smoothing + rawTreble * (1 - smoothing)
        this.audioAnalysis.overall = this.prevAudioAnalysis.overall * smoothing + rawOverall * (1 - smoothing)
        
        // Store previous values for next frame
        this.prevAudioAnalysis.bass = this.audioAnalysis.bass
        this.prevAudioAnalysis.lowMid = this.audioAnalysis.lowMid
        this.prevAudioAnalysis.mid = this.audioAnalysis.mid
        this.prevAudioAnalysis.highMid = this.audioAnalysis.highMid
        this.prevAudioAnalysis.treble = this.audioAnalysis.treble
        this.prevAudioAnalysis.overall = this.audioAnalysis.overall
        
        // Bass kick detection (sudden increase in bass) - use raw values for responsiveness
        const bassIncrease = rawBass - this.prevAudioAnalysis.bass
        this.audioAnalysis.bassKick = Math.max(0, bassIncrease * 3) // Reduced intensity
        
        // Beat detection (simple threshold-based) - use smoothed values
        this.audioAnalysis.beatDetected = this.audioAnalysis.bass > 0.6 && bassIncrease > 0.08
    }

    animateAudioReactiveParticles() {
        if (!this.starfield || !this.audioAnalysis || !this.isPlaying) {
            return
        }
        
        const time = Date.now() * 0.001
        const positions = this.starfield.positions
        const originalPositions = this.starfield.originalPositions
        const velocities = this.starfield.velocities
        const frequencies = this.starfield.frequencies
        
        // Get current audio analysis data
        const { bass, lowMid, mid, highMid, treble, overall, bassKick, beatDetected } = this.audioAnalysis
        
        // Update particle positions based on their assigned frequency and current audio
        for (let i = 0; i < positions.length; i += 3) {
            const particleIndex = i / 3
            const freqBin = Math.floor(frequencies[particleIndex])
            
            // Get the frequency intensity for this particle (0-1)
            const freqIntensity = this.dataArray ? (this.dataArray[freqBin] / 255.0) : 0
            
            // Original position for this particle
            const origX = originalPositions[i]
            const origY = originalPositions[i + 1]
            const origZ = originalPositions[i + 2]
            
            // Calculate percentage-based scale factor (can go below 100% and above)
            let scalePercentage = 100 // Base 100% scale (original position)
            
            // FREQUENCY-SPECIFIC PERCENTAGE SCALING - More reactive with scale down capability
            
            // 1. BASS RESPONSE (0-4 bins) - Scale between 70% and 150%
            if (freqBin <= 4) {
                const bassIntensity = bass * freqIntensity
                const bassKickBoost = bassKick * freqIntensity
                // Scale from 70% (low bass) to 150% (high bass + kick)
                scalePercentage = 70 + (bassIntensity * 60) + (bassKickBoost * 20)
            }
            
            // 2. LOW-MID RESPONSE (5-15 bins) - Scale between 80% and 130%
            else if (freqBin <= 15) {
                const lowMidIntensity = lowMid * freqIntensity
                // Scale from 80% (low) to 130% (high)
                scalePercentage = 80 + (lowMidIntensity * 50)
            }
            
            // 3. MID RESPONSE (16-40 bins) - Scale between 85% and 125%
            else if (freqBin <= 40) {
                const midIntensity = mid * freqIntensity
                // Scale from 85% (low) to 125% (high)
                scalePercentage = 85 + (midIntensity * 40)
            }
            
            // 4. HIGH-MID RESPONSE (41-80 bins) - Scale between 90% and 120%
            else if (freqBin <= 80) {
                const highMidIntensity = highMid * freqIntensity
                // Scale from 90% (low) to 120% (high)
                scalePercentage = 90 + (highMidIntensity * 30)
            }
            
            // 5. TREBLE RESPONSE (81+ bins) - Scale between 95% and 115%
            else {
                const trebleIntensity = treble * freqIntensity
                // Scale from 95% (low) to 115% (high)
                scalePercentage = 95 + (trebleIntensity * 20)
            }
            
            // BEAT DETECTION - Additional burst scaling (up to +25%)
            if (beatDetected) {
                const burstBoost = 15 + (Math.random() * 10) // Random burst between 15-25%
                scalePercentage += burstBoost
            }
            
            // OVERALL AUDIO RESPONSE - Global modifier based on overall volume
            const globalModifier = 0.9 + (overall * 0.2) // Scale between 90% and 110% based on overall audio
            scalePercentage *= globalModifier
            
            // Convert percentage to scale factor
            const scaleFactor = scalePercentage / 100.0
            
            // Apply radial scaling - move particle along its vector from center
            positions[i] = origX * scaleFactor
            positions[i + 1] = origY * scaleFactor
            positions[i + 2] = origZ * scaleFactor
        }
        
        // Update the geometry
        this.starfield.geometry.attributes.position.needsUpdate = true
        
        // Update particle material based on overall audio intensity
        this.starfield.material.opacity = this.starfield.baseOpacity + overall * 0.3
        this.starfield.material.size = this.starfield.baseSize + overall * 1.0 + bassKick * 2.0
        
        // Color shifting based on dominant frequency
        const hue = (bass * 0.0 + lowMid * 0.1 + mid * 0.3 + highMid * 0.6 + treble * 0.9) % 1.0
        this.starfield.material.color.setHSL(hue, 0.5 + overall * 0.5, 0.5 + overall * 0.3)
    }

    animateConstellationMeshes() {
        if (!this.activeConnections || this.activeConnections.size === 0) return
        
        const time = Date.now() * 0.001
        const { bass, mid, treble, overall, beatDetected } = this.audioAnalysis || {}
        
        // Animate all active constellation meshes (but skip static path lines)
        this.activeConnections.forEach((meshes, trackId) => {
            // Skip path lines (they should remain static)
            if (trackId === 'path') return
            
            meshes.forEach(meshGroup => {
                // Additional check for static elements
                if (meshGroup.userData && meshGroup.userData.isStatic) return
                
                this.animateConstellationGroup(meshGroup, time, { bass, mid, treble, overall, beatDetected })
            })
        })
    }

    animateConstellationGroup(meshGroup, time, audioData) {
        if (!meshGroup || !meshGroup.userData) return
        
        // Store animation state if not exists
        if (!meshGroup.userData.animationState) {
            meshGroup.userData.animationState = {
                rotationSpeed: 0.5 + Math.random() * 1.5,
                pulseOffset: Math.random() * Math.PI * 2,
                floatOffset: Math.random() * Math.PI * 2,
                originalScale: meshGroup.scale.clone()
            }
        }
        
        const state = meshGroup.userData.animationState
        const audioIntensity = audioData.overall || 0
        const bassIntensity = audioData.bass || 0
        const midIntensity = audioData.mid || 0
        
        // Animate different mesh types
        meshGroup.traverse((child) => {
            if (child.isMesh || child.isLine) {
                // ROTATION ANIMATION - Based on audio intensity
                if (child.material && child.material.color) {
                    const baseRotationSpeed = state.rotationSpeed * (1 + audioIntensity * 2)
                    
                    // Different rotation axes for different materials/colors
                    if (child.material.color.getHex() === 0x4A90E2) { // Harmonic crystals (blue)
                        child.rotation.x += baseRotationSpeed * 0.04
                        child.rotation.y += baseRotationSpeed * 0.06
                        
                        // Pulsing scale based on bass
                        const pulseFactor = 1 + Math.sin(time * 8 + state.pulseOffset) * 0.2 * bassIntensity
                        child.scale.setScalar(pulseFactor)
                        
                    } else if (child.material.color.getHex() === 0xE2A54A) { // Rhythmic webs (orange)
                        child.rotation.z += baseRotationSpeed * 0.08
                        
                        // Rhythmic pulsing
                        if (audioData.beatDetected) {
                            child.scale.setScalar(1.4)
                            setTimeout(() => {
                                if (child.scale) child.scale.setScalar(1.0)
                            }, 80)
                        }
                        
                    } else if (child.material.color.getHex() === 0xE24A90) { // Emotional nebula (pink)
                        // Floating animation for particles
                        if (child.userData && child.userData.originalPosition) {
                            const floatOffset = child.userData.floatOffset || 0
                            const floatSpeed = child.userData.floatSpeed || 1
                            
                            const floatAmount = Math.sin(time * (floatSpeed * 3) + floatOffset) * 1.0 * midIntensity
                            child.position.copy(child.userData.originalPosition)
                            child.position.y += floatAmount
                        }
                        
                        // Color intensity pulsing
                        if (child.material.emissive) {
                            const emissiveIntensity = 0.2 + Math.sin(time * 6) * 0.4 * audioIntensity
                            child.material.emissiveIntensity = emissiveIntensity
                        }
                        
                    } else if (child.material.color.getHex() === 0x4AE290) { // DNA helix (green)
                        // DNA unwinding animation based on complexity
                        const parent = child.parent
                        if (parent && parent.isGroup) {
                            parent.rotation.y += baseRotationSpeed * 0.03
                            
                            // Helix breathing effect
                            const breatheFactor = 1 + Math.sin(time * 4) * 0.25 * audioIntensity
                            parent.scale.set(breatheFactor, 1, breatheFactor)
                        }
                        
                    } else if (child.material.color && child.material.color.getHex() === 0x9A4AE2) { // Sonic tunnel (purple)
                        // Tunnel expansion/contraction
                        const tunnelPulse = 1 + Math.sin(time * 5 + state.pulseOffset) * 0.3 * bassIntensity
                        child.scale.x = tunnelPulse
                        child.scale.z = tunnelPulse
                        
                        // Rotation around length axis
                        child.rotation.y += baseRotationSpeed * 0.04
                    }
                }
                
                // UNIVERSAL GLOW ANIMATION - All mesh types get audio-reactive glow
                if (child.material && child.material.emissive) {
                    const baseEmissive = child.material.emissiveIntensity || 0.2
                    const glowPulse = Math.sin(time * 12) * 0.15 * audioIntensity
                    child.material.emissiveIntensity = Math.max(0, baseEmissive + glowPulse)
                }
                
                // BEAT DETECTION EFFECTS - Special effects on beat
                if (audioData.beatDetected) {
                    // Flash effect on beat
                    if (child.material && child.material.opacity) {
                        const originalOpacity = child.material.opacity
                        child.material.opacity = Math.min(1, originalOpacity * 1.5)
                        
                        setTimeout(() => {
                            if (child.material) {
                                child.material.opacity = originalOpacity
                            }
                        }, 150)
                    }
                }
            }
        })
        
        // GROUP-LEVEL ANIMATIONS
        // Subtle floating for entire constellation
        const groupFloat = Math.sin(time * 2 + state.floatOffset) * 0.2 * audioIntensity
        meshGroup.position.y += groupFloat * 0.2
        
        // Audio-reactive scale breathing
        const breatheScale = 1 + Math.sin(time * 3.5) * 0.1 * audioIntensity
        meshGroup.scale.multiplyScalar(breatheScale / meshGroup.userData.lastBreathScale || 1)
        meshGroup.userData.lastBreathScale = breatheScale
    }

    createPlaylistFlow() {
        try {
            // Remove existing flow if it exists
            if (this.playlistFlow) {
                this.scene.remove(this.playlistFlow)
                this.disposeConstellationMesh(this.playlistFlow)
            }
            
            if (this.selectedTracks.length < 2) {
                this.playlistFlow = null
                return
            }
            
            // Create flowing path through selected tracks with gravitational attraction
            const flowGroup = new THREE.Group()
            const trackPositions = []
            
            // Get positions of selected tracks
            this.selectedTracks.forEach((track, index) => {
                const trackId = track.track_id || track.uuid || track.id
                const sphere = this.trackMap?.get(trackId)
                
                if (sphere) {
                    trackPositions.push({
                        position: sphere.position.clone(),
                        track: track,
                        index: index,
                        sphere: sphere
                    })
                }
            })
            
            if (trackPositions.length < 2) return
            
            // Create gravitational flow path with attraction forces
            const flowPath = this.createGravitationalPath(trackPositions)
            if (!flowPath || flowPath.length === 0) {
                console.warn('[FLOW] Failed to create flow path')
                return
            }
            
            const flowParticles = this.createFlowParticles(flowPath)
            if (flowParticles) {
                flowGroup.add(flowParticles)
            }
            
            // Create simpler tube for now to avoid geometry issues
            const simpleConnection = this.createSimpleFlowConnection(trackPositions)
            if (simpleConnection) {
                flowGroup.add(simpleConnection)
            }
            
            // Store flow data for animation
            flowGroup.userData = {
                path: flowPath,
                trackPositions: trackPositions,
                particles: flowParticles,
                tube: simpleConnection,
                animationOffset: 0
            }
            
            this.playlistFlow = flowGroup
            this.scene.add(this.playlistFlow)
            
            console.log(`[FLOW] Created playlist flow with ${trackPositions.length} tracks`)
            
        } catch (error) {
            console.error('[FLOW] Error creating playlist flow:', error)
            // Ensure we don't break the scene
            if (this.playlistFlow) {
                this.scene.remove(this.playlistFlow)
                this.playlistFlow = null
            }
        }
    }

    createSimpleFlowConnection(trackPositions) {
        try {
            const connectionGroup = new THREE.Group()
            
            // Create simple lines between tracks for now
            for (let i = 0; i < trackPositions.length - 1; i++) {
                const startPos = trackPositions[i].position
                const endPos = trackPositions[i + 1].position
                
                const points = [startPos, endPos]
                const geometry = new THREE.BufferGeometry().setFromPoints(points)
                const material = new THREE.LineBasicMaterial({
                    color: new THREE.Color(0x1DB954),
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 3
                })
                
                const line = new THREE.Line(geometry, material)
                line.userData = { type: 'flowConnection', segmentIndex: i }
                connectionGroup.add(line)
            }
            
            return connectionGroup
            
        } catch (error) {
            console.error('[FLOW] Error creating simple flow connection:', error)
            return null
        }
    }

    createGravitationalPath(trackPositions) {
        try {
            const path = []
            const segments = 20 // Reduced segments for stability
            
            // Use original positions for now to avoid complexity
            const positions = trackPositions.map(tp => tp.position)
            
            // Create simple interpolated path through positions
            for (let i = 0; i < positions.length - 1; i++) {
                const startPos = positions[i]
                const endPos = positions[i + 1]
                
                // Generate simple linear interpolation with slight curve
                for (let j = 0; j <= segments; j++) {
                    const t = j / segments
                    const point = new THREE.Vector3().lerpVectors(startPos, endPos, t)
                    
                    // Add subtle curve for visual appeal
                    const curveHeight = Math.sin(t * Math.PI) * 1.0
                    point.y += curveHeight
                    
                    path.push({
                        position: point,
                        trackIndex: i + t,
                        flow: t,
                        segment: i
                    })
                }
            }
            
            return path
            
        } catch (error) {
            console.error('[FLOW] Error creating gravitational path:', error)
            return []
        }
    }

    applyGravitationalForces(trackPositions) {
        const adjusted = trackPositions.map(tp => ({
            ...tp,
            originalPosition: tp.position.clone(),
            adjustedPosition: tp.position.clone()
        }))
        
        // Apply attraction forces based on track similarity
        const iterations = 3 // Simulation iterations
        const forceStrength = 2.0 // How strong the attraction is
        
        for (let iter = 0; iter < iterations; iter++) {
            adjusted.forEach((trackA, indexA) => {
                const totalForce = new THREE.Vector3()
                
                adjusted.forEach((trackB, indexB) => {
                    if (indexA !== indexB) {
                        // Calculate similarity-based attraction
                        const similarity = this.calculateTrackSimilarity(trackA.track, trackB.track)
                        const distance = trackA.adjustedPosition.distanceTo(trackB.adjustedPosition)
                        
                        if (similarity > 0.3 && distance > 1) { // Only attract if similar and not too close
                            const direction = new THREE.Vector3()
                                .subVectors(trackB.adjustedPosition, trackA.adjustedPosition)
                                .normalize()
                            
                            const force = direction.multiplyScalar(similarity * forceStrength / distance)
                            totalForce.add(force)
                        }
                    }
                })
                
                // Apply force with damping
                trackA.adjustedPosition.add(totalForce.multiplyScalar(0.1))
                
                // Constrain to prevent tracks from moving too far from original positions
                const maxDeviation = 5
                const deviation = trackA.adjustedPosition.distanceTo(trackA.originalPosition)
                if (deviation > maxDeviation) {
                    const direction = new THREE.Vector3()
                        .subVectors(trackA.adjustedPosition, trackA.originalPosition)
                        .normalize()
                    trackA.adjustedPosition.copy(trackA.originalPosition)
                        .add(direction.multiplyScalar(maxDeviation))
                }
            })
        }
        
        return adjusted.map(tp => tp.adjustedPosition)
    }

    generateControlPoints(startPos, endPos, allPositions, currentIndex) {
        const points = []
        
        // Add previous point for smooth curve (or repeat start if first)
        if (currentIndex > 0) {
            points.push(allPositions[currentIndex - 1])
        } else {
            points.push(startPos.clone().add(new THREE.Vector3(-2, 0, 0)))
        }
        
        points.push(startPos)
        points.push(endPos)
        
        // Add next point for smooth curve (or repeat end if last)
        if (currentIndex + 2 < allPositions.length) {
            points.push(allPositions[currentIndex + 2])
        } else {
            points.push(endPos.clone().add(new THREE.Vector3(2, 0, 0)))
        }
        
        return points
    }

    catmullRomSpline(points, t) {
        // Catmull-Rom spline interpolation
        const p0 = points[0]
        const p1 = points[1] 
        const p2 = points[2]
        const p3 = points[3]
        
        const t2 = t * t
        const t3 = t2 * t
        
        const result = new THREE.Vector3()
        
        result.x = 0.5 * ((2 * p1.x) + 
            (-p0.x + p2.x) * t + 
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + 
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
            
        result.y = 0.5 * ((2 * p1.y) + 
            (-p0.y + p2.y) * t + 
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + 
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
            
        result.z = 0.5 * ((2 * p1.z) + 
            (-p0.z + p2.z) * t + 
            (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + 
            (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
        
        return result
    }

    createFlowTube(flowPath, trackPositions) {
        if (flowPath.length < 2) return new THREE.Group()
        
        const tubeGroup = new THREE.Group()
        const pathPoints = flowPath.map(fp => fp.position)
        
        // Create tube geometry following the flow path
        const curve = new THREE.CatmullRomCurve3(pathPoints)
        const tubeGeometry = new THREE.TubeGeometry(curve, pathPoints.length, 0.2, 8, false)
        
        // Create gradient material based on emotional journey
        const tubeMaterial = this.createFlowMaterial(trackPositions)
        
        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial)
        tube.userData = { type: 'flowTube' }
        
        tubeGroup.add(tube)
        return tubeGroup
    }

    createFlowMaterial(trackPositions) {
        // Create material that shows emotional gradient along the path
        const colors = trackPositions.map((tp, index) => {
            if (tp.track.coordinates) {
                const coords = tp.track.coordinates
                // Map emotional coordinates to color
                const hue = (coords.valence + 1) * 0.5 * 0.3 + coords.energy * 0.7 // Blue to yellow spectrum
                const saturation = 0.7 + coords.complexity * 0.3
                const lightness = 0.4 + coords.tension * 0.4
                
                return new THREE.Color().setHSL(hue, saturation, lightness)
            }
            return new THREE.Color(0x1DB954) // Default Spotify green
        })
        
        // Use average color for now (future: implement gradient shader)
        const avgColor = new THREE.Color(0, 0, 0)
        colors.forEach(color => avgColor.add(color))
        avgColor.multiplyScalar(1 / colors.length)
        
        return new THREE.MeshPhongMaterial({
            color: avgColor,
            transparent: true,
            opacity: 0.6,
            emissive: avgColor.clone().multiplyScalar(0.3),
            emissiveIntensity: 0.4,
            side: THREE.DoubleSide
        })
    }

    createFlowParticles(flowPath) {
        try {
            const particleGroup = new THREE.Group()
            const particleCount = Math.min(50, Math.max(10, flowPath.length))
            
            const particleGeometry = new THREE.SphereGeometry(0.08, 8, 8)
            
            for (let i = 0; i < particleCount; i++) {
                const pathIndex = Math.floor((i / particleCount) * flowPath.length)
                const pathPoint = flowPath[Math.min(pathIndex, flowPath.length - 1)]
                
                if (!pathPoint || !pathPoint.position) continue
                
                const particleMaterial = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(0x1DB954),
                    transparent: true,
                    opacity: 0.8
                })
                
                const particle = new THREE.Mesh(particleGeometry, particleMaterial)
                particle.position.copy(pathPoint.position)
                
                particle.userData = {
                    flowIndex: i / particleCount,
                    pathIndex: pathIndex,
                    speed: 0.5 + Math.random() * 0.5,
                    offset: Math.random() * Math.PI * 2
                }
                
                particleGroup.add(particle)
            }
            
            return particleGroup
            
        } catch (error) {
            console.error('[FLOW] Error creating flow particles:', error)
            return new THREE.Group()
        }
    }

    calculateTrackSimilarity(track1, track2) {
        // Calculate overall similarity between two tracks
        let similarity = 0
        let factors = 0
        
        // Emotional similarity
        if (track1.coordinates && track2.coordinates) {
            const emotionalSim = this.calculateEmotionalSimilarity(track1, track2)
            similarity += emotionalSim * 0.4
            factors += 0.4
        }
        
        // Sonic DNA similarity
        if (track1.sonic_dna && track2.sonic_dna) {
            const harmonicSim = this.calculateVectorSimilarity(
                track1.sonic_dna.harmonic_genes || [], 
                track2.sonic_dna.harmonic_genes || []
            )
            const rhythmicSim = this.calculateVectorSimilarity(
                track1.sonic_dna.rhythmic_genes || [], 
                track2.sonic_dna.rhythmic_genes || []
            )
            
            similarity += (harmonicSim * 0.3 + rhythmicSim * 0.3)
            factors += 0.6
        }
        
        return factors > 0 ? similarity / factors : 0.5
    }

    animatePlaylistFlow() {
        try {
            if (!this.playlistFlow || !this.playlistFlow.userData) return
            
            const time = Date.now() * 0.001
            const audioData = this.audioAnalysis || {}
            const flowData = this.playlistFlow.userData
            
            // Simple animation for flow particles
            if (flowData.particles && flowData.particles.children) {
                flowData.particles.children.forEach((particle, index) => {
                    if (particle && particle.userData) {
                        // Simple floating animation
                        const floatOffset = Math.sin(time + particle.userData.offset) * 0.2
                        particle.position.y += floatOffset * 0.1
                        
                        // Simple scale pulsing
                        const scale = 1 + Math.sin(time * 2 + particle.userData.offset) * 0.1
                        particle.scale.setScalar(scale)
                    }
                })
            }
            
            // Simple tube animation
            if (flowData.tube && flowData.tube.children) {
                flowData.tube.children.forEach(line => {
                    if (line.material) {
                        // Simple opacity pulsing
                        const pulse = 0.6 + Math.sin(time * 3) * 0.2
                        line.material.opacity = pulse
                    }
                })
            }
            
            // Update animation offset
            flowData.animationOffset += 0.01
            
        } catch (error) {
            console.error('[FLOW] Error animating playlist flow:', error)
        }
    }

    animateFlowParticles(particleGroup, flowPath, time, audioData) {
        const audioIntensity = audioData.overall || 0
        const bassIntensity = audioData.bass || 0
        
        particleGroup.children.forEach((particle, index) => {
            const userData = particle.userData
            if (!userData) return
            
            // Move particle along flow path
            const speed = userData.speed * (1 + audioIntensity * 2)
            userData.flowIndex += speed * 0.005
            
            // Loop particles
            if (userData.flowIndex >= 1) {
                userData.flowIndex = 0
            }
            
            // Update particle position along path
            const pathIndex = Math.floor(userData.flowIndex * flowPath.length)
            const safeIndex = Math.min(pathIndex, flowPath.length - 1)
            
            if (flowPath[safeIndex]) {
                const basePosition = flowPath[safeIndex].position.clone()
                
                // Add flowing motion with sine wave
                const flowOffset = Math.sin(time * 2 + userData.offset) * 0.3
                const perpendicular = new THREE.Vector3(
                    Math.sin(userData.offset),
                    Math.cos(userData.offset * 0.7),
                    Math.cos(userData.offset)
                ).multiplyScalar(flowOffset)
                
                particle.position.copy(basePosition).add(perpendicular)
                
                // Scale particles based on audio
                const scale = 1 + Math.sin(time * 4 + userData.offset) * 0.3 * bassIntensity
                particle.scale.setScalar(scale)
                
                // Update emissive intensity
                if (particle.material.emissive) {
                    particle.material.emissiveIntensity = 0.3 + audioIntensity * 0.5
                }
            }
        })
    }

    animateFlowTube(tubeGroup, time, audioData) {
        const audioIntensity = audioData.overall || 0
        const midIntensity = audioData.mid || 0
        
        tubeGroup.children.forEach(tube => {
            if (tube.userData.type === 'flowTube') {
                // Pulse the tube based on audio
                const pulseFactor = 1 + Math.sin(time * 3) * 0.2 * audioIntensity
                tube.scale.set(pulseFactor, 1, pulseFactor)
                
                // Update emissive intensity
                if (tube.material.emissive) {
                    tube.material.emissiveIntensity = 0.4 + midIntensity * 0.6
                }
                
                // Rotate tube slightly for dynamic effect
                tube.rotation.y += 0.002 * (1 + audioIntensity)
            }
        })
    }

    setupAudioEvents() {
        this.audio.addEventListener('timeupdate', () => {
            if (this.audio.duration) {
                const progress = (this.audio.currentTime / this.audio.duration) * 100
                const progressBar = document.getElementById('progress-bar')
                if (progressBar) {
                    progressBar.value = progress
                }
                
                // Update time display
                const currentTime = this.formatTime(this.audio.currentTime)
                const totalTime = this.formatTime(this.audio.duration)
                const timeDisplay = document.getElementById('time-display')
                if (timeDisplay) {
                    timeDisplay.textContent = `${currentTime} / ${totalTime}`
                }
            }
        })

        this.audio.addEventListener('ended', () => {
            this.isPlaying = false
            this.updatePlayButton()
            
            // Reset current track sphere visual effects (only if sphere exists)
            if (this.currentTrack && this.currentTrack.sphere) {
                // Keep bloom if track is selected, otherwise remove emissive
                const trackId = this.currentTrack.track.track_id || this.currentTrack.track.uuid
                if (this.clickedSpheres.has(trackId)) {
                    this.addBloomEffect(this.currentTrack.sphere)
                } else {
                    this.currentTrack.sphere.material.emissive.setHex(0x000000)
                    this.currentTrack.sphere.material.emissiveIntensity = 0
                }
            }
            
            // Auto-play next track if available
            if (this.selectedTracks.length > 1) {
                console.log('🎵 Track ended, auto-playing next...')
                this.playNext()
            }
        })
        
        this.audio.addEventListener('loadstart', () => {
            console.log('🎵 Audio loading started...')
        })
        
        this.audio.addEventListener('canplay', () => {
            console.log('🎵 Audio can start playing')
        })
        
        this.audio.addEventListener('error', (error) => {
            console.error('🎵 Audio error:', error)
            this.isPlaying = false
            this.updatePlayButton()
        })
        
        this.audio.addEventListener('pause', () => {
            console.log('🎵 Audio paused')
            this.isPlaying = false
            this.updatePlayButton()
        })
        
        this.audio.addEventListener('play', () => {
            console.log('🎵 Audio started playing')
            this.isPlaying = true
            this.updatePlayButton()
        })
        
        // Initialize volume button state
        this.updateVolumeButton()
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    setupControlEvents() {
        // Play/Pause button
        const playPauseBtn = document.getElementById('play-pause')
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                if (this.currentTrack) {
                    if (this.isPlaying) {
                        this.audio.pause()
                        this.isPlaying = false
                    } else {
                        // Resume audio context if suspended
                        if (this.audioContext && this.audioContext.state === 'suspended') {
                            this.audioContext.resume()
                        }
                        this.audio.play()
                        this.isPlaying = true
                    }
                    this.updatePlayButton()
                }
            })
        }

        // Previous button
        const prevBtn = document.getElementById('prev-btn')
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.playPrevious()
            })
            
            // Add hover effects
            prevBtn.addEventListener('mouseenter', () => {
                if (this.selectedTracks.length > 0) {
                    prevBtn.style.color = '#1DB954'
                }
            })
            prevBtn.addEventListener('mouseleave', () => {
                prevBtn.style.color = this.selectedTracks.length > 0 ? '#FFFFFF' : '#B3B3B3'
            })
        }

        // Next button
        const nextBtn = document.getElementById('next-btn')
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.playNext()
            })
            
            // Add hover effects
            nextBtn.addEventListener('mouseenter', () => {
                if (this.selectedTracks.length > 0) {
                    nextBtn.style.color = '#1DB954'
                }
            })
            nextBtn.addEventListener('mouseleave', () => {
                nextBtn.style.color = this.selectedTracks.length > 0 ? '#FFFFFF' : '#B3B3B3'
            })
        }

        // Volume/Mute button
        const volumeBtn = document.getElementById('volume-btn')
        if (volumeBtn) {
            volumeBtn.addEventListener('click', () => {
                this.toggleMute()
            })
        }

        // Progress bar
        const progressBar = document.getElementById('progress-bar')
        if (progressBar) {
            progressBar.addEventListener('input', (e) => {
                if (this.audio.duration) {
                    this.audio.currentTime = (e.target.value / 100) * this.audio.duration
                }
            })
        }

        // Discovery Mode Controls
        this.setupDiscoveryControls()
    }

    setupDiscoveryControls() {
        // Find Similar Songs Button
        const findSimilarBtn = document.getElementById('find-similar-btn')
        if (findSimilarBtn) {
            findSimilarBtn.addEventListener('click', () => {
                this.toggleSimilarMode()
            })
        }

        // Set Start Track Button
        const setStartBtn = document.getElementById('set-start-btn')
        if (setStartBtn) {
            setStartBtn.addEventListener('click', () => {
                this.setPathfindingMode('start')
            })
        }

        // Set End Track Button
        const setEndBtn = document.getElementById('set-end-btn')
        if (setEndBtn) {
            setEndBtn.addEventListener('click', () => {
                this.setPathfindingMode('end')
            })
        }

        // Find Path Button
        const findPathBtn = document.getElementById('find-path-btn')
        if (findPathBtn) {
            findPathBtn.addEventListener('click', () => {
                this.findShortestPath()
            })
        }

        // Add Similar Tracks Button
        const addSimilarBtn = document.getElementById('add-similar-btn')
        if (addSimilarBtn) {
            addSimilarBtn.addEventListener('click', () => {
                this.addSimilarTracksToPlaylist()
            })
        }
    }

    toggleSimilarMode() {
        if (this.discoveryMode === 'similar') {
            // Turn off similar mode
            this.discoveryMode = 'none'
            this.clearAllConnections()
            this.similarityContext.clear()
            this.updateDiscoveryUI()
        } else {
            // Turn on similar mode
            this.discoveryMode = 'similar'
            this.pathfindingState = { startTrack: null, endTrack: null, settingStart: false, settingEnd: false }
            this.clearAllConnections()
            this.similarityContext.clear()
            this.updateDiscoveryUI()
        }
    }

    setPathfindingMode(type) {
        this.discoveryMode = 'pathfinding'
        this.clearAllConnections()
        
        if (type === 'start') {
            this.pathfindingState.settingStart = true
            this.pathfindingState.settingEnd = false
        } else if (type === 'end') {
            this.pathfindingState.settingStart = false
            this.pathfindingState.settingEnd = true
        }
        
        this.updateDiscoveryUI()
    }

    findShortestPath() {
        if (!this.pathfindingState.startTrack || !this.pathfindingState.endTrack) {
            console.warn('Both start and end tracks must be set')
            return
        }

        this.clearAllConnections()
        
        const path = this.calculateShortestPath(this.pathfindingState.startTrack, this.pathfindingState.endTrack)
        if (path && path.length > 1) {
            this.showPath(path)
            this.addPathToPlaylist(path)
            this.updateDiscoveryStatus(`Found path with ${path.length} tracks - added to playlist`)
        } else {
            this.updateDiscoveryStatus('No path found between tracks')
        }
    }

    addPathToPlaylist(path) {
        // Clear current selected tracks
        this.selectedTracks = []
        this.currentTrackIndex = -1
        
        // Add each track in the path to the playlist
        path.forEach((trackId, index) => {
            const track = this.tracks.find(t => (t.track_id || t.uuid || t.id) === trackId)
            if (track) {
                this.selectedTracks.push(track)
                
                // Visual selection for tracks in path
                const sphere = this.trackMap?.get(trackId)
                if (sphere) {
                    this.clickedSpheres.add(trackId)
                    this.addBloomEffect(sphere)
                    sphere.scale.set(1.3, 1.3, 1.3)
                }
            }
        })
        
        // Set first track as current
        if (this.selectedTracks.length > 0) {
            this.currentTrackIndex = 0
        }
        
        this.saveSelectedTracks()
        this.updateSelectedTracksList()
        this.updateTrackCountDisplay()
        
        console.log(`[PATH] Added ${path.length} tracks to playlist`)
    }

    addSimilarTracksToPlaylist() {
        if (this.similarityContext.size === 0) {
            console.warn('No similar tracks in context')
            return
        }

        // Get all tracks from similarity context
        const tracksToAdd = []
        this.similarityContext.forEach(trackId => {
            const track = this.tracks.find(t => (t.track_id || t.uuid || t.id) === trackId)
            if (track) {
                tracksToAdd.push(track)
            }
        })

        if (tracksToAdd.length === 0) {
            console.warn('No valid tracks found in similarity context')
            return
        }

        // Add tracks to playlist (append to existing)
        tracksToAdd.forEach(track => {
            const trackId = track.track_id || track.uuid || track.id
            
            // Check if already in playlist
            const existing = this.selectedTracks.findIndex(t => (t.track_id || t.uuid || t.id) === trackId)
            if (existing === -1) {
                this.selectedTracks.push(track)
                
                // Visual selection
                const sphere = this.trackMap?.get(trackId)
                if (sphere) {
                    this.clickedSpheres.add(trackId)
                    this.addBloomEffect(sphere)
                    sphere.scale.set(1.3, 1.3, 1.3)
                }
            }
        })

        // Set first track as current if no current track
        if (this.currentTrackIndex === -1 && this.selectedTracks.length > 0) {
            this.currentTrackIndex = 0
        }

        this.saveSelectedTracks()
        this.updateSelectedTracksList()
        this.updateTrackCountDisplay()
        this.updateDiscoveryUI()

        console.log(`[SIMILAR] Added ${tracksToAdd.length} similar tracks to playlist`)
        this.updateDiscoveryStatus(`Added ${tracksToAdd.length} similar tracks to playlist`)
    }

    calculateShortestPath(startTrackId, endTrackId) {
        if (!this.connections || !this.trackMap) return null

        // Build adjacency graph
        const graph = new Map()
        this.tracks.forEach(track => {
            const trackId = track.track_id || track.uuid || track.id
            graph.set(trackId, [])
        })

        this.connections.forEach(connection => {
            if (graph.has(connection.source) && graph.has(connection.target)) {
                graph.get(connection.source).push({
                    target: connection.target,
                    weight: connection.weight || connection.similarity || 0.5
                })
                graph.get(connection.target).push({
                    target: connection.source,
                    weight: connection.weight || connection.similarity || 0.5
                })
            }
        })

        // Dijkstra's algorithm
        const distances = new Map()
        const previous = new Map()
        const unvisited = new Set()

        // Initialize distances
        this.tracks.forEach(track => {
            const trackId = track.track_id || track.uuid || track.id
            distances.set(trackId, trackId === startTrackId ? 0 : Infinity)
            previous.set(trackId, null)
            unvisited.add(trackId)
        })

        while (unvisited.size > 0) {
            // Find unvisited node with smallest distance
            let current = null
            let smallestDistance = Infinity
            
            for (const trackId of unvisited) {
                if (distances.get(trackId) < smallestDistance) {
                    smallestDistance = distances.get(trackId)
                    current = trackId
                }
            }

            if (current === null || smallestDistance === Infinity) break
            if (current === endTrackId) break

            unvisited.delete(current)

            // Check neighbors
            const neighbors = graph.get(current) || []
            neighbors.forEach(neighbor => {
                if (unvisited.has(neighbor.target)) {
                    // Use inverse of similarity as distance (higher similarity = shorter path)
                    const distance = distances.get(current) + (1 - neighbor.weight)
                    
                    if (distance < distances.get(neighbor.target)) {
                        distances.set(neighbor.target, distance)
                        previous.set(neighbor.target, current)
                    }
                }
            })
        }

        // Reconstruct path
        const path = []
        let current = endTrackId
        
        while (current !== null) {
            path.unshift(current)
            current = previous.get(current)
        }

        // Return path only if we found a route to the end
        return path.length > 1 && path[0] === startTrackId ? path : null
    }

    showPath(path) {
        const connectionLines = []
        
        for (let i = 0; i < path.length - 1; i++) {
            const sourceSphere = this.trackMap.get(path[i])
            const targetSphere = this.trackMap.get(path[i + 1])
            
            if (sourceSphere && targetSphere) {
                const points = [sourceSphere.position.clone(), targetSphere.position.clone()]
                const geometry = new THREE.BufferGeometry().setFromPoints(points)
                const material = new THREE.LineBasicMaterial({
                    color: new THREE.Color(0x9A4AE2), // Purple for path
                    transparent: true,
                    opacity: 0.9,
                    linewidth: 2
                })
                
                const line = new THREE.Line(geometry, material)
                line.userData = { type: 'pathLine', isStatic: true } // Mark as static to skip animations
                this.scene.add(line)
                connectionLines.push(line)
            }
        }
        
        // Store connections for cleanup
        this.activeConnections.set('path', connectionLines)
    }

    updateDiscoveryUI() {
        const findSimilarBtn = document.getElementById('find-similar-btn')
        const addSimilarBtn = document.getElementById('add-similar-btn')
        const setStartBtn = document.getElementById('set-start-btn')
        const setEndBtn = document.getElementById('set-end-btn')
        const findPathBtn = document.getElementById('find-path-btn')

        // Update Find Similar button
        if (findSimilarBtn) {
            if (this.discoveryMode === 'similar') {
                findSimilarBtn.style.background = '#1ed760'
                findSimilarBtn.textContent = '✓ Similar Mode Active'
                this.updateDiscoveryStatus('Click tracks to find similar songs')
            } else {
                findSimilarBtn.style.background = '#1DB954'
                findSimilarBtn.innerHTML = '<i data-lucide="shuffle" style="width: 14px; height: 14px; margin-right: 6px; vertical-align: middle;"></i>Find Similar Songs'
            }
        }

        // Show/Hide Add Similar button
        if (addSimilarBtn) {
            if (this.discoveryMode === 'similar' && this.similarityContext.size > 1) {
                addSimilarBtn.style.display = 'block'
                addSimilarBtn.innerHTML = `<i data-lucide="plus" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></i>Add ${this.similarityContext.size} Similar Tracks`
            } else {
                addSimilarBtn.style.display = 'none'
            }
        }

        // Update pathfinding buttons
        if (setStartBtn) {
            if (this.pathfindingState.settingStart) {
                setStartBtn.style.background = '#FFB84D'
                setStartBtn.style.borderColor = '#FFB84D'
                setStartBtn.style.color = 'white'
                setStartBtn.textContent = 'Click a track...'
            } else if (this.pathfindingState.startTrack) {
                setStartBtn.style.background = '#1DB954'
                setStartBtn.style.borderColor = '#1DB954'
                setStartBtn.style.color = 'white'
                setStartBtn.textContent = '✓ Start Set'
            } else {
                setStartBtn.style.background = 'transparent'
                setStartBtn.style.borderColor = '#666'
                setStartBtn.style.color = '#B3B3B3'
                setStartBtn.innerHTML = '<i data-lucide="play" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></i>Set Start Track'
            }
        }

        if (setEndBtn) {
            if (this.pathfindingState.settingEnd) {
                setEndBtn.style.background = '#FFB84D'
                setEndBtn.style.borderColor = '#FFB84D'
                setEndBtn.style.color = 'white'
                setEndBtn.textContent = 'Click a track...'
            } else if (this.pathfindingState.endTrack) {
                setEndBtn.style.background = '#1DB954'
                setEndBtn.style.borderColor = '#1DB954'
                setEndBtn.style.color = 'white'
                setEndBtn.textContent = '✓ End Set'
            } else {
                setEndBtn.style.background = 'transparent'
                setEndBtn.style.borderColor = '#666'
                setEndBtn.style.color = '#B3B3B3'
                setEndBtn.innerHTML = '<i data-lucide="flag" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></i>Set End Track'
            }
        }

        if (findPathBtn) {
            const canFindPath = this.pathfindingState.startTrack && this.pathfindingState.endTrack
            findPathBtn.disabled = !canFindPath
            findPathBtn.style.opacity = canFindPath ? '1' : '0.5'
            findPathBtn.style.cursor = canFindPath ? 'pointer' : 'not-allowed'
            
            if (canFindPath) {
                findPathBtn.style.background = '#9A4AE2'
                findPathBtn.style.borderColor = '#9A4AE2'
                findPathBtn.style.color = 'white'
            }
        }

        // Update status
        if (this.discoveryMode === 'none') {
            this.updateDiscoveryStatus('Select tracks to discover musical connections')
        } else if (this.discoveryMode === 'pathfinding') {
            if (this.pathfindingState.settingStart) {
                this.updateDiscoveryStatus('Click a track to set as start point')
            } else if (this.pathfindingState.settingEnd) {
                this.updateDiscoveryStatus('Click a track to set as end point')
            } else if (this.pathfindingState.startTrack && this.pathfindingState.endTrack) {
                this.updateDiscoveryStatus('Ready to find shortest path')
            }
        }
        
        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons()
        }
    }

    updateDiscoveryStatus(message) {
        const statusElement = document.getElementById('discovery-status')
        if (statusElement) {
            statusElement.textContent = message
        }
    }

    updatePlayButton() {
        const playPauseBtn = document.getElementById('play-pause')
        if (playPauseBtn) {
            if (this.isPlaying) {
                // Show pause icon
                playPauseBtn.innerHTML = '<i data-lucide="pause" style="width: 20px; height: 20px; margin-left: 0px;"></i>'
            } else {
                // Show play icon
                playPauseBtn.innerHTML = '<i data-lucide="play" style="width: 20px; height: 20px; margin-left: 2px;"></i>'
            }
            // Re-initialize icons
            this.refreshLucideIcons()
        } else {
            console.warn('Play/pause button element not found')
        }
    }

    refreshLucideIcons() {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            try {
                // Small delay to ensure DOM is updated
                setTimeout(() => {
                    lucide.createIcons()
                }, 10)
            } catch (error) {
                console.warn('Error refreshing Lucide icons:', error)
            }
        } else {
            console.warn('Lucide not available for icon refresh')
        }
    }

    toggleMute() {
        if (this.isMuted) {
            // Unmute
            this.audio.volume = this.previousVolume
            this.isMuted = false
        } else {
            // Mute
            this.previousVolume = this.audio.volume
            this.audio.volume = 0
            this.isMuted = true
        }
        this.updateVolumeButton()
    }

    updateVolumeButton() {
        const volumeBtn = document.getElementById('volume-btn')
        if (volumeBtn) {
            if (this.isMuted) {
                // Show muted icon with orange color
                volumeBtn.innerHTML = '<i data-lucide="volume-x" style="width: 18px; height: 18px;"></i>'
                volumeBtn.style.color = '#FF6B35' // Orange color for muted
            } else {
                // Show unmuted icon with default color
                volumeBtn.innerHTML = '<i data-lucide="volume-2" style="width: 18px; height: 18px;"></i>'
                volumeBtn.style.color = '#B3B3B3' // Default color
            }
            // Re-initialize icons
            this.refreshLucideIcons()
        } else {
            console.warn('Volume button element not found')
        }
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prev-btn')
        const nextBtn = document.getElementById('next-btn')
        
        const hasPlaylist = this.selectedTracks.length > 0
        
        if (prevBtn) {
            prevBtn.style.color = hasPlaylist ? '#FFFFFF' : '#B3B3B3'
            prevBtn.style.opacity = hasPlaylist ? '1' : '0.5'
            prevBtn.style.cursor = hasPlaylist ? 'pointer' : 'not-allowed'
            prevBtn.title = hasPlaylist 
                ? `Previous track (${this.selectedTracks.length} in playlist)` 
                : 'No tracks in playlist'
        }
        
        if (nextBtn) {
            nextBtn.style.color = hasPlaylist ? '#FFFFFF' : '#B3B3B3'
            nextBtn.style.opacity = hasPlaylist ? '1' : '0.5'
            nextBtn.style.cursor = hasPlaylist ? 'pointer' : 'not-allowed'
            nextBtn.title = hasPlaylist 
                ? `Next track (${this.selectedTracks.length} in playlist)` 
                : 'No tracks in playlist'
        }
        
        // Update track counter info
        if (hasPlaylist && this.currentTrackIndex >= 0) {
            console.log(`🎵 Current: ${this.currentTrackIndex + 1}/${this.selectedTracks.length} tracks`)
        }
    }

    async testAudioSystem() {
        this.vlog('🔧 Testing audio system...', 'info')
        
        if (!this.tracks || this.tracks.length === 0) {
            this.vlog('❌ No tracks loaded', 'error')
            alert('No tracks loaded yet. Please wait for tracks to load.')
            return
        }
        
        // Get the first track with a valid UUID
        const testTrack = this.tracks.find(track => track.uuid && track.uuid.trim() !== '')
        
        if (!testTrack) {
            this.vlog('❌ No tracks with valid UUIDs found', 'error')
            alert('No tracks with valid UUIDs found')
            return
        }
        
        this.vlog(`🔧 Testing with track: ${testTrack.metadata?.track_display || testTrack.track_id}`, 'info')
        this.vlog(`🔧 UUID: ${testTrack.uuid}`, 'debug')
        
        try {
            const audioUrl = `${this.apiBase}/uuid/${encodeURIComponent(testTrack.uuid)}/audio`
            this.vlog(`🔧 Testing URL: ${audioUrl}`, 'debug')
            
            const response = await fetch(audioUrl, { method: 'GET' })
            this.vlog(`🔧 Response status: ${response.status}`, 'debug')
            
            if (response.ok) {
                this.vlog('✅ Audio endpoint test successful!', 'success')
                alert(`✅ Audio system working!\nTested track: ${testTrack.metadata?.track_display || testTrack.track_id}\nUUID: ${testTrack.uuid}`)
            } else {
                this.vlog(`❌ Audio endpoint test failed: ${response.status} ${response.statusText}`, 'error')
                alert(`❌ Audio endpoint failed: ${response.status} ${response.statusText}`)
            }
        } catch (error) {
            this.vlog(`❌ Audio test error: ${error.message}`, 'error')
            alert(`❌ Audio test error: ${error.message}`)
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this))
        
        // Update controls
        this.controls.update()
        
        // REAL-TIME AUDIO ANALYSIS - Analyze current audio frequencies
        this.analyzeAudio()
        
        // AUDIO-REACTIVE PARTICLE SYSTEM - Make starfield react to music (background only)
        this.animateAudioReactiveParticles()
        
        // ANIMATE CONSTELLATION MESHES - Make mesh volumes dynamic and alive (skip path lines)
        this.animateConstellationMeshes()
        
        // ANIMATE PLAYLIST FLOW - Dynamic flowing visualization of playlist journey
        this.animatePlaylistFlow()
        
        // Update connection lines (keep them following spheres at their static positions)
        this.connectionLines.forEach(line => {
            if (line.userData.source && line.userData.target) {
                const points = [
                    line.userData.source.position.clone(),
                    line.userData.target.position.clone()
                ]
                line.geometry.setFromPoints(points)
            }
        })
        
        // SOPHISTICATED RENDERING - Use composer for enhanced bloom effects
        try {
            if (this.composer && this.bloomPass) {
                // Adjust bloom parameters dynamically based on selected spheres + audio intensity
                const selectedCount = this.clickedSpheres.size
                const audioIntensity = this.audioAnalysis ? this.audioAnalysis.overall * 0.5 : 0
                if (selectedCount > 0) {
                    this.bloomPass.strength = Math.min(0.6, 0.3 + selectedCount * 0.05 + audioIntensity)
                    this.bloomPass.radius = 0.2 + selectedCount * 0.02 + audioIntensity * 0.05
                } else {
                    this.bloomPass.strength = 0.3 + audioIntensity * 0.1
                    this.bloomPass.radius = 0.2 + audioIntensity * 0.02
                }
                
                this.composer.render()
            } else {
                this.renderer.render(this.scene, this.camera)
            }
        } catch (error) {
            // Fallback to basic rendering
            try {
                this.renderer.render(this.scene, this.camera)
            } catch (fallbackError) {
                console.error('❌ Fallback render error:', fallbackError)
            }
        }
    }
}