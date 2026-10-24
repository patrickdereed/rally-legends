// Prints the node tree, meshes, materials and textures of a GLB.
// node tools/inspect.mjs <file.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const f = (v) => v.map((n) => n.toFixed(2)).join(",");

function walk(node, depth) {
  const m = node.getMesh();
  let info = "";
  if (m) {
    const tris = m.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute("POSITION").getCount()) / 3, 0);
    const mats = m.listPrimitives().map((p) => p.getMaterial()?.getName()).join("|");
    const b = getBounds(node);
    info = ` mesh=${m.getName()} tris=${tris} mats=[${mats}] min=${f(b.min)} max=${f(b.max)}`;
  }
  console.log(`${"  ".repeat(depth)}${node.getName()} t=${f(node.getTranslation())} r=${f(node.getRotation())} s=${f(node.getScale())}${info}`);
  for (const c of node.listChildren()) walk(c, depth + 1);
}
for (const s of root.listScenes()) {
  console.log("scene", s.getName(), "bounds", JSON.stringify(getBounds(s)));
  for (const n of s.listChildren()) walk(n, 0);
}
console.log("\nmaterials:");
for (const m of root.listMaterials()) {
  const tex = ["BaseColor", "MetallicRoughness", "Normal", "Emissive", "Occlusion"].map((k) => [k, m[`get${k}Texture`]()]).filter(([, t]) => t).map(([k, t]) => `${k}:${t.getName() || t.getURI()}`);
  console.log(` ${m.getName()} color=${f(m.getBaseColorFactor())} metal=${m.getMetallicFactor()} rough=${m.getRoughnessFactor()} alpha=${m.getAlphaMode()} ${tex.join(" ")}`);
}
console.log("\ntextures:");
for (const t of root.listTextures()) console.log(` ${t.getName()} ${t.getMimeType()} ${t.getSize()?.join("x")} ${(t.getImage().byteLength / 1024).toFixed(0)}KB`);
