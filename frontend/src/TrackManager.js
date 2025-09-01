export class TrackManager {
    constructor(apiBase) {
        this.selectedTracks = []
        this.currentTrackIndex = -1
        this.currentTrack = null
        this.audio = new Audio()
        this.isPlaying = false
        this.isMuted = false
        this.previousVolume = 1.0
        this.apiBase = apiBase
        
        this.setupAudioEvents()
    }

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

    addToSelectedTracks(track, trackId, updateCallbacks) {
        console.log(`[ADD] Adding track to selected tracks: ${trackId}`)
        console.log(`[COUNT] Current selected tracks count: ${this.selectedTracks.length}`)
        
        // Check if already selected
        const existing = this.selectedTracks.findIndex(t => (t.track_id || t.id) === trackId)
        if (existing === -1) {
            this.selectedTracks.push(track)
            this.currentTrackIndex = this.selectedTracks.length - 1
            this.saveSelectedTracks()
            
            if (updateCallbacks) {
                if (updateCallbacks.updateSelectedTracksList) {
                    updateCallbacks.updateSelectedTracksList()
                }
                if (updateCallbacks.createPlaylistFlow) {
                    updateCallbacks.createPlaylistFlow()
                }
            }
            
            console.log(`[SUCCESS] Added track to selection: ${trackId}, new count: ${this.selectedTracks.length}`)
        } else {
            // Track already exists, just update current index
            this.currentTrackIndex = existing
            if (updateCallbacks && updateCallbacks.updateSelectedTracksList) {
                updateCallbacks.updateSelectedTracksList()
            }
            console.log(`[INFO] Track already selected, updated index: ${trackId}`)
        }
    }

    removeFromSelectedTracks(trackId, updateCallbacks) {
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
            
            if (updateCallbacks) {
                if (updateCallbacks.updateSelectedTracksList) {
                    updateCallbacks.updateSelectedTracksList()
                }
                if (updateCallbacks.createPlaylistFlow) {
                    updateCallbacks.createPlaylistFlow()
                }
                if (updateCallbacks.showPlaylistConnections) {
                    updateCallbacks.showPlaylistConnections()
                }
            }
        }
    }

    clearAllSelectedTracks(updateCallbacks) {
        this.selectedTracks = []
        this.currentTrackIndex = -1
        this.saveSelectedTracks()
        
        if (updateCallbacks) {
            if (updateCallbacks.clearAllConnections) {
                updateCallbacks.clearAllConnections()
            }
            if (updateCallbacks.createPlaylistFlow) {
                updateCallbacks.createPlaylistFlow()
            }
            if (updateCallbacks.updateSelectedTracksList) {
                updateCallbacks.updateSelectedTracksList()
            }
        }
        
        console.log('[CLEAR] Cleared all selected tracks')
    }

    playNext(trackMap) {
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
        
        this.playTrackByIndex(this.currentTrackIndex, trackMap)
    }

    playPrevious(trackMap) {
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
        
        this.playTrackByIndex(this.currentTrackIndex, trackMap)
    }

    playTrackByIndex(index, trackMap, playTrackCallback, updateSelectedTracksListCallback) {
        if (index < 0 || index >= this.selectedTracks.length) return
        
        console.log(`🎯 Playing track by index: ${index}`)
        
        const track = this.selectedTracks[index]
        const trackId = track.track_id || track.id
        const sphere = trackMap?.get(trackId)
        
        // Update current track index
        this.currentTrackIndex = index
        
        // Update the UI to reflect the new current track
        if (updateSelectedTracksListCallback) {
            updateSelectedTracksListCallback()
        }
        
        if (sphere) {
            // Call the proper backend playTrack method
            if (playTrackCallback) {
                playTrackCallback(track, sphere)
            }
            console.log(`🎵 Playing track ${index + 1}/${this.selectedTracks.length}: ${trackId}`)
        } else {
            console.warn(`⚠️ Could not find sphere for track: ${trackId}`)
            // Still try to play without sphere reference
            if (playTrackCallback) {
                playTrackCallback(track, null)
            }
        }
    }

    async playTrack(track, sphere, updateCallbacks) {
        const trackUuid = track.uuid
        const trackId = track.track_id || track.id
        
        if (!trackUuid) {
            console.error('[PLAY] ❌ Track missing required uuid:', track)
            if (updateCallbacks && updateCallbacks.showAudioError) {
                updateCallbacks.showAudioError(trackId || 'unknown', 'Track missing UUID')
            }
            return
        }

        try {
            console.log(`[PLAY] 🎵 Starting playback for track: ${trackId} (UUID: ${trackUuid})`)
            
            if (updateCallbacks && updateCallbacks.vlog) {
                updateCallbacks.vlog(`[PLAY] Starting playback: ${trackId} (UUID: ${trackUuid})`)
            }
            
            // Store current track info with error handling
            this.currentTrack = { track, sphere, trackId, trackUuid }
            
            // Update track info UI
            if (updateCallbacks && updateCallbacks.updateTrackInfo) {
                updateCallbacks.updateTrackInfo(track)
            }
            
            // Use correct UUID-based audio endpoint
            const audioUrl = `${this.apiBase}/uuid/${trackUuid}/audio`
            console.log(`[PLAY] 🎵 Requesting audio URL: ${audioUrl}`)
            
            // Set audio source and attempt playback
            this.audio.src = audioUrl
            
            // Visual feedback - make sphere glow and scale up
            if (sphere) {
                sphere.material.emissive.setHex(0x00FF00) // Bright green for playing
                sphere.material.emissiveIntensity = 0.8
                sphere.scale.set(1.4, 1.4, 1.4)
                
                // Add stronger bloom for currently playing track
                if (updateCallbacks && updateCallbacks.addBloomEffect) {
                    updateCallbacks.addBloomEffect(sphere)
                }
            }
            
            // Attempt to resume AudioContext if suspended (for user interaction compliance)
            if (updateCallbacks && updateCallbacks.audioAnalysis && updateCallbacks.audioAnalysis.audioContext) {
                if (updateCallbacks.audioAnalysis.audioContext.state === 'suspended') {
                    console.log('[PLAY] 🎵 Resuming suspended AudioContext')
                    await updateCallbacks.audioAnalysis.audioContext.resume()
                }
            }
            
            // Start playback
            try {
                await this.audio.play()
                this.isPlaying = true
                
                if (updateCallbacks) {
                    if (updateCallbacks.updatePlayButton) {
                        updateCallbacks.updatePlayButton()
                    }
                    if (updateCallbacks.updateNavigationButtons) {
                        updateCallbacks.updateNavigationButtons()
                    }
                    if (updateCallbacks.vlog) {
                        updateCallbacks.vlog(`[SUCCESS] Playing: ${track.metadata?.track_display || trackId}`, 'success')
                    }
                }
                
                console.log(`[SUCCESS] ✅ Successfully started playback for: ${trackId}`)
                
            } catch (playError) {
                console.error(`[PLAY] ❌ Play error for track ${trackId} (UUID: ${trackUuid}):`, playError)
                this.isPlaying = false
                
                if (updateCallbacks) {
                    if (updateCallbacks.showAudioError) {
                        updateCallbacks.showAudioError(trackId, `Play failed: ${playError.message}`)
                    }
                    if (updateCallbacks.updatePlayButton) {
                        updateCallbacks.updatePlayButton()
                    }
                }
            }
            
        } catch (error) {
            console.error(`[PLAY] ❌ Failed to play track ${trackId} (UUID: ${trackUuid}):`, error)
            this.isPlaying = false
            
            if (updateCallbacks) {
                if (updateCallbacks.showAudioError) {
                    updateCallbacks.showAudioError(trackId, `Failed: ${error.message}`)
                }
                if (updateCallbacks.updatePlayButton) {
                    updateCallbacks.updatePlayButton()
                }
                if (updateCallbacks.vlog) {
                    updateCallbacks.vlog(`[ERROR] Failed to play: ${error.message}`, 'error')
                }
            }
        }
    }

    setupAudioEvents(updateCallbacks) {
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
            if (updateCallbacks && updateCallbacks.updatePlayButton) {
                updateCallbacks.updatePlayButton()
            }
            
            // Reset current track sphere visual effects (only if sphere exists)
            if (this.currentTrack && this.currentTrack.sphere && updateCallbacks) {
                // Keep bloom if track is selected, otherwise remove emissive
                const trackId = this.currentTrack.track.track_id || this.currentTrack.track.uuid
                if (updateCallbacks.clickedSpheres && updateCallbacks.clickedSpheres.has(trackId)) {
                    if (updateCallbacks.addBloomEffect) {
                        updateCallbacks.addBloomEffect(this.currentTrack.sphere)
                    }
                } else {
                    this.currentTrack.sphere.material.emissive.setHex(0x000000)
                    this.currentTrack.sphere.material.emissiveIntensity = 0
                }
            }
            
            // Auto-play next track in playlist/path
            if (this.selectedTracks.length > 1) {
                console.log('🎵 Track ended, auto-playing next...')
                if (updateCallbacks && updateCallbacks.playNext) {
                    updateCallbacks.playNext()
                }
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
            if (updateCallbacks && updateCallbacks.updatePlayButton) {
                updateCallbacks.updatePlayButton()
            }
        })
        
        this.audio.addEventListener('pause', () => {
            console.log('🎵 Audio paused')
            this.isPlaying = false
            if (updateCallbacks && updateCallbacks.updatePlayButton) {
                updateCallbacks.updatePlayButton()
            }
        })
        
        this.audio.addEventListener('play', () => {
            console.log('🎵 Audio started playing')
            this.isPlaying = true
            if (updateCallbacks && updateCallbacks.updatePlayButton) {
                updateCallbacks.updatePlayButton()
            }
        })
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    toggleMute() {
        if (this.isMuted) {
            this.audio.volume = this.previousVolume
            this.isMuted = false
        } else {
            this.previousVolume = this.audio.volume
            this.audio.volume = 0
            this.isMuted = true
        }
    }

    setVolume(volume) {
        this.audio.volume = volume
        if (volume > 0 && this.isMuted) {
            this.isMuted = false
        }
    }

    getSelectedTracks() {
        return this.selectedTracks
    }

    getCurrentTrackIndex() {
        return this.currentTrackIndex
    }

    getCurrentTrack() {
        return this.currentTrack
    }

    getIsPlaying() {
        return this.isPlaying
    }

    getIsMuted() {
        return this.isMuted
    }

    getAudio() {
        return this.audio
    }
}