let handposeModel;
let video;
let canvas;
let context;
let gestureStatus;
let gestureHistory = []; // Store recent gesture detections
const GESTURE_SMOOTHING_WINDOW = 5; // Number of frames to consider for smoothing
const CONFIDENCE_THRESHOLD = 0.8; // Minimum confidence for hand detection

// Request camera access immediately
navigator.mediaDevices.getUserMedia({
    video: { 
        width: 320,
        height: 240
    },
    audio: false
}).then(stream => {
    // Store the stream for later use
    window.cameraStream = stream;
}).catch(error => {
    console.error('Camera access error:', error);
    if (gestureStatus) {
        gestureStatus.textContent = 'Error: Camera access denied. Please allow camera access.';
    }
});

// Initialize the application
async function init() {
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    context = canvas.getContext('2d');
    gestureStatus = document.getElementById('gesture-status');

    try {
        // Load the HandPose model
        handposeModel = await handpose.load();
        gestureStatus.textContent = 'Model loaded! Starting video...';

        // Use the previously obtained stream
        if (window.cameraStream) {
            video.srcObject = window.cameraStream;
            // Wait for the video to be ready
            video.addEventListener('loadeddata', () => {
                detectGestures();
            });
        } else {
            gestureStatus.textContent = 'Error: Camera stream not available';
        }
    } catch (error) {
        console.error('Error:', error);
        gestureStatus.textContent = 'Error: ' + error.message;
    }
}

// Detect gestures continuously
async function detectGestures() {
    try {
        const predictions = await handposeModel.estimateHands(video);
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        if (predictions.length > 0 && predictions[0].handInViewConfidence > CONFIDENCE_THRESHOLD) {
            // Draw hand landmarks
            drawHand(predictions[0].landmarks);
            
            // Classify gesture
            const gesture = classifyGesture(predictions[0].landmarks);
            
            // Add to gesture history
            gestureHistory.push(gesture);
            if (gestureHistory.length > GESTURE_SMOOTHING_WINDOW) {
                gestureHistory.shift();
            }
            
            // Get the most common gesture in recent history
            const smoothedGesture = getMostCommonGesture(gestureHistory);
            gestureStatus.textContent = 'Detected Gesture: ' + smoothedGesture;
        } else {
            gestureStatus.textContent = 'No hand detected';
            gestureHistory = []; // Clear history when no hand is detected
        }
    } catch (error) {
        console.error('Error in gesture detection:', error);
    }
    
    // Continue detection
    requestAnimationFrame(detectGestures);
}

// Helper function to get the most common gesture from history
function getMostCommonGesture(history) {
    const counts = {};
    let maxCount = 0;
    let maxGesture = 'Analyzing...';
    
    history.forEach(gesture => {
        counts[gesture] = (counts[gesture] || 0) + 1;
        if (counts[gesture] > maxCount) {
            maxCount = counts[gesture];
            maxGesture = gesture;
        }
    });
    
    // Only return a gesture if it appears in majority of frames
    return maxCount >= Math.floor(history.length / 2) ? maxGesture : 'Analyzing...';
}

// Calculate angle between three points
function calculateAngle(point1, point2, point3) {
    const vector1 = [point1[0] - point2[0], point1[1] - point2[1]];
    const vector2 = [point3[0] - point2[0], point3[1] - point2[1]];
    
    const dotProduct = vector1[0] * vector2[0] + vector1[1] * vector2[1];
    const magnitude1 = Math.sqrt(vector1[0] * vector1[0] + vector1[1] * vector1[1]);
    const magnitude2 = Math.sqrt(vector2[0] * vector2[0] + vector2[1] * vector2[1]);
    
    const angle = Math.acos(dotProduct / (magnitude1 * magnitude2));
    return angle * (180 / Math.PI);
}

// Check if a finger is extended based on angles
function isFingerExtended(landmarks, tipIdx, midIdx, baseIdx) {
    const angle = calculateAngle(landmarks[tipIdx], landmarks[midIdx], landmarks[baseIdx]);
    return angle > 160; // Consider finger extended if angle is greater than 160 degrees
}

