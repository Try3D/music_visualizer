import "./style.css";
import { MusicPlayer3D } from "./musicPlayer3D.js";

class App {
  constructor() {
    this.musicPlayer = null;
    this.initWhenReady();
  }

  async initWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      await this.init();
    }
  }

  async init() {
    try {
      await this.waitForLucide();

      const container = document.getElementById("three-container");
      if (!container) {
        throw new Error("Container element not found");
      }

      this.musicPlayer = new MusicPlayer3D("three-container");
      window.musicPlayer = this.musicPlayer;
      await this.musicPlayer.init();
    } catch (error) {
      console.error("❌ Failed to initialize 3D Music Player:", error);
      this.showError(error.message);
    }
  }

  async waitForLucide() {
    return new Promise((resolve) => {
      const checkLucide = () => {
        if (typeof lucide !== "undefined" && lucide.createIcons) {
          resolve();
        } else {
          setTimeout(checkLucide, 50);
        }
      };
      checkLucide();
    });
  }

  showError(message) {
    const app = document.getElementById("app");
    app.innerHTML = `
            <div class="flex items-center justify-center h-screen bg-spotify-black">
                <div class="text-center p-8 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <h1 class="text-2xl font-bold text-red-400 mb-4">Error</h1>
                    <p class="text-spotify-light-gray">${message}</p>
                    <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-spotify-green text-spotify-black rounded hover:bg-spotify-green/80">
                        Retry
                    </button>
                </div>
            </div>
        `;
  }
}

new App();
