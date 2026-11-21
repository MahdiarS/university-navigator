"use client";
import { Component, type ReactNode } from "react";

/**
 * Error boundary around a whole 3D canvas. A failure inside three.js / WebGL must never take the page down:
 * the fallback keeps search and destination information usable. Technical details go to the console only.
 */
export class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("[3d] scene crashed:", error.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
