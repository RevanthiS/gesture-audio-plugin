async function setupWebcam() {
  const video = document.getElementById("webcam");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    video.srcObject = stream;
    return new Promise((resolve) => {
      video.onloadedmetadata = () => resolve(video);
    });
  } catch (err) {
    console.error("Error accessing webcam:", err);
    document.getElementById("hand_count_output").textContent = "Error accessing webcam";
    return null;
  }
}

// --- START: SPEECH RECOGNITION CODE ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

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
    audioOutput.textContent = finalTranscript + interimTranscript;
  };

  recognition.onerror = (event) => {
    const audioOutput = document.getElementById("audio_output");
    audioOutput.textContent = `Speech Error: ${event.error}`;
    console.error("Speech recognition error:", event.error);
  };

  recognition.onend = () => {
    console.log("Recognition session ended. The 'onend' event was triggered.");
    const startAudioButton = document.getElementById("startAudioButton");
    const stopAudioButton = document.getElementById("stopAudioButton");
    startAudioButton.disabled = false;
    stopAudioButton.disabled = true;
  };
} else {
  console.warn("Web Speech API not supported in this browser.");
}
// --- END: SPEECH RECOGNITION CODE ---

async function loadHandPoseModel() {
  try {
    const model = handPoseDetection.SupportedModels.MediaPipeHands;
    const detectorConfig = {
      runtime: "tfjs",
      modelType: "full",
    };
    const detector = await handPoseDetection.createDetector(model, detectorConfig);
    console.log("Hand pose model loaded successfully");
    return detector;
  } catch (err) {
    console.error("Error loading model:", err);
    document.getElementById("hand_count_output").textContent = "Error loading model";
    return null;
  }
}

function calculateDistance(p1, p2) {
  const dist = Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
    Math.pow(p2.y - p1.y, 2) +
    Math.pow((p2.z || 0) - (p1.z || 0), 2)
  );
  return dist;
}

function calculateAngle(p1, p2, p3) {
  const vector1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: (p1.z || 0) - (p2.z || 0) };
  const vector2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: (p3.z || 0) - (p2.z || 0) };
  const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y + vector1.z * vector2.z;
  const magnitude1 = Math.sqrt(vector1.x ** 2 + vector1.y ** 2 + vector1.z ** 2);
  const magnitude2 = Math.sqrt(vector2.x ** 2 + vector2.y ** 2 + vector2.z ** 2);
  const cosine = dotProduct / (magnitude1 * magnitude2);
  return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
}

function getFingerStates(landmarks) {
  const wrist = landmarks[0];
  const thumbTip = landmarks[4], indexTip = landmarks[8], middleTip = landmarks[12], ringTip = landmarks[16], pinkyTip = landmarks[20];
  const thumbBase = landmarks[2], indexBase = landmarks[5], middleBase = landmarks[9], ringBase = landmarks[13], pinkyBase = landmarks[17];

  const threshold = 10;
  const thumbExtended = calculateDistance(thumbTip, wrist) > calculateDistance(thumbBase, wrist) + threshold;
  const indexExtended = calculateDistance(indexTip, wrist) > calculateDistance(indexBase, wrist) + threshold;
  const middleExtended = calculateDistance(middleTip, wrist) > calculateDistance(middleBase, wrist) + threshold;
  const ringExtended = calculateDistance(ringTip, wrist) > calculateDistance(ringBase, wrist) + threshold;
  const pinkyExtended = calculateDistance(pinkyTip, wrist) > calculateDistance(pinkyBase, wrist) + threshold;

  console.log("Finger States:", {
    thumb: thumbExtended,
    index: indexExtended,
    middle: middleExtended,
    ring: ringExtended,
    pinky: pinkyExtended
  });

  return [thumbExtended, indexExtended, middleExtended, ringExtended, pinkyExtended];
}

