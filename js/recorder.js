// "Download video": records one full play of the reel — 3D scene, holograms, HUD and soundtrack —
// and saves it as a single file. Uses tab capture cropped to the 9:16 frame (Chrome/Edge); falls
// back to recording the 3D canvas only where tab capture isn't available.
const TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];

export function setupRecorder({ game, canvas, sound, restart, total, fileName }) {
  const btn = document.getElementById('downloadBtn'), bar = document.getElementById('recBar'), fill = bar.querySelector('i'), label = bar.querySelector('span');
  let rec = null, stopping = false, tracks = [];

  async function begin() {
    if (rec) return;
    await sound.start();
    let video, cropped = false;
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 30 }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
      });
      video = s.getVideoTracks()[0];
      if (window.CropTarget && video.cropTo) { await video.cropTo(await CropTarget.fromElement(game)); cropped = true; }
    } catch (e) {
      if (e && e.name === 'NotAllowedError') return;              // the user cancelled the share dialog
      video = canvas.captureStream(30).getVideoTracks()[0];          // fallback: 3D scene only
      alert('Tab capture is not available in this browser, so the video will contain the 3D scene without the overlays. Use Chrome or Edge for the full reel.');
    }
    if (!cropped && video.label && !video.label.startsWith('canvas')) console.warn('[recorder] cropping not supported; recording the whole tab');
    const audio = sound.stream().getAudioTracks();
    tracks = [video, ...audio];
    const type = TYPES.find(t => MediaRecorder.isTypeSupported(t)) || '';
    rec = new MediaRecorder(new MediaStream(tracks), { mimeType: type, videoBitsPerSecond: 14e6, audioBitsPerSecond: 192e3 });
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${fileName}.${/mp4/.test(blob.type) ? 'mp4' : 'webm'}` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      tracks.forEach(t => t.stop()); rec = null;
      document.body.classList.remove('recording'); label.textContent = ''; document.title = document.title.replace(/^● REC \d+% · /, '');
    };
    video.addEventListener('ended', () => rec && rec.state === 'recording' && rec.stop());   // user pressed "Stop sharing"
    document.body.classList.add('recording');
    await new Promise(r => setTimeout(r, 350));                     // let the crop settle before rolling
    rec.start(1000); stopping = false;
    restart();                                                       // roll from the Joint Travellers title card
  }

  btn.addEventListener('click', begin);
  return {
    // driven by the reel's own clock, so slow frames never cut the video short
    tick(clock) {
      if (!rec || rec.state !== 'recording') return;
      const k = Math.min(1, clock / total());
      fill.style.width = `${k * 100}%`;
      label.textContent = `● REC ${Math.round(k * 100)}% — keep this tab open`;
      document.title = `● REC ${Math.round(k * 100)}% · ` + document.title.replace(/^● REC \d+% · /, '');
      if (k >= 1 && !stopping) { stopping = true; setTimeout(() => rec && rec.stop(), 700); }
    },
    get recording() { return !!rec; },
  };
}
