import { AppState, Preset, AudioSource, VisualizationMeta } from "../../shared/types";
import { visualizationManager } from "../visualizer/visualization-manager";

console.log("[Control] Script started");

// State
let currentState: AppState | null = null;
let presets: Preset[] = [];
let audioSources: AudioSource[] = [];
let visualizations: VisualizationMeta[] = [];
let isCapturing = false;

// DOM Elements
const presetSelect = document.getElementById("preset-select") as HTMLSelectElement;
const savePresetBtn = document.getElementById("save-preset-btn") as HTMLButtonElement;
const deletePresetBtn = document.getElementById("delete-preset-btn") as HTMLButtonElement;

const audioSourceSelect = document.getElementById("audio-source-select") as HTMLSelectElement;
const captureStatus = document.getElementById("capture-status") as HTMLDivElement;

const vizSelect = document.getElementById("viz-select") as HTMLSelectElement;
const prevVizBtn = document.getElementById("prev-viz-btn") as HTMLButtonElement;
const nextVizBtn = document.getElementById("next-viz-btn") as HTMLButtonElement;
const autoRotateCheck = document.getElementById("auto-rotate-check") as HTMLInputElement;
const rotationSettings = document.getElementById("rotation-settings") as HTMLDivElement;
const rotationInterval = document.getElementById("rotation-interval") as HTMLInputElement;
const rotationIntervalValue = document.getElementById("rotation-interval-value") as HTMLSpanElement;
const randomizeColorsCheck = document.getElementById("randomize-colors-check") as HTMLInputElement;
const randomizeAllCheck = document.getElementById("randomize-all-check") as HTMLInputElement;

const sensitivitySlider = document.getElementById("sensitivity") as HTMLInputElement;
const sensitivityValue = document.getElementById("sensitivity-value") as HTMLSpanElement;
const smoothingSlider = document.getElementById("smoothing") as HTMLInputElement;
const smoothingValue = document.getElementById("smoothing-value") as HTMLSpanElement;

const vizSettingsContainer = document.getElementById("viz-settings-container") as HTMLDivElement;

const savePresetModal = document.getElementById("save-preset-modal") as HTMLDivElement;
const presetNameInput = document.getElementById("preset-name-input") as HTMLInputElement;
const savePresetConfirm = document.getElementById("save-preset-confirm") as HTMLButtonElement;
const savePresetCancel = document.getElementById("save-preset-cancel") as HTMLButtonElement;

// Initialize
async function init() {
  console.log("Initializing control panel...");

  if (!window.vizecAPI) {
    console.error("vizecAPI not available! Preload script may not have loaded.");
    return;
  }

  // REGISTER LISTENER IMMEDIATELY
  if (window.vizecAPI.onVisualizationsUpdated) {
    window.vizecAPI.onVisualizationsUpdated((metas: VisualizationMeta[]) => {
      console.log("Received updated visualizations event:", metas.length);
      visualizations = metas;
      populateVisualizations();
      // Restore selection if needed
      if (currentState && currentState.currentVisualization) {
        vizSelect.value = currentState.currentVisualization;
      }
    });
  }

  try {
    // Load initial data with Promise.allSettled
    console.log("Fetching initial data...");
    const results = await Promise.allSettled([
      window.vizecAPI.getPresets(),
      window.vizecAPI.getAudioSources(),
      window.vizecAPI.getAudioInputDevices(),
      window.vizecAPI.getVisualizations(),
      window.vizecAPI.getState(),
    ]);

    const getResult = <T>(result: PromiseSettledResult<T>, defaultVal: T): T => {
      if (result.status === "fulfilled") return result.value;
      console.error("Data fetch failed:", result.reason);
      return defaultVal;
    };

    presets = getResult(results[0], [] as Preset[]);
    const screenSources = getResult(results[1], [] as AudioSource[]);
    const inputDevices = getResult(results[2], [] as AudioSource[]);
    const fetchedViz = getResult(results[3], [] as VisualizationMeta[]);
    currentState = getResult(results[4], null as AppState | null);

    // Only overwrite visualizations if we got some from the fetch,
    // otherwise keep what might have come in via the event listener
    if (fetchedViz.length > 0) {
      visualizations = fetchedViz;
    }

    audioSources = [
      { id: "system", name: "-- System Audio (select a window) --", type: "audio" as const },
      ...inputDevices,
      ...screenSources,
    ];

    console.log("Data loaded:", {
      presets: presets.length,
      audioSources: audioSources.length,
      visualizations: visualizations.length,
      state: !!currentState,
    });
  } catch (error) {
    console.error("Critical error during initialization:", error);
  }

  // Populate UI
  populatePresets();
  populateAudioSources();
  populateVisualizations();
  updateUIFromState();

  // Set up event listeners
  setupEventListeners();

  // Listen for state changes
  window.vizecAPI.onStateChanged((state: AppState) => {
    currentState = state;
    updateUIFromState();
  });

  console.log("Control panel initialized");
}

