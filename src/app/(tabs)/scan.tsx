// C:\OOTDify\src\app\(tabs)\scan.tsx
// Scan: body photo capture + AI body analysis + virtual try-on.
//
// REAL data only: photos upload to Flask (/api/body-photos → YOLO pose +
// segmentation), try-on runs through the job pipeline (/api/tryon) and the
// result image lives in the private `tryons` bucket. There is no mock path —
// a try-on job fails honestly ("model not configured") until a real VTON
// model is plugged into the backend.
//
// PRIVACY: camera permission is requested ONLY when the user taps "Scan Me",
// after the consent sheet's context copy. The consent toggle must be switched
// on explicitly — it is not pre-checked.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import { fetchCatalog, insertSavedOutfit } from "../../features/clothing/service";
import { CatalogItem } from "../../features/clothing/types";
import { useTryOnSelection } from "../../features/tryon/selectionStore";
import { useWardrobeStore } from "../../features/wardrobe/store";
import {
  BodyPhotoWithUrl,
  createTryOnJob,
  deleteBodyPhoto,
  deleteTryOnJob,
  listBodyPhotos,
  listTryOnJobs,
  retryTryOnJob,
  TryOnJob,
  uploadBodyPhoto,
} from "../../services/aiApi";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { SkeletonBlock } from "../../shared/components/Skeleton";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";
import { toast } from "../../shared/lib/toast";
import { useResponsiveColumns } from "../../shared/hooks/useResponsiveColumns";

const CONSENT_KEY = "ootdify.tryon.consent.v1";

