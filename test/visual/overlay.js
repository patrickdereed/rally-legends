// Contact sheet shown full-window over the game (then take a screenshot). Usage from the console or devtools:
//   window.__views = [[carId, yaw, pitch, dist], ...]; window.__cols = 3; (await import('/visual/overlay.js')).sheet()
// Click the sheet to dismiss it.
export async function sheet() {
  const { CAR_BY_ID } = await import("/res/data.js");
  if (RL_APP.kitsReady) await RL_APP.kitsReady;
  const s = RL_APP.showroom; RL_APP.ui.hide(); RL_APP.menuActive = true;
  const cv = RL_APP.renderer.domElement, out = [];
  for (const [id, yaw, pitch, dist, lights] of window.__views) {
    const car = CAR_BY_ID[id]; s.show(car, car.livery, car.livery.rim); s.auto = false; s.yaw = yaw; s.pitch = pitch; s.dist = dist;
    if (lights) s.model.setLights(true);
    await new Promise(r => setTimeout(r, 250));
    s.update(0, RL_APP.camera, false); RL_APP.camera.clearViewOffset(); RL_APP.camera.updateProjectionMatrix();
    RL_APP.renderer.render(s.scene, RL_APP.camera);
    out.push(cv.toDataURL("image/jpeg", 0.9));
    if (lights) s.model.setLights(false);
  }
  const img = await Promise.all(out.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
  const cols = window.__cols || 3, cw = img[0].width * 0.5, ch = img[0].height * 0.62, c = document.createElement("canvas");
  c.width = cw * cols; c.height = ch * Math.ceil(img.length / cols);
  const x = c.getContext("2d");
  img.forEach((im, k) => x.drawImage(im, im.width * 0.25, im.height * 0.19, cw, ch, (k % cols) * cw, Math.floor(k / cols) * ch, cw, ch));
  let o = document.getElementById("__ov");
  if (!o) {
    o = document.createElement("img"); o.id = "__ov";
    o.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;z-index:99999;background:#000";
    o.onclick = () => o.remove();
    document.body.appendChild(o);
  }
  o.src = c.toDataURL("image/jpeg", 0.9);
  await new Promise(r => (o.onload = r));
  return [c.width, c.height];
}
