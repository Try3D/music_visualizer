import * as THREE from 'three'

export class VisualEffects {
    constructor() {
        this.playlistFlow = null
        this.activeConnections = new Map()
    }

    animateConstellationMeshes(activeConnections, audioAnalysis) {
        if (!activeConnections || activeConnections.size === 0) return
        
        const time = Date.now() * 0.001
        const { bass, mid, treble, overall, beatDetected } = audioAnalysis || {}
        
        // Animate all active constellation meshes (but skip static path lines)
        activeConnections.forEach((meshes, trackId) => {
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

    createSimpleFlowConnection(trackPositions) {
        if (trackPositions.length < 2) return null
        
        const points = []
        trackPositions.forEach(tp => {
            points.push(tp.position)
        })
        
        // Create a simple line connecting all positions
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        const material = new THREE.LineBasicMaterial({
            color: 0x1DB954,
            transparent: true,
            opacity: 0.6,
            linewidth: 3
        })
        
        return new THREE.Line(geometry, material)
    }

    createPlaylistFlow(scene, selectedTracks, trackMap) {
        try {
            // Remove existing flow if it exists
            if (this.playlistFlow) {
                scene.remove(this.playlistFlow)
                this.disposeConstellationMesh(this.playlistFlow)
            }
            
            if (selectedTracks.length < 2) {
                this.playlistFlow = null
                return
            }
            
            // Create flowing path through selected tracks with gravitational attraction
            const flowGroup = new THREE.Group()
            const trackPositions = []
            
            // Get positions of selected tracks
            selectedTracks.forEach((track, index) => {
                const trackId = track.track_id || track.uuid || track.id
                const sphere = trackMap?.get(trackId)
                
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
            
            // Create simpler connection for now
            const simpleConnection = this.createSimpleFlowConnection(trackPositions)
            if (simpleConnection) {
                flowGroup.add(simpleConnection)
            }
            
            // Store flow data for animation
            flowGroup.userData = {
                trackPositions: trackPositions,
                tube: simpleConnection,
                animationOffset: 0
            }
            
            this.playlistFlow = flowGroup
            scene.add(flowGroup)
            
            console.log(`[FLOW] Created playlist flow with ${trackPositions.length} tracks`)
            
        } catch (error) {
            console.error('[FLOW] Error creating playlist flow:', error)
            this.playlistFlow = null
        }
    }

    disposeConstellationMesh(mesh) {
        if (!mesh) return
        
        mesh.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose()
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => material.dispose())
                } else {
                    child.material.dispose()
                }
            }
        })
    }

    animatePlaylistFlow(playlistFlow, audioAnalysis) {
        if (!playlistFlow || !playlistFlow.userData) return
        
        const time = Date.now() * 0.001
        const audioIntensity = audioAnalysis ? audioAnalysis.overall : 0
        
        // Animate the flow connections
        playlistFlow.traverse((child) => {
            if (child.isLine && child.material) {
                // Pulsing opacity based on audio
                const baseopacity = 0.6
                const pulse = Math.sin(time * 4) * 0.3 * audioIntensity
                child.material.opacity = Math.max(0.2, baseopacity + pulse)
                
                // Color shifting
                if (audioAnalysis && audioAnalysis.beatDetected) {
                    child.material.color.setHex(0x00FF00) // Flash green on beat
                    setTimeout(() => {
                        if (child.material) {
                            child.material.color.setHex(0x1DB954)
                        }
                    }, 100)
                }
            }
        })
    }

    showPlaylistConnections(scene, selectedTracks, trackMap, activeConnections) {
        // Clear existing playlist connections
        const playlistConnections = activeConnections.get('playlist')
        if (playlistConnections) {
            playlistConnections.forEach(line => {
                scene.remove(line)
                line.geometry.dispose()
                line.material.dispose()
            })
        }
        
        if (selectedTracks.length < 2) {
            activeConnections.delete('playlist')
            return
        }
        
        const connectionLines = []
        
        // Create connections between consecutive tracks in the playlist
        for (let i = 0; i < selectedTracks.length - 1; i++) {
            const currentTrack = selectedTracks[i]
            const nextTrack = selectedTracks[i + 1]
            
            const currentTrackId = currentTrack.track_id || currentTrack.uuid || currentTrack.id
            const nextTrackId = nextTrack.track_id || nextTrack.uuid || nextTrack.id
            
            const currentSphere = trackMap?.get(currentTrackId)
            const nextSphere = trackMap?.get(nextTrackId)
            
            if (currentSphere && nextSphere) {
                // Create line geometry
                const points = [
                    currentSphere.position.clone(),
                    nextSphere.position.clone()
                ]
                const geometry = new THREE.BufferGeometry().setFromPoints(points)
                
                // Playlist connection material (distinct from similarity connections)
                const material = new THREE.LineBasicMaterial({
                    color: new THREE.Color(0xFF6B35), // Orange for playlist flow
                    transparent: true,
                    opacity: 0.8,
                    linewidth: 3
                })
                
                const line = new THREE.Line(geometry, material)
                line.userData = {
                    sourceTrack: currentTrackId,
                    targetTrack: nextTrackId,
                    isPlaylist: true
                }
                
                scene.add(line)
                connectionLines.push(line)
            }
        }
        
        // Store playlist connections
        if (connectionLines.length > 0) {
            activeConnections.set('playlist', connectionLines)
            console.log(`[PLAYLIST] Created ${connectionLines.length} playlist connections`)
        }
    }

    getPlaylistFlow() {
        return this.playlistFlow
    }
}