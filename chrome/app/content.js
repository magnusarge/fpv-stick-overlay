window.fpvOverlayInjected = true;

const DEFAULT_SETTINGS = {
  boxSize: 100,
  boxSpacing: 25,
  bottomOffset: 100,
  showCrosshair: true,
  boxBgColor: '#dcc882',
  boxBgOpacity: 0.32,
  boxBorderColor: '#3c280a',
  indicatorSize: 15,
  indicatorColor: '#a0c850',
  borderRadius: 10,
  showThrottlePercent: true,
  throttleStick: 'left',
  simpleMode: true
};

let settings = { ...DEFAULT_SETTINGS };
let gamepadMappings = {}; 
let activeGamepadIndex = null;

let isOverlayVisible = false;
let isModalVisible = false;
let isCalibrating = false;
let calibrationStep = 0;

let calSavedStates = [];
let throttleText = null;
const CAL_STEPS = [
  "Move LEFT stick FULLY UP",
  "Move LEFT stick FULLY DOWN",
  "Move LEFT stick FULLY LEFT",
  "Move LEFT stick FULLY RIGHT",
  "Move RIGHT stick FULLY UP",
  "Move RIGHT stick FULLY DOWN",
  "Move RIGHT stick FULLY LEFT",
  "Move RIGHT stick FULLY RIGHT"
];

// DOM Elements
let container, leftBox, rightBox, leftIndicator, rightIndicator;
let leftCrossX, leftCrossY, rightCrossX, rightCrossY;
let gearBtn, modal, settingsPanel, calibrationPanel;
let animationFrameId;

async function init() {
  ['fpv-overlay-container', 'fpv-modal-container'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  const data = await chrome.storage.local.get(['fpvSettings', 'fpvMappings']);
  if (data.fpvSettings) settings = { ...settings, ...data.fpvSettings };
  if (data.fpvMappings) gamepadMappings = data.fpvMappings;

  createOverlay();
  createModal();
  applySettings();
  
  document.addEventListener('FPV_OVERLAY_TOGGLE', () => {
    isOverlayVisible = !isOverlayVisible;
    container.classList.toggle('fpv-hidden', !isOverlayVisible);
    if (!isOverlayVisible) {
      isModalVisible = false;
      modal.classList.add('fpv-hidden');
      if (isCalibrating) cancelCalibration();
    }
    if (isOverlayVisible) startLoop();
    else stopLoop();
  });

  document.addEventListener('FPV_OPEN_SETTINGS', () => {
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      container.classList.remove('fpv-hidden');
      startLoop();
    }
    isModalVisible = true;
    modal.classList.remove('fpv-hidden');
  });
  
  startLoop();
}

function createOverlay() {
  container = document.createElement('div');
  container.id = 'fpv-overlay-container';
  container.classList.add('fpv-hidden');

  leftBox = document.createElement('div');
  leftBox.className = 'fpv-stick-box';
  leftCrossX = document.createElement('div'); leftCrossX.className = 'fpv-stick-crosshair-x';
  leftCrossY = document.createElement('div'); leftCrossY.className = 'fpv-stick-crosshair-y';
  leftIndicator = document.createElement('div'); leftIndicator.className = 'fpv-stick-indicator';
  leftBox.append(leftCrossX, leftCrossY, leftIndicator);

  rightBox = document.createElement('div');
  rightBox.className = 'fpv-stick-box';
  rightCrossX = document.createElement('div'); rightCrossX.className = 'fpv-stick-crosshair-x';
  rightCrossY = document.createElement('div'); rightCrossY.className = 'fpv-stick-crosshair-y';
  rightIndicator = document.createElement('div'); rightIndicator.className = 'fpv-stick-indicator';
  
  rightBox.append(rightCrossX, rightCrossY, rightIndicator);

  throttleText = document.createElement('div');
  throttleText.style.cssText = 'position: absolute; bottom: -45px; left: 50%; transform: translateX(-50%); font-family: monospace; font-size: 18px; font-weight: bold; pointer-events: none;';

  container.append(leftBox, rightBox);
  document.body.appendChild(container);
}

