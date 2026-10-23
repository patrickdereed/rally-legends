async () => {
  // window.__views = [[carId, yaw, pitch, dist], ...] -> 2x2 or 3x2 grid of full-frame renders
  if (RL_APP.race) { RL_APP.race.dispose(); RL_APP.race = null; }
  await new Promise(r => setTimeout(r, 300));
  const errs = []; window.addEventListener('error', e => errs.push(e.message));
  const { CAR_BY_ID } = await import('/res/data.js');
  const s = RL_APP.showroom; RL_APP.ui.hide(); RL_APP.menuActive = true;
  const cv = RL_APP.renderer.domElement, out = [];
  for (const [id, yaw, pitch, dist] of window.__views) {
    const car = CAR_BY_ID[id]; s.show(car, car.livery, car.livery.rim); s.auto = false; s.yaw = yaw; s.pitch = pitch; s.dist = dist;
    await new Promise(r => setTimeout(r, 250));
    s.update(0, RL_APP.camera, false); RL_APP.camera.clearViewOffset(); RL_APP.camera.updateProjectionMatrix();
    RL_APP.renderer.render(s.scene, RL_APP.camera);
    out.push(cv.toDataURL('image/jpeg', 0.9));
  }
  const img = await Promise.all(out.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
  const cols = window.__cols || 2, cw = img[0].width * 0.5, ch = img[0].height * 0.62, c = document.createElement('canvas');
  c.width = cw * cols; c.height = ch * Math.ceil(img.length / cols);
  const x = c.getContext('2d');
  img.forEach((im, k) => x.drawImage(im, im.width * 0.25, im.height * 0.19, cw, ch, (k % cols) * cw, Math.floor(k / cols) * ch, cw, ch));
  if (errs.length) return 'ERR ' + errs.join(' | ');
  return c.toDataURL('image/jpeg', 0.9);
}
