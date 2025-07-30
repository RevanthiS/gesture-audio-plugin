//with gesture detection + speech recognition

let tf;
let handPoseDetection;
let labels = null;
let sentence = "";
let lastChar = "";
let sameCharCount = 0;
const stableThreshold = 15;
let lastAcceptedTime = 0;
const delayBetweenChars = 1000;

let progressInterval;
let isWebcamOn = false;
let isDetectionRunning = false;
let detector;
let video;
let canvas;
let ctx;

// Speech Recognition variables
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let fullTranscript = '';
let isListening = false;

// UI Elements
const loadingOverlay = document.getElementById('loading-overlay');
const themeToggle = document.getElementById('theme-toggle');

//Enumerate All Video Input Devices (Cameras)
async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    const select = document.getElementById('cameraSelect');
    select.innerHTML = ''; // Clear old options

    if (videoDevices.length === 0) {
      select.innerHTML = '<option>No cameras found</option>';
      return;
    }

    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Camera ${index + 1}`;
      select.appendChild(option);
    });
  } catch (err) {
    console.error("Error enumerating devices:", err);
  }
}

window.onload = async () => {
  await getCameras();
  applySavedTheme(); // Apply theme on load
};

//for a time delay of 2 sec between every char
function updateProgressBar() {
  const bar = document.getElementById("progress_bar");
  if (!bar) return;
  const elapsed = Date.now() - lastAcceptedTime;
  const percent = Math.min((elapsed / delayBetweenChars) * 100, 100);
  bar.style.width = percent + "%";
}

// for loading of libraries
function waitForLibraries() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50;

    const checkLibraries = () => {
      attempts++;
      if (window.tf && window.tf.setBackend && window.handPoseDetection && window.handPoseDetection.SupportedModels) {
        tf = window.tf;
        handPoseDetection = window.handPoseDetection;
        console.log("✅ Libraries found");
        resolve({ tf, handPoseDetection });
      } else if (attempts >= maxAttempts) {
        reject(new Error("Libraries failed to load after 5 seconds"));
      } else {
        setTimeout(checkLibraries, 100);
      }
    };

    checkLibraries();
  });
}

let graphModel;

async function loadLabels() {
  const labelsUrl = chrome.runtime.getURL("labels.txt");
  const response = await fetch(labelsUrl);
  const text = await response.text();
  labels = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  console.log("✅ Loaded labels:", labels);
}

async function loadGraphModel() {
  const modelUrl = chrome.runtime.getURL("graph_model/model.json");
  console.log("🔍 Loading model from:", modelUrl);
  graphModel = await tf.loadGraphModel(modelUrl);
  console.log("✅ Graph model loaded");
}

async function setupWebcam() {
  video = document.getElementById("webcam");
  const deviceId = document.getElementById('cameraSelect').value;
  const constraints = {
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    return new Promise(resolve => {
      video.onloadedmetadata = () => resolve(video);
    });
  } catch (err) {
    console.error("Error accessing webcam:", err);
    alert("Could not access webcam. Please check permissions.");
    return null;
  }
}

async function loadHandPoseModel() {
  const model = handPoseDetection.SupportedModels.MediaPipeHands;
  const detectorConfig = {
    runtime: "tfjs",
    modelType: "full",
    maxHands: 1
  };
  return await handPoseDetection.createDetector(model, detectorConfig);
}

async function predictFromHand(video, keypoints) {
  try {
    if (!keypoints || keypoints.length === 0) return { label: "?", confidence: 0, index: -1 };

    const scaleX = video.videoWidth / 320;
    const scaleY = video.videoHeight / 240;
    const xs = keypoints.map(kp => kp.x * scaleX);
    const ys = keypoints.map(kp => kp.y * scaleY);
    let xMin = Math.min(...xs), xMax = Math.max(...xs);
    let yMin = Math.min(...ys), yMax = Math.max(...ys);

    const pad = Math.max(xMax - xMin, yMax - yMin) * 0.3;
    xMin = Math.max(0, xMin - pad);
    yMin = Math.max(0, yMin - pad);
    xMax = Math.min(video.videoWidth, xMax + pad);
    yMax = Math.min(video.videoHeight, yMax + pad);

    const off = document.createElement("canvas");
    off.width = off.height = 224;
    const ctx = off.getContext("2d");
    ctx.drawImage(video, xMin, yMin, xMax - xMin, yMax - yMin, 0, 0, 224, 224);

    const debug = document.getElementById("model_input_canvas");
    if (debug) debug.getContext("2d").drawImage(off, 0, 0);

    const result = await tf.tidy(() => {
      let input = tf.browser.fromPixels(off);
      input = tf.cast(input, 'float32');
      input = tf.div(input, 255);
      input = tf.expandDims(input, 0);

      const pred = graphModel.execute(input);
      const scores = pred.arraySync()[0];
      const maxIndex = scores.indexOf(Math.max(...scores));
      const confidence = scores[maxIndex];
      const label = labels[maxIndex] || "?";

      return { label, confidence, index: maxIndex };
    });

    return result;
  } catch (e) {
    console.error("Prediction error:", e);
    return { label: "?", confidence: 0, index: -1 };
  }
}

async function detectHands() {
  if (!isDetectionRunning || !isWebcamOn) return;

  const hands = await detector.estimateHands(video);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const now = Date.now();
  const gestureOutput = document.getElementById("gesture_output");
  const sentenceOutput = document.getElementById("sentence_output");

  if (hands.length > 0) {
    const result = await predictFromHand(video, hands[0].keypoints);
    gestureOutput.textContent = `${result.label} (${(result.confidence * 100).toFixed(1)}%)`;

    const label = result.label;
    const labelIndex = result.index;

// Step 1: Manage the stability counter for the currently held gesture.
if (label === lastChar) {
  sameCharCount++; // If the gesture is the same, increment its stability count.
} else {
  lastChar = label;
  sameCharCount = 1; // If it's a new gesture, reset the count to 1.
}

// Step 2: Check if the gesture is stable AND the 2-second cooldown has passed.
if (sameCharCount >= stableThreshold && (now - lastAcceptedTime > delayBetweenChars)) {
  
  // Clear the initial placeholder text if it exists.
  if (sentence === "Your sentence will be built here...") sentence = "";
  
  // Determine the correct label for "DELETE" and "SPACE" based on the labels.txt file
  const deleteLabel = "DELETE";
  const spaceLabel = "SPACE";

  // Step 3: Perform the action based on the stable gesture.
  if (label === spaceLabel) { // Action for "space"
    sentence += " ";
  } else if (label === deleteLabel) { // Action for "delete"
    sentence = sentence.slice(0, -1);
  } else if (label !== 'NOTHING') { // Action for letters, ignoring "NOTHING" gesture
    sentence += label;
  }

  // Update the UI and reset timers for the next character.
  sentenceOutput.textContent = sentence.length > 0 ? sentence : "Your sentence will be built here...";
  lastAcceptedTime = now;
  updateProgressBar();
  
  // Immediately reset the counter after an action to prevent rapid-fire repeats.
  sameCharCount = 0; 
}
  } else {
    gestureOutput.textContent = "No gesture detected";
  }

  requestAnimationFrame(detectHands);
}

function initializeSpeechRecognition() {
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = document.getElementById("language-select").value;

    recognition.onresult = (event) => {
      const audioOutput = document.getElementById("audio_output");
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          fullTranscript += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      audioOutput.textContent = fullTranscript + interimTranscript;
    };

    recognition.onerror = (event) => {
      const audioOutput = document.getElementById("audio_output");
      audioOutput.textContent = `Speech Error: ${event.error}`;
      console.error("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      isListening = false;
      updateAudioButtons();
    };
  } else {
    console.warn("Web Speech API not supported in this browser.");
    document.getElementById("audio_output").textContent = "Speech Recognition not supported in this browser";
  }
}

function updateControlButtons() {
    const webcamButton = document.getElementById("webcamButton");
    const detectionButton = document.getElementById("detectionButton");
    const cameraSelect = document.getElementById("cameraSelect");
    const webcamStatus = document.getElementById("webcam-status");
    const detectionStatus = document.getElementById("detection-status");

    // Webcam Button State
    if (isWebcamOn) {
        webcamButton.innerHTML = "🚫 Disable Webcam";
        webcamButton.classList.add("active");
        cameraSelect.disabled = true;
    } else {
        webcamButton.innerHTML = "📷 Enable Webcam";
        webcamButton.classList.remove("active");
        cameraSelect.disabled = false;
    }
    webcamStatus.classList.toggle('active', isWebcamOn);

    // Detection Button State
    detectionButton.disabled = !isWebcamOn;
    detectionStatus.classList.toggle('active', isDetectionRunning && isWebcamOn);
    if (isDetectionRunning) {
        detectionButton.innerHTML = "⏹️ Stop Detection";
        detectionButton.classList.add("active");
    } else {
        detectionButton.innerHTML = "▶️ Start Detection";
        detectionButton.classList.remove("active");
    }
}

function updateAudioButtons() {
  const startAudioButton = document.getElementById("startAudioButton");
  const stopAudioButton = document.getElementById("stopAudioButton");
  const listeningStatus = document.getElementById('listening-status');
  
  startAudioButton.disabled = isListening;
  stopAudioButton.disabled = !isListening;
  listeningStatus.classList.toggle('active', isListening);
}

// Theme management functions
function applySavedTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggle.textContent = '🌙'; // Moon icon for dark theme
  } else {
    document.body.classList.remove('dark-theme');
    themeToggle.textContent = '☀️'; // Sun icon for light theme
  }
}

function toggleTheme() {
  if (document.body.classList.contains('dark-theme')) {
    document.body.classList.remove('dark-theme');
    localStorage.setItem('theme', 'light');
    themeToggle.textContent = '☀️';
  } else {
    document.body.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
    themeToggle.textContent = '🌙';
  }
}

async function main() {
  try {
    await waitForLibraries();
    await tf.setBackend("webgl");
    await tf.ready();
    await loadLabels();
    await loadGraphModel();

    canvas = document.getElementById("output_canvas");
    ctx = canvas.getContext("2d");

    detector = await loadHandPoseModel();
    
    initializeSpeechRecognition();
    setupEventListeners();
    updateControlButtons();
    updateAudioButtons();
    applySavedTheme(); // Ensure theme is applied after all elements are loaded

    console.log("✅ Application initialized successfully");
    document.getElementById("gesture_output").textContent = "Ready";
    loadingOverlay.style.opacity = '0';
    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 300);
    
  } catch (error) {
    console.error("App error:", error);
    loadingOverlay.innerHTML = `<p style="color:red;">Initialization Error: ${error.message}</p>`;
  }
}

function setupEventListeners() {
  document.getElementById("webcamButton")?.addEventListener("click", async () => {
    if (!isWebcamOn) {
      const videoElement = await setupWebcam();
      if (videoElement) {
        isWebcamOn = true;
        if (!progressInterval) {
          progressInterval = setInterval(updateProgressBar, 100);
        }
      }
    } else {
      if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }
      isWebcamOn = false;
      isDetectionRunning = false;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      document.getElementById("gesture_output").textContent = "Inactive";

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    }
    updateControlButtons();
  });

  document.getElementById("detectionButton")?.addEventListener("click", () => {
    if (!isWebcamOn) return; 
    isDetectionRunning = !isDetectionRunning;
    if (isDetectionRunning) {
      detectHands();
    }
    updateControlButtons();
  });

  document.getElementById("speakButton")?.addEventListener("click", () => {
    const textToSpeak = document.getElementById("sentence_output").textContent;
    if (textToSpeak.length > 0 && textToSpeak !== "Your sentence will be built here...") {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = "en-US";
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
  });

  document.getElementById("clearSentenceButton")?.addEventListener("click", () => {
    sentence = "";
    lastChar = "";
    sameCharCount = 0;
    lastAcceptedTime = 0; // Reset delay timer
    document.getElementById("sentence_output").textContent = "Your sentence will be built here...";
    document.getElementById("progress_bar").style.width = "0%";
  });

  // New Save Gesture Transcript Button
  document.getElementById("saveGestureTranscriptButton")?.addEventListener("click", () => {
    if (sentence.trim() && sentence !== "Your sentence will be built here...") {
      const blob = new Blob([sentence], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gesture_transcript_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert("No gesture transcript to save!");
    }
  });

  document.getElementById("startAudioButton")?.addEventListener("click", () => {
    if (recognition) {
      recognition.lang = document.getElementById("language-select").value;
      recognition.start();
      isListening = true;
      updateAudioButtons();
    }
  });

  document.getElementById("stopAudioButton")?.addEventListener("click", () => {
    if (recognition) {
      recognition.stop();
      isListening = false; // onend will also set this, but we do it here for immediate UI feedback
      updateAudioButtons();
    }
  });

  document.getElementById("saveTranscriptButton")?.addEventListener("click", () => {
    if (fullTranscript.trim()) {
      const blob = new Blob([fullTranscript], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcript_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert("No transcript to save!");
    }
  });

  document.getElementById("clearTranscriptButton")?.addEventListener("click", () => {
    fullTranscript = '';
    document.getElementById("audio_output").textContent = "Transcript will appear here...";
  });

  document.getElementById("language-select")?.addEventListener("change", (e) => {
    if (recognition) {
      recognition.lang = e.target.value;
      if (isListening) {
          recognition.stop();
          recognition.start();
      }
    }
  });

  // Event listener for the theme toggle button
  themeToggle?.addEventListener('click', toggleTheme);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}