function createModal() {
  modal = document.createElement('div');
  modal.id = 'fpv-modal-container';
  modal.className = 'fpv-hidden';

  settingsPanel = document.createElement('div');
  settingsPanel.innerHTML = `
    <div class="fpv-modal-header">
      <h2>FPV Overlay Settings</h2>
      <label><input type="checkbox" id="fpv-set-simple" ${settings.simpleMode ? 'checked' : ''}> Simple</label>
    </div>
    <div class="fpv-form-group">
      <label>Box Size <span class="fpv-val-disp" id="val-boxsize"></span></label>
      <input type="range" id="fpv-set-boxsize" min="50" max="400" value="${settings.boxSize}">
    </div>
    <div class="fpv-form-group">
      <label>Box Distance <span class="fpv-val-disp" id="val-spacing"></span></label>
      <input type="range" id="fpv-set-spacing" min="0" max="800" value="${settings.boxSpacing}">
    </div>
    <div class="fpv-form-group">
      <label>Bottom Offset <span class="fpv-val-disp" id="val-bottom"></span></label>
      <input type="range" id="fpv-set-bottom" min="0" max="500" value="${settings.bottomOffset}">
    </div>
    <div class="fpv-form-group">
      <label>Border Radius (%) <span class="fpv-val-disp" id="val-radius"></span></label>
      <input type="range" id="fpv-set-radius" min="0" max="50" value="${settings.borderRadius}">
    </div>
    <div class="fpv-form-group">
      <label>Show Crosshair</label>
      <input type="checkbox" id="fpv-set-crosshair" ${settings.showCrosshair ? 'checked' : ''}>
    </div>
    <div class="fpv-form-group">
      <label>Background Color <span class="fpv-val-disp" id="val-bgcolor"></span></label>
      <input type="color" id="fpv-set-bgcolor" value="${settings.boxBgColor}">
    </div>
    <div class="fpv-form-group">
      <label>Background Opacity <span class="fpv-val-disp" id="val-bgopacity"></span></label>
      <input type="range" id="fpv-set-bgopacity" min="0" max="100" value="${Math.round(settings.boxBgOpacity * 100)}">
    </div>
    <div class="fpv-form-group">
      <label>Border & Cross Color <span class="fpv-val-disp" id="val-bordercolor"></span></label>
      <input type="color" id="fpv-set-bordercolor" value="${settings.boxBorderColor}">
    </div>
    <div class="fpv-form-group">
      <label>Stick Marker Size <span class="fpv-val-disp" id="val-indsize"></span></label>
      <input type="range" id="fpv-set-indsize" min="2" max="50" value="${settings.indicatorSize}">
    </div>
    <div class="fpv-form-group">
      <label>Stick Marker Color <span class="fpv-val-disp" id="val-indcolor"></span></label>
      <input type="color" id="fpv-set-indcolor" value="${settings.indicatorColor}">
    </div>
    <div class="fpv-form-group">
      <label>Show Throttle %</label>
      <input type="checkbox" id="fpv-set-showthr" ${settings.showThrottlePercent ? 'checked' : ''}>
    </div>
    <div class="fpv-form-group">
      <label>Throttle Axis Is On</label>
      <select id="fpv-set-thrstick" style="width: 134px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid #555; padding: 2px;">
        <option value="left" ${settings.throttleStick === 'left' ? 'selected' : ''}>Left Stick</option>
        <option value="right" ${settings.throttleStick === 'right' ? 'selected' : ''}>Right Stick</option>
      </select>
    </div>
    <button class="fpv-btn" id="fpv-btn-calibrate">Calibrate Controller</button>
    <button class="fpv-btn fpv-btn-secondary" id="fpv-btn-close">Close Settings</button>
  `;

  calibrationPanel = document.createElement('div');
  calibrationPanel.className = 'fpv-hidden';
  calibrationPanel.innerHTML = `
    <h2>Calibrate Controller</h2>
    <div id="fpv-calibration-msg">Move LEFT stick FULLY UP</div>
    <div style="display:flex; gap: 10px; margin-top: 15px;">
      <button class="fpv-btn" id="fpv-btn-cal-ok" style="background: #28a745; margin-top:0;">OK</button>
      <button class="fpv-btn fpv-btn-secondary" id="fpv-btn-cancel-cal" style="margin-top:0;">Cancel</button>
    </div>
  `;

  modal.append(settingsPanel, calibrationPanel);
  document.body.appendChild(modal);

  const bindInput = (id, key, parser) => {
    document.getElementById(id).addEventListener('input', (e) => {
      settings[key] = parser(e.target);
      applySettings();
      saveSettings();
    });
  };

  bindInput('fpv-set-boxsize', 'boxSize', t => Number(t.value));
  bindInput('fpv-set-spacing', 'boxSpacing', t => Number(t.value));
  bindInput('fpv-set-bottom', 'bottomOffset', t => Number(t.value));
  bindInput('fpv-set-radius', 'borderRadius', t => Number(t.value));
  bindInput('fpv-set-crosshair', 'showCrosshair', t => t.checked);
  bindInput('fpv-set-bgcolor', 'boxBgColor', t => t.value);
  bindInput('fpv-set-bgopacity', 'boxBgOpacity', t => Number(t.value) / 100);
  bindInput('fpv-set-bordercolor', 'boxBorderColor', t => t.value);
  bindInput('fpv-set-indsize', 'indicatorSize', t => Number(t.value));
  bindInput('fpv-set-indcolor', 'indicatorColor', t => t.value);
  bindInput('fpv-set-showthr', 'showThrottlePercent', t => t.checked);
  bindInput('fpv-set-thrstick', 'throttleStick', t => t.value);
  bindInput('fpv-set-simple', 'simpleMode', t => t.checked);

  document.getElementById('fpv-btn-close').addEventListener('click', () => {
    isModalVisible = false;
    modal.classList.add('fpv-hidden');
  });

  document.getElementById('fpv-btn-calibrate').addEventListener('click', startCalibration);
  document.getElementById('fpv-btn-cancel-cal').addEventListener('click', cancelCalibration);
  document.getElementById('fpv-btn-cal-ok').addEventListener('click', onCalibrationOk);
}

