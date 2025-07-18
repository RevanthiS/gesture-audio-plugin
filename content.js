//with gesture detection + speech recognition

let tf;
let handPoseDetection;
let labels = null;
let sentence = "";
let lastChar = "";
let sameCharCount = 0;
const stableThreshold = 15;
let lastAcceptedTime = 0;
const delayBetweenChars = 2000;

let progressInterval;
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

//Enumerate All Video Input Devices (Cameras)
async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');
  
  const select = document.getElementById('cameraSelect');
  select.innerHTML = ''; // Clear old options

  videoDevices.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || `Camera ${index + 1}`;
    select.appendChild(option);
  });
}

//Start the Camera Based on User Selection
async function startCamera() {
  const deviceId = document.getElementById('cameraSelect').value;

  const constraints = {
    video: {
      deviceId: { exact: deviceId }
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const video = document.getElementById('video');
  video.srcObject = stream;
}

window.onload = async () => {
  await getCameras();
};

//for a time delay of 2 sec between every char
function updateProgressBar() {
  const bar = document.getElementById("progress_bar");
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
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    video.srcObject = stream;
    return new Promise(resolve => {
      video.onloadedmetadata = () => resolve(video);
    });
  } catch (err) {
    console.error("Error accessing webcam:", err);
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

    const pad = Math.max(xMax - xMin, yMax - yMin) * 0.2;
    xMin = Math.max(0, xMin - pad);
    yMin = Math.max(0, yMin - pad);
    xMax = Math.min(video.videoWidth, xMax + pad);
    yMax = Math.min(video.videoHeight, yMax + pad);

    const off = document.createElement("canvas");
    off.width = off.height = 224;
    const ctx = off.getContext("2d");
    ctx.drawImage(video, xMin, yMin, xMax - xMin, yMax - yMin, 0, 0, 224, 224);

    // Optional debug display
    const debug = document.getElementById("model_input_canvas");
    if (debug) debug.getContext("2d").drawImage(off, 0, 0);

    // Use tf.tidy to manage memory
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
  if (!isDetectionRunning) return;

  const hands = await detector.estimateHands(video);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const now = Date.now();
  const handCountOutput = document.getElementById("hand_count_output");
  const gestureOutput = document.getElementById("gesture_output");
  const sentenceOutput = document.getElementById("sentence_output");

  if (hands.length) {
    handCountOutput.textContent = `Hands detected: ${hands.length}`;
    const result = await predictFromHand(video, hands[0].keypoints);
    gestureOutput.textContent = `Prediction: ${result.label} (${(result.confidence * 100).toFixed(1)}%)`;

    const label = result.label;
    const labelIndex = result.index;

    if (now - lastAcceptedTime < delayBetweenChars) {
      requestAnimationFrame(detectHands);
      return;
    }

    if (label === lastChar) {
      sameCharCount++;
      if (sameCharCount === stableThreshold) {
        if (labelIndex === 27) {
          sentence += " ";
        } else if (labelIndex === 26) {
          sentence = sentence.slice(0, -1);
        } else if (labelIndex >= 0 && labelIndex <= 25) {
          sentence += label;
        }
        sentenceOutput.textContent = "Sentence: " + sentence;
        sameCharCount = 0;
        lastAcceptedTime = now;
        updateProgressBar();
      }
    } else {
      lastChar = label;
      sameCharCount = 1;
    }
  } else {
    handCountOutput.textContent = "Hands detected: 0";
    gestureOutput.textContent = "No gesture detected";
  }

  requestAnimationFrame(detectHands);
}

// Initialize Speech Recognition
function initializeSpeechRecognition() {
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = document.getElementById("language-select").value;

    recognition.onresult = (event) => {
      const audioOutput = document.getElementById("audio_output");
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
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
      console.log("Recognition session ended");
      isListening = false;
      updateAudioButtons();
    };
  } else {
    console.warn("Web Speech API not supported in this browser.");
    document.getElementById("audio_output").textContent = "Speech Recognition not supported in this browser";
  }
}

function updateWebcamButtons() {
  const webcamButton = document.getElementById("webcamButton");
  const startDetectionButton = document.getElementById("startDetectionButton");
  const stopDetectionButton = document.getElementById("stopDetectionButton");
  const disableWebcamButton = document.getElementById("disableWebcamButton");

  if (video && video.srcObject) {
    webcamButton.disabled = true;
    startDetectionButton.disabled = isDetectionRunning;
    stopDetectionButton.disabled = !isDetectionRunning;
    disableWebcamButton.disabled = false;
  } else {
    webcamButton.disabled = false;
    startDetectionButton.disabled = true;
    stopDetectionButton.disabled = true;
    disableWebcamButton.disabled = true;
  }
}

function updateAudioButtons() {
  const startAudioButton = document.getElementById("startAudioButton");
  const stopAudioButton = document.getElementById("stopAudioButton");
  
  startAudioButton.disabled = isListening;
  stopAudioButton.disabled = !isListening;
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
    
    // Initialize speech recognition
    initializeSpeechRecognition();

    // Set up button event listeners
    setupEventListeners();

    console.log("✅ Application initialized successfully");
    document.getElementById("gesture_output").textContent = "Ready to detect gestures";
    
  } catch (error) {
    console.error("App error:", error);
    document.getElementById("gesture_output").textContent = "Initialization error: " + error.message;
  }
}

function setupEventListeners() {
  // Webcam control buttons
  document.getElementById("webcamButton")?.addEventListener("click", async () => {
    const videoElement = await setupWebcam();
    if (videoElement) {
      updateWebcamButtons();
      
      if (!progressInterval) {
        progressInterval = setInterval(updateProgressBar, 100);
      }
    }
  });

  document.getElementById("startDetectionButton")?.addEventListener("click", () => {
    isDetectionRunning = true;
    updateWebcamButtons();
    detectHands();
  });

  document.getElementById("stopDetectionButton")?.addEventListener("click", () => {
    isDetectionRunning = false;
    updateWebcamButtons();
  });

  document.getElementById("disableWebcamButton")?.addEventListener("click", () => {
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
    isDetectionRunning = false;
    updateWebcamButtons();
    
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  });

  // Gesture sentence speak button
  document.getElementById("speakButton")?.addEventListener("click", () => {
    if (sentence.length > 0) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = "en-US";
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
  });

  // Speech recognition buttons
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
      isListening = false;
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

  // Language selection change
  document.getElementById("language-select")?.addEventListener("change", (e) => {
    if (recognition) {
      recognition.lang = e.target.value;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}