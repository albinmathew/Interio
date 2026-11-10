/**
 * Header-only image inspection: real format and pixel size of a PNG or JPEG.
 * No decoding, no dependencies. Used to reject non-images before they reach
 * the model and to know the pixel frame the model's coordinates refer to.
 */

export type ImageMediaType = 'image/png' | 'image/jpeg';

export interface ImageInfo {
  mediaType: ImageMediaType;
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Returns null when the bytes are not a readable PNG or JPEG. */
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  return inspectPng(bytes) ?? inspectJpeg(bytes);
}

function inspectPng(bytes: Uint8Array): ImageInfo | null {
  // signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4)
  if (bytes.length < 24) return null;
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  if (ascii(bytes, 12, 4) !== 'IHDR') return null;
  const view = viewOf(bytes);
  return sized('image/png', view.getUint32(16), view.getUint32(20));
}

function inspectJpeg(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = viewOf(bytes);
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    // Fill bytes before a marker.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Markers without a payload: TEM, RSTn, SOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    // End of image or start of scan before any frame header.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = view.getUint16(i + 2);
    if (length < 2) return null;
    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      // length (2) + precision (1) + height (2) + width (2)
      if (i + 9 > bytes.length) return null;
      return sized('image/jpeg', view.getUint16(i + 7), view.getUint16(i + 5));
    }
    i += 2 + length;
  }
  return null;
}

function sized(mediaType: ImageMediaType, width: number, height: number): ImageInfo | null {
  return width > 0 && height > 0 ? { mediaType, width, height } : null;
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
