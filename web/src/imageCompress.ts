// Сжатие изображения в браузере до загрузки: ужимаем по большей стороне и
// перекодируем в JPEG. С телефона прилетают снимки на несколько мегабайт, а в
// панели и в чате столько не нужно — экономим и трафик, и место на диске.

const MAX_DIMENSION = 1600; // px по большей стороне
const QUALITY = 0.8;
const SKIP_UNDER = 1024 * 1024; // мелкие файлы (<1 МБ) и так не трогаем

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')); };
    img.src = url;
  });
}

// Возвращает сжатый JPEG-File либо исходный файл, если сжимать нечего/не вышло.
// Никогда не бросает — при любой ошибке отдаёт оригинал, чтобы загрузка не падала.
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  // GIF потерял бы анимацию на canvas, SVG нет смысла растрировать.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }

  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  if (scale === 1 && file.size <= SKIP_UNDER) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', QUALITY));
  if (!blob || blob.size >= file.size) return file; // не раздуваем — берём меньшее

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}
