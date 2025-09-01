import * as THREE from 'three'
import { SceneSetup } from './SceneSetup.js'
import { AudioAnalysis } from './AudioAnalysis.js'
import { SphereManager } from './SphereManager.js'
import { TrackManager } from './TrackManager.js'
import { UIManager } from './UIManager.js'
import { VisualEffects } from './VisualEffects.js'

export class MusicPlayer3D {
    constructor(containerId) {
        this.containerId = containerId
        this.tracks = []
        this.trackPositions = null
        this.connections = []
        
        // Discovery mode state
        this.discoveryMode = 'none' // 'none', 'similar', 'pathfinding'
        this.pathfindingState = {
            startTrack: null,
            endTrack: null,
            settingStart: false,
            settingEnd: false
        }
        
        this.mouse = new THREE.Vector2()
        this.raycaster = new THREE.Raycaster()
        
        this.apiBase = 'http://localhost:8000/api'
        
        // Initialize modules
        this.sceneSetup = new SceneSetup(containerId)
        this.audioAnalysis = new AudioAnalysis()
        this.sphereManager = new SphereManager(null) // Will set scene later
        this.trackManager = new TrackManager(this.apiBase)
        this.uiManager = new UIManager(this.apiBase)
        this.visualEffects = new VisualEffects()
        
        this.setupControlEvents()
        this.loadSelectedTracks()
        
        // Initialize visual log
        this.uiManager.vlog('[INIT] MusicPlayer3D initialized')
        this.uiManager.vlog(`[API] API Base: ${this.apiBase}`)
    }

    loadSelectedTracks() {
        this.trackManager.loadSelectedTracks()
    }

