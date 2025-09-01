import * as THREE from 'three'

export class SphereManager {
    constructor(scene) {
        this.scene = scene
        this.musicSpheres = []
        this.connectionLines = []
        this.connections = []
        this.clickedSpheres = new Set()
        this.activeConnections = new Map()
        this.trackMap = new Map()
        this.discoveryMode = 'none' // 'none', 'similar', 'pathfinding'
        this.similarityContext = new Set()
    }

    createMusicSpheres(tracks) {
        // ADVANCED EMOTIONAL GALAXY - Full 3D force-directed visualization
        const maxSpheres = tracks.length // Show all tracks for full galaxy
        const baseRadius = 25 // Larger radius for better distribution
        
        console.log(`[GALAXY] Creating advanced emotional galaxy with ALL ${maxSpheres} tracks (force-directed semantic positioning + advanced bloom)`)
        
        // Enhanced sphere parameters for visual impact
        const sphereGeometry = new THREE.SphereGeometry(0.3, 16, 16) // Larger, higher quality spheres
        
        for (let i = 0; i < maxSpheres; i++) {
            const track = tracks[i]
            
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
    }

    createConnections(connections) {
        this.connections = connections
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

    toggleSphereConnections(sphere, trackId, playTrackCallback, addToSelectedTracksCallback, removeFromSelectedTracksCallback, updateTrackCountDisplayCallback) {
        console.log(`[TARGET] Toggle sphere connections for track: ${trackId}`)
        console.log(`[STATUS] Currently clicked spheres: ${Array.from(this.clickedSpheres)}`)
        
        if (this.clickedSpheres.has(trackId)) {
            // Remove connections for this sphere
            this.removeConnectionsForSphere(trackId)
            this.clickedSpheres.delete(trackId)
            
            // Remove bloom effect
            this.removeBloomEffect(sphere)
            sphere.scale.set(1, 1, 1)
            
            // Remove visual glow effect
            sphere.material.emissive.setHex(0x000000) // Remove glow
            sphere.material.emissiveIntensity = 0
            
            // Remove from selected tracks
            if (removeFromSelectedTracksCallback) {
                removeFromSelectedTracksCallback(trackId)
            }
            
            console.log(`[REMOVE] Removed connections for track: ${trackId}`)
        } else {
            // Add connections for this sphere
            this.addConnectionsForSphere(trackId)
            this.clickedSpheres.add(trackId)
            
            // Add bloom effect
            this.addBloomEffect(sphere)
            sphere.scale.set(1.3, 1.3, 1.3)
            
            // Add visual glow effect immediately on click
            sphere.material.emissive.setHex(0x1DB954) // Green glow
            sphere.material.emissiveIntensity = 0.3
            
            // Add to selected tracks 
            if (addToSelectedTracksCallback) {
                addToSelectedTracksCallback(sphere.userData.track, trackId)
            }
            
            // Auto-play the track via backend API
            if (playTrackCallback) {
                playTrackCallback(sphere.userData.track, sphere)
            }
            
            console.log(`[ADD] Added connections for track: ${trackId}`)
        }
        
        // Update count display
        if (updateTrackCountDisplayCallback) {
            updateTrackCountDisplayCallback()
        }
        
        // Add wave effect AFTER all toggle logic is complete
        this.createClickWaveEffect(sphere)
    }

    createClickWaveEffect(sphere) {
        // Simple immediate wave effect - just flash bright and fade
        console.log('[WAVE] Creating click wave effect')
        
        // Check current selection state AFTER toggle
        const trackId = sphere.userData.track.track_id || sphere.userData.track.uuid || sphere.userData.track.id
        const isNowSelected = this.clickedSpheres.has(trackId)
        
        // Store the original emissive state to restore it after animation
        const originalEmissive = sphere.material.emissive.getHex()
        const originalEmissiveIntensity = sphere.material.emissiveIntensity
        
        // Create immediate bright flash
        sphere.material.emissive.setHex(0x00FFFF) // Bright cyan
        sphere.material.emissiveIntensity = 1.0
        
        // Animate back over 400ms
        let startTime = null
        const duration = 400
        
        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp
            const elapsed = timestamp - startTime
            const progress = Math.min(elapsed / duration, 1)
            
            // Fade out the cyan glow
            sphere.material.emissiveIntensity = 1.0 * (1 - progress)
            
            if (progress < 1) {
                requestAnimationFrame(animate)
            } else {
                // Reset to appropriate final state based on selection
                if (isNowSelected) {
                    sphere.material.emissive.setHex(0x1DB954) // Green for selected
                    sphere.material.emissiveIntensity = 0.3
                } else {
                    sphere.material.emissive.setHex(originalEmissive) // Restore original emissive
                    sphere.material.emissiveIntensity = originalEmissiveIntensity
                }
            }
        }
        
        requestAnimationFrame(animate)
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
        
        console.log(`[SIMILAR] Created ${connectionLines.length} similarity connections for track ${trackId}`)
        console.log(`[SIMILAR] Found ${this.similarityContext.size} tracks in similarity context`)
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
        // Remove all connection lines
        this.activeConnections.forEach((lines, trackId) => {
            lines.forEach(line => {
                this.scene.remove(line)
                line.geometry.dispose()
                line.material.dispose()
            })
        })
        this.activeConnections.clear()
        
        // Clear clicked spheres and remove their effects
        this.clickedSpheres.forEach(trackId => {
            const sphere = this.trackMap.get(trackId)
            if (sphere) {
                this.removeBloomEffect(sphere)
                sphere.scale.set(1, 1, 1)
                sphere.material.emissive.setHex(0x000000)
                sphere.material.emissiveIntensity = 0
            }
        })
        this.clickedSpheres.clear()
        
        console.log('[CLEAR] All connections and sphere selections cleared')
    }

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
            
            // Update material color and stored original color
            sphere.material.color.copy(newColor)
            sphere.material.userData.originalColor = newColor.clone()
            sphere.userData.originalColor = newColor.clone()
            
            // Store the color mode in material userData
            sphere.material.userData.colorMode = mode
            
            sphere.material.needsUpdate = true
        })
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

    getMusicSpheres() {
        return this.musicSpheres
    }

    getTrackMap() {
        return this.trackMap
    }

    getClickedSpheres() {
        return this.clickedSpheres
    }

    setDiscoveryMode(mode) {
        this.discoveryMode = mode
    }

    getDiscoveryMode() {
        return this.discoveryMode
    }

    getSimilarityContext() {
        return this.similarityContext
    }
}