function classifySingleHandGesture(landmarks, allHands) {
  if (!landmarks || landmarks.length < 21) return null;
  const fingerStates = getFingerStates(landmarks);
  const [thumb, index, middle, ring, pinky] = fingerStates;
  const wrist = landmarks[0], thumbTip = landmarks[4], indexTip = landmarks[8], 
        middleTip = landmarks[12], ringTip = landmarks[16], pinkyTip = landmarks[20];
  const thumbBase = landmarks[2], indexBase = landmarks[5];

  console.log("Gesture Debug:", {
    thumbTipY: thumbTip.y,
    wristY: wrist.y,
    yDiff: thumbTip.y - wrist.y,
    thumbAngle: calculateAngle(landmarks[2], landmarks[3], landmarks[4]),
    thumbIndexDist: calculateDistance(thumbTip, indexTip),
    indexMiddleDist: calculateDistance(indexTip, middleTip),
    middleRingDist: calculateDistance(middleTip, ringTip),
    wristX: wrist.x
  });
  // Existing gestures
  if (thumb && !index && !middle && !ring && !pinky) {
    const thumbAngle = calculateAngle(landmarks[2], landmarks[3], landmarks[4]);
    if (thumbAngle > 120 && thumbTip.y < wrist.y - 10) {
      return { gesture: '👍 Thumbs Up'};
    }
    if (thumbTip.y > wrist.y + 10) {
      return { gesture: '👎 Thumbs Down'};
    }
  }
  if (!index && !middle && !ring && !pinky && !thumb) {
    return { gesture: '✊ Fist' };
  }
  
  const thumbIndexDist = calculateDistance(thumbTip, indexTip);
  if (thumbIndexDist < 15 && middle && ring && pinky) {
    return { gesture: '👌 OK Sign'};
  }
  if (thumb && index && middle && ring && pinky) {
    const indexMiddleDistance = calculateDistance(indexTip, middleTip);
    const middleRingDistance = calculateDistance(middleTip, ringTip);
    const avgDistance = (indexMiddleDistance + middleRingDistance) / 2;
    if (avgDistance > 20) {
      return { gesture: '🖐️ Open Palm' };
    }
  }
  if (index && middle && !ring && !pinky) {
    const indexStraight = indexTip.y < landmarks[6].y - 10;
    const middleStraight = middleTip.y < landmarks[10].y - 10;
    const bothPointingUp = indexTip.y < wrist.y && middleTip.y < wrist.y;
    const fingerSeparation = calculateDistance(indexTip, middleTip);
    if (indexStraight && middleStraight && bothPointingUp && fingerSeparation > 20) {
      return { gesture: '✌️ Peace Sign'};
    }
  }
  if (index && !middle && !ring && !pinky) {
    const indexStraight = indexTip.y < landmarks[6].y - 10;
    const pointingUp = indexTip.y < landmarks[5].y - 15;
    const aboveWrist = indexTip.y < wrist.y - 15;
    if (indexStraight && pointingUp && aboveWrist) {
      return { gesture: '☝️ Pointing Up' };
    }
  }
  if (index && pinky && !middle && !ring && !thumb) {
    const indexStraight = indexTip.y < landmarks[6].y - 10;
    const pinkyStraight = pinkyTip.y < landmarks[18].y - 10;
    const bothPointingUp = indexTip.y < wrist.y && pinkyTip.y < wrist.y;
    const indexPinkyDistance = calculateDistance(indexTip, pinkyTip);
    if (indexStraight && pinkyStraight && bothPointingUp && indexPinkyDistance > 25) {
      return { gesture: '🤘 Horns Sign' };
    }
  }
// --- CALL ME GESTURE (🤙) ---
if (thumb && pinky && !index && !middle && !ring) {
  const thumbTip = landmarks[4];
  const pinkyTip = landmarks[20];
  const thumbPinkyDistance = calculateDistance(thumbTip, pinkyTip);
  const thumbAngle = calculateAngle(landmarks[2], landmarks[3], landmarks[4]);
  const pinkyStraight = pinkyTip.y < landmarks[18].y - 10; // Pinky tip above PIP joint
  const thumbExtended = Math.abs(thumbTip.x - landmarks[2].x) > 20; // Thumb extended left/right
  const otherFingersFolded = 
    landmarks[8].y > landmarks[6].y && // Index tip below PIP
    landmarks[12].y > landmarks[10].y && // Middle tip below PIP
    landmarks[16].y > landmarks[14].y; // Ring tip below PIP
  if (thumbPinkyDistance > 40 && thumbAngle > 100 && pinkyStraight && thumbExtended && otherFingersFolded) {
    console.log("🤙 Call Me Gesture Detected");
    return { gesture: '🤙 Call Me' };
  }
}

  if (index && !middle && !ring && !pinky) {
    const indexBase = landmarks[5];
    const indexMiddle = landmarks[6];
    const indexTip = landmarks[8];
    const fingerAngle = calculateAngle(indexBase, indexMiddle, indexTip);
    const isStraight = fingerAngle > 160;
    const tipBelowWrist = indexTip.y > wrist.y + 20;
    const pointingDown = indexTip.y > indexBase.y + 30;
    if (isStraight && tipBelowWrist && pointingDown) {
      console.log("Detected 👇 Pointing Down", {
        angle: fingerAngle,
        tipY: indexTip.y,
        baseY: indexBase.y,
        wristY: wrist.y
      });
      return { gesture: '👇 Pointing Down' };
    }
  }
  if (thumb && index && pinky && !middle && !ring) {
    const indexPinkyDistance = calculateDistance(indexTip, pinkyTip);
    const thumbAngle = calculateAngle(landmarks[2], landmarks[3], landmarks[4]);
    if (indexPinkyDistance > 25 && thumbAngle > 100) {
      return { gesture: '🤟 Love You' };
    }
  }
  if (index && middle && ring && pinky) {
    const d1 = calculateDistance(indexTip, middleTip);
    const d2 = calculateDistance(indexTip, ringTip);
    const d3 = calculateDistance(indexTip, pinkyTip);
    const d4 = calculateDistance(middleTip, ringTip);
    const d5 = calculateDistance(middleTip, pinkyTip);
    const d6 = calculateDistance(ringTip, pinkyTip);
    const maxTipClusterDistance = Math.max(d1, d2, d3, d4, d5, d6);
    if (maxTipClusterDistance < 25) {
      return { gesture: '🤌 Pinched Hands' };
    }
  }
  if (index && !middle && !ring && !pinky && !thumb) {
    const indexBase = landmarks[5];
    const indexMiddle = landmarks[6];
    const indexTip = landmarks[8];
    const indexAngle = calculateAngle(indexBase, indexMiddle, indexTip);
    const isIndexStraight = indexAngle > 160;
    const wrist = landmarks[0];
    const xDiff = indexTip.x - wrist.x;
    const yDiff = indexTip.y - wrist.y;
    const isHorizontalish = Math.abs(xDiff) > Math.abs(yDiff) * 1.5;
    const zDiff = (indexTip.z || 0) - (wrist.z || 0);
    const isForwardPointing = zDiff < -0.05 || isHorizontalish;
    console.log("Pointing Viewer Debug:", {
      indexAngle,
      xDiff,
      yDiff,
      zDiff,
      isIndexStraight,
      isHorizontalish,
      isForwardPointing
    });
    if (isIndexStraight && isForwardPointing) {
      return { gesture: '🫵 Pointing Viewer' };
    }
  }

  // --- NUMBER 4 HAND GESTURE ---
if (!thumb && index && middle && ring && pinky) {
  const wrist = landmarks[0];
  const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];

  // All extended fingers should be above the wrist
  const fingersAboveWrist = tips.every(tip => tip.y < wrist.y);

  // Ensure finger separation is reasonable (not pinched)
  const spread1 = calculateDistance(landmarks[8], landmarks[12]);
  const spread2 = calculateDistance(landmarks[12], landmarks[16]);
  const spread3 = calculateDistance(landmarks[16], landmarks[20]);
  const avgSpread = (spread1 + spread2 + spread3) / 3;

  if (fingersAboveWrist && avgSpread > 15) {
    console.log("✋ Number 4 Hand Detected");
    return { gesture: '✋ Number 4' };
  }
}

