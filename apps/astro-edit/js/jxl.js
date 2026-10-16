import initDecoder, { JxlImage } from '../vendor/jxl-oxide-wasm/jxl_oxide_wasm.js';
import { decodePng } from './png.js';

let decoderReady = null;

export async function decodeJxl(bytes) {
  decoderReady ??= initDecoder({ module_or_path: new URL('../vendor/jxl-oxide-wasm/jxl_oxide_wasm_bg.wasm', import.meta.url) });
  await decoderReady;
  const image = new JxlImage();
  try {
    image.feedBytes(bytes);
    if (!image.tryInit()) throw new Error('The JPEG XL data in this file is incomplete.');
    return decodePng(image.render().encodeToPng());
  } finally {
    image.free();
  }
}