function populatePresets() {
  presetSelect.innerHTML = '<option value="">Select preset...</option>';
  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name + (preset.builtin ? " (Built-in)" : "");
    presetSelect.appendChild(option);
  });
}

function populateAudioSources() {
  audioSourceSelect.innerHTML = '<option value="">Select audio source...</option>';
  audioSources.forEach((source) => {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.name;
    audioSourceSelect.appendChild(option);
  });
}

function populateVisualizations() {
  // Clear existing options first
  vizSelect.innerHTML = "";

  if (visualizations.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Loading...";
    vizSelect.appendChild(option);
    return;
  }

  visualizations.forEach((viz) => {
    const option = document.createElement("option");
    option.value = viz.id;
    option.textContent = viz.name;
    vizSelect.appendChild(option);
  });

  // Set current value if state exists
  if (currentState && currentState.currentVisualization) {
    vizSelect.value = currentState.currentVisualization;
  }
}

function updateUIFromState() {
  if (!currentState) return;

  // Preset
  if (currentState.currentPreset) {
    presetSelect.value = currentState.currentPreset;
  }

  // Update delete button state
  const selectedPreset = presets.find((p) => p.id === currentState?.currentPreset);
  deletePresetBtn.disabled = !selectedPreset || selectedPreset.builtin;

  // Audio source
  if (currentState.audioSource) {
    audioSourceSelect.value = currentState.audioSource.id;
  }

  // Capture state
  isCapturing = currentState.isCapturing;
  if (isCapturing && currentState.audioSource) {
    captureStatus.innerHTML = `<span class="status-dot active"></span>Capturing: ${currentState.audioSource.name}`;
    captureStatus.style.display = "block";
  } else {
    captureStatus.style.display = "none";
  }

  // Visualization
  if (currentState.currentVisualization) {
    // Only update if the value actually exists in the options,
    // or if we're still loading (to avoid unsetting it)
    const exists = Array.from(vizSelect.options).some(
      (opt) => opt.value === currentState?.currentVisualization,
    );
    if (exists) {
      vizSelect.value = currentState.currentVisualization;
    }
  }

  // Rotation
  autoRotateCheck.checked = currentState.rotation.enabled;
  rotationSettings.style.display = currentState.rotation.enabled ? "block" : "none";
  rotationInterval.value = String(currentState.rotation.interval);
  rotationIntervalValue.textContent = `${currentState.rotation.interval}s`;

  const orderRadios = document.querySelectorAll(
    'input[name="rotation-order"]',
  ) as NodeListOf<HTMLInputElement>;
  orderRadios.forEach((radio) => {
    radio.checked = radio.value === currentState?.rotation.order;
  });

  randomizeColorsCheck.checked = currentState.rotation.randomizeColors ?? false;
  randomizeAllCheck.checked = currentState.rotation.randomizeAll ?? false;

  // Audio settings
  sensitivitySlider.value = String(currentState.audioConfig.sensitivity);
  sensitivityValue.textContent = currentState.audioConfig.sensitivity.toFixed(1);
  smoothingSlider.value = String(currentState.audioConfig.smoothing);
  smoothingValue.textContent = currentState.audioConfig.smoothing.toFixed(2);

  // Display settings
  const bgRadios = document.querySelectorAll(
    'input[name="background"]',
  ) as NodeListOf<HTMLInputElement>;
  bgRadios.forEach((radio) => {
    radio.checked = radio.value === currentState?.displayConfig.background;
  });

  // Update visualization-specific settings
  updateVisualizationSettings();
}