if (ring && !index && !middle && !pinky) {
  const ringStraight = ringTip.y < landmarks[14].y - 10;
  const pointingUp = ringTip.y < landmarks[13].y - 15;
  const aboveWrist = ringTip.y < wrist.y - 15;
  if (ringStraight && pointingUp && aboveWrist) {
    return { gesture: ' Ring Finger Up' };
  }
}

const extendedCount = fingerStates.filter(Boolean).length;
  if (extendedCount === 0) return { gesture: 'Closed Hand'};
  if (extendedCount === 5) return { gesture: 'Open Hand' };
  return { gesture: 'Unknown' };
}

function drawKeypoints(ctx, keypoints, handedness) {
  ctx.fillStyle = handedness === "Left" ? "blue" : "red";
  ctx.strokeStyle = handedness === "Left" ? "blue" : "red";
  ctx.lineWidth = 2;

  for (const keypoint of keypoints) {
    ctx.beginPath();
    ctx.arc(keypoint.x, keypoint.y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }

  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20]
  ];

  ctx.beginPath();
  for (const [start, end] of connections) {
    ctx.moveTo(keypoints[start].x, keypoints[start].y);
    ctx.lineTo(keypoints[end].x, keypoints[end].y);
  }
  ctx.stroke();

  if (keypoints.length > 0) {
    ctx.font = "12px Arial";
    ctx.fillText(handedness, keypoints[0].x, keypoints[0].y - 10);
  }
}

function saveTranscript() {
  if (!fullTranscript.trim()) {
    alert("There is no transcript to save!");
    return;
  }
  const blob = new Blob([fullTranscript], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transcript.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let detectionRunning = false;
let animationFrameId = null;
let webcamStream = null;
let fullTranscript = '';

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
    const video = document.getElementById("webcam");
    video.srcObject = null;
  }
}

