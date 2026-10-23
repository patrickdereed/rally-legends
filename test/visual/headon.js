async () => {
  if (RL_APP.race) { RL_APP.race.dispose(); RL_APP.race = null; }
  await new Promise(r => setTimeout(r, 300));
  const { CARS } = await import('/res/data.js');
  const s = RL_APP.showroom; RL_APP.ui.hide(); RL_APP.menuActive = true;
  const cv = RL_APP.renderer.domElement, out = [];
  const ids = window.__ids || CARS.map(c => c.id), yaw = window.__yaw || 0;
  for (const id of ids) {
    const car = CARS.find(c => c.id === id); s.show(car, car.livery, car.livery.rim); s.auto = false; s.yaw = yaw; s.pitch = window.__pitch || 0.06; s.dist = window.__dist || 4.4;
    await new Promise(r => setTimeout(r, 250));
    s.update(0, RL_APP.camera, false); RL_APP.camera.clearViewOffset(); RL_APP.camera.updateProjectionMatrix();
    RL_APP.renderer.render(s.scene, RL_APP.camera);
    out.push(cv.toDataURL('image/jpeg', 0.9));
  }
  const img = await Promise.all(out.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
  const cols = 5, cw = img[0].width * 0.36, ch = img[0].height * 0.46, c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * Math.ceil(img.length / cols);
  const x = c.getContext('2d');
  img.forEach((im, k) => x.drawImage(im, im.width * 0.32, im.height * 0.3, cw, ch, (k % cols) * cw, Math.floor(k / cols) * ch, cw, ch));
  return c.toDataURL('image/jpeg', 0.9);
}
