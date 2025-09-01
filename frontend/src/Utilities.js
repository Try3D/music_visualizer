export class Utilities {
  constructor(musicPlayerInstance) {
    this.musicPlayer = musicPlayerInstance;
  }

  setupVisualLogging() {
    const clearLogBtn = document.getElementById("clear-log-btn");
    if (clearLogBtn) {
      clearLogBtn.addEventListener("click", () => {
        this.clearVisualLog();
      });
    }
  }

  vlog(message, type = "info") {
    const logContent = document.getElementById("log-content");
    if (logContent) {
      const timestamp = new Date().toLocaleTimeString();
      const colors = {
        info: "#ccc",
        success: "#1DB954",
        warning: "#FFB84D",
        error: "#FF6B35",
        debug: "#888",
      };

      const logEntry = document.createElement("div");
      logEntry.style.color = colors[type] || "#ccc";
      logEntry.style.marginBottom = "2px";
      logEntry.innerHTML = `<span style="color: #666;">[${timestamp}]</span> ${message}`;

      logContent.appendChild(logEntry);

      logContent.scrollTop = logContent.scrollHeight;

      while (logContent.children.length > 50) {
        logContent.removeChild(logContent.firstChild);
      }
    }
  }

  clearVisualLog() {
    const logContent = document.getElementById("log-content");
    if (logContent) {
      logContent.innerHTML = "";
    }
  }

  truncateText(text, maxLength = 35) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  formatTrackTitle(track) {
    if (track.metadata) {
      const metadata = track.metadata;
      const title =
        metadata.track_display || metadata.track_name || "Unknown Track";
      return this.truncateText(title, 35);
    } else {
      const trackId = track.track_id || track.id;
      const parts = trackId.split("_");
      let title = parts.slice(2).join(" ") || "Unknown Track";

      title = title.replace(/^\d+\.\s*/, "");
      title = title.replace(/\.(mp3|flac|wav|m4a)$/i, "");
      return this.truncateText(title, 35);
    }
  }

  formatArtistName(track) {
    if (track.metadata) {
      const metadata = track.metadata;
      const artist =
        metadata.artist_display || metadata.artist || "Unknown Artist";
      return this.truncateText(artist, 25);
    } else {
      const trackId = track.track_id || track.id;
      const parts = trackId.split("_");
      const artist = parts[0] || "Unknown Artist";
      return this.truncateText(artist, 25);
    }
  }

  showAudioError(trackId, error) {
    const notification = document.createElement("div");
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
        `;
    notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Audio Playback Issue</div>
            <div style="margin-bottom: 8px;">Track: ${trackId}</div>
            <div style="font-size: 12px; opacity: 0.8;">Check console for details</div>
        `;

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  refreshLucideIcons() {
    if (typeof lucide !== "undefined" && lucide.createIcons) {
      try {
        setTimeout(() => {
          lucide.createIcons();
        }, 10);
      } catch (error) {
        console.warn("Failed to refresh lucide icons:", error);
      }
    }
  }
}