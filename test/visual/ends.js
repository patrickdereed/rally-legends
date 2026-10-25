async () => {
  if (RL_APP.race) { RL_APP.race.dispose(); RL_APP.race = null; }
  const { CAR_BY_ID } = await import('/res/data.js');
  const s = RL_APP.showroom; RL_APP.ui.hide(); RL_APP.menuActive = true;
  const cv = RL_APP.renderer.domElement, out = [];
  const ids = window.__ids || ['mosquito', 'asti', 'pleiad', 'kaze'];
  for (const id of ids) for (const yaw of [0.35, Math.PI - 0.35]) {
    const car = CAR_BY_ID[id]; s.show(car, car.livery, car.livery.rim); s.auto = false; s.yaw = yaw; s.pitch = 0.12; s.dist = 5.2;
    await new Promise(r => setTimeout(r, 250));
    s.update(0, RL_APP.camera, false);
    RL_APP.renderer.render(s.scene, RL_APP.camera);
    out.push(cv.toDataURL('image/jpeg', 0.85));
  }
  const img = await Promise.all(out.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
  const cw = img[0].width * 0.42, ch = img[0].height * 0.55, c = document.createElement('canvas'); c.width = cw * 4; c.height = ch * Math.ceil(img.length / 4);
  const x = c.getContext('2d');
  img.forEach((im, k) => x.drawImage(im, im.width * 0.29, im.height * 0.25, cw, ch, (k % 4) * cw, Math.floor(k / 4) * ch, cw, ch));
  return c.toDataURL('image/jpeg', 0.85);
}
