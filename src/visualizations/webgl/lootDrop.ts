import * as THREE from "three";
import { BaseVisualization } from "../base";
import {
  VisualizationMeta,
  VisualizationConfig,
  AudioData,
  ConfigSchema,
} from "../types";

export class LootDrop extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "lootDrop",
    name: "Loot Drop",
    renderer: "webgl",
    transitionType: "zoom",
  };

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private webglRenderer!: THREE.WebGLRenderer;
  private particles!: THREE.Points;
  private beam!: THREE.Mesh;
  private particleCount = 1000;
  private width = 0;
  private height = 0;
  private config: VisualizationConfig = {
      sensitivity: 1.0,
      colorScheme: "golden"
  };

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.updateConfig(config);
    this.scene = new THREE.Scene();
    
    this.webglRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.webglRenderer.setSize(this.width, this.height);
    this.webglRenderer.setClearColor(0x000000, 0);
    container.appendChild(this.webglRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 100);
    this.camera.position.set(0, 2, 8);
    this.camera.lookAt(0, 2, 0);

    // The Beam
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 20, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ 
        color: 0xffaa00, // Legendary Orange
        transparent: true, 
        opacity: 0.3,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.position.y = 10;
    this.scene.add(this.beam);

    // Particles
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const speeds = new Float32Array(this.particleCount);
    
    for(let i=0; i<this.particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 2;
        positions[i*3] = Math.cos(angle) * r; // x
        positions[i*3+1] = Math.random() * 10; // y
        positions[i*3+2] = Math.sin(angle) * r; // z
        speeds[i] = 0.05 + Math.random() * 0.1;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1)); // custom
    
    const partMat = new THREE.PointsMaterial({
        color: 0xffcc88,
        size: 0.1,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    
    this.particles = new THREE.Points(geometry, partMat);
    this.scene.add(this.particles);

    this.resize(container.clientWidth, container.clientHeight);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
      this.config = { ...this.config, ...config };
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Sensitivity",
        min: 0.1,
        max: 3.0,
        default: 1.0,
        step: 0.1,
      },
    };
  }

  render(audioData: AudioData, _deltaTime: number): void {
    const { sensitivity } = this.config;
    const { volume, bass } = audioData;
    
    // Pulse beam opacity
    const beamMat = this.beam.material as THREE.MeshBasicMaterial;
    beamMat.opacity = 0.2 + (bass * 0.4 * sensitivity);
    this.beam.rotation.y += 0.01;
    
    // Particle animation
    const positions = this.particles.geometry.attributes.position.array as Float32Array;
    // We can't access custom attributes easily in TS without custom shader material or casting
    // Just re-randomize speed here or assume constant up flow
    
    for(let i=0; i<this.particleCount; i++) {
        let y = positions[i*3+1];
        y += 0.05 + (volume * 0.2); // Speed up with volume
        
        if(y > 15) {
            y = 0;
            // Reset radius
            const angle = Math.random() * Math.PI * 2;
            const r = 0.5 + Math.random() * 2;
            positions[i*3] = Math.cos(angle) * r;
            positions[i*3+2] = Math.sin(angle) * r;
        }
        
        positions[i*3+1] = y;
        
        // Swirl
        const x = positions[i*3];
        const z = positions[i*3+2];
        const angle = 0.02 * (1 + bass);
        // Rotate x,z
        positions[i*3] = x * Math.cos(angle) - z * Math.sin(angle);
        positions[i*3+2] = x * Math.sin(angle) + z * Math.cos(angle);
    }
    
    this.particles.geometry.attributes.position.needsUpdate = true;
    
    this.webglRenderer.render(this.scene, this.camera);
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
    if (this.webglRenderer) {
      this.webglRenderer.dispose();
      this.webglRenderer.domElement.remove();
    }
  }
}
