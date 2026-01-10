import * as THREE from 'three';
import { BaseVisualization } from '../base';
import {
  VisualizationMeta,
  VisualizationConfig,
  AudioData,
  ConfigSchema,
} from '../types';

interface Note {
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  trail: THREE.Mesh;
  lane: number;
  energy: number;
  spawnTime: number;
  hit: boolean;
}

interface HitEffect {
  particles: THREE.Points;
  ring: THREE.Mesh;
  age: number;
  lane: number;
}

// Guitar Hero lane colors - vibrant neon
const LANE_COLORS = [
  0x00ff44, // Green
  0xff2244, // Red
  0xffee00, // Yellow
  0x00aaff, // Blue
  0xff8800, // Orange
];

// Glow versions (slightly different hue for depth)
const LANE_GLOW_COLORS = [
  0x44ffaa, // Green glow
  0xff6688, // Red glow
  0xffffaa, // Yellow glow
  0x66ccff, // Blue glow
  0xffbb44, // Orange glow
];

export class NoteHighway extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: 'noteHighway',
    name: 'Note Highway',
    renderer: 'webgl',
    transitionType: 'zoom',
  };

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private webglRenderer!: THREE.WebGLRenderer;
  private notes: Note[] = [];
  private hitEffects: HitEffect[] = [];
  private lanes: number = 5;
  private laneWidth: number = 2.0;
  private beatAccumulator: number = 0;
  private width = 0;
  private height = 0;
  private time: number = 0;

  // Highway elements
  private highwayGroup!: THREE.Group;
  private laneLines: THREE.Line[] = [];
  private strikeZone!: THREE.Group;
  private strikeButtons: THREE.Mesh[] = [];
  private strikeRings: THREE.Mesh[] = [];
  private highwayFloor!: THREE.Mesh;
  private scrollMarkers: THREE.Line[] = [];
  private floorOffset: number = 0;

  // Beat detection - improved with history
  private bassHistory: number[] = [];
  private midHistory: number[] = [];
  private trebleHistory: number[] = [];
  private historySize: number = 8;
  private laneCooldowns: number[] = [0, 0, 0, 0, 0];

  private config: VisualizationConfig & { speed: number; glowIntensity: number; noteSize: number } = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    speed: 1.2,
    glowIntensity: 1.2,
    noteSize: 1.0,
  };

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.updateConfig(config);
    this.scene = new THREE.Scene();

    // Renderer with transparency
    this.webglRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.webglRenderer.setSize(this.width, this.height);
    this.webglRenderer.setClearColor(0x000000, 0);
    this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.webglRenderer.domElement);

    // Camera - more dramatic angle looking down the highway
    this.camera = new THREE.PerspectiveCamera(70, this.width / this.height, 0.1, 100);
    this.camera.position.set(0, 6, 10);
    this.camera.lookAt(0, 0, -5);

    // Create highway group
    this.highwayGroup = new THREE.Group();
    this.scene.add(this.highwayGroup);

    this.createHighway();
    this.createStrikeZone();
    this.createLaneLines();
    this.createScrollMarkers();

    // Initialize history arrays
    for (let i = 0; i < this.historySize; i++) {
      this.bassHistory.push(0);
      this.midHistory.push(0);
      this.trebleHistory.push(0);
    }

    this.resize(container.clientWidth, container.clientHeight);
  }

  private createHighway(): void {
    // Semi-transparent highway floor
    const highwayWidth = this.lanes * this.laneWidth + 1;
    const highwayLength = 35;

    const floorGeometry = new THREE.PlaneGeometry(highwayWidth, highwayLength, 1, 1);
    const floorMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a0a18,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });

    this.highwayFloor = new THREE.Mesh(floorGeometry, floorMaterial);
    this.highwayFloor.rotation.x = -Math.PI / 2;
    this.highwayFloor.position.set(0, -0.1, -highwayLength / 2 + 5);
    this.highwayGroup.add(this.highwayFloor);

    // Highway edge glow lines
    const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(0, 0, -highwayLength + 5),
    ]);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x8866ff,
      transparent: true,
      opacity: 0.9,
    });

    const leftEdge = new THREE.Line(edgeGeometry, edgeMaterial);
    leftEdge.position.x = -highwayWidth / 2;
    this.highwayGroup.add(leftEdge);

    const rightEdge = new THREE.Line(edgeGeometry.clone(), edgeMaterial.clone());
    rightEdge.position.x = highwayWidth / 2;
    this.highwayGroup.add(rightEdge);
  }

  private createScrollMarkers(): void {
    // Horizontal lines that scroll down the highway for motion effect
    const highwayWidth = this.lanes * this.laneWidth + 0.5;
    const markerCount = 12;
    const spacing = 2.5;

    for (let i = 0; i < markerCount; i++) {
      const z = -i * spacing;
      const points = [
        new THREE.Vector3(-highwayWidth / 2, 0.02, z),
        new THREE.Vector3(highwayWidth / 2, 0.02, z),
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x4433aa,
        transparent: true,
        opacity: 0.3,
      });
      const line = new THREE.Line(geometry, material);
      this.scrollMarkers.push(line);
      this.highwayGroup.add(line);
    }
  }

  private createLaneLines(): void {
    const lineLength = 35;

    for (let i = 1; i < this.lanes; i++) {
      const x = (i - this.lanes / 2) * this.laneWidth;
      const points = [
        new THREE.Vector3(x, 0.01, 5),
        new THREE.Vector3(x, 0.01, -lineLength + 5),
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x3333aa,
        transparent: true,
        opacity: 0.4,
      });
      const line = new THREE.Line(geometry, material);
      this.laneLines.push(line);
      this.highwayGroup.add(line);
    }
  }

  private createStrikeZone(): void {
    this.strikeZone = new THREE.Group();
    this.strikeZone.position.z = 3;

    // Strike line (the "fret") - glowing bar
    const strikeLineGeometry = new THREE.BoxGeometry(
      this.lanes * this.laneWidth + 1.5,
      0.08,
      0.15
    );
    const strikeLineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    const strikeLine = new THREE.Mesh(strikeLineGeometry, strikeLineMaterial);
    strikeLine.position.y = 0.04;
    this.strikeZone.add(strikeLine);

    // Strike buttons for each lane
    for (let i = 0; i < this.lanes; i++) {
      const x = (i - (this.lanes - 1) / 2) * this.laneWidth;

      // Button base (larger, more visible)
      const buttonGeometry = new THREE.CircleGeometry(0.65, 32);
      const buttonMaterial = new THREE.MeshBasicMaterial({
        color: LANE_COLORS[i],
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
      button.rotation.x = -Math.PI / 2;
      button.position.set(x, 0.02, 0);
      this.strikeButtons.push(button);
      this.strikeZone.add(button);

      // Button ring (thicker)
      const ringGeometry = new THREE.RingGeometry(0.55, 0.7, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: LANE_COLORS[i],
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.03, 0);
      this.strikeRings.push(ring);
      this.strikeZone.add(ring);
    }

    this.highwayGroup.add(this.strikeZone);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: 'number',
        label: 'Sensitivity',
        min: 0.5,
        max: 3.0,
        default: 1.0,
        step: 0.1,
      },
      speed: {
        type: 'number',
        label: 'Highway Speed',
        min: 0.5,
        max: 3.0,
        default: 1.2,
        step: 0.1,
      },
      glowIntensity: {
        type: 'number',
        label: 'Glow Intensity',
        min: 0.0,
        max: 2.0,
        default: 1.2,
        step: 0.1,
      },
      noteSize: {
        type: 'number',
        label: 'Note Size',
        min: 0.5,
        max: 2.0,
        default: 1.0,
        step: 0.1,
      },
    };
  }

  private detectBeat(current: number, history: number[], threshold: number): boolean {
    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((a, b) => a + (b - avg) ** 2, 0) / history.length;
    const stdDev = Math.sqrt(variance);
    
    // Beat detected if current value exceeds average + threshold * stdDev
    // Lowered minimum threshold for more responsive detection
    return current > avg + threshold * Math.max(stdDev, 0.03) && current > 0.1;
  }

  render(audioData: AudioData, deltaTime: number): void {
    const { sensitivity, speed, glowIntensity, noteSize } = this.config;
    const { bass, mid, treble, volume, frequencyData } = audioData;

    this.time += deltaTime * 1000; // time in ms for internal use
    // deltaTime is in SECONDS (from engine), scale by speed
    // Notes should travel ~28 units in about 2 seconds at speed=1
    const moveSpeed = deltaTime * speed * 15;

    // Update histories
    this.bassHistory.push(bass);
    this.midHistory.push(mid);
    this.trebleHistory.push(treble);
    if (this.bassHistory.length > this.historySize) this.bassHistory.shift();
    if (this.midHistory.length > this.historySize) this.midHistory.shift();
    if (this.trebleHistory.length > this.historySize) this.trebleHistory.shift();

    // Update lane cooldowns (stored in ms, deltaTime is seconds)
    const deltaMs = deltaTime * 1000;
    for (let i = 0; i < this.laneCooldowns.length; i++) {
      this.laneCooldowns[i] = Math.max(0, this.laneCooldowns[i] - deltaMs);
    }

    // Beat detection with adaptive thresholds (higher = fewer notes)
    const bassThreshold = 1.8 / sensitivity;
    const midThreshold = 1.6 / sensitivity;
    const trebleThreshold = 1.5 / sensitivity;

    const bassHit = this.detectBeat(bass, this.bassHistory, bassThreshold);
    const midHit = this.detectBeat(mid, this.midHistory, midThreshold);
    const trebleHit = this.detectBeat(treble, this.trebleHistory, trebleThreshold);

    // Beat-based spawning - distribute across all lanes more evenly
    // Use combined energy to decide WHEN to spawn, then pick lanes based on frequency character
    
    if (bassHit && bass > 0.35) {
      // Strong bass = green (lane 0)
      if (this.laneCooldowns[0] <= 0) {
        this.spawnNote(0, bass);
        this.laneCooldowns[0] = 350 / sensitivity;
      }
    }

    if (midHit && mid > 0.3) {
      // Mid frequencies = red (lane 1)
      if (this.laneCooldowns[1] <= 0) {
        this.spawnNote(1, mid);
        this.laneCooldowns[1] = 300 / sensitivity;
      }
    }

    if (trebleHit && treble > 0.25) {
      // Treble = yellow center (lane 2)
      if (this.laneCooldowns[2] <= 0) {
        this.spawnNote(2, treble);
        this.laneCooldowns[2] = 280 / sensitivity;
      }
    }

    // Use frequency data for right side lanes (blue=3, orange=4)
    // Higher frequency bins mapped to these lanes with lower thresholds
    const bandSize = Math.floor(frequencyData.length / 5);
    
    // Lane 3 (blue) - upper mid frequencies
    let band3Energy = 0;
    for (let j = 0; j < bandSize; j++) {
      band3Energy += frequencyData[bandSize * 2 + j] / 255;  // Mid-high range
    }
    band3Energy /= bandSize;
    if (this.laneCooldowns[3] <= 0 && band3Energy > 0.3 * (1 / sensitivity)) {
      if (Math.random() < 0.4) {
        this.spawnNote(3, band3Energy);
        this.laneCooldowns[3] = 320 / sensitivity;
      }
    }
    
    // Lane 4 (orange) - high frequencies
    let band4Energy = 0;
    for (let j = 0; j < bandSize; j++) {
      band4Energy += frequencyData[bandSize * 3 + j] / 255;  // High range
    }
    band4Energy /= bandSize;
    if (this.laneCooldowns[4] <= 0 && band4Energy > 0.25 * (1 / sensitivity)) {
      if (Math.random() < 0.4) {
        this.spawnNote(4, band4Energy);
        this.laneCooldowns[4] = 320 / sensitivity;
      }
    }
    
    // Occasional random lane to fill gaps when music is playing
    if (volume > 0.2 && Math.random() < 0.008 * sensitivity) {
      const randomLane = Math.floor(Math.random() * 5);
      if (this.laneCooldowns[randomLane] <= 0) {
        this.spawnNote(randomLane, volume);
        this.laneCooldowns[randomLane] = 400 / sensitivity;
      }
    }

    // Move and update notes
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const note = this.notes[i];
      note.mesh.position.z += moveSpeed;
      note.glow.position.z += moveSpeed;
      note.trail.position.z += moveSpeed;

      // Pulse notes with overall volume
      const pulse = 1 + volume * 0.15;
      const baseScale = noteSize * pulse;
      note.mesh.scale.setScalar(baseScale);
      note.glow.scale.setScalar(baseScale * 1.2);

      // Brighten glow based on energy
      const glowMat = note.glow.material as THREE.MeshBasicMaterial;
      glowMat.opacity = 0.4 * glowIntensity * (0.6 + volume * 0.4);

      // Trail fade as note moves
      const trailMat = note.trail.material as THREE.MeshBasicMaterial;
      const progress = (note.mesh.position.z + 25) / 30;
      trailMat.opacity = Math.max(0, 0.3 - progress * 0.2);

      // Check if note reached strike zone - trigger hit effect and remove
      if (!note.hit && note.mesh.position.z > 2.5) {
        note.hit = true;
        this.createHitEffect(note.lane, note.energy);
        
        // Flash the button
        const button = this.strikeButtons[note.lane];
        const buttonMat = button.material as THREE.MeshBasicMaterial;
        buttonMat.opacity = 0.9;
        
        const ring = this.strikeRings[note.lane];
        ring.scale.setScalar(1.3);
        
        // Remove note immediately when it hits the strike zone
        this.scene.remove(note.mesh);
        this.scene.remove(note.glow);
        this.scene.remove(note.trail);
        note.mesh.geometry.dispose();
        (note.mesh.material as THREE.Material).dispose();
        note.glow.geometry.dispose();
        (note.glow.material as THREE.Material).dispose();
        note.trail.geometry.dispose();
        (note.trail.material as THREE.Material).dispose();
        this.notes.splice(i, 1);
        continue;
      }
    }

    // Update hit effects
    for (let i = this.hitEffects.length - 1; i >= 0; i--) {
      const effect = this.hitEffects[i];
      effect.age += deltaTime;
      
      // Expand ring
      effect.ring.scale.setScalar(1 + effect.age * 0.008);
      const ringMat = effect.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity = Math.max(0, 0.8 - effect.age * 0.004);
      
      // Move particles outward
      const positions = effect.particles.geometry.attributes.position.array as Float32Array;
      for (let j = 0; j < positions.length; j += 3) {
        positions[j] *= 1.02; // x
        positions[j + 1] += 0.02; // y (rise up)
        positions[j + 2] *= 1.02; // z
      }
      effect.particles.geometry.attributes.position.needsUpdate = true;
      
      const particleMat = effect.particles.material as THREE.PointsMaterial;
      particleMat.opacity = Math.max(0, 1 - effect.age * 0.003);

      // Remove old effects
      if (effect.age > 300) {
        this.scene.remove(effect.particles);
        this.scene.remove(effect.ring);
        effect.particles.geometry.dispose();
        (effect.particles.material as THREE.Material).dispose();
        effect.ring.geometry.dispose();
        (effect.ring.material as THREE.Material).dispose();
        this.hitEffects.splice(i, 1);
      }
    }

    // Fade strike buttons and rings back
    for (let i = 0; i < this.strikeButtons.length; i++) {
      const button = this.strikeButtons[i];
      const mat = button.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0.25, mat.opacity - 0.03);
      
      const ring = this.strikeRings[i];
      ring.scale.setScalar(Math.max(1, ring.scale.x - 0.02));
    }

    // Scroll markers animation
    for (const marker of this.scrollMarkers) {
      marker.position.z += moveSpeed;
      if (marker.position.z > 5) {
        marker.position.z -= 30;
      }
      // Fade based on distance
      const mat = marker.material as THREE.LineBasicMaterial;
      const dist = Math.abs(marker.position.z);
      mat.opacity = 0.3 * (1 - dist / 30);
    }

    // Pulse highway edges with bass
    const edges = this.highwayGroup.children.filter(
      (c) => c instanceof THREE.Line && !this.laneLines.includes(c as THREE.Line) && !this.scrollMarkers.includes(c as THREE.Line),
    );
    edges.forEach((edge) => {
      if (edge instanceof THREE.Line) {
        const mat = edge.material as THREE.LineBasicMaterial;
        mat.opacity = 0.5 + bass * 0.5;
      }
    });

    // Attract mode - spawn occasional notes when quiet
    if (volume < 0.1) {
      this.beatAccumulator += deltaMs;
      if (this.beatAccumulator > 600) {
        const lane = Math.floor(Math.random() * 5);
        if (this.laneCooldowns[lane] <= 0) {
          this.spawnNote(lane, 0.5);
          this.laneCooldowns[lane] = 200;
        }
        this.beatAccumulator = 0;
      }
    } else {
      this.beatAccumulator = 0;
    }

    // Subtle camera sway with volume
    this.camera.position.x = Math.sin(this.time * 0.001) * 0.3 * volume;
    this.camera.position.y = 6 + bass * 0.5;

    this.webglRenderer.render(this.scene, this.camera);
  }

  private createHitEffect(laneIndex: number, energy: number): void {
    const x = (laneIndex - (this.lanes - 1) / 2) * this.laneWidth;
    const color = LANE_GLOW_COLORS[laneIndex];

    // Particle burst
    const particleCount = 20;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 0.2 + Math.random() * 0.3;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.1 + Math.random() * 0.2;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: color,
      size: 0.15 * (0.8 + energy * 0.4),
      transparent: true,
      opacity: 1,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.position.set(x, 0.1, 3);

    // Expanding ring
    const ringGeometry = new THREE.RingGeometry(0.3, 0.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, 3);

    this.scene.add(particles);
    this.scene.add(ring);

    this.hitEffects.push({
      particles,
      ring,
      age: 0,
      lane: laneIndex,
    });
  }

  private spawnNote(laneIndex: number, energy: number): void {
    const x = (laneIndex - (this.lanes - 1) / 2) * this.laneWidth;
    const color = LANE_COLORS[laneIndex];
    const glowColor = LANE_GLOW_COLORS[laneIndex];
    const size = this.config.noteSize;

    // Note gem - smaller, cleaner diamond shape
    const noteGeometry = new THREE.BoxGeometry(0.45 * size, 0.18 * size, 0.45 * size);
    const noteMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.95,
    });
    const noteMesh = new THREE.Mesh(noteGeometry, noteMaterial);
    noteMesh.rotation.y = Math.PI / 4; // Diamond orientation
    noteMesh.rotation.x = Math.PI / 6;
    noteMesh.position.set(x, 0.25, -25);

    // Subtle glow under the note (smaller)
    const glowGeometry = new THREE.CircleGeometry(0.4 * size, 12);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.25 * this.config.glowIntensity,
      side: THREE.DoubleSide,
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.set(x, 0.03, -25);

    // Thin trail line behind note (not a big plane)
    const trailGeometry = new THREE.PlaneGeometry(0.08 * size, 1.2);
    const trailMaterial = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const trailMesh = new THREE.Mesh(trailGeometry, trailMaterial);
    trailMesh.rotation.x = -Math.PI / 2;
    trailMesh.position.set(x, 0.02, -25 - 0.6);

    this.scene.add(noteMesh);
    this.scene.add(glowMesh);
    this.scene.add(trailMesh);

    this.notes.push({
      mesh: noteMesh,
      glow: glowMesh,
      trail: trailMesh,
      lane: laneIndex,
      energy: energy,
      spawnTime: this.time,
      hit: false,
    });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.webglRenderer) {
      this.webglRenderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  destroy(): void {
    // Clean up all notes
    for (const note of this.notes) {
      this.scene.remove(note.mesh);
      this.scene.remove(note.glow);
      this.scene.remove(note.trail);
      note.mesh.geometry.dispose();
      (note.mesh.material as THREE.Material).dispose();
      note.glow.geometry.dispose();
      (note.glow.material as THREE.Material).dispose();
      note.trail.geometry.dispose();
      (note.trail.material as THREE.Material).dispose();
    }
    this.notes = [];

    // Clean up hit effects
    for (const effect of this.hitEffects) {
      this.scene.remove(effect.particles);
      this.scene.remove(effect.ring);
      effect.particles.geometry.dispose();
      (effect.particles.material as THREE.Material).dispose();
      effect.ring.geometry.dispose();
      (effect.ring.material as THREE.Material).dispose();
    }
    this.hitEffects = [];

    // Clean up strike buttons and rings
    for (const button of this.strikeButtons) {
      button.geometry.dispose();
      (button.material as THREE.Material).dispose();
    }
    this.strikeButtons = [];
    
    for (const ring of this.strikeRings) {
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    }
    this.strikeRings = [];

    // Clean up scroll markers
    for (const marker of this.scrollMarkers) {
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
    }
    this.scrollMarkers = [];

    // Dispose renderer
    if (this.webglRenderer) {
      this.webglRenderer.dispose();
      this.webglRenderer.domElement.remove();
    }
  }
}
