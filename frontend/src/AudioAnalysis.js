export class AudioAnalysis {
    constructor() {
        this.audioContext = null
        this.analyser = null
        this.dataArray = null
        this.bufferLength = 0
        
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
    }

    setupAudioAnalysis(audioElement) {
        try {
            // Create audio context and analyser
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
            this.analyser = this.audioContext.createAnalyser()
            
            // Connect audio element to analyser
            const source = this.audioContext.createMediaElementSource(audioElement)
            source.connect(this.analyser)
            this.analyser.connect(this.audioContext.destination)
            
            // Configure analyser for detailed frequency analysis
            this.analyser.fftSize = 256 // 128 frequency bins
            this.analyser.smoothingTimeConstant = 0.8 // Smooth transitions
            this.bufferLength = this.analyser.frequencyBinCount
            this.dataArray = new Uint8Array(this.bufferLength)
            
            console.log('🎵 Enhanced audio analysis setup complete')
        } catch (error) {
            console.warn('🎵 Audio analysis setup failed:', error)
        }
    }

    analyzeAudio(isPlaying) {
        if (!this.analyser || !this.dataArray || !isPlaying) {
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

    animateAudioReactiveParticles(starfield, isPlaying) {
        if (!starfield || !this.audioAnalysis || !isPlaying) {
            return
        }
        
        const time = Date.now() * 0.001
        const positions = starfield.positions
        const originalPositions = starfield.originalPositions
        const velocities = starfield.velocities
        const frequencies = starfield.frequencies
        
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
        starfield.geometry.attributes.position.needsUpdate = true
        
        // Update particle material based on overall audio intensity
        starfield.material.opacity = starfield.baseOpacity + overall * 0.3
        starfield.material.size = starfield.baseSize + overall * 1.0 + bassKick * 2.0
        
        // Color shifting based on dominant frequency
        const hue = (bass * 0.0 + lowMid * 0.1 + mid * 0.3 + highMid * 0.6 + treble * 0.9) % 1.0
        starfield.material.color.setHSL(hue, 0.5 + overall * 0.5, 0.5 + overall * 0.3)
    }

    getAudioAnalysis() {
        return this.audioAnalysis
    }
}