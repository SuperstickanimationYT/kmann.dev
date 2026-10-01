async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

export async function songFromShareCode(code) {
  const binary = atob(code.replace(/^.*#s=/, '').replaceAll('-', '+').replaceAll('_', '/'));
  const raw = JSON.parse(await inflate(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
  const soloed = raw.tracks.some((track) => track.solo);
  return {
    ...raw,
    tracks: raw.tracks
      .filter((track) => !track.muted && (!soloed || track.solo))
      .map((track) => ({ ...track, notes: track.notes.map(([row, step, length]) => ({ row, step, length })) })),
  };
}
