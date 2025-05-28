// Import MediaPipe libraries
import { FilesetResolver, HandLandmarker, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

window.FilesetResolver = FilesetResolver;
window.HandLandmarker = HandLandmarker;
window.DrawingUtils = DrawingUtils;
window.HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

// Helper drawing functions
window.drawConnectors = function(ctx, landmarks, connections, options) {
    const drawingUtils = new DrawingUtils(ctx);
    drawingUtils.drawConnectors(landmarks, connections, options);
};

window.drawLandmarks = function(ctx, landmarks, options) {
    const drawingUtils = new DrawingUtils(ctx);
    drawingUtils.drawLandmarks(landmarks, options);
};

// Custom Gesture Recognition Class
class CustomGestureRecognizer {
    constructor() {
        this.gestureHistory = [];
        this.confidenceThreshold = 0.7;
    }

    calculateDistance(point1, point2) {
        return Math.sqrt(
            Math.pow(point1.x - point2.x, 2) + 
            Math.pow(point1.y - point2.y, 2)
        );
    }

    calculateAngle(point1, point2, point3) {
        const a = this.calculateDistance(point2, point3);
        const b = this.calculateDistance(point1, point3);
        const c = this.calculateDistance(point1, point2);
        const angle = Math.acos((a * a + c * c - b * b) / (2 * a * c));
        return angle * (180 / Math.PI);
    }

    getFingerStates(landmarks) {
    const fingerTips = [4, 8, 12, 16, 20];           // Tips of all fingers
    const fingerKnuckles = [2, 5, 9, 13, 17];        // Base knuckles (where fingers meet palm)
    const fingerMiddleJoints = [3, 6, 10, 14, 18];   // Middle joints of fingers
    let fingerStates = [];

    // Thumb detection 
    const thumbTip = landmarks[4];
    const thumbKnuckle = landmarks[2];             
    const thumbBase = landmarks[1];                 
    const thumbExtended = this.calculateDistance(thumbTip, thumbBase) > 
                        this.calculateDistance(thumbKnuckle, thumbBase) * 1.2;
    fingerStates.push(thumbExtended);

    // Check other fingers (index, middle, ring, pinky)
    for (let i = 1; i < 5; i++) {
        const fingerTipY = landmarks[fingerTips[i]].y;              
        const middleJointY = landmarks[fingerMiddleJoints[i]].y;    
        const knuckleY = landmarks[fingerKnuckles[i]].y;            
        
        // More reliable finger extension detection
        const fingerExtended = (fingerTipY < middleJointY - 0.02) && (middleJointY < knuckleY + 0.01);
        fingerStates.push(fingerExtended);
    }

    return fingerStates;
}


    //single-hand gesture classification 
    classifySingleHandGesture(landmarks) {
        if (!landmarks || landmarks.length < 21) return null;

        const fingerStates = this.getFingerStates(landmarks);
        const [thumb, index, middle, ring, pinky] = fingerStates;

        const wrist = landmarks[0];
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        const indexMCP = landmarks[5];
        const middleMCP = landmarks[9];

        // Thumbs Up
        if (thumb && !index && !middle && !ring && !pinky) {
            const thumbAngle = this.calculateAngle(landmarks[2], landmarks[3], landmarks[4]);
            if (thumbAngle > 150 && thumbTip.y < wrist.y - 0.05) {
                return { gesture: 'Thumbs Up', confidence: 0.9 };
            }
        }

        // Thumbs Down
        if (thumb && !index && !middle && !ring && !pinky) {
            if (thumbTip.y > wrist.y + 0.05) {
                return { gesture: 'Thumbs Down', confidence: 0.85 };
            }
        }

        // Fist Detection 
        if (!thumb && !index && !middle && !ring && !pinky) {
            // Additional check: all fingertips should be close to palm
            const palmCenter = landmarks[0];
            const indexTipDistance = this.calculateDistance(indexTip, palmCenter);
            const middleTipDistance = this.calculateDistance(middleTip, palmCenter);
            const ringTipDistance = this.calculateDistance(ringTip, palmCenter);
            
            if (indexTipDistance < 0.15 && middleTipDistance < 0.15 && ringTipDistance < 0.15) {
                return { gesture: 'Fist', confidence: 0.95 };
            }
        }

        // Open Palm
        if (thumb && index && middle && ring && pinky) {
            const indexMiddleDistance = this.calculateDistance(indexTip, middleTip);
            const middleRingDistance = this.calculateDistance(middleTip, ringTip);
            const avgDistance = (indexMiddleDistance + middleRingDistance) / 2;
            
            if (avgDistance > 0.03) {
                return { gesture: 'Open Palm', confidence: 0.9 };
            }
        }

        // Peace Sign 
        if (index && middle && !ring && !pinky) {
        const indexTip = landmarks[8];
        const indexMiddleJoint = landmarks[6];
        const middleTip = landmarks[12];
        const middleMiddleJoint = landmarks[10];
        const wrist = landmarks[0];
        
        // Check if fingers are straight and pointing up
        const indexStraight = indexTip.y < indexMiddleJoint.y - 0.02;
        const middleStraight = middleTip.y < middleMiddleJoint.y - 0.02;
        const bothPointingUp = indexTip.y < wrist.y && middleTip.y < wrist.y;
        
        // Check separation between fingers
        const fingerSeparation = this.calculateDistance(indexTip, middleTip);
        
        if (indexStraight && middleStraight && bothPointingUp && fingerSeparation > 0.03) {
            return { gesture: 'Peace Sign', confidence: 0.9 };
        }
    }

        // OK Sign
        const thumbIndexDistance = this.calculateDistance(thumbTip, indexTip);
        if (thumbIndexDistance < 0.06 && middle && ring && pinky) {
            return { gesture: 'OK Sign', confidence: 0.85 };
        }

        // Pointing Up
        if (index && !middle && !ring && !pinky) {
        const indexTip = landmarks[8];
        const indexMiddleJoint = landmarks[6];
        const indexKnuckle = landmarks[5];
        const wrist = landmarks[0];
        
        // Check if index finger is straight and pointing up
        const indexStraight = indexTip.y < indexMiddleJoint.y - 0.02;
        const pointingUp = indexTip.y < indexKnuckle.y - 0.05;
        const aboveWrist = indexTip.y < wrist.y - 0.03;
        
        if (indexStraight && pointingUp && aboveWrist) {
            return { gesture: 'Pointing Up', confidence: 0.9 };
        }
    }
        // Default cases
        const extendedCount = fingerStates.filter(Boolean).length;
        if (extendedCount === 0) {
            return { gesture: 'Closed Hand', confidence: 0.7 };
        } else if (extendedCount === 5) {
            return { gesture: 'Open Hand', confidence: 0.7 };
        }

        return { gesture: 'Unknown', confidence: 0.5 };
    }

    // Two-hand gesture classification
    classifyTwoHandGesture(results) {
        const leftHand = results.landmarks[0];
        const rightHand = results.landmarks[1];

        // Praying hands detection
        const leftWrist = leftHand[0];
        const rightWrist = rightHand[0];
        const leftMiddleTip = leftHand[12];
        const rightMiddleTip = rightHand[12];

        // Check if palms are facing each other and close together
        const wristDistance = this.calculateDistance(leftWrist, rightWrist);
        const tipDistance = this.calculateDistance(leftMiddleTip, rightMiddleTip);
        const yDifference = Math.abs(leftWrist.y - rightWrist.y);

        if (wristDistance < 0.15 && tipDistance < 0.1 && yDifference < 0.05) {
            // Check if fingers are extended on both hands
            const leftFingers = this.getFingerStates(leftHand);
            const rightFingers = this.getFingerStates(rightHand);
            const leftExtended = leftFingers.filter(Boolean).length;
            const rightExtended = rightFingers.filter(Boolean).length;

            if (leftExtended >= 4 && rightExtended >= 4) {
                return { gesture: 'Praying Hands', confidence: 0.9 };
            }
        }
        return { gesture: 'Two Hands Detected', confidence: 0.6 };
    }

    // Main classification method
    classifyGesture(results) {
        if (!results.landmarks || results.landmarks.length === 0) return null;

        // Two-hand gestures
        if (results.landmarks.length === 2) {
            return this.classifyTwoHandGesture(results);
        }

        // Single-hand gestures
        const landmarks = results.landmarks[0];
        return this.classifySingleHandGesture(landmarks);
    }

    recognizeWithHistory(results) {
        const result = this.classifyGesture(results);
        if (!result) return null;

        this.gestureHistory.push(result);
        if (this.gestureHistory.length > 5) {
            this.gestureHistory.shift();
        }

        const gestureCounts = {};
        this.gestureHistory.forEach(g => {
            gestureCounts[g.gesture] = (gestureCounts[g.gesture] || 0) + 1;
        });

        const mostCommon = Object.keys(gestureCounts).reduce((a, b) => 
            gestureCounts[a] > gestureCounts[b] ? a : b
        );

        const confidence = gestureCounts[mostCommon] / this.gestureHistory.length;

        if (confidence >= this.confidenceThreshold) {
            return { gesture: mostCommon, confidence: confidence };
        }

        return result;
    }
}

// Main Application
let handLandmarker = null;
let runningMode = "IMAGE";
let webcamRunning = false;
const customGestureRecognizer = new CustomGestureRecognizer();

// Initialize MediaPipe Hand Landmarker
async function createHandLandmarker() {
    try {
        if (!window.FilesetResolver) {
            throw new Error("MediaPipe libraries not loaded yet");
        }

        const vision = await window.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        handLandmarker = await window.HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU"
            },
            runningMode: runningMode,
            numHands: 2 // Support both one and two hands
        });

        return true;
    } catch (error) {
        console.error("Error creating hand landmarker:", error);
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    const video = document.getElementById("webcam");
    const canvasElement = document.getElementById("output_canvas");
    const canvasCtx = canvasElement.getContext("2d");
    const gestureOutput = document.getElementById("gesture_output");
    const enableWebcamButton = document.getElementById("webcamButton");

    // Check webcam support
    function hasGetUserMedia() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    // Enable/disable webcam
    async function toggleWebcam() {
        try {
            if (webcamRunning) {
                webcamRunning = false;
                enableWebcamButton.textContent = "🎥 Enable Webcam";
                
                if (video.srcObject) {
                    const tracks = video.srcObject.getTracks();
                    tracks.forEach(track => track.stop());
                    video.srcObject = null;
                }
                
                gestureOutput.textContent = "Webcam disabled";
                gestureOutput.classList.remove('active');
                return;
            }

            if (!handLandmarker) {
                enableWebcamButton.textContent = "Loading...";
                await createHandLandmarker();
            }

            const constraints = {
                video: { width: 320, height: 240 },
                audio: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            webcamRunning = true;
            enableWebcamButton.textContent = "🚫 Disable Webcam";

            video.addEventListener("loadeddata", () => {
                predictWebcam();
            });

        } catch (err) {
            console.error('Error accessing webcam:', err);
            alert("Camera access failed: " + err.message);
            enableWebcamButton.textContent = "🎥 Enable Webcam";
        }
    }

    // Webcam prediction loop
    let lastVideoTime = -1;
    async function predictWebcam() {
        if (!handLandmarker) return;

        if (runningMode === "IMAGE") {
            runningMode = "VIDEO";
            await handLandmarker.setOptions({ runningMode: "VIDEO" });
        }

        let startTimeMs = performance.now();

        if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const results = handLandmarker.detectForVideo(video, startTimeMs);

            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            if (results.landmarks && results.landmarks.length > 0) {
                // Draw all detected hands
                for (let i = 0; i < results.landmarks.length; i++) {
                    const landmarks = results.landmarks[i];
                    const handColor = i === 0 ? '#00FF00' : '#00FFFF';
                    const pointColor = i === 0 ? '#FF0000' : '#FF00FF';

                    window.drawConnectors(
                        canvasCtx,
                        landmarks,
                        window.HAND_CONNECTIONS,
                        { color: handColor, lineWidth: 3 }
                    );

                    window.drawLandmarks(
                        canvasCtx,
                        landmarks,
                        { color: pointColor, lineWidth: 2, radius: 3 }
                    );
                }

                // Gesture recognition
                const gestureResult = customGestureRecognizer.recognizeWithHistory(results);
                
                if (gestureResult && gestureResult.confidence > 0.6) {
                    const confidencePercent = (gestureResult.confidence * 100).toFixed(1);
                    gestureOutput.innerHTML = `
                        <div style="font-size: 1.2em; font-weight: bold;">${gestureResult.gesture}</div>
                        <div style="font-size: 0.9em; opacity: 0.8;">Confidence: ${confidencePercent}%</div>
                    `;
                    gestureOutput.classList.add('active');
                } else {
                    gestureOutput.textContent = "No gesture detected";
                    gestureOutput.classList.remove('active');
                }
            } else {
                gestureOutput.textContent = "No hands detected";
                gestureOutput.classList.remove('active');
            }

            canvasCtx.restore();
        }

        if (webcamRunning) {
            window.requestAnimationFrame(predictWebcam);
        }
    }

    // Button event listeners
    enableWebcamButton.addEventListener("click", toggleWebcam);

    // Check camera support
    if (hasGetUserMedia()) {
        enableWebcamButton.addEventListener("click", toggleWebcam);
    } else {
        console.warn("getUserMedia() is not supported by your browser");
        enableWebcamButton.disabled = true;
        enableWebcamButton.textContent = "Camera not supported";
    }
});
