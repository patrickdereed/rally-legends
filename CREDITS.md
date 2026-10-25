# Credits

## Car models

All twelve cars use modelled bodies made by other artists and shared on Sketchfab under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Thank you to the authors.

| In the game | Model | Author |
|---|---|---|
| Ronin Evo VI | [Thunderbolt '96 - Low poly model](https://sketchfab.com/3d-models/thunderbolt-96-low-poly-model-25a4ff2002834ec1b4441c57ecd7ca9f) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Pleiad WRX '98 | [Generic Toyama XR Sedan](https://sketchfab.com/3d-models/generic-toyama-xr-sedan-a161542c38ac44fca3b1c283f6d986bb) | [mk2design](https://sketchfab.com/mk2design) |
| Lionne 205 T16 | [Placeholder MV6 '83 - Low poly model](https://sketchfab.com/3d-models/placeholder-mv6-83-low-poly-model-d78bdfc34e024ac7926853f9ae863190) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Asti S4 | [Asti Stradale '89 - Low poly model](https://sketchfab.com/3d-models/asti-stradale-89-low-poly-model-97b15b067111443ebe05840137b49c65) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Mosquito 1275 S | [Lasley '67 - Low poly model](https://sketchfab.com/3d-models/lasley-67-low-poly-model-1269720ec7b84c899eac77c1d325141e) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Sialia SW 1800 | [Sialia SW '68 Racemod - Low poly model](https://sketchfab.com/3d-models/sialia-sw-68-racemod-low-poly-model-2e63fb0a8f7e4ea9b3cbf796e8373d49) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Pennine RS1800 | [Doutrive '78 - Low poly model](https://sketchfab.com/3d-models/doutrive-78-low-poly-model-30700a84311c4bea9ef722f0773ce92a) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Sanremo 2000 Abarth | [Sanremo '70 - Low poly model](https://sketchfab.com/3d-models/sanremo-70-low-poly-model-b2261c471645417a8b7e5882d541c248) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Fairheaven SW Turbo 4x4 | [Fairheaven SW '84 - Low poly model](https://sketchfab.com/3d-models/fairheaven-sw-84-low-poly-model-aa0becb6e854422596cac6b21bf79787) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Eagle Turbo GT-R | [Eagle Turbo '92 - Retro Style Model](https://sketchfab.com/3d-models/eagle-turbo-92-retro-style-model-eb7d6c072bf54d9ba6a48f6d49e6abeb) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Kaze R1 Hybrid | [Stinger '96 - Low Poly model](https://sketchfab.com/3d-models/stinger-96-low-poly-model-a9832fee5393460baf1675fade6f2f25) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |
| Ferox Rally1 Hybrid | [Urban '10 - Low poly model](https://sketchfab.com/3d-models/urban-10-low-poly-model-2866efdfa943484391ef8313768e074d) | [Daniel Zhabotinsky](https://sketchfab.com/DanielZhabotinsky) |

Changes made for the game (by `tools/build-cars.mjs`): the models were converted to car space, their wheels and
brake callipers were removed (the game draws its own), lamp parts were given separate materials, a second UV set
was added for the liveries, textures were resized and re-encoded as WebP, the MV6 was scaled up 10% and
lengthened 8%, the Doutrive scaled to 88%, the Stinger up 6% and the Eagle to 95%, and off-centre models were centred. In the game the paint is replaced by the player's livery, and number boards, stickers, crew and mud
flaps are added.

## Code and fonts

- [three.js](https://threejs.org) r170, including `GLTFLoader.js` and `BufferGeometryUtils.js` (MIT; see `three.LICENSE.txt`).
