export class AudioManager {
  constructor(musicPlayer) {
    this.musicPlayer = musicPlayer;
  }

  setupAudioAnalysis() {
    try {
      this.musicPlayer.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this.musicPlayer.analyser = this.musicPlayer.audioContext.createAnalyser();

      const source = this.musicPlayer.audioContext.createMediaElementSource(this.musicPlayer.audio);
      source.connect(this.musicPlayer.analyser);
      this.musicPlayer.analyser.connect(this.musicPlayer.audioContext.destination);

      this.musicPlayer.analyser.fftSize = 256;
      this.musicPlayer.analyser.smoothingTimeConstant = 0.8;
      this.musicPlayer.bufferLength = this.musicPlayer.analyser.frequencyBinCount;
      this.musicPlayer.dataArray = new Uint8Array(this.musicPlayer.bufferLength);

      this.musicPlayer.audioAnalysis = {
        bass: 0,
        lowMid: 0,
        mid: 0,
        highMid: 0,
        treble: 0,
        overall: 0,
        bassKick: 0,
        beatDetected: false,
      };
    } catch (error) {
      console.warn("🎵 Audio analysis setup failed:", error);
    }
  }

  analyzeAudio() {
    if (!this.musicPlayer.analyser || !this.musicPlayer.dataArray || !this.musicPlayer.isPlaying) {
      return;
    }

    this.musicPlayer.analyser.getByteFrequencyData(this.musicPlayer.dataArray);

    let bassSum = 0,
      lowMidSum = 0,
      midSum = 0,
      highMidSum = 0,
      trebleSum = 0;
    let bassCount = 0,
      lowMidCount = 0,
      midCount = 0,
      highMidCount = 0,
      trebleCount = 0;
    let overallSum = 0;

    for (let i = 0; i < this.musicPlayer.bufferLength; i++) {
      const value = this.musicPlayer.dataArray[i] / 255.0;
      overallSum += value;

      if (i <= 4) {
        bassSum += value;
        bassCount++;
      } else if (i <= 15) {
        lowMidSum += value;
        lowMidCount++;
      } else if (i <= 40) {
        midSum += value;
        midCount++;
      } else if (i <= 80) {
        highMidSum += value;
        highMidCount++;
      } else {
        trebleSum += value;
        trebleCount++;
      }
    }

    const rawBass = bassCount > 0 ? bassSum / bassCount : 0;
    const rawLowMid = lowMidCount > 0 ? lowMidSum / lowMidCount : 0;
    const rawMid = midCount > 0 ? midSum / midCount : 0;
    const rawHighMid = highMidCount > 0 ? highMidSum / highMidCount : 0;
    const rawTreble = trebleCount > 0 ? trebleSum / trebleCount : 0;
    const rawOverall = overallSum / this.musicPlayer.bufferLength;

    const smoothing = 0.7;
    this.musicPlayer.audioAnalysis.bass =
      this.musicPlayer.prevAudioAnalysis.bass * smoothing + rawBass * (1 - smoothing);
    this.musicPlayer.audioAnalysis.lowMid =
      this.musicPlayer.prevAudioAnalysis.lowMid * smoothing + rawLowMid * (1 - smoothing);
    this.musicPlayer.audioAnalysis.mid =
      this.musicPlayer.prevAudioAnalysis.mid * smoothing + rawMid * (1 - smoothing);
    this.musicPlayer.audioAnalysis.highMid =
      this.musicPlayer.prevAudioAnalysis.highMid * smoothing + rawHighMid * (1 - smoothing);
    this.musicPlayer.audioAnalysis.treble =
      this.musicPlayer.prevAudioAnalysis.treble * smoothing + rawTreble * (1 - smoothing);
    this.musicPlayer.audioAnalysis.overall =
      this.musicPlayer.prevAudioAnalysis.overall * smoothing + rawOverall * (1 - smoothing);

    this.musicPlayer.prevAudioAnalysis.bass = this.musicPlayer.audioAnalysis.bass;
    this.musicPlayer.prevAudioAnalysis.lowMid = this.musicPlayer.audioAnalysis.lowMid;
    this.musicPlayer.prevAudioAnalysis.mid = this.musicPlayer.audioAnalysis.mid;
    this.musicPlayer.prevAudioAnalysis.highMid = this.musicPlayer.audioAnalysis.highMid;
    this.musicPlayer.prevAudioAnalysis.treble = this.musicPlayer.audioAnalysis.treble;
    this.musicPlayer.prevAudioAnalysis.overall = this.musicPlayer.audioAnalysis.overall;

    const bassIncrease = rawBass - this.musicPlayer.prevAudioAnalysis.bass;
    this.musicPlayer.audioAnalysis.bassKick = Math.max(0, bassIncrease * 3);

    this.musicPlayer.audioAnalysis.beatDetected =
      this.musicPlayer.audioAnalysis.bass > 0.6 && bassIncrease > 0.08;
  }

