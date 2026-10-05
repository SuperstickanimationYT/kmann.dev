const FRAMES_PER_SECOND = 24;
const BITS_PER_SECOND = 12_000_000;
const STILL_QUALITY = 0.92;
const DECODE_AHEAD = 8;
const ENCODES_IN_FLIGHT = 4;
const FORMATS = [
  { type: 'video/mp4;codecs=avc1', extension: 'mp4' },
  { type: 'video/webm;codecs=vp9', extension: 'webm' },
  { type: 'video/webm', extension: 'webm' },
];

export const videoFormat = () => FORMATS.find(({ type }) => window.MediaRecorder?.isTypeSupported(type)) ?? null;

const untilTime = (time) => new Promise((resolve) => setTimeout(resolve, Math.max(0, time - performance.now())));

function fastestStillType() {
  const probe = document.createElement('canvas');
  [probe.width, probe.height] = [1, 1];
  return probe.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
}

const stillOf = (picture, type) => new Promise((resolve) => picture.toBlob(resolve, type, STILL_QUALITY));

async function captureStills({ frames, pictureAt, onFrame, cancelled }) {
  const type = fastestStillType();
  const stills = [];
  for (let frame = 0; frame < frames && !cancelled(); frame++) {
    if (frame >= ENCODES_IN_FLIGHT) await stills[frame - ENCODES_IN_FLIGHT];
    stills.push(stillOf(await pictureAt(frame), type));
    onFrame(frame + 1);
  }
  return Promise.all(stills);
}

async function playIntoRecorder(stills, { width, height, cancelled }) {
  const format = videoFormat();
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [width, height];
  const context = canvas.getContext('2d');
  const stream = canvas.captureStream(0);
  const [track] = stream.getVideoTracks();
  const recorder = new MediaRecorder(stream, { mimeType: format.type, videoBitsPerSecond: BITS_PER_SECOND });
  const chunks = [];
  recorder.addEventListener('dataavailable', ({ data }) => data.size && chunks.push(data));
  const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve));

  const decoded = stills.slice(0, DECODE_AHEAD).map((still) => createImageBitmap(still));
  recorder.start();
  const start = performance.now();
  for (let frame = 0; frame < stills.length && !cancelled(); frame++) {
    if (frame + DECODE_AHEAD < stills.length) decoded.push(createImageBitmap(stills[frame + DECODE_AHEAD]));
    const bitmap = await decoded[frame];
    await untilTime(start + (frame * 1000) / FRAMES_PER_SECOND);
    context.drawImage(bitmap, 0, 0, width, height);
    track.requestFrame();
    bitmap.close();
  }
  await untilTime(start + (stills.length * 1000) / FRAMES_PER_SECOND);
  recorder.stop();
  await stopped;
  track.stop();
  return { blob: new Blob(chunks, { type: format.type }), extension: format.extension };
}

export async function recordFrames({ width, height, frames, pictureAt, onFrame, onPlayback, cancelled }) {
  const stills = await captureStills({ frames, pictureAt, onFrame, cancelled });
  if (cancelled()) return null;
  onPlayback(stills.length / FRAMES_PER_SECOND);
  const video = await playIntoRecorder(stills, { width, height, cancelled });
  return cancelled() ? null : video;
}
