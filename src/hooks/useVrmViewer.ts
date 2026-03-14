import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import { VRMLoaderPlugin, VRM, VRMUtils } from "@pixiv/three-vrm";
import {
  VRMAnimationLoaderPlugin,
  VRMAnimation,
  createVRMAnimationClip,
} from "@pixiv/three-vrm-animation";

// Standard VRM expression preset names
export const VRM_EXPRESSION_PRESETS = [
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "blink",
  "blinkLeft",
  "blinkRight",
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "neutral",
] as const;

export type ExpressionName = (typeof VRM_EXPRESSION_PRESETS)[number] | string;

export interface AnimationClipInfo {
  name: string;
  duration: number;
  clip: THREE.AnimationClip;
}

export interface AnimationState {
  clips: AnimationClipInfo[];
  currentClip: string | null;
  isPlaying: boolean;
  speed: number;
  loop: boolean;
}

export interface IdleAnimationState {
  enabled: boolean;
  breathing: boolean;
  blinking: boolean;
}

export interface VrmViewerState {
  modelName: string | null;
  isLoading: boolean;
  error: string | null;
  hasModel: boolean;
  availableExpressions: string[];
  animation: AnimationState;
  idle: IdleAnimationState;
}

export function useVrmViewer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const animFrameRef = useRef<number>(0);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  // Animation refs
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const clipsRef = useRef<AnimationClipInfo[]>([]);

  // Idle animation refs
  const idleStateRef = useRef<IdleAnimationState>({
    enabled: true,
    breathing: true,
    blinking: true,
  });
  const blinkTimerRef = useRef(0);
  const nextBlinkRef = useRef(2 + Math.random() * 4);

  // Expression overrides (manual slider values)
  const expressionOverridesRef = useRef<Record<string, number>>({});

  const [state, setState] = useState<VrmViewerState>({
    modelName: null,
    isLoading: false,
    error: null,
    hasModel: false,
    availableExpressions: [],
    animation: {
      clips: [],
      currentClip: null,
      isPlaying: false,
      speed: 1.0,
      loop: true,
    },
    idle: {
      enabled: true,
      breathing: true,
      blinking: true,
    },
  });

  // --- Idle animation logic ---
  const updateIdleAnimation = useCallback((delta: number, elapsed: number) => {
    const vrm = vrmRef.current;
    const idle = idleStateRef.current;
    if (!vrm || !idle.enabled) return;

    // Breathing: subtle chest bone movement
    if (idle.breathing && vrm.humanoid) {
      const chest = vrm.humanoid.getRawBoneNode("chest");
      if (chest) {
        const breathe = Math.sin(elapsed * 1.5) * 0.008;
        chest.rotation.x = breathe;
      }
    }

    // Blinking
    if (idle.blinking && vrm.expressionManager) {
      blinkTimerRef.current += delta;

      if (blinkTimerRef.current >= nextBlinkRef.current) {
        // Start blink cycle
        const blinkProgress = blinkTimerRef.current - nextBlinkRef.current;
        const blinkDuration = 0.15; // seconds for full blink
        const halfBlink = blinkDuration / 2;

        let blinkValue = 0;
        if (blinkProgress < halfBlink) {
          // Closing
          blinkValue = blinkProgress / halfBlink;
        } else if (blinkProgress < blinkDuration) {
          // Opening
          blinkValue = 1 - (blinkProgress - halfBlink) / halfBlink;
        } else {
          // Blink finished, reset timer
          blinkTimerRef.current = 0;
          nextBlinkRef.current = 2 + Math.random() * 4;
          blinkValue = 0;
        }

        // Only set blink if not manually overridden
        if (expressionOverridesRef.current["blink"] === undefined) {
          vrm.expressionManager.setValue("blink", blinkValue);
        }
      }
    }
  }, []);

  // Initialize the 3D scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      35,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 1.2, 3);
    cameraRef.current = camera;

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

    const grid = new THREE.GridHelper(10, 20, 0x444466, 0x333355);
    scene.add(grid);
    gridRef.current = grid;

    let elapsed = 0;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();
      elapsed += delta;

      // Update animation mixer
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      // Update idle animations
      updateIdleAnimation(delta, elapsed);

      // Update VRM
      if (vrmRef.current) {
        vrmRef.current.update(delta);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

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
  }, [canvasRef, updateIdleAnimation]);

  // --- Detect available expressions on a VRM ---
  const detectExpressions = useCallback((vrm: VRM): string[] => {
    const expressions: string[] = [];
    if (!vrm.expressionManager) return expressions;

    for (const preset of VRM_EXPRESSION_PRESETS) {
      const expr = vrm.expressionManager.getExpression(preset);
      if (expr) {
        expressions.push(preset);
      }
    }

    // Also check for custom expressions
    // The expressionManager has a private _expressionMap but we can iterate known customs
    // For now, just return presets that exist
    return expressions;
  }, []);

  // --- Load VRM from file bytes ---
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
        // Clean up existing
        if (currentActionRef.current) {
          currentActionRef.current.stop();
          currentActionRef.current = null;
        }
        if (mixerRef.current) {
          mixerRef.current.stopAllAction();
          mixerRef.current = null;
        }
        clipsRef.current = [];
        expressionOverridesRef.current = {};

        if (vrmRef.current) {
          VRMUtils.deepDispose(vrmRef.current.scene);
          scene.remove(vrmRef.current.scene);
          vrmRef.current = null;
        }

        const blob = new Blob([fileBytes], {
          type: "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);

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

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        VRMUtils.rotateVRM0(vrm);

        scene.add(vrm.scene);
        vrm.scene.updateMatrixWorld(true);
        vrmRef.current = vrm;

        // Create animation mixer on the normalized humanoid rig root.
        // The normalized bones are in a separate hierarchy from vrm.scene,
        // so the mixer must target that root to find bones by name.
        const mixerRoot = vrm.humanoid?.normalizedHumanBonesRoot ?? vrm.scene;
        // The normalized rig is a detached hierarchy — update its world matrices
        mixerRoot.updateMatrixWorld(true);
        mixerRef.current = new THREE.AnimationMixer(mixerRoot);

        // Detect expressions
        const expressions = detectExpressions(vrm);

        // Frame the model
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
          availableExpressions: expressions,
          animation: {
            clips: [],
            currentClip: null,
            isPlaying: false,
            speed: 1.0,
            loop: true,
          },
          idle: {
            enabled: true,
            breathing: true,
            blinking: true,
          },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load VRM";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        console.error("VRM load error:", err);
      }
    },
    [detectExpressions]
  );

  // --- Load animation from file bytes ---
  const loadAnimation = useCallback(
    async (fileBytes: Uint8Array, fileName: string) => {
      const vrm = vrmRef.current;
      const mixer = mixerRef.current;
      if (!vrm || !mixer) {
        setState((prev) => ({
          ...prev,
          error: "Load a VRM model first before loading animations",
        }));
        return;
      }

      try {
        const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
        const blob = new Blob([fileBytes], {
          type: "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);
        let newClips: THREE.AnimationClip[] = [];

        if (ext === "vrma") {
          // Load .vrma using VRMAnimationLoaderPlugin
          const loader = new GLTFLoader();
          loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

          const gltf = await new Promise<any>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });

          const vrmAnimations: VRMAnimation[] =
            gltf.userData.vrmAnimations ?? [];
          for (const vrmAnim of vrmAnimations) {
            const clip = createVRMAnimationClip(vrmAnim, vrm);
            clip.name =
              clip.name || fileName.replace(/\.[^.]+$/, "") + `_${newClips.length}`;
            newClips.push(clip);
          }

          if (newClips.length === 0) {
            throw new Error("No VRM animations found in file");
          }
        } else if (ext === "fbx") {
          // Load FBX animations (typically Mixamo)
          const loader = new FBXLoader();
          const fbx = await new Promise<THREE.Group>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });

          // Ensure world matrices are computed for rest pose capture
          fbx.updateMatrixWorld(true);

          if (fbx.animations.length === 0) {
            throw new Error("No animations found in FBX file");
          }

          // Log FBX bone names for debugging
          const fbxBoneNames: string[] = [];
          fbx.traverse((obj) => {
            if ((obj as any).isBone) fbxBoneNames.push(obj.name);
          });
          console.log("FBX bones found:", fbxBoneNames);
          console.log("FBX animation clips:", fbx.animations.length);
          for (const clip of fbx.animations) {
            console.log(`  Clip "${clip.name}": ${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s`);
            // Log first few track names to see naming convention
            for (let i = 0; i < Math.min(5, clip.tracks.length); i++) {
              console.log(`    Track: ${clip.tracks[i].name}`);
            }
          }

          // Log VRM bone node names for debugging
          if (vrm.humanoid) {
            const normHips = vrm.humanoid.getNormalizedBoneNode("hips" as any);
            const rawHips = vrm.humanoid.getRawBoneNode("hips" as any);
            console.log("VRM normalized hips node name:", normHips?.name);
            console.log("VRM raw hips node name:", rawHips?.name);
          }

          // Retarget each animation clip from Mixamo to VRM skeleton
          for (const clip of fbx.animations) {
            const retargetedClip = retargetClipToVRM(clip, fbx, vrm);
            if (retargetedClip) {
              retargetedClip.name =
                clip.name || fileName.replace(/\.[^.]+$/, "");
              console.log(`Retargeted "${retargetedClip.name}": ${retargetedClip.tracks.length} tracks`);
              // Log first few retargeted track names
              for (let i = 0; i < Math.min(5, retargetedClip.tracks.length); i++) {
                console.log(`  -> ${retargetedClip.tracks[i].name}`);
              }
              newClips.push(retargetedClip);
            } else {
              console.warn("retargetClipToVRM returned null for clip:", clip.name);
            }
          }

          if (newClips.length === 0) {
            throw new Error(
              "Could not retarget FBX animation to VRM. " +
              "Make sure the FBX uses Mixamo bone naming (mixamorigHips, etc.)"
            );
          }
        } else if (ext === "bvh") {
          // Load BVH
          const loader = new BVHLoader();
          const text = new TextDecoder().decode(fileBytes);
          const result = loader.parse(text);
          if (result.clip) {
            result.clip.name = fileName.replace(/\.[^.]+$/, "");
            newClips.push(result.clip);
          }
        } else if (ext === "glb" || ext === "gltf") {
          // Load GLB/GLTF - check for VRM animations first, then raw clips
          const loader = new GLTFLoader();
          loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

          const gltf = await new Promise<any>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });

          // Try VRM animation data first
          const vrmAnimations: VRMAnimation[] =
            gltf.userData.vrmAnimations ?? [];
          for (const vrmAnim of vrmAnimations) {
            const clip = createVRMAnimationClip(vrmAnim, vrm);
            clip.name =
              clip.name || fileName.replace(/\.[^.]+$/, "") + `_${newClips.length}`;
            newClips.push(clip);
          }

          // If no VRM animations, use raw GLTF animations
          if (newClips.length === 0 && gltf.animations?.length > 0) {
            for (const clip of gltf.animations) {
              clip.name = clip.name || fileName.replace(/\.[^.]+$/, "");
              newClips.push(clip);
            }
          }
        } else {
          throw new Error(`Unsupported animation format: .${ext}`);
        }

        URL.revokeObjectURL(url);

        // Add clips to our list
        const clipInfos: AnimationClipInfo[] = newClips.map((clip) => ({
          name: clip.name,
          duration: clip.duration,
          clip,
        }));

        clipsRef.current = [...clipsRef.current, ...clipInfos];

        // Auto-play the first loaded clip
        if (clipInfos.length > 0 && mixer) {
          const firstClip = clipInfos[0];
          if (currentActionRef.current) {
            currentActionRef.current.fadeOut(0.3);
          }
          const action = mixer.clipAction(firstClip.clip);
          action.reset();
          action.fadeIn(0.3);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
          currentActionRef.current = action;

          setState((prev) => ({
            ...prev,
            error: null,
            animation: {
              ...prev.animation,
              clips: clipsRef.current,
              currentClip: firstClip.name,
              isPlaying: true,
            },
          }));
        } else {
          setState((prev) => ({
            ...prev,
            error: null,
            animation: {
              ...prev.animation,
              clips: clipsRef.current,
            },
          }));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load animation";
        setState((prev) => ({
          ...prev,
          error: message,
        }));
        console.error("Animation load error:", err);
      }
    },
    []
  );

  // --- Mixamo bone name mapping ---
  const MIXAMO_TO_VRM_BONE: Record<string, string> = {
    "mixamorigHips": "hips",
    "mixamorigSpine": "spine",
    "mixamorigSpine1": "chest",
    "mixamorigSpine2": "upperChest",
    "mixamorigNeck": "neck",
    "mixamorigHead": "head",
    "mixamorigLeftShoulder": "leftShoulder",
    "mixamorigLeftArm": "leftUpperArm",
    "mixamorigLeftForeArm": "leftLowerArm",
    "mixamorigLeftHand": "leftHand",
    "mixamorigRightShoulder": "rightShoulder",
    "mixamorigRightArm": "rightUpperArm",
    "mixamorigRightForeArm": "rightLowerArm",
    "mixamorigRightHand": "rightHand",
    "mixamorigLeftUpLeg": "leftUpperLeg",
    "mixamorigLeftLeg": "leftLowerLeg",
    "mixamorigLeftFoot": "leftFoot",
    "mixamorigLeftToeBase": "leftToes",
    "mixamorigRightUpLeg": "rightUpperLeg",
    "mixamorigRightLeg": "rightLowerLeg",
    "mixamorigRightFoot": "rightFoot",
    "mixamorigRightToeBase": "rightToes",
    // Finger bones (Mixamo)
    "mixamorigLeftHandThumb1": "leftThumbMetacarpal",
    "mixamorigLeftHandThumb2": "leftThumbProximal",
    "mixamorigLeftHandThumb3": "leftThumbDistal",
    "mixamorigLeftHandIndex1": "leftIndexProximal",
    "mixamorigLeftHandIndex2": "leftIndexIntermediate",
    "mixamorigLeftHandIndex3": "leftIndexDistal",
    "mixamorigLeftHandMiddle1": "leftMiddleProximal",
    "mixamorigLeftHandMiddle2": "leftMiddleIntermediate",
    "mixamorigLeftHandMiddle3": "leftMiddleDistal",
    "mixamorigLeftHandRing1": "leftRingProximal",
    "mixamorigLeftHandRing2": "leftRingIntermediate",
    "mixamorigLeftHandRing3": "leftRingDistal",
    "mixamorigLeftHandPinky1": "leftLittleProximal",
    "mixamorigLeftHandPinky2": "leftLittleIntermediate",
    "mixamorigLeftHandPinky3": "leftLittleDistal",
    "mixamorigRightHandThumb1": "rightThumbMetacarpal",
    "mixamorigRightHandThumb2": "rightThumbProximal",
    "mixamorigRightHandThumb3": "rightThumbDistal",
    "mixamorigRightHandIndex1": "rightIndexProximal",
    "mixamorigRightHandIndex2": "rightIndexIntermediate",
    "mixamorigRightHandIndex3": "rightIndexDistal",
    "mixamorigRightHandMiddle1": "rightMiddleProximal",
    "mixamorigRightHandMiddle2": "rightMiddleIntermediate",
    "mixamorigRightHandMiddle3": "rightMiddleDistal",
    "mixamorigRightHandRing1": "rightRingProximal",
    "mixamorigRightHandRing2": "rightRingIntermediate",
    "mixamorigRightHandRing3": "rightRingDistal",
    "mixamorigRightHandPinky1": "rightLittleProximal",
    "mixamorigRightHandPinky2": "rightLittleIntermediate",
    "mixamorigRightHandPinky3": "rightLittleDistal",
  };

  // --- FBX retargeting helper ---
  // Retargets Mixamo FBX animations to VRM normalized bones.
  //
  // VRM normalized bones have identity rest rotations by design.
  // The motion delta from the Mixamo rest pose IS the final normalized rotation:
  //   vrmNormalizedLocal = inverse(fbxLocalRest) * fbxLocalAnim
  //
  // This works because both Mixamo and VRM normalized skeletons use a
  // standardized T-pose with consistent bone axes (Y-up, forward-facing).
  function retargetClipToVRM(
    clip: THREE.AnimationClip,
    fbxRoot: THREE.Group,
    vrm: VRM
  ): THREE.AnimationClip | null {
    if (!vrm.humanoid) return null;

    // Build FBX bone name -> Object3D map
    const fbxBoneMap = new Map<string, THREE.Object3D>();
    fbxRoot.traverse((obj) => {
      if (obj.name) {
        fbxBoneMap.set(obj.name, obj);
      }
    });

    // For each mapped bone, capture the FBX rest quaternion and VRM normalized node
    interface BoneMapping {
      fbxRestInv: THREE.Quaternion;
      vrmNode: THREE.Object3D;
    }

    const boneMappings = new Map<string, BoneMapping>();

    for (const [mixamoName, humanBone] of Object.entries(MIXAMO_TO_VRM_BONE)) {
      const fbxBone = fbxBoneMap.get(mixamoName);
      const vrmNode = vrm.humanoid.getNormalizedBoneNode(humanBone as any);
      if (!fbxBone || !vrmNode) continue;

      boneMappings.set(mixamoName, {
        fbxRestInv: fbxBone.quaternion.clone().invert(),
        vrmNode,
      });
    }

    // Compute scale factor for hips position tracks
    let hipsScaleFactor = 1;
    const fbxHips = fbxBoneMap.get("mixamorigHips");
    const rawHips = vrm.humanoid.getRawBoneNode("hips" as any);
    if (fbxHips && rawHips) {
      const fbxHipsY = new THREE.Vector3().setFromMatrixPosition(
        fbxHips.matrixWorld
      ).y;
      const vrmHipsY = new THREE.Vector3().setFromMatrixPosition(
        rawHips.matrixWorld
      ).y;
      if (fbxHipsY > 0.001) {
        hipsScaleFactor = vrmHipsY / fbxHipsY;
      }
    }

    const retargetedTracks: THREE.KeyframeTrack[] = [];

    for (const track of clip.tracks) {
      const dotIdx = track.name.indexOf(".");
      if (dotIdx < 0) continue;

      let fbxBoneName = track.name.substring(0, dotIdx);
      const property = track.name.substring(dotIdx + 1);

      // Strip armature prefix (e.g. "Armature|mixamorigHips")
      const pipeIdx = fbxBoneName.lastIndexOf("|");
      if (pipeIdx >= 0) {
        fbxBoneName = fbxBoneName.substring(pipeIdx + 1);
      }

      const mapping = boneMappings.get(fbxBoneName);
      if (!mapping) continue;

      if (property === "quaternion") {
        const { fbxRestInv, vrmNode } = mapping;

        const values = new Float32Array(track.values.length);
        const animQ = new THREE.Quaternion();

        for (let i = 0; i < track.values.length; i += 4) {
          animQ.set(
            track.values[i],
            track.values[i + 1],
            track.values[i + 2],
            track.values[i + 3]
          );

          // Motion delta = inverse(fbxRest) * fbxAnim
          // Since VRM normalized rest is identity, this IS the final rotation
          animQ.premultiply(fbxRestInv);

          values[i] = animQ.x;
          values[i + 1] = animQ.y;
          values[i + 2] = animQ.z;
          values[i + 3] = animQ.w;
        }

        retargetedTracks.push(
          new THREE.QuaternionKeyframeTrack(
            vrmNode.name + ".quaternion",
            Array.from(track.times),
            Array.from(values)
          )
        );
      } else if (property === "position") {
        // Position tracks: keep for hips only, scale to match VRM size
        const vrmHumanBoneName = MIXAMO_TO_VRM_BONE[fbxBoneName];
        if (vrmHumanBoneName === "hips") {
          const values = new Float32Array(track.values.length);
          for (let i = 0; i < track.values.length; i += 3) {
            values[i] = track.values[i] * hipsScaleFactor;
            values[i + 1] = track.values[i + 1] * hipsScaleFactor;
            values[i + 2] = track.values[i + 2] * hipsScaleFactor;
          }

          retargetedTracks.push(
            new THREE.VectorKeyframeTrack(
              mapping.vrmNode.name + ".position",
              Array.from(track.times),
              Array.from(values)
            )
          );
        }
      }
      // Skip scale tracks
    }

    if (retargetedTracks.length === 0) return null;

    return new THREE.AnimationClip(clip.name, clip.duration, retargetedTracks);
  }

  // --- Playback controls ---
  const playClip = useCallback((clipName: string) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const info = clipsRef.current.find((c) => c.name === clipName);
    if (!info) return;

    // Stop current
    if (currentActionRef.current) {
      currentActionRef.current.fadeOut(0.3);
    }

    const action = mixer.clipAction(info.clip);
    action.reset();
    action.fadeIn(0.3);

    setState((prev) => {
      const loop = prev.animation.loop;
      action.setLoop(
        loop ? THREE.LoopRepeat : THREE.LoopOnce,
        loop ? Infinity : 1
      );
      action.clampWhenFinished = !loop;
      action.timeScale = prev.animation.speed;
      return {
        ...prev,
        animation: {
          ...prev.animation,
          currentClip: clipName,
          isPlaying: true,
        },
      };
    });

    action.play();
    currentActionRef.current = action;
  }, []);

  const togglePlayPause = useCallback(() => {
    const action = currentActionRef.current;
    if (!action) return;

    setState((prev) => {
      const newPlaying = !prev.animation.isPlaying;
      action.paused = !newPlaying;
      return {
        ...prev,
        animation: { ...prev.animation, isPlaying: newPlaying },
      };
    });
  }, []);

  const stopAnimation = useCallback(() => {
    const action = currentActionRef.current;
    if (action) {
      action.stop();
    }
    currentActionRef.current = null;
    setState((prev) => ({
      ...prev,
      animation: {
        ...prev.animation,
        currentClip: null,
        isPlaying: false,
      },
    }));
  }, []);

  const setAnimationSpeed = useCallback((speed: number) => {
    if (currentActionRef.current) {
      currentActionRef.current.timeScale = speed;
    }
    setState((prev) => ({
      ...prev,
      animation: { ...prev.animation, speed },
    }));
  }, []);

  const setAnimationLoop = useCallback((loop: boolean) => {
    if (currentActionRef.current) {
      currentActionRef.current.setLoop(
        loop ? THREE.LoopRepeat : THREE.LoopOnce,
        loop ? Infinity : 1
      );
      currentActionRef.current.clampWhenFinished = !loop;
    }
    setState((prev) => ({
      ...prev,
      animation: { ...prev.animation, loop },
    }));
  }, []);

  const removeClip = useCallback((clipName: string) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    // If it's currently playing, stop first
    const info = clipsRef.current.find((c) => c.name === clipName);
    if (info) {
      const action = mixer.existingAction(info.clip);
      if (action) {
        action.stop();
        mixer.uncacheAction(info.clip);
        mixer.uncacheClip(info.clip);
      }
    }

    clipsRef.current = clipsRef.current.filter((c) => c.name !== clipName);

    setState((prev) => ({
      ...prev,
      animation: {
        ...prev.animation,
        clips: clipsRef.current,
        currentClip:
          prev.animation.currentClip === clipName
            ? null
            : prev.animation.currentClip,
        isPlaying:
          prev.animation.currentClip === clipName
            ? false
            : prev.animation.isPlaying,
      },
    }));

    if (currentActionRef.current) {
      // Check if the stopped action was the current one
      const wasPlaying = info?.clip === currentActionRef.current.getClip();
      if (wasPlaying) {
        currentActionRef.current = null;
      }
    }
  }, []);

  // --- Expression controls ---
  const setExpression = useCallback((name: string, value: number) => {
    const vrm = vrmRef.current;
    if (!vrm?.expressionManager) return;

    if (value > 0) {
      expressionOverridesRef.current[name] = value;
    } else {
      delete expressionOverridesRef.current[name];
    }

    vrm.expressionManager.setValue(name, value);
  }, []);

  const resetExpressions = useCallback(() => {
    const vrm = vrmRef.current;
    if (!vrm?.expressionManager) return;

    for (const name of Object.keys(expressionOverridesRef.current)) {
      vrm.expressionManager.setValue(name, 0);
    }
    expressionOverridesRef.current = {};
  }, []);

  // --- Idle animation controls ---
  const setIdleEnabled = useCallback((enabled: boolean) => {
    idleStateRef.current.enabled = enabled;
    setState((prev) => ({
      ...prev,
      idle: { ...prev.idle, enabled },
    }));
  }, []);

  const setIdleBreathing = useCallback((breathing: boolean) => {
    idleStateRef.current.breathing = breathing;
    // Reset chest rotation if disabling
    if (!breathing && vrmRef.current?.humanoid) {
      const chest = vrmRef.current.humanoid.getRawBoneNode("chest");
      if (chest) chest.rotation.x = 0;
    }
    setState((prev) => ({
      ...prev,
      idle: { ...prev.idle, breathing },
    }));
  }, []);

  const setIdleBlinking = useCallback((blinking: boolean) => {
    idleStateRef.current.blinking = blinking;
    if (!blinking && vrmRef.current?.expressionManager) {
      vrmRef.current.expressionManager.setValue("blink", 0);
    }
    setState((prev) => ({
      ...prev,
      idle: { ...prev.idle, blinking },
    }));
  }, []);

  // --- Camera / scene controls ---
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

  const toggleGrid = useCallback(() => {
    if (gridRef.current) {
      gridRef.current.visible = !gridRef.current.visible;
    }
  }, []);

  const setBackground = useCallback((color: string) => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(color);
    }
  }, []);

  return {
    state,
    loadVrm,
    loadAnimation,
    playClip,
    togglePlayPause,
    stopAnimation,
    setAnimationSpeed,
    setAnimationLoop,
    removeClip,
    setExpression,
    resetExpressions,
    setIdleEnabled,
    setIdleBreathing,
    setIdleBlinking,
    resetCamera,
    toggleGrid,
    setBackground,
  };
}
