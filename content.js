const webcamElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const ctx = canvasElement.getContext('2d');
let isDetecting = false;


//hand connections for drawing
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],// Ring
  [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
];

const fingerTips = [4, 8, 12, 16, 20];
const fingerKnuckles = [2, 5, 9, 13, 17];
const fingerMiddleJoints = [3, 6, 10, 14, 18];

// --- Gesture Logic ---

function calculateDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function calculateAngle(a, b, c) {
  const ab = calculateDistance(a, b);
  const bc = calculateDistance(b, c);
  const ac = calculateDistance(a, c);
  return Math.acos((ab * ab + bc * bc - ac * ac) / (2 * ab * bc)) * (180 / Math.PI);
}

function getFingerStates(landmarks) {
  let fingerStates = [];
  // Thumb: Check angles at MCP (landmark 2) and IP (landmark 3)
  const thumbMCPAngle = calculateAngle(landmarks[1], landmarks[2], landmarks[3]);
  const thumbIPAngle = calculateAngle(landmarks[2], landmarks[3], landmarks[4]);
  const thumbExtended = thumbMCPAngle > 150 && thumbIPAngle > 150;
  fingerStates.push(thumbExtended);
  // Other fingers: Check angles at PIP and DIP joints
  for (let i = 1; i < 5; i++) {
    const baseIdx = [0, 5, 9, 13, 17][i]; // MCP
    const pipIdx = [0, 6, 10, 14, 18][i]; // PIP
    const dipIdx = [0, 7, 11, 15, 19][i]; // DIP
    const tipIdx = [0, 8, 12, 16, 20][i]; // Tip
    const pipAngle = calculateAngle(landmarks[baseIdx], landmarks[pipIdx], landmarks[dipIdx]);
    const dipAngle = calculateAngle(landmarks[pipIdx], landmarks[dipIdx], landmarks[tipIdx]);
    const fingerExtended = pipAngle > 150 && dipAngle > 150;
    fingerStates.push(fingerExtended);
  }
  return fingerStates;
}

function classifySingleHandGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;
  const fingerStates = getFingerStates(landmarks);
  const [thumb, index, middle, ring, pinky] = fingerStates;
  const wrist = landmarks[0], thumbTip = landmarks[4], indexTip = landmarks[8], middleTip = landmarks[12], ringTip = landmarks[16], pinkyTip = landmarks[20];
  // Thumbs Up
  if (thumb && !index && !middle && !ring && !pinky) {
    const thumbAngle = calculateAngle(landmarks[2], landmarks[3], landmarks[4]);
    if (thumbAngle > 150 && thumbTip.y < wrist.y - 0.05) {
      return { gesture: '👍 Thumbs Up', confidence: 0.9 };
    }
  }
  // Thumbs Down
  if (thumb && !index && !middle && !ring && !pinky) {
    if (thumbTip.y > wrist.y + 0.05) {
      return { gesture: '👎 Thumbs Down', confidence: 0.85 };
    }
  }
  // FIST: All fingers (except possibly thumb) not extended
  if (!index && !middle && !ring && !pinky) {
    return { gesture: '✊ Fist', confidence: 0.95 };
  }
  // OK SIGN: Thumb and index tips close, other fingers extended
  const thumbIndexDist = calculateDistance(thumbTip, indexTip);
  if (thumbIndexDist < 20 && middle && ring && pinky) {
    return { gesture: '👌 OK Sign', confidence: 0.9 };
  }
  // Open Palm
  if (thumb && index && middle && ring && pinky) {
    const indexMiddleDistance = calculateDistance(indexTip, middleTip);
    const middleRingDistance = calculateDistance(middleTip, ringTip);
    const avgDistance = (indexMiddleDistance + middleRingDistance) / 2;
    if (avgDistance > 0.03) {
      return { gesture: '🖐️ Open Palm', confidence: 0.9 };
    }
  }
  // Peace Sign
  if (index && middle && !ring && !pinky) {
    const indexStraight = indexTip.y < landmarks[6].y - 0.02;
    const middleStraight = middleTip.y < landmarks[10].y - 0.02;
    const bothPointingUp = indexTip.y < wrist.y && middleTip.y < wrist.y;
    const fingerSeparation = calculateDistance(indexTip, middleTip);
    if (indexStraight && middleStraight && bothPointingUp && fingerSeparation > 0.03) {
      return { gesture: '✌️ Peace Sign', confidence: 0.9 };
    }
  }
  // Pointing Up
  if (index && !middle && !ring && !pinky) {
    const indexStraight = indexTip.y < landmarks[6].y - 0.02;
    const pointingUp = indexTip.y < landmarks[5].y - 0.05;
    const aboveWrist = indexTip.y < wrist.y - 0.03;
    if (indexStraight && pointingUp && aboveWrist) {
      return { gesture: '☝️ Pointing Up', confidence: 0.9 };
    }
  }
  // Default
  const extendedCount = fingerStates.filter(Boolean).length;
  if (extendedCount === 0) return { gesture: 'Closed Hand', confidence: 0.7 };
  if (extendedCount === 5) return { gesture: 'Open Hand', confidence: 0.7 };
  return { gesture: 'Unknown', confidence: 0.5 };
}

