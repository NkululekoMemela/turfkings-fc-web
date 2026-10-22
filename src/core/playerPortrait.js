export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function makePortraitPhotoDataUrl(file, width = 420, height = 520) {
  const raw = await fileToDataUrl(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve(raw);
          return;
        }

        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, width, height);

        const scale = Math.max(width / img.width, height / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = (width - drawW) / 2;
        const dy = (height - drawH) / 2;

        ctx.drawImage(img, dx, dy, drawW, drawH);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = raw;
  });
}