    async init() {
        await this.loadTracks()
        this.sceneSetup.setupScene()
        this.sceneSetup.setupCamera()
        this.sceneSetup.setupRenderer()
        
        // Add small delay to ensure renderer is ready
        await new Promise(resolve => setTimeout(resolve, 100))
        
        this.sceneSetup.setupPostProcessing()
        this.sceneSetup.setupControls()
        this.sceneSetup.setupLights()
        
        // Set scene reference for sphere manager after scene is created
        this.sphereManager = new SphereManager(this.sceneSetup.getScene())
        
        this.sphereManager.createMusicSpheres(this.tracks)
        this.sphereManager.createConnections(this.connections)
        this.setupEventListeners()
        
        // Setup audio analysis with the track manager's audio element
        this.audioAnalysis.setupAudioAnalysis(this.trackManager.getAudio())
        
        // Restore visual selections after everything is initialized
        if (this.trackManager.getSelectedTracks().length > 0) {
            console.log(`[RESTORE] Restoring ${this.trackManager.getSelectedTracks().length} selected tracks from localStorage`)
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
            this.uiManager.vlog('[TRACKS] Loading positioned tracks from API...')
            const response = await fetch(`${this.apiBase}/tracks/positioned`, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit'
            })
            if (!response.ok) {
                this.uiManager.vlog(`[WARN] Positioned tracks not available (${response.status}), falling back to regular tracks`, 'warning')
                const fallbackResponse = await fetch(`${this.apiBase}/tracks`, {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'omit'
                })
                if (!fallbackResponse.ok) {
                    throw new Error(`Failed to load tracks: ${fallbackResponse.status} ${fallbackResponse.statusText}`)
                }
                const fallbackData = await fallbackResponse.json()
                // Handle both array format and object format from API
                const tracks = Array.isArray(fallbackData) ? fallbackData : fallbackData.tracks || []
                this.tracks = tracks
                this.trackPositions = null
                this.connections = []
                this.uiManager.vlog(`[SUCCESS] Loaded ${this.tracks.length} tracks via fallback`, 'success')
                this.uiManager.vlog(`[DEBUG] First track UUID: ${this.tracks[0]?.uuid}`, 'debug')
            } else {
                const positionedData = await response.json()
                this.tracks = positionedData.tracks
                this.trackPositions = positionedData.tracks
                this.connections = positionedData.connections || []
                this.uiManager.vlog(`[SUCCESS] Loaded ${this.tracks.length} positioned tracks with ${this.connections.length} connections`, 'success')
                this.uiManager.vlog(`[DEBUG] First positioned track UUID: ${this.tracks[0]?.uuid}`, 'debug')
                
                // Log metadata if available
                if (positionedData.metadata) {
                    this.uiManager.vlog(`[DATA] Metadata: ${positionedData.metadata.source}`, 'debug')
                }
            }
            this.uiManager.vlog(`[SUCCESS] Total tracks loaded: ${this.tracks.length}`, 'success')
            
            // Add count display to UI
            this.updateTrackCountDisplay()
            
        } catch (error) {
            console.error('[ERROR] Error loading tracks:', error)
            // More detailed error logging
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                this.uiManager.vlog('[ERROR] Network error - Failed to connect to API. Please check:', 'error')
                this.uiManager.vlog('[ERROR] 1. Is the backend server running on localhost:8000?', 'error')
                this.uiManager.vlog('[ERROR] 2. Is CORS properly configured?', 'error')
                this.uiManager.vlog('[ERROR] 3. Are there any network/firewall issues?', 'error')
            }
            throw new Error(`Failed to connect to music API. Please ensure the server is running on localhost:8000. Details: ${error.message}`)
        }
    }

    updateTrackCountDisplay() {
        this.uiManager.updateTrackCountDisplay(
            this.tracks,
            this.trackManager.getSelectedTracks(),
            this.sphereManager.activeConnections
        )
        this.updateSelectedTracksList()
    }

    updateSelectedTracksList() {
        this.uiManager.updateSelectedTracksList(
            this.trackManager.getSelectedTracks(),
            this.trackManager.getCurrentTrackIndex(),
            this.sphereManager.getTrackMap(),
            (sphere) => this.sphereManager.addBloomEffect(sphere)
        )
        this.updateNavigationButtons()
        this.showPlaylistConnections()
    }

    restoreVisualSelections() {
        const selectedTracks = this.trackManager.getSelectedTracks()
        console.log(`[RESTORE] Restoring visual selections for ${selectedTracks.length} tracks`)
        
        selectedTracks.forEach((trackData, index) => {
            const trackId = trackData.track_id || trackData.uuid || trackData.id
            console.log(`[RESTORE] Restoring selection ${index + 1}: ${trackId}`)
            
            const sphere = this.sphereManager.getTrackMap().get(trackId)
            
            if (sphere) {
                this.sphereManager.getClickedSpheres().add(trackId)
                this.sphereManager.addBloomEffect(sphere)
                sphere.scale.set(1.3, 1.3, 1.3)
                
                if (this.sphereManager.getDiscoveryMode() !== 'none') {
                    this.sphereManager.addConnectionsForSphere(trackId)
                }
                console.log(`[VISUAL] Restored visual selection for: ${trackId}`)
            } else {
                console.warn(`[WARNING] No sphere found for track: ${trackId}`)
            }
        })
        
        // Show playlist connections
        if (this.sphereManager.getDiscoveryMode() === 'none') {
            this.showPlaylistConnections()
        }
        
        console.log(`[SUCCESS] Restored ${this.sphereManager.getClickedSpheres().size} visual selections`)
        this.updateTrackCountDisplay()
    }

    addToSelectedTracks(track, trackId) {
        this.trackManager.addToSelectedTracks(track, trackId, {
            updateSelectedTracksList: () => this.updateSelectedTracksList(),
            createPlaylistFlow: () => this.visualEffects.createPlaylistFlow(
                this.sceneSetup.getScene(),
                this.trackManager.getSelectedTracks(),
                this.sphereManager.getTrackMap()
            )
        })
    }

    removeFromSelectedTracks(trackId) {
        this.trackManager.removeFromSelectedTracks(trackId, {
            updateSelectedTracksList: () => this.updateSelectedTracksList(),
            createPlaylistFlow: () => this.visualEffects.createPlaylistFlow(
                this.sceneSetup.getScene(),
                this.trackManager.getSelectedTracks(),
                this.sphereManager.getTrackMap()
            ),
            showPlaylistConnections: () => this.showPlaylistConnections()
        })
    }

    clearAllSelectedTracks() {
        this.trackManager.clearAllSelectedTracks({
            clearAllConnections: () => this.sphereManager.clearAllConnections(),
            createPlaylistFlow: () => this.visualEffects.createPlaylistFlow(
                this.sceneSetup.getScene(),
                this.trackManager.getSelectedTracks(),
                this.sphereManager.getTrackMap()
            ),
            updateSelectedTracksList: () => this.updateSelectedTracksList()
        })
    }

    playNext() {
        this.trackManager.playNext(this.sphereManager.getTrackMap())
    }

    playPrevious() {
        this.trackManager.playPrevious(this.sphereManager.getTrackMap())
    }

    playTrackByIndex(index) {
        this.trackManager.playTrackByIndex(
            index,
            this.sphereManager.getTrackMap(),
            (track, sphere) => this.playTrack(track, sphere),
            () => this.updateSelectedTracksList()
        )
    }

    async playTrack(track, sphere) {
        await this.trackManager.playTrack(track, sphere, {
            showAudioError: (trackId, error) => this.uiManager.showAudioError(trackId, error),
            updateTrackInfo: (track) => this.uiManager.updateTrackInfo(track),
            updatePlayButton: () => this.updatePlayButton(),
            updateNavigationButtons: () => this.updateNavigationButtons(),
            vlog: (message, type) => this.uiManager.vlog(message, type),
            addBloomEffect: (sphere) => this.sphereManager.addBloomEffect(sphere),
            audioAnalysis: this.audioAnalysis,
            clickedSpheres: this.sphereManager.getClickedSpheres()
        })
    }

    showPlaylistConnections() {
        this.visualEffects.showPlaylistConnections(
            this.sceneSetup.getScene(),
            this.trackManager.getSelectedTracks(),
            this.sphereManager.getTrackMap(),
            this.sphereManager.activeConnections
        )
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize())
        window.addEventListener('keydown', (event) => this.onKeyDown(event))
        
        const canvas = this.sceneSetup.getRenderer().domElement
        canvas.addEventListener('click', (event) => this.onCanvasClick(event))
        canvas.addEventListener('mousemove', (event) => this.onCanvasMouseMove(event))
    }

    onCanvasClick(event) {
        const rect = this.sceneSetup.getRenderer().domElement.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.raycaster.setFromCamera(this.mouse, this.sceneSetup.getCamera())
        const intersects = this.raycaster.intersectObjects(this.sphereManager.getMusicSpheres())

        if (intersects.length > 0) {
            const sphere = intersects[0].object
            const track = sphere.userData.track
            const trackId = track.track_id || track.uuid || track.id

            this.sphereManager.toggleSphereConnections(
                sphere,
                trackId,
                (track, sphere) => this.playTrack(track, sphere),
                (track, trackId) => this.addToSelectedTracks(track, trackId),
                (trackId) => this.removeFromSelectedTracks(trackId),
                () => this.updateTrackCountDisplay()
            )
        }
    }

    onCanvasMouseMove(event) {
        const rect = this.sceneSetup.getRenderer().domElement.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.raycaster.setFromCamera(this.mouse, this.sceneSetup.getCamera())
        const intersects = this.raycaster.intersectObjects(this.sphereManager.getMusicSpheres())

        // Remove hover effects from all spheres
        this.sphereManager.getMusicSpheres().forEach(sphere => {
            if (!sphere.material.userData.isSelected) {
                this.sphereManager.removeHoverEffect(sphere)
            }
        })

        // Add hover effect to intersected sphere
        if (intersects.length > 0) {
            const sphere = intersects[0].object
            this.sphereManager.addHoverEffect(sphere)
        }
    }

    onWindowResize() {
        this.sceneSetup.onWindowResize()
    }

    onKeyDown(event) {
        // Space: Play/Pause current track
        if (event.code === 'Space') {
            event.preventDefault()
            if (this.trackManager.getCurrentTrack()) {
                if (this.trackManager.getIsPlaying()) {
                    this.trackManager.getAudio().pause()
                } else {
                    this.trackManager.getAudio().play()
                }
            }
        }
        // Arrow keys: Navigate playlist
        else if (event.code === 'ArrowRight') {
            event.preventDefault()
            this.playNext()
        }
        else if (event.code === 'ArrowLeft') {
            event.preventDefault()
            this.playPrevious()
        }
        // M: Toggle mute
        else if (event.code === 'KeyM') {
            event.preventDefault()
            this.toggleMute()
        }
        // C: Clear all selections
        else if (event.code === 'KeyC') {
            event.preventDefault()
            this.clearAllSelectedTracks()
        }
    }

    setupControlEvents() {
        // Play/Pause button
        const playPauseBtn = document.getElementById('play-pause')
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                if (this.trackManager.getCurrentTrack()) {
                    if (this.trackManager.getIsPlaying()) {
                        this.trackManager.getAudio().pause()
                    } else {
                        if (this.audioAnalysis.audioContext && this.audioAnalysis.audioContext.state === 'suspended') {
                            this.audioAnalysis.audioContext.resume()
                        }
                        this.trackManager.getAudio().play()
                    }
                    this.updatePlayButton()
                }
            })
        }

        // Navigation buttons
        const nextBtn = document.getElementById('next-track')
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.playNext())
        }

        const prevBtn = document.getElementById('prev-track')
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.playPrevious())
        }

        // Volume button
        const volumeBtn = document.getElementById('volume')
        if (volumeBtn) {
            volumeBtn.addEventListener('click', () => this.toggleMute())
        }

        // Clear all button
        const clearAllBtn = document.getElementById('clear-all')
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => this.clearAllSelectedTracks())
        }

        // Test audio button
        const testAudioBtn = document.getElementById('test-audio')
        if (testAudioBtn) {
            testAudioBtn.addEventListener('click', () => this.uiManager.testAudioSystem(this.tracks))
        }
    }

    updatePlayButton() {
        this.uiManager.updatePlayButton(this.trackManager.getIsPlaying())
    }

    toggleMute() {
        this.trackManager.toggleMute()
        this.updateVolumeButton()
    }

    updateVolumeButton() {
        this.uiManager.updateVolumeButton(this.trackManager.getIsMuted())
    }

    updateNavigationButtons() {
        this.uiManager.updateNavigationButtons(
            this.trackManager.getSelectedTracks(),
            this.trackManager.getCurrentTrackIndex()
        )
    }

    updateDiscoveryUI() {
        this.uiManager.updateDiscoveryUI(this.sphereManager.getDiscoveryMode())
    }

    switchColorMode(mode) {
        this.sphereManager.switchColorMode(mode)
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this))
        
        if (this.sceneSetup.getControls()) {
            this.sceneSetup.getControls().update()
        }
        
        // Audio analysis
        this.audioAnalysis.analyzeAudio(this.trackManager.getIsPlaying())
        
        // Animate audio-reactive particles (starfield)
        this.audioAnalysis.animateAudioReactiveParticles(
            this.sceneSetup.getStarfield(),
            this.trackManager.getIsPlaying()
        )
        
        // Animate constellation meshes
        this.visualEffects.animateConstellationMeshes(
            this.sphereManager.activeConnections,
            this.audioAnalysis.getAudioAnalysis()
        )
        
        // Animate playlist flow
        const playlistFlow = this.visualEffects.getPlaylistFlow()
        if (playlistFlow) {
            this.visualEffects.animatePlaylistFlow(playlistFlow, this.audioAnalysis.getAudioAnalysis())
        }
        
        try {
            // Dynamic connection line animation based on audio intensity
            const connectionLines = this.sphereManager.connectionLines
            if (connectionLines && this.trackManager.getIsPlaying()) {
                const audioData = this.audioAnalysis.getAudioAnalysis()
                connectionLines.forEach(line => {
                    if (line.userData.source && line.userData.target) {
                        const opacity = 0.4 + (audioData.overall || 0) * 0.4
                        line.material.opacity = Math.min(opacity, 0.8)
                    }
                })
            }
            
            // Animate playlist connections 
            const playlistConnections = this.sphereManager.activeConnections.get('playlist')
            if (playlistConnections && this.trackManager.getIsPlaying()) {
                const audioData = this.audioAnalysis.getAudioAnalysis()
                playlistConnections.forEach(line => {
                    if (line.userData.sourceTrack && line.userData.targetTrack) {
                        const bassIntensity = audioData.bass || 0
                        const opacity = 0.6 + bassIntensity * 0.3
                        line.material.opacity = Math.min(opacity, 0.9)
                    }
                })
            }
            
            // Render with bloom effects
            if (this.sceneSetup.getComposer() && this.sceneSetup.getBloomPass()) {
                // Adjust bloom parameters dynamically based on selected spheres + audio intensity
                const selectedCount = this.trackManager.getSelectedTracks().length > 0 ? 
                    this.trackManager.getSelectedTracks().length : 
                    this.sphereManager.getClickedSpheres().size
                const audioIntensity = this.audioAnalysis.getAudioAnalysis() ? 
                    this.audioAnalysis.getAudioAnalysis().overall * 0.5 : 0
                
                if (selectedCount > 0) {
                    this.sceneSetup.getBloomPass().strength = Math.min(0.6, 0.3 + selectedCount * 0.05 + audioIntensity)
                    this.sceneSetup.getBloomPass().radius = 0.2 + selectedCount * 0.02 + audioIntensity * 0.05
                } else {
                    this.sceneSetup.getBloomPass().strength = 0.3 + audioIntensity * 0.1
                    this.sceneSetup.getBloomPass().radius = 0.2 + audioIntensity * 0.02
                }
                
                this.sceneSetup.getComposer().render()
            } else {
                this.sceneSetup.getRenderer().render(this.sceneSetup.getScene(), this.sceneSetup.getCamera())
            }
        } catch (error) {
            // Fallback to basic rendering
            try {
                this.sceneSetup.getRenderer().render(this.sceneSetup.getScene(), this.sceneSetup.getCamera())
            } catch (fallbackError) {
                console.error('❌ Fallback render error:', fallbackError)
            }
        }
    }
}