function updateVisualizationSettings() {
  if (!currentState) return;

  // Get config schema for current visualization
  const viz = visualizationManager.createVisualization(currentState.currentVisualization);
  if (!viz) {
    vizSettingsContainer.innerHTML =
      '<p style="color: var(--text-secondary);">No settings available</p>';
    return;
  }

  const schema = viz.getConfigSchema();
  viz.destroy();

  vizSettingsContainer.innerHTML = "";

  Object.entries(schema).forEach(([key, field]) => {
    const settingItem = document.createElement("div");
    settingItem.className = "setting-item";

    const currentValue = currentState?.visualizationConfig[key] ?? field.default;

    if (field.type === "number") {
      settingItem.innerHTML = `
        <label>${field.label}: <span id="viz-${key}-value">${currentValue}</span></label>
        <input type="range" class="slider" id="viz-${key}" 
          min="${field.min ?? 0}" max="${field.max ?? 100}" step="${field.step ?? 1}" 
          value="${currentValue}">
      `;

      const slider = settingItem.querySelector(`#viz-${key}`) as HTMLInputElement;
      const valueSpan = settingItem.querySelector(`#viz-${key}-value`) as HTMLSpanElement;

      slider.addEventListener("input", () => {
        const value = parseFloat(slider.value);
        valueSpan.textContent = String(value);
        window.vizecAPI.updateVisualizationConfig({ [key]: value });
      });
    } else if (field.type === "boolean") {
      settingItem.innerHTML = `
        <label class="checkbox-label">
          <input type="checkbox" id="viz-${key}" ${currentValue ? "checked" : ""}>
          <span>${field.label}</span>
        </label>
      `;

      const checkbox = settingItem.querySelector(`#viz-${key}`) as HTMLInputElement;
      checkbox.addEventListener("change", () => {
        window.vizecAPI.updateVisualizationConfig({ [key]: checkbox.checked });
      });
    } else if (field.type === "select" && field.options) {
      settingItem.innerHTML = `
        <label>${field.label}</label>
        <select class="select" id="viz-${key}">
          ${field.options
            .map(
              (opt) => `
            <option value="${opt.value}" ${opt.value === currentValue ? "selected" : ""}>
              ${opt.label}
            </option>
          `,
            )
            .join("")}
        </select>
      `;

      const select = settingItem.querySelector(`#viz-${key}`) as HTMLSelectElement;
      select.addEventListener("change", () => {
        window.vizecAPI.updateVisualizationConfig({ [key]: select.value });
      });
    }

    vizSettingsContainer.appendChild(settingItem);
  });
}

