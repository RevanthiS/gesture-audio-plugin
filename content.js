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
    Math.pow((p2.z || 0) - (p1.z || 0), 2) //used to handel 2d cases in case z is undefined.
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
  return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;  //Math.max(-1, Math.min(1, cosine)) ensures the cosine is within valid bounds to avoid errors from floating-point inaccuracies.
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

function classifySingleHandGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;
  const fingerStates = getFingerStates(landmarks);
  const [thumb, index, middle, ring, pinky] = fingerStates;
  const wrist = landmarks[0], thumbTip = landmarks[4], indexTip = landmarks[8], middleTip = landmarks[12], ringTip = landmarks[16], pinkyTip = landmarks[20];

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

  if (thumb && !index && !middle && !ring && !pinky) {
    const thumbAngle = calculateAngle(landmarks[2], landmarks[3], landmarks[4]);
    if (thumbAngle > 120 && thumbTip.y < wrist.y - 10) {
      return { gesture: '👍 Thumbs Up'};
    }
  }
  if (thumb && !index && !middle && !ring && !pinky) {
    if (thumbTip.y > wrist.y + 10) {
      return { gesture: '👎 Thumbs Down'};
    }
  }
  if (!index && !middle && !ring && !pinky) {
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

// Global variables to manage detection state
let detectionRunning = false;
let animationFrameId = null;
let webcamStream = null;

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
  
  gestureOutput.textContent = "Model Loading...";
  handCountOutput.textContent = "Hands detected: 0";

  let video = null;
  let detector = null;
  let canvas = null;
  let ctx = null;

  // Initialize button states
  updateButtonStates(false, false);

  webcamButton.addEventListener("click", async () => {
    webcamButton.disabled = true;
    webcamButton.textContent = "Loading...";

    video = await setupWebcam();
    if (!video) {
      updateButtonStates(false, false);
      return;
    }

    // Store the stream reference for cleanup
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
          const result = classifySingleHandGesture(hand.keypoints);
          drawKeypoints(ctx, hand.keypoints, hand.handedness);
          return result
            ? `${hand.handedness} hand: ${result.gesture}`
            : `${hand.handedness} hand: Unknown (0%)`;
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
    
    // Clear the canvas
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (video) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    }
  });

  disableWebcamButton.addEventListener("click", () => {
    // Stop detection first
    detectionRunning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    // Stop webcam
    stopWebcam();
    
    // Clear canvas
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Reset variables
    video = null;
    detector = null;
    
    updateButtonStates(false, false);
    gestureOutput.textContent = "Webcam disabled";
    handCountOutput.textContent = "Hands detected: 0";
  });
}

main();