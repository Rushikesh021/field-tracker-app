/**
 * Mobile-Optimized HTML5 Canvas Image Compression.
 * - Max dimension: 1280px (preserves aspect ratio)
 * - Format: JPEG, Quality: 0.7
 */
export function compressImageFile(file: File, maxDimension = 1280, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const isImage = (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);
    if (!isImage) {
      return reject(new Error(`"${file.name}" is not a recognized image format.`));
    }

    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      objectUrl = '';
    }

    const processImageElement = (img: HTMLImageElement) => {
      try {
        let { width, height } = img;
        if (width <= 0 || height <= 0) {
          width = 1280;
          height = 720;
        }

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      } catch (err: unknown) {
        const error = err as { message?: string };
        reject(new Error(error.message || 'Image processing failed on this device.'));
      }
    };

    if (objectUrl) {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        processImageElement(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        const reader = new FileReader();
        reader.onload = (e) => {
          const fallbackImg = new Image();
          fallbackImg.onload = () => processImageElement(fallbackImg);
          fallbackImg.onerror = () => reject(new Error(`Failed to decode image.`));
          fallbackImg.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error(`Could not read selected photo.`));
        reader.readAsDataURL(file);
      };
      img.src = objectUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fallbackImg = new Image();
        fallbackImg.onload = () => processImageElement(fallbackImg);
        fallbackImg.onerror = () => reject(new Error(`Failed to decode image.`));
        fallbackImg.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error(`Could not read selected photo.`));
      reader.readAsDataURL(file);
    }
  });
}

/**
 * Compresses a base64 / dataUrl image from native Capacitor Camera.
 */
export function compressBase64OrDataUrl(dataUrl: string, maxDimension = 1280, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width <= 0 || height <= 0) {
          width = 1280;
          height = 720;
        }
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err: unknown) {
        const error = err as { message?: string };
        reject(new Error(error.message || 'Image processing failed.'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image from camera'));
    img.src = dataUrl;
  });
}