  setupAudioEvents() {
    this.musicPlayer.audio.addEventListener("timeupdate", () => {
      if (this.musicPlayer.audio.duration) {
        const progress = (this.musicPlayer.audio.currentTime / this.musicPlayer.audio.duration) * 100;
        const progressBar = document.getElementById("progress-bar");
        if (progressBar) {
          progressBar.value = progress;
        }

        const currentTime = this.formatTime(this.musicPlayer.audio.currentTime);
        const totalTime = this.formatTime(this.musicPlayer.audio.duration);
        const timeDisplay = document.getElementById("time-display");
        if (timeDisplay) {
          timeDisplay.textContent = `${currentTime} / ${totalTime}`;
        }
      }
    });

    this.musicPlayer.audio.addEventListener("ended", () => {
      this.musicPlayer.isPlaying = false;
      this.musicPlayer.uiManager.updatePlayButton();

      if (this.musicPlayer.currentTrack && this.musicPlayer.currentTrack.sphere) {
        const trackId =
          this.musicPlayer.currentTrack.track.track_id || this.musicPlayer.currentTrack.track.uuid;
        if (this.musicPlayer.clickedSpheres.has(trackId)) {
          this.musicPlayer.visualEffects.addBloomEffect(this.musicPlayer.currentTrack.sphere);
        } else {
          this.musicPlayer.currentTrack.sphere.material.emissive.setHex(0x000000);
          this.musicPlayer.currentTrack.sphere.material.emissiveIntensity = 0;
        }
      }

      if (this.musicPlayer.selectedTracks.length > 1) {
        this.musicPlayer.trackManager.playNext();
      }
    });

    this.musicPlayer.audio.addEventListener("error", (error) => {
      console.error("🎵 Audio error:", error);
      this.musicPlayer.isPlaying = false;
      this.musicPlayer.uiManager.updatePlayButton();
    });

    this.musicPlayer.audio.addEventListener("pause", () => {
      this.musicPlayer.isPlaying = false;
      this.musicPlayer.uiManager.updatePlayButton();
    });

    this.musicPlayer.audio.addEventListener("play", () => {
      this.musicPlayer.isPlaying = true;
      this.musicPlayer.uiManager.updatePlayButton();
    });

    this.musicPlayer.uiManager.updateVolumeButton();
  }

