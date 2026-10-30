// C:\OOTDify\src\features\tryon\realistic\useRealisticSession.ts
// "Go realistic": a short, opt-in Decart Lucy VTON session. The camera is
// streamed over LiveKit/WebRTC and Decart redraws the person wearing the
// garment cut-out. Billed per second, so the session is strictly bounded.
//
// All phase and countdown logic lives in the pure realisticReducer
// (session.ts). This hook only wires effects to it:
//   - consent: the flag lives in AsyncStorage, like Scan's consent key;
//   - session: opens while sessionOpen(phase) and tears down when it stops
//     being open or the screen unmounts (see the SINGLE TEARDOWN below);
//   - countdown: a 1 s interval dispatches "tick" while live;
//   - lifecycle: leaving the foreground dispatches "background".
//
// The screen must make the VisionCamera inactive whenever
// releasesCamera(phase) is true, so LiveKit can open the camera.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RealTimeClient } from "@decartai/sdk";
import type { MediaStream } from "@livekit/react-native-webrtc";
import { File } from "expo-file-system";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AppState } from "react-native";

import { requestRealisticToken } from "../../../services/aiApi";
import {
  createDialGate,
  INITIAL_REALISTIC,
  isNotConfiguredError,
  realisticReducer,
  sessionOpen,
  type RealisticPhase,
} from "./session";
import { realtimeDeps } from "./webrtc";

export const REALISTIC_CONSENT_KEY = "ootdify.tryon.realistic.consent.v1";

/**
 * VisionCamera releases the device asynchronously after `isActive` turns
 * false; give it a moment before LiveKit asks for the same camera.
 */
const CAMERA_RELEASE_MS = 300;

/**
 * Bounded dialling: one re-dial on failure and at most 10 s of capacity
 * re-dials (SDK defaults are 5 and 60 s). Each dial mints a token, and tokens
 * count against the 15 sessions/hour cap.
 */
const CONNECT_RETRIES = 1;
const CAPACITY_RETRY_BUDGET_MS = 10_000;

/**
 * Module-wide, not per hook instance: a dial left over from a session on a
 * screen that has since unmounted must still finish before the next session
 * (even on a remounted screen) dials.
 */
const dialGate = createDialGate();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
  stream.release();
}

export interface RealisticSession {
  phase: RealisticPhase;
  secondsLeft: number;
  /** Decart's redrawn stream; non-null only while live. */
  remoteStream: MediaStream | null;
  start(): void;
  stop(): void;
  /** Accept the consent sheet (stores the flag) and start. */
  accept(): void;
  /** Close the consent sheet or an ended/failed message, back to the AR preview. */
  back(): void;
}