type CameraMode = "idle" | "camera" | "preview";

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t, tl } = useT();
  const { itemWidth, onLayout } = useResponsiveColumns(110, 12);

  // Camera view ref (component instance exposes takePictureAsync).
  const cameraRef = useRef<CameraView | null>(null);

  // --- Consent gate (explicit opt-in, persisted on-device only) -----------
  const [consentLoaded, setConsentLoaded] = useState(false);
  const [consented, setConsented] = useState(false);
  const [agree, setAgree] = useState(false);

  // --- Camera / capture ----------------------------------------------------
  const [cameraMode, setCameraMode] = useState<CameraMode>("idle");
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [perm, requestPerm] = useCameraPermissions();

  // --- Body photos ----------------------------------------------------------
  const [bodyPhotos, setBodyPhotos] = useState<BodyPhotoWithUrl[]>([]);
  // Start as loading: the sections only render behind the consent gate, so the
  // first visible frame after consent shows the skeleton, not an empty list.
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<{
    detected: boolean;
    confidence: number | null;
  } | null>(null);

  // --- Try-on -----------------------------------------------------------------
  const [clothingSource, setClothingSource] = useState<"catalog" | "closet">("catalog");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const closetItems = useWardrobeStore((s) => s.items);
  const [selectedClothing, setSelectedClothing] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<TryOnJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const openCapture = useCaptureModalStore((s) => s.open);

  // Cross-tab preselection ("Use in try-on" from Discover/Home). Consumed
  // ONCE on mount via effect — never in render (useRef initializers re-run on
  // every render, which would mutate the store and discard the selection).
  const preselected = useRef<{
    clothingId: string | null;
    clothingSource: "catalog" | "item" | null;
    bodyPhotoId: string | null;
  } | null>(null);

  useEffect(() => {
    preselected.current = useTryOnSelection.getState().consume();
  }, []);

  // ---------------------------------------------------------------------------
  // Consent
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CONSENT_KEY)
      .then((v) => {
        if (alive) setConsented(v === "true");
      })
      .catch(() => {
        if (alive) setConsented(false);
      })
      .finally(() => {
        if (alive) setConsentLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Data loading
  //
  // Two layers per resource: the *core* loaders never setState before their
  // awaits, so effects can kick them off safely; the refresh* wrappers show the
  // spinner / clear the error and are called from user actions only.
  // No manual useCallback here — the React Compiler memoizes these instead
  // (it cannot preserve the hand-written memoization this component used to
  // declare, which is why the whole component previously went uncompiled).
  // ---------------------------------------------------------------------------
  const loadBodyPhotos = useCallback(async () => {
    try {
      const photos = await listBodyPhotos();
      setBodyPhotos(photos);
      setSelectedBodyId((prev) =>
        prev && photos.some((p) => p.id === prev)
          ? prev
          : photos[0]?.id ?? null,
      );
    } catch (e) {
      setPhotosError(e instanceof Error ? e.message : "Could not load body photos.");
    } finally {
      setPhotosLoading(false);
    }
  }, []);

  const refreshBodyPhotos = async () => {
    setPhotosLoading(true);
    setPhotosError(null);
    await loadBodyPhotos();
  };

  const loadTryOnJobs = useCallback(async () => {
    try {
      const rows = await listTryOnJobs();
      setJobs(rows);
      setJobsError(null);
    } catch (e) {
      setJobsError(e instanceof Error ? e.message : "Could not load try-on jobs.");
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const refreshJobs = async () => {
    setJobsLoading(true);
    await loadTryOnJobs();
  };

  const acceptConsent = async () => {
    // The handler kicks the loads itself (below), so the consent effect below
    // must not double-fetch when `consented` flips to true.
    initialLoadsStarted.current = true;
    setConsented(true);
    try {
      await AsyncStorage.setItem(CONSENT_KEY, "true");
    } catch {
      /* in-memory consent is fine for this session */
    }
    void refreshBodyPhotos();
    void refreshJobs();
  };

  // Initial loads: consent is either freshly accepted (acceptConsent above) or
  // restored from storage — both transitions land here. Single-flight so repeat
  // effect runs never double-fetch.
  const initialLoadsStarted = useRef(false);
  useEffect(() => {
    if (!consented || initialLoadsStarted.current) return;
    initialLoadsStarted.current = true;
    // Microtask kick-off: no setState runs synchronously within the effect body.
    Promise.resolve()
      .then(() => Promise.all([loadBodyPhotos(), loadTryOnJobs()]))
      .catch(() => {});
  }, [consented, loadBodyPhotos, loadTryOnJobs]);

  // Load catalog for the try-on garment picker.
  useEffect(() => {
    if (!consented) return;
    let alive = true;
    fetchCatalog({ limit: 40 })
      .then((rows) => {
        if (alive) setCatalogItems(rows);
      })
      .catch(() => {
        if (alive) setCatalogItems([]);
      });
    return () => {
      alive = false;
    };
  }, [consented]);

  // Apply cross-tab preselection once data is available (through a microtask:
  // setState outside the synchronous effect body).
  useEffect(() => {
    if (!consented || !preselected.current) return;
    const sel = preselected.current;
    preselected.current = null;
    Promise.resolve().then(() => {
      if (sel.bodyPhotoId) setSelectedBodyId(sel.bodyPhotoId);
      if (sel.clothingId) {
        setClothingSource(sel.clothingSource === "item" ? "closet" : "catalog");
        setSelectedClothing(new Set([sel.clothingId]));
      }
    });
  }, [consented, catalogItems, closetItems, bodyPhotos]);

  // Poll until the tab has no active jobs. The interval callback is an
  // external-system subscription; it calls the core loader, which never
  // setState synchronously (and keeps the jobs skeleton from flashing).
  useEffect(() => {
    if (!consented) return;
    const tick = () => {
      const hasActive = jobs.some(
        (j) => j.status === "uploading" || j.status === "queued" || j.status === "processing",
      );
      if (hasActive) void loadTryOnJobs();
    };
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [consented, jobs, loadTryOnJobs]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const startCapture = async () => {
    if (!perm?.granted) {
      const res = await requestPerm();
      if (!res.granted) {
        Alert.alert(
          t("scan.permission.title"),
          t("scan.permission.message"),
        );
        return;
      }
    }
    setCameraMode("camera");
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets?.length) {
      setCapturedUri(result.assets[0].uri);
      setCameraMode("preview");
    }
  };

  const analyzeAndSave = async () => {
    if (!capturedUri) return;
    setUploading(true);
    try {
      const { body_photo, analysis, signedUrl } = await uploadBodyPhoto(capturedUri);
      const photo: BodyPhotoWithUrl = {
        ...body_photo,
        signedUrl,
      };
      setBodyPhotos((prev) => [photo, ...prev]);
      setSelectedBodyId(photo.id);
      setLastAnalysis({
        detected: analysis?.personDetected ?? false,
        confidence: analysis?.personConfidence ?? null,
      });
      setCameraMode("idle");
      setCapturedUri(null);
    } catch (e) {
      Alert.alert(
        t("scan.error.scan_failed.title"),
        e instanceof Error ? e.message : t("scan.error.scan_failed.message"),
      );
      // Keep the preview so the user can retry or cancel.
    } finally {
      setUploading(false);
    }
  };

  const removeBodyPhoto = async (id: string) => {
    Alert.alert(
      t("scan.delete_photo.title"),
      t("scan.delete_photo.message"),
      [
        { text: t("scan.camera.cancel"), style: "cancel" },
        {
          text: t("scan.jobs.delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteBodyPhoto(id);
                setBodyPhotos((prev) => prev.filter((p) => p.id !== id));
                if (selectedBodyId === id) setSelectedBodyId(null);
              } catch (e) {
                Alert.alert(
                  t("scan.error.delete_photo_failed.title"),
                  e instanceof Error ? e.message : t("scan.error.delete_photo_failed.message"),
                );
              }
            })();
          },
        },
      ],
    );
  };

  const toggleClothing = (id: string) => {
    setSelectedClothing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startTryOn = async () => {
    setRunError(null);
    if (!selectedBodyId) {
      setRunError(t("scan.error.need_body_photo"));
      return;
    }
    if (selectedClothing.size === 0) {
      setRunError(t("scan.error.need_garment"));
      return;
    }
    setCreating(true);
    try {
      const job = await createTryOnJob({
        bodyPhotoId: selectedBodyId,
        clothingIds: Array.from(selectedClothing),
      });
      setJobs((prev) => [job, ...prev]);
      setSelectedClothing(new Set());
      void refreshJobs();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : t("scan.error.tryon_start_failed"));
    } finally {
      setCreating(false);
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      await retryTryOnJob(jobId);
      void refreshJobs();
    } catch (e) {
      Alert.alert(t("scan.error.retry_failed.title"), e instanceof Error ? e.message : t("scan.error.retry_failed.message"));
    }
  };

  const removeJob = async (job: TryOnJob) => {
    Alert.alert(
      t("scan.delete_job.title"),
      t("scan.delete_job.message"),
      [
        { text: t("scan.camera.cancel"), style: "cancel" },
        {
          text: t("scan.jobs.delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteTryOnJob(job.id);
                setJobs((prev) => prev.filter((j) => j.id !== job.id));
              } catch (e) {
                Alert.alert(
                  t("scan.error.delete_photo_failed.title"),
                  e instanceof Error ? e.message : t("scan.error.delete_job_failed.message"),
                );
              }
            })();
          },
        },
      ],
    );
  };

  const saveJobAsOutfit = async (job: TryOnJob) => {
    try {
      const saved = await insertSavedOutfit({
        name: `Try-on ${new Date().toLocaleDateString()}`,
        clothing_ids: job.clothing_ids,
        try_on_id: job.id,
        result_url: job.result_url ?? null,
      });
      toast.success(t("scan.toast.outfit_saved.title"), t("scan.toast.outfit_saved.message"), {
        label: t("outfits.toast.view"),
        onPress: () => router.push(`/outfit/${saved.id}`),
      });
    } catch (e) {
      toast.error(
        t("outfits.toast.save_error.title"),
        e instanceof Error ? e.message : t("outfits.toast.save_error.message"),
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!consentLoaded) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  if (!consented) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <ScrollView contentContainerStyle={styles.consentContent} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title={t("scan.title")}
            subtitle={t("scan.consent.subtitle")}
          />
          <View style={styles.consentCard}>
            <Text style={styles.consentTitle}>{t("scan.consent.title")}</Text>
            <Text style={styles.consentBody}>
              {t("scan.consent.body")}
            </Text>
            <View style={styles.bullets}>
              {[
                t("scan.consent.b1"),
                t("scan.consent.b2"),
                t("scan.consent.b3"),
                t("scan.consent.b4"),
                t("scan.consent.b5"),
              ].map((b) => (
                <View key={b} style={styles.bulletRow}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.primary} />
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>

            <Pressable onPress={() => router.push("/privacy/policy")} hitSlop={6}>
              <Text style={styles.policyLink}>{t("scan.consent.policy")}</Text>
            </Pressable>

            <View style={styles.consentToggleRow}>
              <Switch
                value={agree}
                onValueChange={setAgree}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
              <Text style={styles.consentToggleLabel}>
                {t("scan.consent.agree")}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!agree}
              onPress={acceptConsent}
              style={[styles.primaryBtn, !agree && styles.btnDisabled]}
            >
              <Text style={styles.primaryBtnText}>{t("scan.consent.continue")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title={t("scan.title")}
          subtitle={t("scan.subtitle")}
        />

        {/* 5-step workflow: Photo → Clothing → Generate → Review → Save */}
        <StepIndicator
          current={
            creating
              ? 3
              : jobs.some((j) => j.status === "completed")
                ? 4
                : selectedClothing.size > 0 || selectedBodyId
                  ? 2
                  : 1
          }
        />

        {/* ------------------------- Body photo ------------------------- */}
        <Text style={styles.sectionLabel}>{t("scan.body_photo.label")}</Text>
        {cameraMode === "camera" ? (
          <View style={styles.cameraBox}>
            <CameraView
              ref={cameraRef}
              style={styles.cameraPreview}
              facing={facing}
              flash={flash}
            >
              <View style={styles.cameraOverlay}>
                <View style={styles.cameraTopRow}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.camIconBtn}
                    onPress={() => setFlash((f) => (f === "off" ? "on" : "off"))}
                  >
                    <Ionicons
                      name={flash === "on" ? "flash" : "flash-off-outline"}
                      size={20}
                      color="#FFF"
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.camIconBtn}
                    onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}
                  >
                    <Ionicons name="camera-reverse-outline" size={22} color={theme.colors.onPrimary} />
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  style={styles.shutter}
                  onPress={async () => {
                    try {
                      const photo = await cameraRef.current?.takePictureAsync();
                      if (photo?.uri) {
                        setCapturedUri(photo.uri);
                        setCameraMode("preview");
                      }
                    } catch {
                      Alert.alert(t("scan.error.capture_failed.title"), t("scan.error.capture_failed.message"));
                    }
                  }}
                >
                  <View style={styles.shutterInner} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.cancelCapture}
                  onPress={() => setCameraMode("idle")}
                >
                  <Text style={styles.cancelCaptureText}>{t("scan.camera.cancel")}</Text>
                </Pressable>
              </View>
            </CameraView>
          </View>
        ) : cameraMode === "preview" && capturedUri ? (
          <View style={styles.previewBox}>
            <Image source={{ uri: capturedUri }} style={styles.previewImage} contentFit="cover" transition={150} />
            <View style={styles.previewActions}>
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryBtn}
                onPress={() => {
                  setCapturedUri(null);
                  setCameraMode("idle");
                }}
              >
                <Text style={styles.secondaryBtnText}>{t("scan.preview.retake")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={[styles.primaryBtn, styles.flex]}
                onPress={analyzeAndSave}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color={theme.colors.onPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>{t("scan.preview.analyze")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.scanActions}>
            <Pressable accessibilityRole="button" style={styles.scanBtn} onPress={startCapture}>
              <Ionicons name="camera-outline" size={22} color={theme.colors.onPrimary} />
              <Text style={styles.scanBtnText}>{t("scan.action.scan")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.scanBtnGhost} onPress={pickPhoto}>
              <Ionicons name="images-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.scanBtnGhostText}>{t("scan.action.choose")}</Text>
            </Pressable>
          </View>
        )}

        {lastAnalysis ? (
          <View style={styles.analysisBanner}>
            <Ionicons
              name={lastAnalysis.detected ? "checkmark-circle" : "alert-circle-outline"}
              size={16}
              color={lastAnalysis.detected ? theme.colors.primary : theme.colors.warning}
            />
            <Text style={styles.analysisText}>
              {lastAnalysis.detected
                ? t("scan.analysis.detected", { confidence: Math.round((lastAnalysis.confidence ?? 0) * 100) })
                : t("scan.analysis.no_person")}
            </Text>
          </View>
        ) : null}

        {photosLoading ? (
          <ActivityIndicator style={styles.inlineSpin} color={theme.colors.primary} />
        ) : photosError ? (
          <ErrorState message={photosError} onRetry={refreshBodyPhotos} />
        ) : bodyPhotos.length === 0 ? (
          <EmptyState
            icon="body-outline"
            title={t("scan.photos.empty.title")}
            message={t("scan.photos.empty.message")}
          />
        ) : (
          <View>
            <Text style={styles.miniLabel}>{t("scan.photos.select_hint")}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
            >
              {bodyPhotos.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  onPress={() => setSelectedBodyId(p.id)}
                  style={[
                    styles.photoCard,
                    selectedBodyId === p.id && styles.photoCardSelected,
                  ]}
                >
                  <BodyPhotoImage photo={p} />
                  <View style={styles.photoBadgeRow}>
                    <Ionicons
                      name={p.detection?.personDetected ? "person" : "help-circle-outline"}
                      size={12}
                      color={theme.colors.textMuted}
                    />
                    <Text style={styles.photoBadgeText}>
                      {p.detection?.personDetected ? t("scan.photos.badge.person") : t("scan.photos.badge.check")}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => removeBodyPhoto(p.id)}
                    style={styles.photoDelete}
                  >
                    <Ionicons name="trash-outline" size={14} color={theme.colors.onPrimary} />
                  </Pressable>
                  {selectedBodyId === p.id ? (
                    <View style={styles.photoSelectedRing}>
                      <Ionicons name="checkmark" size={14} color={theme.colors.onPrimary} />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ------------------------- Try-on ------------------------- */}
        <Text style={styles.sectionLabel}>{t("scan.tryon.label")}</Text>
        <View style={styles.tryonCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t("scan.tryon.body_photo")}</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {selectedBodyId ? t("scan.tryon.selected") : t("scan.tryon.none_selected")}
            </Text>
          </View>
          <View style={styles.segRow}>
            <SegButton
              label={t("scan.tryon.catalog")}
              active={clothingSource === "catalog"}
              onPress={() => setClothingSource("catalog")}
            />
            <SegButton
              label={t("scan.tryon.closet")}
              active={clothingSource === "closet"}
              onPress={() => {
                setClothingSource("closet");
                if (!closetItems.length) {
                  void useWardrobeStore.getState().loadFromServer().catch(() => {});
                }
              }}
            />
          </View>

          {clothingSource === "catalog" ? (
            catalogItems.length === 0 ? (
              <Text style={styles.smallHint}>{t("scan.tryon.catalog.loading")}</Text>
            ) : (
              <View style={styles.itemGrid} onLayout={onLayout}>
                {catalogItems.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => toggleClothing(item.id)}
                    style={[styles.pickCard, { width: itemWidth }]}
                  >
                    <PickImage source={item.image_url} />
                    <Text style={styles.pickName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {selectedClothing.has(item.id) ? (
                      <View style={styles.pickCheck}>
                        <Ionicons name="checkmark" size={12} color={theme.colors.onPrimary} />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )
          ) : closetItems.length === 0 ? (
            <View style={styles.emptyCloset}>
              <Text style={styles.smallHint}>
                {t("scan.tryon.closet.empty")}
              </Text>
              <Pressable
                accessibilityRole="button"
                style={styles.inlineCta}
                onPress={openCapture}
              >
                <Text style={styles.inlineCtaText}>{t("scan.tryon.closet.capture")}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.itemGrid} onLayout={onLayout}>
              {closetItems.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => toggleClothing(item.id)}
                  style={[styles.pickCard, { width: itemWidth }]}
                >
                  <PickImage source={item.image_url} />
                  <Text style={styles.pickName} numberOfLines={1}>
                    {item.name || (item.category ? tl("category", item.category) : t("scan.item_fallback"))}
                  </Text>
                  {selectedClothing.has(item.id) ? (
                    <View style={styles.pickCheck}>
                      <Ionicons name="checkmark" size={12} color={theme.colors.onPrimary} />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}

          {creating ? (
            <View style={styles.creatingPanel}>
              <SkeletonBlock aspectRatio={0.8} radius={theme.borderRadius.md} />
              <View style={styles.creatingCopy}>
                <Text style={styles.creatingTitle}>{t("scan.tryon.creating.title")}</Text>
                <Text style={styles.creatingText}>
                  {t("scan.tryon.creating.message")}
                </Text>
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            style={[styles.primaryBtn, creating && styles.btnDisabled]}
            onPress={startTryOn}
            disabled={creating}
          >
            {creating ? (
              <View style={styles.creatingBtnRow}>
                <ActivityIndicator color={theme.colors.onPrimary} size="small" />
                <Text style={styles.primaryBtnText}>{t("scan.tryon.creating")}</Text>
              </View>
            ) : (
              <Text style={styles.primaryBtnText}>{t("scan.tryon.start")}</Text>
            )}
          </Pressable>
          {runError ? <Text style={styles.errorText}>{runError}</Text> : null}
        </View>

        {/* ------------------------- Jobs ------------------------- */}
        <Text style={styles.sectionLabel}>{t("scan.jobs.label")}</Text>
        {jobsLoading && jobs.length === 0 ? (
          <ActivityIndicator style={styles.inlineSpin} color={theme.colors.primary} />
        ) : jobsError ? (
          <ErrorState message={jobsError} onRetry={refreshJobs} />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon="sparkles-outline"
            title={t("scan.jobs.empty.title")}
            message={t("scan.jobs.empty.message")}
          />
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} onDelete={removeJob} onRetry={retryJob} onSave={saveJobAsOutfit} />)
        )}

        <Text style={styles.footnote}>
          {t("scan.footnote")}
        </Text>
      </ScrollView>
    </View>
  );
}

function BodyPhotoImage({ photo }: { photo: BodyPhotoWithUrl }) {
  const styles = useStyles();
  const [uri, setUri] = useState<string | null>(photo.signedUrl ?? null);
  useEffect(() => {
    if (uri) return;
    let alive = true;
    resolveMediaUrl(photo.storage_path, 900).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [photo.storage_path, uri]);
  return uri ? (
    <Image source={{ uri }} style={styles.photoImage} contentFit="cover" transition={150} />
  ) : (
    <View style={[styles.photoImage, styles.photoPlaceholder]} />
  );
}

function PickImage({ source }: { source: string | null }) {
  const styles = useStyles();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    resolveMediaUrl(source, 900).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [source]);
  return uri ? (
    <Image source={{ uri }} style={styles.pickImage} contentFit="cover" transition={150} />
  ) : (
    <View style={[styles.pickImage, styles.pickImagePlaceholder]} />
  );
}

function SegButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.segBtn, active && styles.segBtnActive]}
    >
      <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StepIndicator({ current }: { current: number }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const TRYON_STEPS = [
    t("scan.step.photo"),
    t("scan.step.clothing"),
    t("scan.step.generate"),
    t("scan.step.review"),
    t("scan.step.save"),
  ];
  return (
    <View
      style={styles.stepsRow}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: TRYON_STEPS.length, now: Math.min(current, TRYON_STEPS.length) }}
    >
      {TRYON_STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <Fragment key={label}>
            {i > 0 ? (
              <View
                style={[styles.stepConnector, step <= current && styles.stepConnectorDone]}
              />
            ) : null}
            <View style={styles.stepNode}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  active && styles.stepDotActive,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={10} color={theme.colors.onPrimary} />
                ) : (
                  <Text style={[styles.stepDotText, active && styles.stepDotTextActive]}>
                    {step}
                  </Text>
                )}
              </View>
              <Text
                style={[styles.stepLabel, (active || done) && styles.stepLabelActive]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

function formatJobDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function JobCard({
  job,
  onDelete,
  onRetry,
  onSave,
}: {
  job: TryOnJob;
  onDelete: (job: TryOnJob) => void;
  onRetry: (id: string) => void;
  onSave: (job: TryOnJob) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const active = job.status === "uploading" || job.status === "queued" || job.status === "processing";
  return (
    <View style={styles.jobCard}>
      <View style={styles.jobTopRow}>
        <View style={styles.jobStatusWrap}>
          <JobStatusPill status={job.status} />
        </View>
        <Text style={styles.jobDate} numberOfLines={1}>
          {formatJobDate(job.created_at)}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onDelete(job)} style={styles.jobDelete}>
          <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {active ? (
        <View style={styles.jobActive}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.jobActiveText}>{t("scan.jobs.processing")}</Text>
        </View>
      ) : job.status === "completed" ? (
        <View style={styles.jobDone}>
          <JobResultImage job={job} />
          <View style={styles.jobDoneActions}>
            <Pressable accessibilityRole="button" style={styles.inlineCta} onPress={() => onSave(job)}>
              <Text style={styles.inlineCtaText}>{t("scan.jobs.save_outfit")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.linkBtn} onPress={() => onDelete(job)}>
              <Text style={styles.linkBtnText}>{t("scan.jobs.delete")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.jobFailed}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.colors.warning} />
          <Text style={styles.jobFailedText}>{job.error || t("scan.jobs.failed")}</Text>
          <Pressable accessibilityRole="button" style={styles.linkBtn} onPress={() => onRetry(job.id)}>
            <Text style={styles.linkBtnText}>{t("scan.jobs.retry")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function JobStatusPill({ status }: { status: TryOnJob["status"] }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const colors: Record<TryOnJob["status"], string> = {
    uploading: theme.colors.textMuted,
    queued: theme.colors.textMuted,
    processing: theme.colors.primary,
    completed: theme.colors.success,
    failed: theme.colors.warning,
  };
  return (
    <View style={[styles.pill, { borderColor: colors[status] }]}>
      <Text style={[styles.pillText, { color: colors[status] }]}>{t(`scan.job_status.${status}` as TranslationKey)}</Text>
    </View>
  );
}

function JobResultImage({ job }: { job: TryOnJob }) {
  const styles = useStyles();
  const [uri, setUri] = useState<string | null>(job.resultSignedUrl ?? null);
  useEffect(() => {
    if (uri || !job.result_url) return;
    let alive = true;
    resolveMediaUrl(job.result_url, 900).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [job.result_url, uri]);
  return (
    <View style={styles.jobResultWrap}>
      {uri ? (
        <Image source={{ uri }} style={styles.jobResultImage} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.jobResultImage, styles.jobResultPlaceholder]} />
      )}
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  center: { alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 12, paddingBottom: 40, gap: 12 },
  consentContent: { paddingHorizontal: 12, paddingBottom: 40, gap: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 10,
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: theme.colors.textMuted,
    marginBottom: 8,
  },

  // workflow steps
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 6,
    paddingBottom: 2,
  },
  stepNode: { alignItems: "center", width: 62 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  stepDotActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    transform: [{ scale: 1.08 }],
  },
  stepDotText: { fontSize: 11, fontWeight: "800", color: theme.colors.textMuted },
  stepDotTextActive: { color: theme.colors.onPrimary },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: theme.colors.border,
    marginTop: 10,
    marginHorizontal: 3,
    alignSelf: "flex-start",
  },
  stepConnectorDone: { backgroundColor: theme.colors.primary },
  stepLabel: {
    fontSize: 9.5,
    fontWeight: "600",
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  stepLabelActive: { color: theme.colors.text, fontWeight: "800" },

  // creating state
  creatingPanel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 14,
  },
  creatingCopy: { gap: 4 },
  creatingTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  creatingText: { fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
  creatingBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  // consent
  consentCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 14,
  },
  consentTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
  consentBody: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  bullets: { gap: 8 },
  bulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bulletText: { flex: 1, fontSize: 12.5, color: theme.colors.text, lineHeight: 18 },
  policyLink: { fontSize: 13, fontWeight: "700", color: theme.colors.primary, textDecorationLine: "underline" },
  consentToggleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  consentToggleLabel: { flex: 1, fontSize: 13, color: theme.colors.text, lineHeight: 19 },

  primaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
  flex: { flex: 1 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  secondaryBtnText: { color: theme.colors.text, fontWeight: "700", fontSize: 14 },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  linkBtnText: { color: theme.colors.primary, fontWeight: "700", fontSize: 13 },
  errorText: { color: theme.colors.warning, fontSize: 12.5, marginTop: 8 },

  // camera
  cameraBox: { borderRadius: theme.borderRadius.lg, overflow: "hidden" },
  cameraPreview: { width: "100%", aspectRatio: 3 / 4, backgroundColor: "#000" },
  cameraOverlay: { flex: 1, justifyContent: "space-between", padding: 16 },
  cameraTopRow: { flexDirection: "row", justifyContent: "space-between" },
  camIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutter: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.surface },
  cancelCapture: { alignSelf: "center", padding: 10 },
  cancelCaptureText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 14 },
  previewBox: { gap: 12 },
  previewImage: { width: "100%", aspectRatio: 3 / 4, borderRadius: theme.borderRadius.lg },
  previewActions: { flexDirection: "row", gap: 10 },

  scanActions: { flexDirection: "row", gap: 10 },
  scanBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
  },
  scanBtnText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 14 },
  scanBtnGhost: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
  },
  scanBtnGhostText: { color: theme.colors.text, fontWeight: "700", fontSize: 14 },

  analysisBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  analysisText: { flex: 1, fontSize: 12.5, color: theme.colors.text },

  inlineSpin: { paddingVertical: 24 },

  photoRow: { gap: 10, paddingRight: 16, paddingBottom: 4 },
  photoCard: {
    width: 108,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: "transparent",
  },
  photoCardSelected: { borderColor: theme.colors.primary },
  photoImage: { width: 108, height: 128, backgroundColor: theme.colors.primaryMuted },
  photoPlaceholder: { backgroundColor: theme.colors.border },
  photoBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  photoBadgeText: { fontSize: 10, fontWeight: "600", color: theme.colors.textMuted },
  photoDelete: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  photoSelectedRing: {
    position: "absolute",
    bottom: 30,
    right: 6,
    backgroundColor: theme.colors.primary,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  // try-on
  tryonCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 12,
  },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.textMuted },
  metaValue: { fontSize: 12.5, fontWeight: "700", color: theme.colors.text },
  segRow: { flexDirection: "row", backgroundColor: theme.colors.primaryMuted, borderRadius: theme.borderRadius.sm, padding: 3, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: theme.borderRadius.sm, alignItems: "center" },
  segBtnActive: { backgroundColor: theme.colors.primary },
  segBtnText: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted },
  segBtnTextActive: { color: theme.colors.onPrimary },
  smallHint: { fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
  itemGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  pickCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  pickImage: { width: "100%", aspectRatio: 0.85, backgroundColor: theme.colors.primaryMuted },
  pickImagePlaceholder: { backgroundColor: theme.colors.border },
  pickName: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.text,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  pickCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: theme.colors.primary,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCloset: { gap: 10, paddingVertical: 6 },
  inlineCta: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  inlineCtaText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 13 },

  // jobs
  jobCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 10,
  },
  jobTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  jobStatusWrap: { flexShrink: 0 },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: { fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  jobDate: { flex: 1, fontSize: 11, color: theme.colors.textMuted },
  jobDelete: { padding: 4 },
  jobActive: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  jobActiveText: { flex: 1, fontSize: 12.5, color: theme.colors.text },
  jobDone: { gap: 10 },
  jobResultWrap: { borderRadius: theme.borderRadius.sm, overflow: "hidden" },
  jobResultImage: { width: "100%", aspectRatio: 0.85, backgroundColor: theme.colors.primaryMuted },
  jobResultPlaceholder: { backgroundColor: theme.colors.border },
  jobDoneActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  jobFailed: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4, flexWrap: "wrap" },
  jobFailedText: { flex: 1, fontSize: 12.5, color: theme.colors.warning, lineHeight: 18 },

  footnote: {
    fontSize: 11,
    color: theme.colors.textMuted,
    lineHeight: 16,
    marginTop: 4,
  },
}));