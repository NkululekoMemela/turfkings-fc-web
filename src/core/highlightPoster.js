// Capture a small first-frame image from the local upload while the video transfers.
export function captureHighlightPoster(file) {
  if (!file || typeof document === "undefined") return Promise.resolve("");
  return new Promise(resolve => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let finished = false;
    const finish = (poster = "") => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      video.onloadeddata = video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(poster);
    };
    const timer = setTimeout(finish, 1800);
    video.onerror = () => finish();
    video.onloadeddata = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 240 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        for (const quality of [.58, .4, .25]) {
          const poster = canvas.toDataURL("image/jpeg", quality);
          if (poster.startsWith("data:image/jpeg;") && poster.length <= 8192) return finish(poster);
        }
      } catch { /* Unrecognised codecs can still use a video preview. */ }
      finish();
    };
    video.src = url;
  });
}