function setupEventListeners() {
  // Preset selection
  presetSelect.addEventListener("change", () => {
    if (presetSelect.value) {
      window.vizecAPI.loadPreset(presetSelect.value);
    }
  });

  // Save preset
  savePresetBtn.addEventListener("click", () => {
    presetNameInput.value = "";
    savePresetModal.style.display = "flex";
    presetNameInput.focus();
  });

  savePresetConfirm.addEventListener("click", async () => {
    const name = presetNameInput.value.trim();
    if (name) {
      const newPreset = await window.vizecAPI.savePreset(name);
      presets.push(newPreset);
      populatePresets();
      presetSelect.value = newPreset.id;
      savePresetModal.style.display = "none";
    }
  });

  savePresetCancel.addEventListener("click", () => {
    savePresetModal.style.display = "none";
  });

  // Delete preset
  deletePresetBtn.addEventListener("click", async () => {
    if (currentState?.currentPreset) {
      const preset = presets.find((p) => p.id === currentState?.currentPreset);
      if (preset && !preset.builtin) {
        if (confirm(`Delete preset "${preset.name}"?`)) {
          await window.vizecAPI.deletePreset(preset.id);
          presets = presets.filter((p) => p.id !== preset.id);
          populatePresets();
        }
      }
    }
  });

  // Audio source selection
  audioSourceSelect.addEventListener("change", () => {
    const source = audioSources.find((s) => s.id === audioSourceSelect.value);
    if (source) {
      window.vizecAPI.selectAudioSource(source);
      window.vizecAPI.startCapture();
    } else {
      window.vizecAPI.stopCapture();
    }
  });

  // Visualization selection
  vizSelect.addEventListener("change", () => {
    window.vizecAPI.setVisualization(vizSelect.value);
  });

  prevVizBtn.addEventListener("click", () => {
    window.vizecAPI.prevVisualization();
  });

  nextVizBtn.addEventListener("click", () => {
    window.vizecAPI.nextVisualization();
  });

  // Helper to get current rotation config
  const getRotationConfig = () => ({
    enabled: autoRotateCheck.checked,
    interval: parseInt(rotationInterval.value),
    order: (document.querySelector('input[name="rotation-order"]:checked') as HTMLInputElement)
      ?.value as "sequential" | "random",
    randomizeColors: randomizeColorsCheck.checked,
    randomizeAll: randomizeAllCheck.checked,
  });

  // Auto-rotate
  autoRotateCheck.addEventListener("change", () => {
    window.vizecAPI.setRotation(getRotationConfig());
  });

  rotationInterval.addEventListener("input", () => {
    rotationIntervalValue.textContent = `${rotationInterval.value}s`;
    window.vizecAPI.setRotation(getRotationConfig());
  });

  document.querySelectorAll('input[name="rotation-order"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      window.vizecAPI.setRotation(getRotationConfig());
    });
  });

  randomizeColorsCheck.addEventListener("change", () => {
    window.vizecAPI.setRotation(getRotationConfig());
  });

  randomizeAllCheck.addEventListener("change", () => {
    if (randomizeAllCheck.checked) {
      randomizeColorsCheck.checked = true;
    }
    window.vizecAPI.setRotation(getRotationConfig());
  });

  // Audio settings
  sensitivitySlider.addEventListener("input", () => {
    const value = parseFloat(sensitivitySlider.value);
    sensitivityValue.textContent = value.toFixed(1);
    window.vizecAPI.setAudioConfig({
      sensitivity: value,
      smoothing: parseFloat(smoothingSlider.value),
    });
  });

  smoothingSlider.addEventListener("input", () => {
    const value = parseFloat(smoothingSlider.value);
    smoothingValue.textContent = value.toFixed(2);
    window.vizecAPI.setAudioConfig({
      sensitivity: parseFloat(sensitivitySlider.value),
      smoothing: value,
    });
  });

  // Display settings
  document.querySelectorAll('input[name="background"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      window.vizecAPI.setDisplayConfig({
        background: (e.target as HTMLInputElement).value as "transparent" | "solid",
      });
    });
  });

  // Refresh audio sources button
  audioSourceSelect.addEventListener("focus", async () => {
    const [screenSources, inputDevices] = await Promise.all([
      window.vizecAPI.getAudioSources(),
      window.vizecAPI.getAudioInputDevices(),
    ]);
    audioSources = [
      { id: "system", name: "-- System Audio (select a window) --", type: "audio" as const },
      ...inputDevices,
      ...screenSources,
    ];
    populateAudioSources();
    if (currentState?.audioSource) {
      audioSourceSelect.value = currentState.audioSource.id;
    }
  });

  // Modal interactions
  savePresetModal.addEventListener("click", (e) => {
    if (e.target === savePresetModal) {
      savePresetModal.style.display = "none";
    }
  });

  presetNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      savePresetConfirm.click();
    } else if (e.key === "Escape") {
      savePresetModal.style.display = "none";
    }
  });
}

// Start initialization
console.log("Control script loaded");
init().catch((err) => {
  console.error("Init failed:", err);
});