function updateButtonStates(webcamEnabled, detectionActive) {
  const webcamButton = document.getElementById("webcamButton");
  const startButton = document.getElementById("startDetectionButton");
  const stopButton = document.getElementById("stopDetectionButton");
  const disableButton = document.getElementById("disableWebcamButton");

  if (webcamEnabled) {
    webcamButton.disabled = true;
    webcamButton.textContent = "Webcam Enabled";
    disableButton.disabled = false;
    disableButton.textContent = "Disable Webcam";
    if (detectionActive) {
      startButton.disabled = true;
      stopButton.disabled = false;
    } else {
      startButton.disabled = false;
      stopButton.disabled = true;
    }
  } else {
    webcamButton.disabled = false;
    webcamButton.textContent = "Enable Webcam";
    disableButton.disabled = true;
    disableButton.textContent = "Disable Webcam";
    startButton.disabled = true;
    stopButton.disabled = true;
  }
}

async function main() {
  const webcamButton = document.getElementById("webcamButton");
  const startDetectionButton = document.getElementById("startDetectionButton");
  const stopDetectionButton = document.getElementById("stopDetectionButton");
  const disableWebcamButton = document.getElementById("disableWebcamButton");
  const gestureOutput = document.getElementById("gesture_output");
  const handCountOutput = document.getElementById("hand_count_output");
  const startAudioButton = document.getElementById("startAudioButton");
  const stopAudioButton = document.getElementById("stopAudioButton");
  const audioOutput = document.getElementById("audio_output");
  const saveTranscriptButton = document.getElementById("saveTranscriptButton");

  gestureOutput.textContent = "Model Loading...";
  handCountOutput.textContent = "Hands detected: 0";
  
  let video = null;
  let detector = null;
  let canvas = null;
  let ctx = null;

  updateButtonStates(false, false);

  if (!SpeechRecognition) {
    startAudioButton.disabled = true;
    startAudioButton.textContent = "API Not Supported";
    stopAudioButton.disabled = true;
    audioOutput.textContent = "Web Speech API is not available in your browser.";
  }

  webcamButton.addEventListener("click", async () => {
    webcamButton.disabled = true;
    webcamButton.textContent = "Loading...";
    video = await setupWebcam();
    if (!video) {
      updateButtonStates(false, false);
      return;
    }
    webcamStream = video.srcObject;
    detector = await loadHandPoseModel();
    if (!detector) {
      stopWebcam();
      updateButtonStates(false, false);
      return;
    }
    canvas = document.getElementById("output_canvas");
    ctx = canvas.getContext("2d");
    updateButtonStates(true, false);
    gestureOutput.textContent = "Webcam ready - Click 'Start Detection' to begin";
  });

  startDetectionButton.addEventListener("click", () => {
    if (!video || !detector) return;
    detectionRunning = true;
    updateButtonStates(true, true);
    
    async function detectHands() {
      if (!detectionRunning) return;
      const hands = await detector.estimateHands(video);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (hands.length > 0) {
        handCountOutput.textContent = `Hands detected: ${hands.length}`;
        const gestureTexts = hands.map((hand) => {
          const result = classifySingleHandGesture(hand.keypoints, hands);
          drawKeypoints(ctx, hand.keypoints, hand.handedness);
          return result ? `${hand.handedness} hand: ${result.gesture}` : `${hand.handedness} hand: Unknown`;
        });
        gestureOutput.textContent = gestureTexts.join(" | ");
      } else {
        handCountOutput.textContent = "Hands detected: 0";
        gestureOutput.textContent = "No gestures detected";
      }
      animationFrameId = requestAnimationFrame(detectHands);
    }
    detectHands();
  });

  stopDetectionButton.addEventListener("click", () => {
    detectionRunning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    updateButtonStates(true, false);
    gestureOutput.textContent = "Detection stopped";
    handCountOutput.textContent = "Hands detected: 0";
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (video) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
  });

  disableWebcamButton.addEventListener("click", () => {
    detectionRunning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    stopWebcam();
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    video = null;
    detector = null;
    updateButtonStates(false, false);
    gestureOutput.textContent = "Webcam disabled";
    handCountOutput.textContent = "Hands detected: 0";
  });

  startAudioButton.addEventListener('click', () => {
    console.log("1. 'Start Listening' button was clicked.");
    if (recognition) {
      console.log("2. The 'recognition' object exists.");
      try {
        console.log("3. Attempting to call recognition.start()...");
        recognition.start();
        console.log("4. recognition.start() was called without an immediate error.");
        startAudioButton.disabled = true;
        stopAudioButton.disabled = false;
        audioOutput.textContent = "Listening...";
      } catch (e) {
        console.error("5. An error was thrown by recognition.start()", e);
        audioOutput.textContent = `Error on start: ${e.message}`;
      }
    } else {
      console.error("X. The 'recognition' object is null or undefined.");
    }
  });

  saveTranscriptButton.addEventListener('click', saveTranscript);

  stopAudioButton.addEventListener('click', () => {
    if (recognition) {
      recognition.stop();
      startAudioButton.disabled = false;
      stopAudioButton.disabled = true;
      audioOutput.textContent = "Stopped. Click 'Start Listening' to begin again.";
    }
  });
}

main();