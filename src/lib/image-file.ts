export async function urlToImageFile(url: string, filename = "food.jpg"): Promise<File> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`IMAGE_FETCH_FAILED_${resp.status}`);

  const blob = await resp.blob();
  if (!blob || blob.size <= 0) throw new Error("IMAGE_EMPTY");

  const type = blob.type || "image/jpeg";
  return new File([blob], filename, { type, lastModified: Date.now() });
}

export function normalizePickedImageFile(file: File, filename = "food.jpg"): File {
  // Ensure a real File with a stable name/type for downstream pipeline
  const type = file.type || "image/jpeg";
  const sliced = file.slice(0, file.size, type);
  return new File([sliced], filename, { type, lastModified: file.lastModified || Date.now() });
}