function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function hexToRgbString(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function applySettings() {
  container.style.gap = settings.boxSpacing + 'px';
  container.style.paddingBottom = settings.bottomOffset + 'px';

  const boxStyles = [leftBox, rightBox];
  boxStyles.forEach(box => {
    box.style.width = settings.boxSize + 'px';
    box.style.height = settings.boxSize + 'px';
    box.style.backgroundColor = hexToRgba(settings.boxBgColor, settings.boxBgOpacity);
    box.style.border = `2px solid ${settings.boxBorderColor}`;
    box.style.borderRadius = settings.borderRadius + '%';
  });

  const crosses = [leftCrossX, leftCrossY, rightCrossX, rightCrossY];
  crosses.forEach(c => {
    c.style.display = settings.showCrosshair ? 'block' : 'none';
    c.style.backgroundColor = settings.boxBorderColor;
  });

  throttleText.style.color = settings.boxBorderColor;
  throttleText.style.textShadow = `1px 1px 3px ${settings.boxBgColor}, -1px -1px 3px ${settings.boxBgColor}, 0px 0px 8px ${settings.boxBgColor}`;
  if (settings.showThrottlePercent) {
    throttleText.style.display = 'block';
    if (settings.throttleStick === 'left') leftBox.appendChild(throttleText);
    else rightBox.appendChild(throttleText);
  } else {
    throttleText.style.display = 'none';
  }

  const inds = [leftIndicator, rightIndicator];
  inds.forEach(ind => {
    ind.style.width = settings.indicatorSize + 'px';
    ind.style.height = settings.indicatorSize + 'px';
    ind.style.backgroundColor = settings.indicatorColor;
  });

  const dispEls = document.querySelectorAll('.fpv-val-disp');
  if (dispEls.length > 0) {
    dispEls.forEach(el => {
      el.style.display = settings.simpleMode ? 'none' : 'inline';
      el.style.opacity = '0.7';
      el.style.marginLeft = '4px';
    });
    if (!settings.simpleMode) {
      document.getElementById('val-boxsize').innerText = `(${settings.boxSize})`;
      document.getElementById('val-spacing').innerText = `(${settings.boxSpacing})`;
      document.getElementById('val-bottom').innerText = `(${settings.bottomOffset})`;
      document.getElementById('val-radius').innerText = `(${settings.borderRadius})`;
      document.getElementById('val-bgcolor').innerText = `(${hexToRgbString(settings.boxBgColor)})`;
      document.getElementById('val-bgopacity').innerText = `(${Math.round(settings.boxBgOpacity * 100)})`;
      document.getElementById('val-bordercolor').innerText = `(${hexToRgbString(settings.boxBorderColor)})`;
      document.getElementById('val-indsize').innerText = `(${settings.indicatorSize})`;
      document.getElementById('val-indcolor').innerText = `(${hexToRgbString(settings.indicatorColor)})`;
    }
  }
}

function saveSettings() {
  chrome.storage.local.set({ fpvSettings: settings });
}

function saveMappings() {
  chrome.storage.local.set({ fpvMappings: gamepadMappings });
}

// --- Calibration Logic ---

function startCalibration() {
  const gamepads = navigator.getGamepads();
  const gp = Array.from(gamepads).find(g => g !== null);
  if (!gp) {
    alert("No gamepad detected! Connect a controller and press any button.");
    return;
  }

  activeGamepadIndex = gp.index;
  settingsPanel.classList.add('fpv-hidden');
  calibrationPanel.classList.remove('fpv-hidden');
  isCalibrating = true;
  calibrationStep = 0;
  calSavedStates = [];
  updateCalMessage();
}

function cancelCalibration() {
  isCalibrating = false;
  settingsPanel.classList.remove('fpv-hidden');
  calibrationPanel.classList.add('fpv-hidden');
}

function updateCalMessage() {
  document.getElementById('fpv-calibration-msg').innerText = CAL_STEPS[calibrationStep] + " and click OK";
}

function onCalibrationOk() {
  const gp = navigator.getGamepads()[activeGamepadIndex];
  if (!gp) return;

  calSavedStates.push([...gp.axes]);
  calibrationStep++;

  if (calibrationStep >= CAL_STEPS.length) {
    processCalibrationResults(gp.id);
  } else {
    updateCalMessage();
  }
}

function processCalibrationResults(gpId) {
  // Find which axis changed the most for each pair
  const getAxisAndRange = (stateA, stateB) => {
    let maxDiff = 0;
    let axisIndex = 0;
    for (let i = 0; i < stateA.length; i++) {
      const diff = Math.abs(stateA[i] - stateB[i]);
      if (diff > maxDiff) {
        maxDiff = diff;
        axisIndex = i;
      }
    }
    return {
      axis: axisIndex,
      val1: stateA[axisIndex], // e.g. UP
      val2: stateB[axisIndex]  // e.g. DOWN
    };
  };

  const leftY = getAxisAndRange(calSavedStates[0], calSavedStates[1]); // UP/DOWN
  const leftX = getAxisAndRange(calSavedStates[2], calSavedStates[3]); // LEFT/RIGHT
  const rightY = getAxisAndRange(calSavedStates[4], calSavedStates[5]); // UP/DOWN
  const rightX = getAxisAndRange(calSavedStates[6], calSavedStates[7]); // LEFT/RIGHT

  gamepadMappings[gpId] = { leftY, leftX, rightY, rightX };
  saveMappings();
  cancelCalibration();
  alert("Calibration complete!");
}

// --- Render Loop ---
function startLoop() {
  if (!animationFrameId) {
    updateLoop();
  }
}

function stopLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function updateLoop() {
  if (!isOverlayVisible) return;
  if (!isCalibrating) updateSticks();
  animationFrameId = requestAnimationFrame(updateLoop);
}

function getAxisPercent(axisVal, startVal, endVal) {
  const range = endVal - startVal;
  if (range === 0) return 50; 
  let pct = ((axisVal - startVal) / range) * 100;
  return Math.max(0, Math.min(100, pct)); 
}

function updateSticks() {
  const gamepads = navigator.getGamepads();
  let gp = Array.from(gamepads).find(g => g !== null);
  if (!gp) return;

  const m = gamepadMappings[gp.id];
  if (!m) {
    // Fallback: standard Gamepad API (Left=0,1 Right=2,3)
    moveIndicatorPercent(leftIndicator, 
      getAxisPercent(gp.axes[0], -1, 1), 
      getAxisPercent(gp.axes[1], -1, 1)
    );
    moveIndicatorPercent(rightIndicator, 
      getAxisPercent(gp.axes[2], -1, 1), 
      getAxisPercent(gp.axes[3], -1, 1)
    );
  } else {
    // Use calibrated mapping
    moveIndicatorPercent(leftIndicator, 
      getAxisPercent(gp.axes[m.leftX.axis], m.leftX.val1, m.leftX.val2),
      getAxisPercent(gp.axes[m.leftY.axis], m.leftY.val1, m.leftY.val2)
    );
    moveIndicatorPercent(rightIndicator, 
      getAxisPercent(gp.axes[m.rightX.axis], m.rightX.val1, m.rightX.val2),
      getAxisPercent(gp.axes[m.rightY.axis], m.rightY.val1, m.rightY.val2)
    );
  }

  if (settings.showThrottlePercent) {
    let yPct = 0;
    if (settings.throttleStick === 'left') {
      yPct = parseFloat(leftIndicator.style.top) || 0;
    } else {
      yPct = parseFloat(rightIndicator.style.top) || 0;
    }
    throttleText.innerText = Math.round(100 - yPct) + '%';
  }
}

function moveIndicatorPercent(indicator, xPct, yPct) {
  indicator.style.left = xPct + '%';
  indicator.style.top = yPct + '%';
}

init();

function updateModalInputs() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && el.value != val) el.value = val; };
  const setCheck = (id, val) => { const el = document.getElementById(id); if (el && el.checked != val) el.checked = val; };

  setVal('fpv-set-boxsize', settings.boxSize);
  setVal('fpv-set-spacing', settings.boxSpacing);
  setVal('fpv-set-bottom', settings.bottomOffset);
  setVal('fpv-set-radius', settings.borderRadius);
  setCheck('fpv-set-crosshair', settings.showCrosshair);
  setVal('fpv-set-bgcolor', settings.boxBgColor);
  setVal('fpv-set-bgopacity', Math.round(settings.boxBgOpacity * 100));
  setVal('fpv-set-bordercolor', settings.boxBorderColor);
  setVal('fpv-set-indsize', settings.indicatorSize);
  setVal('fpv-set-indcolor', settings.indicatorColor);
  setCheck('fpv-set-showthr', settings.showThrottlePercent);
  setVal('fpv-set-thrstick', settings.throttleStick);
  setCheck('fpv-set-simple', settings.simpleMode);
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    let needsApply = false;
    if (changes.fpvSettings && changes.fpvSettings.newValue) {
      settings = { ...settings, ...changes.fpvSettings.newValue };
      updateModalInputs();
      needsApply = true;
    }
    if (changes.fpvMappings && changes.fpvMappings.newValue) {
      gamepadMappings = changes.fpvMappings.newValue;
      needsApply = true;
    }
    if (needsApply) {
      applySettings();
    }
  }
});