  async playTrack(track, sphere) {
    try {
      const trackUUID = track.uuid;
      const trackId = track.track_id || track.uuid || "unknown";

      let displayName = trackId;
      if (track.metadata) {
        const artist =
          track.metadata.artist_display || track.metadata.artist || "Unknown";
        const title =
          track.metadata.track_display ||
          track.metadata.track_name ||
          "Unknown";
        displayName = `${artist} - ${title}`;
      }

      if (!trackUUID) {
        throw new Error(`Track UUID not available for: ${displayName}`);
      }

      if (this.musicPlayer.currentTrack && this.musicPlayer.currentTrack.sphere) {
        const prevTrackId =
          this.musicPlayer.currentTrack.track.track_id || this.musicPlayer.currentTrack.track.uuid;
        if (this.musicPlayer.clickedSpheres.has(prevTrackId)) {
          this.musicPlayer.visualEffects.addBloomEffect(this.musicPlayer.currentTrack.sphere);
        } else {
          this.musicPlayer.visualEffects.removeBloomEffect(this.musicPlayer.currentTrack.sphere);
        }
      }

      this.musicPlayer.updateTrackInfo(track);

      this.musicPlayer.currentTrack = { track, sphere: sphere || null };

      try {
        if (!trackUUID || trackUUID.trim() === "") {
          throw new Error(
            `Invalid UUID: "${trackUUID}" for track: ${displayName}`,
          );
        }

        if (!this.musicPlayer.audio.paused) {
          this.musicPlayer.audio.pause();
        }

        if (this.musicPlayer.audio.src && this.musicPlayer.audio.src.startsWith("blob:")) {
          URL.revokeObjectURL(this.musicPlayer.audio.src);
        }

        let audioUrl = null;
        let audioBlob = null;

        try {
          const getUrl = `${this.musicPlayer.apiBase}/uuid/${encodeURIComponent(trackUUID.trim())}/audio`;

          const getResponse = await fetch(getUrl, {
            method: "GET",
            headers: {
              Accept: "audio/*",
              "Cache-Control": "no-cache",
            },
          });

          if (getResponse.ok) {
            audioBlob = await getResponse.blob();
            audioUrl = URL.createObjectURL(audioBlob);
          }
        } catch (getError) {
          console.warn(`⚠️ GET request error:`, getError);
        }

        if (!audioUrl) {
          try {
            const postUrl = `${this.musicPlayer.apiBase}/uuid/audio`;

            const postResponse = await fetch(postUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "audio/*",
              },
              body: JSON.stringify({
                uuid: trackUUID.trim(),
                track_uuid: trackUUID.trim(),
              }),
            });

            if (postResponse.ok) {
              audioBlob = await postResponse.blob();
              audioUrl = URL.createObjectURL(audioBlob);
            } else {
              console.error(
                `POST request failed: ${postResponse.status} ${postResponse.statusText}`,
              );
              const errorText = await postResponse.text();
              console.error(`POST error details:`, errorText);
            }
          } catch (postError) {
            console.error(`POST request error:`, postError);
          }
        }

        if (!audioUrl) {
          throw new Error(
            `Failed to load audio from both GET and POST methods for UUID: ${trackUUID}`,
          );
        }

        this.musicPlayer.audio.src = audioUrl;
        this.musicPlayer.audio.currentTime = 0;

        const handleAudioError = (event) => {
          this.musicPlayer.audio.removeEventListener("error", handleAudioError);
          throw new Error(`Failed to load audio for: ${displayName}`);
        };

        this.musicPlayer.audio.addEventListener("error", handleAudioError, { once: true });

        this.musicPlayer.audio.load();

        await new Promise((resolve, reject) => {
          const onCanPlay = () => {
            this.musicPlayer.audio.removeEventListener("canplay", onCanPlay);
            this.musicPlayer.audio.removeEventListener("error", onError);
            resolve();
          };

          const onError = (event) => {
            this.musicPlayer.audio.removeEventListener("canplay", onCanPlay);
            this.musicPlayer.audio.removeEventListener("error", onError);
            reject(new Error(`Audio loading failed for: ${displayName}`));
          };

          this.musicPlayer.audio.addEventListener("canplay", onCanPlay, { once: true });
          this.musicPlayer.audio.addEventListener("error", onError, { once: true });
        });

        await this.musicPlayer.audio.play();
        this.musicPlayer.isPlaying = true;
        this.musicPlayer.uiManager.updatePlayButton();

        if (!this.musicPlayer.audioContext) {
          this.setupAudioAnalysis();
        }

        if (sphere) {
          sphere.material.emissive.setHex(0x1db954);
          sphere.material.emissiveIntensity = 0.3;
        }
      } catch (audioError) {
        this.musicPlayer.utilities.showAudioError(trackId, audioError);

        this.musicPlayer.isPlaying = false;
        this.musicPlayer.uiManager.updatePlayButton();

        if (sphere) {
          sphere.material.emissive.setHex(0xff6b35);
          sphere.material.emissiveIntensity = 0.3;
        }
      }
    } catch (error) {
      this.musicPlayer.utilities.showAudioError(track.track_id || track.uuid, error);
    }
  }

  async testAudioSystem() {
    this.musicPlayer.utilities.vlog("🔧 Testing audio system...", "info");

    if (!this.musicPlayer.tracks || this.musicPlayer.tracks.length === 0) {
      this.musicPlayer.utilities.vlog("❌ No tracks loaded", "error");
      alert("No tracks loaded yet. Please wait for tracks to load.");
      return;
    }

    const testTrack = this.musicPlayer.tracks.find(
      (track) => track.uuid && track.uuid.trim() !== "",
    );

    if (!testTrack) {
      this.musicPlayer.utilities.vlog("❌ No tracks with valid UUIDs found", "error");
      alert("No tracks with valid UUIDs found");
      return;
    }

    this.musicPlayer.utilities.vlog(
      `🔧 Testing with track: ${testTrack.metadata?.track_display || testTrack.track_id}`,
      "info",
    );
    this.musicPlayer.utilities.vlog(`🔧 UUID: ${testTrack.uuid}`, "debug");

    try {
      const audioUrl = `${this.musicPlayer.apiBase}/uuid/${encodeURIComponent(testTrack.uuid)}/audio`;
      this.musicPlayer.utilities.vlog(`🔧 Testing URL: ${audioUrl}`, "debug");

      const response = await fetch(audioUrl, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
      });
      this.musicPlayer.utilities.vlog(`🔧 Response status: ${response.status}`, "debug");

      if (response.ok) {
        this.musicPlayer.utilities.vlog("✅ Audio endpoint test successful!", "success");
        alert(
          `✅ Audio system working!\nTested track: ${testTrack.metadata?.track_display || testTrack.track_id}\nUUID: ${testTrack.uuid}`,
        );
      } else {
        this.musicPlayer.utilities.vlog(
          `❌ Audio endpoint test failed: ${response.status} ${response.statusText}`,
          "error",
        );
        alert(
          `❌ Audio endpoint failed: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      this.musicPlayer.utilities.vlog(`❌ Audio test error: ${error.message}`, "error");
      alert(`❌ Audio test error: ${error.message}`);
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  toggleMute() {
    if (this.musicPlayer.isMuted) {
      this.musicPlayer.audio.volume = this.musicPlayer.previousVolume;
      this.musicPlayer.isMuted = false;
    } else {
      this.musicPlayer.previousVolume = this.musicPlayer.audio.volume;
      this.musicPlayer.audio.volume = 0;
      this.musicPlayer.isMuted = true;
    }
    this.musicPlayer.uiManager.updateVolumeButton();
  }
}