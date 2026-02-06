import {
  createApp,
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  toRaw,
} from "vue";
import {
  AppState,
  AudioSource,
  ConfigField,
  ConfigSchema,
  DisplayConfig,
  Preset,
  RotationConfig,
  VisualizationConfig,
  VisualizationMeta,
} from "../../shared/types";
import { visualizationManager } from "../visualizer/visualization-manager";

const HIDE_SPEECH_VISUALIZATIONS_KEY = "hideSpeechVisualizations";

type RotationOrder = RotationConfig["order"];
type DisplayBackground = DisplayConfig["background"];
type VizSettingValue = number | boolean | string;

createApp({
  setup() {
    const api = window.vizecAPI;
    if (!api) {
      console.error("vizecAPI not available! Preload script may not have loaded.");
    }

    const presets = ref<Preset[]>([]);
    const audioSources = ref<AudioSource[]>([]);
    const visualizations = ref<VisualizationMeta[]>([]);
    const currentState = ref<AppState | null>(null);
    const isCapturing = ref(false);

    const selectedPresetId = ref("");
    const selectedAudioSourceId = ref("");
    const vizSearch = ref("");
    const isVizDropdownOpen = ref(false);
    const highlightedIndex = ref(-1);
    const hideSpeechVisualizations = ref(false);

    const rotationForm = reactive({
      enabled: false,
      interval: 30,
      order: "sequential" as RotationOrder,
      randomizeColors: false,
      randomizeAll: false,
    });

    const audioForm = reactive({
      sensitivity: 1,
      smoothing: 0.8,
    });

    const displayForm = reactive({
      background: "transparent" as DisplayBackground,
    });

    const vizSchema = ref<ConfigSchema>({});
    const vizConfigValues = reactive<Record<string, VizSettingValue>>({});

    const isSavePresetModalOpen = ref(false);
    const presetNameInput = ref("");

    const vizCombobox = ref<HTMLElement | null>(null);
    const vizSearchInput = ref<HTMLInputElement | null>(null);
    const vizDropdown = ref<HTMLDivElement | null>(null);
    const presetNameInputRef = ref<HTMLInputElement | null>(null);

    let lastVisualizationId: string | null = null;
    let unsubscribeState: (() => void) | null = null;
    let unsubscribeVisualizations: (() => void) | null = null;

    const selectedPreset = computed(() =>
      presets.value.find((preset: Preset) => preset.id === selectedPresetId.value) ?? null,
    );

    const canDeletePreset = computed(() => {
      const preset = selectedPreset.value;
      return !!preset && !preset.builtin;
    });

    const visibleVisualizations = computed(() =>
      hideSpeechVisualizations.value
        ? visualizations.value.filter((viz: VisualizationMeta) => !viz.usesSpeech)
        : visualizations.value,
    );

    const filteredVisualizations = computed(() => {
      const filterLower = vizSearch.value.toLowerCase().trim();
      if (!filterLower) return visibleVisualizations.value;
      return visibleVisualizations.value.filter((viz: VisualizationMeta) =>
        viz.name.toLowerCase().includes(filterLower),
      );
    });

    const vizSettingsEntries = computed(() => {
      const entries = Object.entries(vizSchema.value) as Array<[string, ConfigField]>;
      return entries.filter(([, field]) => {
        if (field.type === "number" || field.type === "boolean") return true;
        return field.type === "select" && !!field.options?.length;
      });
    });

    const captureStatusVisible = computed(
      () => isCapturing.value && !!currentState.value?.audioSource,
    );
    const captureStatusLabel = computed(
      () => currentState.value?.audioSource?.name ?? "",
    );

    const getResult = <T>(result: PromiseSettledResult<T>, fallback: T): T => {
      if (result.status === "fulfilled") return result.value;
      console.error("Data fetch failed:", result.reason);
      return fallback;
    };

    const buildAudioSources = (screenSources: AudioSource[], inputDevices: AudioSource[]) => {
      const systemAudio: AudioSource = {
        id: "system",
        name: "-- System Audio (select a window) --",
        type: "audio",
      };
      return [systemAudio, ...inputDevices, ...screenSources];
    };

    const clearVizConfigValues = () => {
      for (const key of Object.keys(vizConfigValues)) {
        delete vizConfigValues[key];
      }
    };

    const syncVizSearchToCurrent = () => {
      if (!currentState.value) return;
      const viz = visualizations.value.find(
        (item: VisualizationMeta) => item.id === currentState.value?.currentVisualization,
      );
      if (viz) {
        vizSearch.value = viz.name;
      }
    };

    const resolveConfigValue = (
      config: VisualizationConfig,
      key: string,
      field: ConfigField,
    ): VizSettingValue | undefined => {
      if (field.type === "number") {
        if (typeof config[key] === "number") return config[key] as number;
        if (typeof field.default === "number") return field.default;
        return field.min ?? 0;
      }
      if (field.type === "boolean") {
        if (typeof config[key] === "boolean") return config[key] as boolean;
        return Boolean(field.default);
      }
      if (field.type === "select") {
        if (typeof config[key] === "string") return config[key] as string;
        if (typeof field.default === "string") return field.default;
        return field.options?.[0]?.value ?? "";
      }
      return undefined;
    };

    const syncVizConfigValues = (schema: ConfigSchema, config: VisualizationConfig) => {
      for (const [key, field] of Object.entries(schema)) {
        const value = resolveConfigValue(config, key, field);
        if (value !== undefined) {
          vizConfigValues[key] = value;
        }
      }
    };

    const updateVisualizationSchema = () => {
      if (!currentState.value) {
        vizSchema.value = {};
        clearVizConfigValues();
        return;
      }

      const vizId = currentState.value.currentVisualization;
      const shouldRefresh = vizId !== lastVisualizationId;

      if (shouldRefresh) {
        lastVisualizationId = vizId;
        const vizInstance = visualizationManager.createVisualization(vizId);
        if (!vizInstance) {
          vizSchema.value = {};
          clearVizConfigValues();
          return;
        }

        const schema = vizInstance.getConfigSchema();
        vizInstance.destroy();
        vizSchema.value = schema;
        clearVizConfigValues();
      }

      syncVizConfigValues(vizSchema.value, currentState.value.visualizationConfig);
    };

    const syncFromState = (state: AppState) => {
      currentState.value = state;
      isCapturing.value = state.isCapturing;
      selectedPresetId.value = state.currentPreset ?? "";
      selectedAudioSourceId.value = state.audioSource?.id ?? "";

      rotationForm.enabled = state.rotation.enabled;
      rotationForm.interval = state.rotation.interval;
      rotationForm.order = state.rotation.order;
      rotationForm.randomizeColors = state.rotation.randomizeColors ?? false;
      rotationForm.randomizeAll = state.rotation.randomizeAll ?? false;

      audioForm.sensitivity = state.audioConfig.sensitivity;
      audioForm.smoothing = state.audioConfig.smoothing;

      displayForm.background = state.displayConfig.background;

      if (hideSpeechVisualizations.value !== state.hideSpeechVisualizations) {
        hideSpeechVisualizations.value = state.hideSpeechVisualizations;
        localStorage.setItem(
          HIDE_SPEECH_VISUALIZATIONS_KEY,
          String(state.hideSpeechVisualizations),
        );
      }

      if (!isVizDropdownOpen.value) {
        syncVizSearchToCurrent();
      }

      updateVisualizationSchema();
    };

    const openDropdown = () => {
      isVizDropdownOpen.value = true;
    };

    const closeDropdown = () => {
      isVizDropdownOpen.value = false;
      highlightedIndex.value = -1;
      syncVizSearchToCurrent();
    };

    const scrollHighlightedOption = () => {
      nextTick(() => {
        const dropdown = vizDropdown.value;
        if (!dropdown) return;
        const options = dropdown.querySelectorAll<HTMLElement>(
          ".searchable-select-option:not(.no-results)",
        );
        if (highlightedIndex.value >= 0 && highlightedIndex.value < options.length) {
          options[highlightedIndex.value].scrollIntoView({ block: "nearest" });
        }
      });
    };

    const highlightOption = (index: number) => {
      highlightedIndex.value = index;
      scrollHighlightedOption();
    };

    const selectVisualization = (viz: VisualizationMeta) => {
      if (!api) return;
      api.setVisualization(viz.id);
      vizSearch.value = viz.name;
      closeDropdown();
    };

    const onVizFocus = () => {
      vizSearch.value = "";
      openDropdown();
      highlightedIndex.value = -1;
      nextTick(() => vizSearchInput.value?.select());
    };

    const onVizInput = () => {
      openDropdown();
      highlightedIndex.value = -1;
    };

    const onVizKeydown = (event: KeyboardEvent) => {
      const filtered = filteredVisualizations.value;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!isVizDropdownOpen.value) {
          openDropdown();
          highlightOption(filtered.length > 0 ? 0 : -1);
          return;
        }
        if (filtered.length > 0) {
          highlightOption(Math.min(highlightedIndex.value + 1, filtered.length - 1));
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (filtered.length > 0) {
          highlightOption(Math.max(highlightedIndex.value - 1, 0));
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (highlightedIndex.value >= 0 && highlightedIndex.value < filtered.length) {
          selectVisualization(filtered[highlightedIndex.value]);
        }
      } else if (event.key === "Escape") {
        closeDropdown();
        vizSearchInput.value?.blur();
      }
    };

    const onPresetChange = () => {
      if (!api) return;
      if (!selectedPresetId.value) return;
      api.loadPreset(selectedPresetId.value).catch((error) => {
        console.error("Failed to load preset:", error);
      });
    };

    const openSavePresetModal = () => {
      presetNameInput.value = "";
      isSavePresetModalOpen.value = true;
      nextTick(() => presetNameInputRef.value?.focus());
    };

    const closeSavePresetModal = () => {
      isSavePresetModalOpen.value = false;
    };

    const confirmSavePreset = async () => {
      if (!api) return;
      const name = presetNameInput.value.trim();
      if (!name) return;
      try {
        const newPreset = await api.savePreset(name);
        presets.value = [...presets.value, newPreset];
        selectedPresetId.value = newPreset.id;
        closeSavePresetModal();
      } catch (error) {
        console.error("Failed to save preset:", error);
      }
    };

    const deletePreset = async () => {
      if (!api || !selectedPreset.value || selectedPreset.value.builtin) return;
      if (!confirm(`Delete preset "${selectedPreset.value.name}"?`)) return;
      try {
        const presetId = selectedPreset.value.id;
        await api.deletePreset(presetId);
        presets.value = presets.value.filter((preset: Preset) => preset.id !== presetId);
        if (selectedPresetId.value === presetId) {
          selectedPresetId.value = "";
        }
      } catch (error) {
        console.error("Failed to delete preset:", error);
      }
    };

    const onPresetNameKeydown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirmSavePreset();
      } else if (event.key === "Escape") {
        closeSavePresetModal();
      }
    };

    const onAudioSourceChange = () => {
      if (!api) return;
      const source = audioSources.value.find(
        (item: AudioSource) => item.id === selectedAudioSourceId.value,
      );
      if (source) {
        const payload = { ...toRaw(source) } as AudioSource;
        api.selectAudioSource(payload);
        api.startCapture();
      } else {
        api.stopCapture();
      }
    };

    const refreshAudioSources = async () => {
      if (!api) return;
      try {
        const [screenSources, inputDevices] = await Promise.all([
          api.getAudioSources(),
          api.getAudioInputDevices(),
        ]);
        audioSources.value = buildAudioSources(screenSources, inputDevices);
        if (currentState.value?.audioSource) {
          selectedAudioSourceId.value = currentState.value.audioSource.id;
        }
      } catch (error) {
        console.error("Failed to refresh audio sources:", error);
      }
    };

    const nextVisualization = () => {
      api?.nextVisualization();
    };

    const prevVisualization = () => {
      api?.prevVisualization();
    };

    const onHideSpeechChange = () => {
      if (!api) return;
      localStorage.setItem(
        HIDE_SPEECH_VISUALIZATIONS_KEY,
        String(hideSpeechVisualizations.value),
      );
      api.updateState({ hideSpeechVisualizations: hideSpeechVisualizations.value });
      api.resetRandomRotationPool();
      highlightedIndex.value = -1;
    };

    const applyRotation = () => {
      if (!api) return;
      const rotation: RotationConfig = {
        enabled: rotationForm.enabled,
        interval: rotationForm.interval,
        order: rotationForm.order,
        randomizeColors: rotationForm.randomizeColors,
        randomizeAll: rotationForm.randomizeAll,
      };
      api.setRotation(rotation);
    };

    const onRotationRandomizeAllChange = () => {
      if (rotationForm.randomizeAll) {
        rotationForm.randomizeColors = true;
      }
      applyRotation();
    };

    const resetRotationPool = () => {
      api?.resetRandomRotationPool();
    };

    const applyAudioConfig = () => {
      api?.setAudioConfig({
        sensitivity: audioForm.sensitivity,
        smoothing: audioForm.smoothing,
      });
    };

    const onDisplayBackgroundChange = () => {
      api?.setDisplayConfig({ background: displayForm.background });
    };

    const updateVisualizationConfig = (key: string, value: VizSettingValue) => {
      if (!api) return;
      vizConfigValues[key] = value;
      const update = { [key]: value } as Partial<VisualizationConfig>;
      api.updateVisualizationConfig(update);
      if (currentState.value) {
        currentState.value.visualizationConfig = {
          ...currentState.value.visualizationConfig,
          [key]: value,
        };
      }
    };

    const onVizNumberInput = (key: string) => {
      const value = vizConfigValues[key];
      if (typeof value === "number") {
        updateVisualizationConfig(key, value);
      }
    };

    const onVizBooleanChange = (key: string) => {
      const value = vizConfigValues[key];
      if (typeof value === "boolean") {
        updateVisualizationConfig(key, value);
      }
    };

    const onVizSelectChange = (key: string) => {
      const value = vizConfigValues[key];
      if (typeof value === "string") {
        updateVisualizationConfig(key, value);
      }
    };

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (vizCombobox.value && !vizCombobox.value.contains(target)) {
        closeDropdown();
      }
    };

    const initialize = async () => {
      if (!api) return;

      const storedHideSpeech = localStorage.getItem(HIDE_SPEECH_VISUALIZATIONS_KEY);
      if (storedHideSpeech !== null) {
        hideSpeechVisualizations.value = storedHideSpeech === "true";
      }

      unsubscribeVisualizations = api.onVisualizationsUpdated((metas) => {
        visualizations.value = metas;
        syncVizSearchToCurrent();
      });

      unsubscribeState = api.onStateChanged((state) => {
        syncFromState(state);
      });

      try {
        const results = await Promise.allSettled([
          api.getPresets(),
          api.getAudioSources(),
          api.getAudioInputDevices(),
          api.getVisualizations(),
          api.getState(),
        ]);

        presets.value = getResult(results[0], [] as Preset[]);
        const screenSources = getResult(results[1], [] as AudioSource[]);
        const inputDevices = getResult(results[2], [] as AudioSource[]);
        const fetchedViz = getResult(results[3], [] as VisualizationMeta[]);
        const state = getResult(results[4], null as AppState | null);

        if (state) {
          if (storedHideSpeech !== null) {
            const hideSpeechValue = storedHideSpeech === "true";
            if (state.hideSpeechVisualizations !== hideSpeechValue) {
              api.updateState({ hideSpeechVisualizations: hideSpeechValue });
            }
          }
          syncFromState(state);
        }

        if (fetchedViz.length > 0) {
          visualizations.value = fetchedViz;
          syncVizSearchToCurrent();
        }

        audioSources.value = buildAudioSources(screenSources, inputDevices);
      } catch (error) {
        console.error("Critical error during initialization:", error);
      }
    };

    onMounted(() => {
      document.addEventListener("click", handleDocumentClick);
      initialize();
    });

    onUnmounted(() => {
      document.removeEventListener("click", handleDocumentClick);
      unsubscribeState?.();
      unsubscribeVisualizations?.();
    });

    return {
      presets,
      audioSources,
      visualizations,
      currentState,
      selectedPresetId,
      selectedAudioSourceId,
      vizSearch,
      isVizDropdownOpen,
      highlightedIndex,
      hideSpeechVisualizations,
      rotationForm,
      audioForm,
      displayForm,
      vizConfigValues,
      vizSettingsEntries,
      visibleVisualizations,
      filteredVisualizations,
      canDeletePreset,
      isSavePresetModalOpen,
      presetNameInput,
      captureStatusVisible,
      captureStatusLabel,
      vizCombobox,
      vizSearchInput,
      vizDropdown,
      presetNameInputRef,
      onPresetChange,
      openSavePresetModal,
      closeSavePresetModal,
      confirmSavePreset,
      deletePreset,
      onPresetNameKeydown,
      onAudioSourceChange,
      refreshAudioSources,
      nextVisualization,
      prevVisualization,
      onHideSpeechChange,
      applyRotation,
      onRotationRandomizeAllChange,
      resetRotationPool,
      applyAudioConfig,
      onDisplayBackgroundChange,
      onVizNumberInput,
      onVizBooleanChange,
      onVizSelectChange,
      onVizFocus,
      onVizInput,
      onVizKeydown,
      selectVisualization,
      highlightOption,
    };
  },
}).mount("#app");
