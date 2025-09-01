export class UIManager {
    constructor(apiBase) {
        this.apiBase = apiBase
        this.setupVisualLogging()
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

    updateTrackCountDisplay(tracks, selectedTracks, activeConnections) {
        // Update Galaxy Info (Top Left) - Simplified to show only 3 items
        const galaxyInfo = document.getElementById('galaxy-info')
        if (galaxyInfo) {
            galaxyInfo.innerHTML = `
                <div style="font-size: 12px; color: #B3B3B3; line-height: 1.6;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <i data-lucide="bar-chart" style="width: 12px; height: 12px; color: #1DB954;"></i>
                        Total Tracks: <span style="color: #1DB954; font-weight: bold;">${tracks.length}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <i data-lucide="heart" style="width: 12px; height: 12px; color: #E91E63;"></i>
                        Selected Tracks: <span style="color: #E91E63; font-weight: bold;">${selectedTracks.length}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="network" style="width: 12px; height: 12px; color: #9C27B0;"></i>
                        Active Connections: <span style="color: #9C27B0; font-weight: bold;">${Array.from(activeConnections.values()).reduce((total, lines) => total + lines.length, 0)}</span>
                    </div>
                </div>
            `
        }
        
        // Re-initialize Lucide icons for the updated content
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons()
        }
    }
    
    updateSelectedTracksList(selectedTracks, currentTrackIndex, trackMap, bloomCallback) {
        const selectedTracksContent = document.getElementById('selected-tracks-list')
        if (!selectedTracksContent) {
            console.log('[WARN] selected-tracks-list element not found')
            return
        }
        
        console.log(`[UPDATE] Updating selected tracks list with ${selectedTracks.length} tracks`)
        
        if (selectedTracks.length === 0) {
            selectedTracksContent.innerHTML = `
                <div style="text-align: center; color: #888; font-style: italic;">No tracks selected</div>
            `
            return
        }
        
        let tracksHTML = ''
        selectedTracks.forEach((track, index) => {
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
            
            const isCurrentTrack = index === currentTrackIndex
            
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
        
        // Ensure bloom effects are applied to all selected tracks
        if (bloomCallback && trackMap) {
            selectedTracks.forEach((track, index) => {
                const trackId = track.track_id || track.uuid || track.id
                const sphere = trackMap.get(trackId)
                if (sphere && !sphere.material.userData.isSelected) {
                    bloomCallback(sphere)
                    sphere.scale.set(1.3, 1.3, 1.3)
                }
            })
        }
    }

    showAudioError(trackId, error) {
        // Update UI to show audio error
        const audioStatus = document.getElementById('audio-status')
        if (audioStatus) {
            audioStatus.innerHTML = `
                <div style="color: #FF6B35; font-size: 12px; padding: 8px; background: rgba(255, 107, 53, 0.1); border-radius: 4px; margin: 4px 0;">
                    ⚠️ Audio Error: ${error}<br>
                    Track: ${trackId}
                </div>
            `
        }
        
        this.vlog(`[AUDIO ERROR] ${trackId}: ${error}`, 'error')
    }

    truncateText(text, maxLength = 35) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    }

    formatTrackTitle(track) {
        if (track.metadata && track.metadata.track_display) {
            return this.truncateText(track.metadata.track_display)
        }
        return this.truncateText(track.track_id || track.id || 'Unknown Track')
    }

    formatArtistName(track) {
        if (track.metadata && track.metadata.artist_display) {
            return this.truncateText(track.metadata.artist_display)
        }
        if (track.metadata && track.metadata.artist) {
            return this.truncateText(track.metadata.artist)
        }
        // Fallback: Extract artist from track_id
        const trackId = track.track_id || track.id || ''
        const parts = trackId.split('_')
        const artist = parts[0] ? parts[0].replace(/_/g, ' ') : 'Unknown Artist'
        return this.truncateText(artist)
    }

    updateTrackInfo(track) {
        // Update Now Playing info
        const trackTitle = document.getElementById('track-title')
        const trackArtist = document.getElementById('track-artist')
        const trackAlbum = document.getElementById('track-album')
        
        if (trackTitle) {
            trackTitle.textContent = this.formatTrackTitle(track)
        }
        if (trackArtist) {
            trackArtist.textContent = this.formatArtistName(track)
        }
        if (trackAlbum) {
            const albumName = track.metadata?.album_display || 
                            track.metadata?.album || 
                            track.album || 
                            'Unknown Album'
            trackAlbum.textContent = this.truncateText(albumName)
        }
        
        // Update metadata display if it exists
        const metadataDisplay = document.getElementById('track-metadata')
        if (metadataDisplay) {
            let metadataHTML = '<div style="font-size: 10px; color: #B3B3B3; margin-top: 8px;">'
            
            if (track.coordinates) {
                metadataHTML += `<div>Valence: ${track.coordinates.valence?.toFixed(2) || 'N/A'}</div>`
                metadataHTML += `<div>Energy: ${track.coordinates.energy?.toFixed(2) || 'N/A'}</div>`
                metadataHTML += `<div>Complexity: ${track.coordinates.complexity?.toFixed(2) || 'N/A'}</div>`
                metadataHTML += `<div>Tension: ${track.coordinates.tension?.toFixed(2) || 'N/A'}</div>`
            }
            
            if (track.uuid) {
                metadataHTML += `<div>UUID: ${track.uuid.substring(0, 8)}...</div>`
            }
            
            metadataHTML += '</div>'
            metadataDisplay.innerHTML = metadataHTML
        }
    }

    updatePlayButton(isPlaying) {
        const playPauseBtn = document.getElementById('play-pause')
        if (playPauseBtn) {
            if (isPlaying) {
                playPauseBtn.innerHTML = '<i data-lucide="pause"></i>'
                playPauseBtn.title = 'Pause'
            } else {
                playPauseBtn.innerHTML = '<i data-lucide="play"></i>'
                playPauseBtn.title = 'Play'
            }
        }
        
        this.refreshLucideIcons()
    }

    refreshLucideIcons() {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
                lucide.createIcons()
            }, 50)
        }
    }

    updateVolumeButton(isMuted) {
        const volumeBtn = document.getElementById('volume')
        if (volumeBtn) {
            if (isMuted) {
                volumeBtn.innerHTML = '<i data-lucide="volume-x"></i>'
                volumeBtn.title = 'Unmute'
            } else {
                volumeBtn.innerHTML = '<i data-lucide="volume-2"></i>'
                volumeBtn.title = 'Mute'
            }
        }
        
        this.refreshLucideIcons()
    }

    updateNavigationButtons(selectedTracks, currentTrackIndex) {
        // Update Previous button
        const prevBtn = document.getElementById('prev-track')
        if (prevBtn) {
            prevBtn.disabled = selectedTracks.length === 0
            prevBtn.style.opacity = selectedTracks.length === 0 ? '0.5' : '1'
        }
        
        // Update Next button  
        const nextBtn = document.getElementById('next-track')
        if (nextBtn) {
            nextBtn.disabled = selectedTracks.length === 0
            nextBtn.style.opacity = selectedTracks.length === 0 ? '0.5' : '1'
        }
        
        // Show current track position in playlist
        const hasPlaylist = selectedTracks && selectedTracks.length > 1
        const playlistInfo = document.getElementById('playlist-info')
        if (playlistInfo) {
            if (hasPlaylist && currentTrackIndex >= 0) {
                playlistInfo.textContent = `${currentTrackIndex + 1} / ${selectedTracks.length}`
                playlistInfo.style.display = 'block'
            } else {
                playlistInfo.style.display = 'none'
            }
        }
    }

    async testAudioSystem(tracks) {
        // Find a track with UUID for testing
        if (!tracks || tracks.length === 0) {
            alert('No tracks loaded yet. Please wait for tracks to load.')
            return
        }
        
        const testTrack = tracks.find(t => t.uuid)
        if (!testTrack) {
            alert('No tracks with valid UUIDs found')
            return
        }
        
        try {
            this.vlog(`[TEST] Testing audio system with track: ${testTrack.uuid}`)
            
            const response = await fetch(`${this.apiBase}/uuid/${testTrack.uuid}/audio`, {
                method: 'HEAD' // Just check if endpoint responds
            })
            
            if (response.ok) {
                this.vlog(`[TEST] Audio endpoint responded successfully`, 'success')
                alert(`✅ Audio system working!\nTested track: ${testTrack.metadata?.track_display || testTrack.track_id}\nUUID: ${testTrack.uuid}`)
            } else {
                alert(`❌ Audio endpoint failed: ${response.status} ${response.statusText}`)
            }
        } catch (error) {
            this.vlog(`[TEST] Audio test failed: ${error.message}`, 'error')
            alert(`❌ Audio test error: ${error.message}`)
        }
    }

    updateDiscoveryUI(discoveryMode) {
        const discoveryModeElement = document.getElementById('discovery-mode')
        if (discoveryModeElement) {
            discoveryModeElement.textContent = discoveryMode || 'none'
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }
}