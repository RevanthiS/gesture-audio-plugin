navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    const video = document.querySelector("video");
    if (video) {
      video.srcObject = stream;
    }
  })
  .catch(err => {
    console.error('Error accessing media:', err.name, err.message);
    alert('Media access error: ' + err.name + '\n' + err.message);
  });
  