export function useRealisticSession(
  cutoutUri: string | null,
  facing: "front" | "back" = "front",
): RealisticSession {
  const [state, dispatch] = useReducer(realisticReducer, INITIAL_REALISTIC);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const open = sessionOpen(state.phase);

  // Latest props, read by the session effect once, when the session opens.
  // A prop change mid-session must not tear down and re-dial. (Written in an
  // effect and read only in effects: never during render.)
  const latest = useRef({ cutoutUri, facing });
  useEffect(() => {
    latest.current = { cutoutUri, facing };
  }, [cutoutUri, facing]);

  // --- Session -------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const { cutoutUri, facing } = latest.current;
    let closed = false;
    let stream: MediaStream | null = null;
    let client: RealTimeClient | null = null;

    // SINGLE TEARDOWN. Every exit path runs this: stop, reaching 0 and
    // background (the reducer leaves the open phases, so this effect cleans
    // up), an error (same), and unmount. It disconnects from Decart and stops
    // the local camera tracks. Anything still in flight checks `closed` and
    // releases what it gets; a connect() still dialling is disconnected by
    // dialGate when it resolves, and apiKeyProvider refuses further dials.
    const teardown = () => {
      closed = true;
      if (client) {
        try {
          client.disconnect();
        } catch (e) {
          console.warn("Realistic mode disconnect failed:", e);
        }
        client = null;
      }
      if (stream) {
        stopStream(stream);
        stream = null;
      }
    };

    const run = async () => {
      if (!cutoutUri) throw new Error("Garment cut-out is not ready.");
      // start() only opens a session when these loaded.
      const deps = realtimeDeps();
      if (!deps) throw new Error("WebRTC native module not found.");
      const { mediaDevices } = deps.webrtc;
      const { createDecartClient, isRealtimeModel, models, resolveFpsNumber } = deps.decart;
      // An earlier session's dial may still be in flight: let it settle (it is
      // disconnected if abandoned) before this session mints or dials anything.
      await dialGate.idle();
      if (closed) return;
      // First token up front: it names the model, and a 503 not_configured
      // fails here before the camera is ever opened.
      const first = await requestRealisticToken();
      if (closed) return;
      setRemoteStream(null); // drop a previous session's (released) stream
      if (!isRealtimeModel(first.model)) throw new Error(`Unknown realtime model: ${first.model}`);
      const model = models.realtime(first.model);
      // The SDK can't read file:// URIs; send the PNG bytes as base64.
      const image = await new File(cutoutUri).base64();
      if (closed) return;

      await wait(CAMERA_RELEASE_MS);
      if (closed) return;
      const local = await mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: facing === "front" ? "user" : "environment",
          frameRate: resolveFpsNumber(model.fps),
          width: model.width,
          height: model.height,
        },
      });
      if (closed) {
        stopStream(local);
        return;
      }
      stream = local;

      // A fresh token per dial: the first dial uses the one just minted,
      // any SDK reconnect asks the backend again.
      let unused: string | null = first.apiKey;
      const decart = createDecartClient({
        apiKeyProvider: async () => {
          // Stopped while dialling: refuse, so the SDK mints no more tokens.
          if (closed) throw new Error("cancelled");
          if (unused) {
            const key = unused;
            unused = null;
            return key;
          }
          return (await requestRealisticToken()).apiKey;
        },
      });
      const dial = decart.realtime.connect<MediaStream>(local, {
        model,
        preferredVideoCodec: "vp8",
        retries: CONNECT_RETRIES,
        capacityRetryBudgetMs: CAPACITY_RETRY_BUDGET_MS,
        initialState: { image },
        onRemoteStream: (remote) => {
          if (!closed) setRemoteStream(remote);
        },
      });
      // If teardown ran while dialling, the gate disconnects the late client.
      const rt = await dialGate.track(dial, (late) => late.disconnect(), () => closed);
      if (closed) return;
      client = rt;
      rt.on("error", (e) => {
        console.warn("Realistic mode error:", e.code);
        if (!closed) dispatch({ type: "error", notConfigured: false });
      });
      // Server-side end (no reconnect coming): end like "stop".
      rt.on("sessionEnded", () => {
        if (!closed) dispatch({ type: "stop" });
      });
      dispatch({ type: "connected", sessionSeconds: first.sessionSeconds });
    };

    run().catch((e: unknown) => {
      if (closed) return;
      const notConfigured = isNotConfiguredError(e);
      if (!notConfigured) console.warn("Realistic mode couldn't start:", e instanceof Error ? e.message : e);
      dispatch({ type: "error", notConfigured });
    });

    return teardown;
  }, [open]);

  // --- Countdown -----------------------------------------------------------
  const live = state.phase === "live";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(id);
  }, [live]);

  // --- Lifecycle: never stream from the background --------------------------
  useEffect(() => {
    if (!open) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") dispatch({ type: "background" });
    });
    return () => sub.remove();
  }, [open]);

  // Stable callbacks: the screen runs `stop` as a blur cleanup.
  const start = useCallback(() => {
    if (!realtimeDeps()) {
      dispatch({ type: "unsupported" });
      return;
    }
    AsyncStorage.getItem(REALISTIC_CONSENT_KEY)
      .then((v) => dispatch({ type: "start", consented: v === "true" }))
      .catch(() => dispatch({ type: "start", consented: false }));
  }, []);
  const accept = useCallback(() => {
    dispatch({ type: "consented" });
    AsyncStorage.setItem(REALISTIC_CONSENT_KEY, "true").catch((e: unknown) => {
      console.warn("Couldn't store realistic-mode consent:", e);
    });
  }, []);
  const stop = useCallback(() => dispatch({ type: "stop" }), []);
  const back = useCallback(() => dispatch({ type: "back" }), []);

  return {
    phase: state.phase,
    secondsLeft: state.secondsLeft,
    remoteStream: live ? remoteStream : null,
    start,
    stop,
    accept,
    back,
  };
}
