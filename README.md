# Sonic DNA Analyzer

A full-stack application that visualizes your local music library as an interactive 3D galaxy, allowing for novel exploration and playlist creation based on deep audio analysis.

---

![Playlist Generation](docs/playlist-generation.mov)

## ✨ Core Concepts

This project moves beyond simple metadata tags (like genre or artist) to understand the music itself. It's built on two key ideas:

1.  **Sonic DNA**: A rich, multi-dimensional "fingerprint" of a track extracted through deep audio analysis. It includes genetic markers for harmony, rhythm, timbre, texture, and dynamics.
2.  **Emotional Space**: A 3D universe where every track from your library is a star. The position of each star is determined by its Sonic DNA, creating a galaxy where similar-sounding tracks naturally cluster together.

## 🚀 Features

### 3D Music Galaxy Navigation
![Navigation](docs/navigation.mov)
Explore your music library in a 3D space rendered with **Three.js**. You can pan, zoom, and rotate to discover clusters of similar-sounding songs. Each sphere represents a track, and its position and color are determined by its unique Sonic DNA.

### Similar Song Discovery
![Similar Songs](docs.similar-songs.mov)
Click on a track to see its sonic relatives. The application draws connections to other tracks that are acoustically similar, based on a detailed analysis of their Sonic DNA. This allows you to discover new connections in your music library that you might not have found otherwise.

### Visual Playlist Generation
![Playlist Generation](docs/playlist-generation.mov)
Create playlists with a gradual mood change by visually selecting a path through the galaxy. As you select tracks, they are added to a playlist. The application uses `localStorage` to save your playlist, so it persists between sessions.

### Interactive Music Playback
![Start and End Track](docs/start-end-track.mov)
Click on any track to start playback. The UI provides controls for play, pause, next, and previous tracks in your playlist. The 3D environment also reacts to the music in real-time, with a pulsing starfield that responds to the audio frequencies.

## 🛠️ How It Works

The application is composed of a Python backend for analysis and a JavaScript frontend for visualization and interaction.

### 1. Backend (Python)

The backend is responsible for analyzing your music library and creating the data for the 3D visualization.

#### Sonic DNA Extraction (`sonic_dna_extractor.py`)

This is where the magic begins. For each track, the application performs a deep audio analysis using the **Librosa** library to extract a `SonicDNA` profile. This profile is a comprehensive set of "genetic markers" that describe the track's acoustic properties:

*   **Harmonic Genes**: A 12-dimensional vector representing the track's harmonic content (which notes are present).
*   **Rhythmic Genes**: A sequence that describes the rhythmic patterns of the track.
*   **Timbral Genes**: Based on MFCCs (Mel-frequency cepstral coefficients), these genes describe the timbre or tonal quality of the sound.
*   **Textural Genes**: Derived from spectral contrast, these describe the texture of the sound (e.g., whether it's "bright" or "dark").
*   **Dynamic Genes**: Captures the energy variations and dynamics of the track.

From these genes, the extractor also derives higher-level "emotional coordinates":

*   **Valence**: A measure of how "happy" or "sad" the track sounds.
*   **Energy**: How energetic or calm the track is.
*   **Complexity**: The musical complexity of the track.
*   **Tension**: The level of tension or relaxation in the music.

All of this data is stored in `data/sonic_dna/sonic_dna_profiles.json`.

#### Emotional Space Mapping (`emotional_space_mapper.py`)

Once the Sonic DNA is extracted, this script maps the high-dimensional feature space into a 3D "Emotional Space".

*   **Dimensionality Reduction**: It uses powerful dimensionality reduction techniques, **UMAP** (if available) or **t-SNE**, to project the multi-dimensional Sonic DNA of each track into a 3D coordinate (`x`, `y`, `z`). This is done in a way that preserves the sonic relationships between tracks, so similar-sounding songs end up close to each other in the 3D space.
*   **Graph Creation**: It also builds a graph of all the tracks using the `networkx` library, where the edges represent the similarity between tracks. This graph is used for finding similar songs and creating emotional journeys.
*   **Data Export**: Finally, it exports all the data required for the frontend visualization—including the 3D positions, connections, and color information for each track—into `data/emotional_space_data.json`.

### 2. Frontend (JavaScript)

The frontend is a modern web application built with **Vite** and **Three.js** that visualizes the data from the backend and provides an interactive user experience.

#### 3D Visualization (`musicPlayer3D.js`, `SceneSetup.js`, `SphereManager.js`)

*   **Three.js**: The core of the visualization is built with Three.js. It creates a 3D scene, sets up a camera and lighting, and renders the music galaxy.
*   **Sphere Representation**: Each track is represented as a sphere (`SphereManager.js`). The position of the sphere is determined by the `x`, `y`, `z` coordinates calculated by the backend. The color of the sphere is also algorithmically determined based on the track's emotional and sonic properties, creating a visually rich and informative galaxy.
*   **Navigation**: `OrbitControls` from Three.js is used to enable intuitive navigation of the 3D space (pan, zoom, rotate).

#### User Interaction and Playback (`musicPlayer3D.js`, `TrackManager.js`, `UIManager.js`)

*   **Raycasting**: The application uses raycasting to detect when the user clicks on a sphere.
*   **Playback**: When a track is clicked, the `TrackManager.js` handles the audio playback. It fetches the audio from the backend API and uses the browser's `Audio` element to play it.
*   **Playlist Management**: The `TrackManager.js` also manages the user's playlist. When a user selects tracks, they are added to a playlist array.
*   **`localStorage` for Persistence**: The application uses the browser's `localStorage` to save the user's playlist. This is a simple and effective way to persist user data on the client-side without needing a server-side database. When the user returns to the application, their playlist is loaded from `localStorage`, providing a seamless experience.
*   **UI Updates**: The `UIManager.js` is responsible for updating the user interface with information about the currently playing track, the playlist, and other status messages.

## 🏁 Getting Started

Follow these steps to get the Sonic DNA Analyzer running on your local machine.

### Prerequisites

-   Python 3.8+ and `pip`
-   Node.js and `npm`
-   A local music library (for the initial analysis)

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd sonic-dna-analyzer
```

### 2. Setup the Backend

```bash
# Install Python dependencies
pip install -r requirements.txt
```

### 3. Setup the Frontend

```bash
# Navigate to the frontend directory
cd frontend

# Install Node.js dependencies
npm install

# Go back to the root directory
cd ..
```

### 4. Run the Analysis

This step scans your music library, extracts the Sonic DNA, and generates the 3D map. **This only needs to be run once** (or again when you add new music).

*Note: Make sure your music library is accessible, and update the path in the script if necessary.*

```bash
python scripts/run_quick_analysis.py
```

### 5. Launch the Application

You'll need to run the backend and frontend servers in two separate terminals.

**Terminal 1: Start the Backend API**

```bash
python backend/api/api_server.py
```

**Terminal 2: Start the Frontend**

```bash
cd frontend
npm run dev
```

Now, open your web browser and navigate to the localhost URL provided by the `npm run dev` command (usually `http://localhost:5173`).

## 🔮 Future Ideas

-   **VR/AR Implementation**: Adapt the 3D visualization for a fully immersive experience.
-   **Streaming Service Integration**: Apply the analysis engine to a Spotify or Apple Music library.
-   **Collaborative Playlisting**: Allow multiple users to explore the galaxy and build playlists together.
-   **Advanced Pathfinding**: Implement algorithms for finding "scenic routes" or more complex emotional journeys between tracks.

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.