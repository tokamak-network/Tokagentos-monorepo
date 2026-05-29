/**
 * AuroraEnvironment — Tokagent companion scene background.
 *
 * Replaces the upstream Matrix-style MathEnvironment. Renders three
 * radial-gradient blobs in Tokamak's gold accent palette on a dark base.
 * Blobs drift slowly (12-20s loop) with no pulse. No grid, no screen panels.
 *
 * Interface matches MathEnvironment exactly so VrmEngine (and re-exports) can
 * swap it as a drop-in replacement.
 *
 * Spec: docs/superpowers/specs/2026-04-24-companion-vrm-redesign-design.md §6.3
 */
import * as THREE from "three";
import { getSceneTokens, type SceneTokens } from "./scene-theme-tokens";

type AuroraBlob = {
  mesh: THREE.Mesh;
  initialPosition: THREE.Vector3;
  driftOffset: number;
  driftSpeed: number; // 1/period, smaller = slower
  driftRadius: number;
};

export class AuroraEnvironment {
  private group: THREE.Group | null = null;
  private blobs: AuroraBlob[] = [];
  private elapsed = 0;
  private currentTheme: "light" | "dark" = "light";
  private tokens: SceneTokens | null = null;

  public build(scene: THREE.Scene, theme: "light" | "dark"): void {
    this.currentTheme = theme;
    this.tokens = getSceneTokens();
    this.group = new THREE.Group();
    const opacity = theme === "dark" ? 0.18 : 0.05;
    const colors = [
      this.tokens.accent,
      this.tokens.accentDark,
      this.tokens.accentLight,
    ];
    const positions: [number, number, number][] = [
      [-2.4, 1.6, -3.5],
      [2.8, 0.4, -4.0],
      [0.0, -1.6, -3.2],
    ];
    const speeds = [1 / 18, 1 / 14, 1 / 20];
    const radii = [0.7, 0.9, 0.6];
    for (let i = 0; i < 3; i++) {
      const geom = new THREE.CircleGeometry(2.2, 48);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colors[i]),
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(...positions[i]);
      this.group.add(mesh);
      this.blobs.push({
        mesh,
        initialPosition: mesh.position.clone(),
        driftOffset: i * 2.1,
        driftSpeed: speeds[i],
        driftRadius: radii[i],
      });
    }
    scene.add(this.group);
  }

  public update(deltaTime: number, _camera: THREE.Camera): void {
    this.elapsed += deltaTime;
    for (const blob of this.blobs) {
      const phase =
        (this.elapsed + blob.driftOffset) * blob.driftSpeed * Math.PI * 2;
      blob.mesh.position.x =
        blob.initialPosition.x + Math.sin(phase) * blob.driftRadius;
      blob.mesh.position.y =
        blob.initialPosition.y +
        Math.cos(phase * 0.7) * blob.driftRadius * 0.5;
    }
  }

  public setTheme(theme: "light" | "dark"): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    const opacity = theme === "dark" ? 0.18 : 0.05;
    for (const blob of this.blobs) {
      const mat = blob.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;
    }
  }

  public dispose(): void {
    if (!this.group) return;
    for (const blob of this.blobs) {
      this.group.remove(blob.mesh);
      blob.mesh.geometry.dispose();
      (blob.mesh.material as THREE.Material).dispose();
    }
    this.blobs = [];
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group = null;
  }
}
