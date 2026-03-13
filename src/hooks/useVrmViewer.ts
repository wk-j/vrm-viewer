import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRM, VRMUtils } from "@pixiv/three-vrm";

export interface VrmViewerState {
  modelName: string | null;
  isLoading: boolean;
  error: string | null;
  hasModel: boolean;
}

export function useVrmViewer(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const animFrameRef = useRef<number>(0);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const [state, setState] = useState<VrmViewerState>({
    modelName: null,
    isLoading: false,
    error: null,
    hasModel: false,
  });

  // Initialize the 3D scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      35,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 1.2, 3);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.5;
    controls.maxDistance = 20;
    controls.update();
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 2, 3);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-1, 1, -2);
    scene.add(backLight);

    // Grid
    const grid = new THREE.GridHelper(10, 20, 0x444466, 0x333355);
    scene.add(grid);
    gridRef.current = grid;

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();

      if (vrmRef.current) {
        vrmRef.current.update(delta);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!canvas || !renderer || !camera) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas);
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, [canvasRef]);

  // Load VRM from file bytes
  const loadVrm = useCallback(
    async (fileBytes: Uint8Array, fileName: string) => {
      const scene = sceneRef.current;
      if (!scene) return;

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        // Remove existing VRM
        if (vrmRef.current) {
          VRMUtils.deepDispose(vrmRef.current.scene);
          scene.remove(vrmRef.current.scene);
          vrmRef.current = null;
        }

        // Create a blob URL from the bytes
        const blob = new Blob([fileBytes], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);

        // Load VRM
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });

        URL.revokeObjectURL(url);

        const vrm: VRM = gltf.userData.vrm;
        if (!vrm) {
          throw new Error("Failed to parse VRM data from file");
        }

        // Optimize and add to scene
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        VRMUtils.rotateVRM0(vrm);

        scene.add(vrm.scene);
        vrmRef.current = vrm;

        // Reset camera to frame the model
        if (cameraRef.current && controlsRef.current) {
          const box = new THREE.Box3().setFromObject(vrm.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const distance = maxDim * 1.8;

          cameraRef.current.position.set(
            center.x,
            center.y + size.y * 0.1,
            center.z + distance
          );
          controlsRef.current.target.copy(center);
          controlsRef.current.update();
        }

        const displayName = fileName.replace(/\.vrm$/i, "");
        setState({
          modelName: displayName,
          isLoading: false,
          error: null,
          hasModel: true,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load VRM";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        console.error("VRM load error:", err);
      }
    },
    []
  );

  // Reset camera
  const resetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;

    if (vrmRef.current) {
      const box = new THREE.Box3().setFromObject(vrmRef.current.scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 1.8;

      cameraRef.current.position.set(
        center.x,
        center.y + size.y * 0.1,
        center.z + distance
      );
      controlsRef.current.target.copy(center);
    } else {
      cameraRef.current.position.set(0, 1.2, 3);
      controlsRef.current.target.set(0, 0.9, 0);
    }
    controlsRef.current.update();
  }, []);

  // Toggle grid visibility
  const toggleGrid = useCallback(() => {
    if (gridRef.current) {
      gridRef.current.visible = !gridRef.current.visible;
    }
  }, []);

  // Set background color
  const setBackground = useCallback((color: string) => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(color);
    }
  }, []);

  return {
    state,
    loadVrm,
    resetCamera,
    toggleGrid,
    setBackground,
  };
}