function classifyTwoHandGesture(hands) {
  if (hands.length !== 2) return null;
  const left = hands[0].keypoints, right = hands[1].keypoints;
  const wristDist = calculateDistance(left[0], right[0]);
  const tipDist = calculateDistance(left[12], right[12]);
  // Praying Hands: Both hands open, wrists and middle tips close
  const leftStates = getFingerStates(left);
  const rightStates = getFingerStates(right);
  const leftOpen = leftStates.every(state => state); // All fingers extended
  const rightOpen = rightStates.every(state => state);
  if (leftOpen && rightOpen && wristDist < 50 && tipDist < 40) {
    return { gesture: '🙏 Praying Hands', confidence: 0.9 };
  }
  return { gesture: 'Two Hands Detected', confidence: 0.6 };
}

function classifyGesture(hands) {
  if (!hands || hands.length === 0) return { gesture: 'No Hand', confidence: 0 };
  if (hands.length === 2) return classifyTwoHandGesture(hands);
  return classifySingleHandGesture(hands[0].keypoints);
}

// --- Drawing functions ---

// Draw hands with scaled and mirrored coordinates
function drawHands(hands, ctx, scaleX, scaleY, videoWidth) {
  if (!hands || hands.length === 0) return;

  hands.forEach(hand => {
    const isLeftHand = hand.handedness === 'Left';
    const landmarks = hand.keypoints;

    // Use a bright, visible color
    ctx.fillStyle = 'yellow';

    landmarks.forEach((point, index) => {
      // Calculate drawing coordinates with mirroring
      const drawX = (point.x) * scaleX;
      const drawY = point.y * scaleY;

      // Log coordinates for debugging
      console.log(`Landmark ${index}: drawX=${drawX}, drawY=${drawY}`);

      // Draw a larger square instead of a circle for visibility
      ctx.fillRect(drawX - 5, drawY - 5, 10, 10);
    });

    // Draw connections (optional, for debugging)
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      const startDrawX = (videoWidth - start.x) * scaleX;
      const startDrawY = start.y * scaleY;
      const endDrawX = (videoWidth - end.x) * scaleX;
      const endDrawY = end.y * scaleY;
      ctx.beginPath();
      ctx.moveTo(startDrawX, startDrawY);
      ctx.lineTo(endDrawX, endDrawY);
      ctx.stroke();
    });
  });
}
// --- Main application logic ---

let detector = null;
let webcamStream = null;
// let isDetecting = false;

async function setup() {
  await tf.setBackend('webgl');
  detector = await handPoseDetection.createDetector(
    handPoseDetection.SupportedModels.MediaPipeHands,
    {
      runtime: 'tfjs',
      modelType: 'full',
      maxHands: 2
    }
  ).then(det => {
    console.log('Detector created successfully');
    return det;
  }).catch(err => {
    console.error('Error creating detector:', err);
    throw err;
  });
}

async function enableWebcam() {
  const webcamElement = document.getElementById('webcam');
  const gestureOutput = document.getElementById('gesture_output');
  const handCountOutput = document.getElementById('hand_count_output');
  const canvasElement = document.getElementById('output_canvas');
  canvasElement.width = 320;
  canvasElement.height = 240;
  const ctx = canvasElement.getContext('2d');

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' }
    });
    webcamElement.srcObject = webcamStream;
    await webcamElement.play();
    gestureOutput.textContent = 'Webcam enabled. Loading model...';
    await setup();
    gestureOutput.textContent = 'Model loaded. Detecting gestures...';
    isDetecting = true;
    detectHands();
  } catch (err) {
    gestureOutput.textContent = 'Error accessing webcam: ' + err.message;
  }

  async function detectHands() {
    if (!isDetecting) return;
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      // Calculate scaling factors
    const videoWidth = webcamElement.videoWidth;
    const videoHeight = webcamElement.videoHeight;
    const canvasWidth = canvasElement.width; // 320
    const canvasHeight = canvasElement.height; // 240
    const scaleX = canvasWidth / videoWidth;
    const scaleY = canvasHeight / videoHeight;
    // Test canvas rendering
    // ctx.fillStyle = 'red';
    // ctx.beginPath();
    // ctx.arc(100, 100, 5, 0, 2 * Math.PI);
    // ctx.fill();

    try {
      const hands = await detector.estimateHands(webcamElement, { flipHorizontal: false });
      console.log('Hands detected:', hands.length);
      if (hands.length > 0) {
        console.log('First hand landmarks:', hands[0].keypoints);
      }
      drawHands(hands, ctx, scaleX, scaleY, videoWidth);
      if (handCountOutput) {
        handCountOutput.textContent = `Hands detected: ${hands.length}`;
      }
      const gestureResult = classifyGesture(hands);
      if (gestureResult && gestureResult.confidence > 0.7) {
        gestureOutput.textContent = `Detected: ${gestureResult.gesture}`;
      } else {
        gestureOutput.textContent = 'No gesture detected';
      }
    } catch (err) {
      gestureOutput.textContent = 'Detection error: ' + err.message;
      console.error('Detection error:', err);
    }

    requestAnimationFrame(detectHands);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('webcamButton').addEventListener('click', async () => {
    document.getElementById('webcamButton').disabled = true;
    await enableWebcam();
  });
});