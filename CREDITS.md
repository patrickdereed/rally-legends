# Credits

## Car models

Four cars use modelled bodies made by other artists and shared on Sketchfab under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Thank you to the authors.

| In the game | Model | Author |
|---|---|---|
| Ronin Evo VI | [Thunderbolt '96 - Low poly model](https://sketchfab.com/3d-models/thunderbolt-96-low-poly-model-25a4ff2002834ec1b4441c57ecd7ca9f) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Pleiad WRX '98 | [Generic Toyama XR Sedan](https://sketchfab.com/3d-models/generic-toyama-xr-sedan-a161542c38ac44fca3b1c283f6d986bb) | [mk2design](https://sketchfab.com/mk2design) |
| Lionne 205 T16 | [Placeholder MV6 '83 - Low poly model](https://sketchfab.com/3d-models/placeholder-mv6-83-low-poly-model-d78bdfc34e024ac7926853f9ae863190) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Asti S4 | [Asti Stradale '89 - Low poly model](https://sketchfab.com/3d-models/asti-stradale-89-low-poly-model-97b15b067111443ebe05840137b49c65) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |

Changes made for the game (by `tools/build-cars.mjs`): the models were converted to car space, their wheels and
brake callipers were removed (the game draws its own), lamp parts were given separate materials, a second UV set
was added for the liveries, textures were resized and re-encoded as WebP, and the MV6 was scaled up 10% and
lengthened 8%. In the game the paint is replaced by the player's livery, and number boards, stickers, crew and mud
flaps are added.

## Code and fonts

- [three.js](https://threejs.org) r170, including `GLTFLoader.js` and `BufferGeometryUtils.js` (MIT; see `three.LICENSE.txt`).
