const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  video.srcObject = stream;
  return new Promise(resolve => {
    video.onloadedmetadata = () => resolve(video);
  });
}

async function main() {
  await setupCamera();
  video.play();

  const model = await handpose.load();
  console.log("Handpose model loaded");

  async function detectHands() {
    const predictions = await model.estimateHands(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    predictions.forEach(prediction => {
      prediction.landmarks.forEach(point => {
        const [x, y] = point;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "red";
        ctx.fill();
      });
    });

    requestAnimationFrame(detectHands);
  }

  detectHands();
}

main();