// Classify gesture based on hand landmarks with improved accuracy
function classifyGesture(landmarks) {
    const fingerConfigurations = {
        index: isFingerExtended(landmarks, 8, 7, 5),
        middle: isFingerExtended(landmarks, 12, 11, 9),
        ring: isFingerExtended(landmarks, 16, 15, 13),
        pinky: isFingerExtended(landmarks, 20, 19, 17)
    };
    
    // Calculate thumb position and angle
    const thumbTip = landmarks[4];
    const thumbBase = landmarks[2];
    const palmBase = landmarks[0];
    const thumbAngle = calculateAngle(thumbTip, thumbBase, palmBase);
    
    // Helper function to check if fingers are aligned vertically
    const areFingersTightlyAligned = () => {
        const fingerTips = [8, 12, 16, 20].map(idx => landmarks[idx]);
        const maxHorizontalDiff = Math.max(
            ...fingerTips.map(tip => Math.abs(tip[0] - landmarks[5][0]))
        );
        return maxHorizontalDiff < 30; // Fingers are within 30 pixels horizontally
    };

    // Pointing Up: Only index finger extended, others closed
    if (fingerConfigurations.index && 
        !fingerConfigurations.middle && 
        !fingerConfigurations.ring && 
        !fingerConfigurations.pinky) {
        // Verify index finger is pointing upward
        const indexTip = landmarks[8];
        const indexBase = landmarks[5];
        if (indexTip[1] < indexBase[1] - 50) { // At least 50 pixels above base
            return 'Pointing Up';
        }
    }
    
    // Open Palm: All fingers extended and spread
    if (Object.values(fingerConfigurations).every(extended => extended)) {
        // Check if thumb is also extended
        const thumbExtended = calculateAngle(thumbTip, thumbBase, palmBase) > 30;
        // Verify fingers are spread apart
        const spreadDistance = Math.abs(landmarks[8][0] - landmarks[20][0]); // Distance between index and pinky
        if (thumbExtended && spreadDistance > 50) {
            return 'Open Palm';
        }
    }
    
    // Closed Palm: All fingers closed together, palm facing camera
    if (!Object.values(fingerConfigurations).some(extended => extended)) {
        // Check if fingers are aligned and thumb is tucked
        if (areFingersTightlyAligned() && 
            Math.abs(thumbTip[0] - palmBase[0]) < 40 &&
            Math.abs(thumbTip[1] - palmBase[1]) < 40) {
            return 'Closed Palm';
        }
    }
    
    // Peace Sign: Index and middle extended, others closed
    if (fingerConfigurations.index && fingerConfigurations.middle && 
        !fingerConfigurations.ring && !fingerConfigurations.pinky) {
        // Verify fingers are spread apart
        const distance = Math.hypot(
            landmarks[8][0] - landmarks[12][0],
            landmarks[8][1] - landmarks[12][1]
        );
        if (distance > 30) { // Minimum distance between fingers
            return 'Peace Sign';
        }
    }
    
    // Thumbs Up: Thumb pointing up, all fingers closed
    if (thumbTip[1] < palmBase[1] && thumbAngle > 45 &&
        !Object.values(fingerConfigurations).some(extended => extended)) {
        return 'Thumbs Up';
    }
    
    // Thumbs Down: Thumb pointing down, all fingers closed
    if (thumbTip[1] > palmBase[1] && thumbAngle > 45 &&
        !Object.values(fingerConfigurations).some(extended => extended)) {
        return 'Thumbs Down';
    }
    
    return 'Analyzing...';
}

// Draw hand landmarks on canvas
function drawHand(landmarks) {
    // Set drawing styles
    context.fillStyle = 'red';
    context.strokeStyle = 'red';
    context.lineWidth = 1;

    // Draw all points
    landmarks.forEach(point => {
        context.beginPath();
        context.arc(point[0], point[1], 3, 0, 2 * Math.PI);
        context.fill();
    });

    // Draw palm connections
    const palmPoints = [0, 1, 2, 5, 9, 13, 17, 0];
    drawPath(landmarks, palmPoints, true);

    // Draw thumb
    drawPath(landmarks, [0, 1, 2, 3, 4]);

    // Draw fingers
    drawPath(landmarks, [5, 6, 7, 8]); // Index finger
    drawPath(landmarks, [9, 10, 11, 12]); // Middle finger
    drawPath(landmarks, [13, 14, 15, 16]); // Ring finger
    drawPath(landmarks, [17, 18, 19, 20]); // Pinky
}

// Helper function to draw paths
function drawPath(landmarks, indices, closePath = false) {
    context.beginPath();
    context.moveTo(landmarks[indices[0]][0], landmarks[indices[0]][1]);
    
    for (let i = 1; i < indices.length; i++) {
        const [x, y] = landmarks[indices[i]];
        context.lineTo(x, y);
    }

    if (closePath) {
        context.closePath();
    }
    context.stroke();
}

// Start the application when the document is loaded
document.addEventListener('DOMContentLoaded', init);
