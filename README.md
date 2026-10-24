# Rally Legends

A rally time-attack game that runs inside Salesforce as a Visualforce tab. Drive against the clock on 27 stages across nine famous rallies, from 1960s Heritage cars to modern Rally1 hybrids, and build a career through five championship eras.

The game reads no Salesforce data and makes no callouts. Progress is saved in the player's browser (`localStorage`), per Salesforce user.

## What's in the game

- **9 rallies, 27 stages:** Monte-Carlo (Col de Turini at night), Sweden, Finland, Wales, Portugal (Fafe), Kenya, Greece, Corsica and Argentina. Every stage is generated from a fixed seed: hairpins, switchbacks, crests and jumps, ice patches, snow banks, armco and stone walls, crowds, villages, forests, lakes and the sea. Many stages also run through rock and concrete tunnels (the light drops and the headlamps come on), over stone, timber and concrete bridges across river gorges, and through water splashes, with warning signs, field fences and log piles along the way.
- **Mixed surfaces:** each stage alternates tarmac, concrete, gravel and mud (plus snow and sand where they belong), each with its own grip, wet-weather behaviour and look. The co-driver calls surface changes.
- **Pace notes:** corners graded 1 to 6 plus hairpins, crests, jumps, ice, surface changes, tunnels, bridges and water splashes, spoken by the co-driver (browser speech) and shown as cards.
- **11 cars across five eras:** Heritage (1960s), Group 4 (1970s), Group B (1980s, three cars), World Rally Car (1990s–2000s) and Rally1 Hybrid (2020s). Names are original. The Ronin, Pleiad, Lionne and Asti use modelled bodies by Sketchfab artists (CC BY 4.0, see [CREDITS.md](CREDITS.md)); the others are built in code.
- **Season mode:** five championships with seven rivals per class, points, Power Stage bonus points, prize money, sponsor objectives, reputation levels that unlock each era, service-park repairs, stage retries and practice runs.
- **Garage:** six upgrade categories (Engine, Drivetrain, Tyres, Suspension, Brakes, Weight), each with six levels bought in order (Street → Sport → Rally → Pro → Works → Legend). Seventeen livery designs in four colourways each, a custom paint shop, race numbers and wheels.
- **Time Trial:** any stage, any owned car, any surface, with personal records and a ghost car.
- **Driving:** a two-axle tyre model with weight transfer, FWD/RWD/AWD layouts, turbo lag, hybrid boost, an automatic or manual gearbox, handbrake, jumps, damage, and optional steering, ABS and traction assists.
- **Graphics:** three.js (r170) with image-based lighting from a procedural sky, shadows, instanced forests with wind sway, dust, snow, mud and smoke particles, skid marks, rain and snowfall, and night stages with working headlamps.

### Balance

A simulated full career for an average driver on Amateur takes about 18–20 hours to reach Rally1 and about 40–45 hours to own everything (all cars fully upgraded, every livery and wheel). `test/economy.sim.js` reproduces this.

## What's in the package

| Component | Type | Purpose |
|---|---|---|
| `RallyLegends` | Visualforce page | Hosts the game full screen |
| `RallyLegends` | Static resource (zip) | The game: ES modules, `app.css`, and three.js r170 (MIT, licence included) |
| `RallyLegendsCars`, `RallyLegendsCars2` | Static resources (zip) | Modelled car bodies (GLB, CC BY 4.0, `CREDITS.txt` in each) |
| `RallyLegends` | Custom tab | Opens the page from the App Launcher |
| `Rally_Legends` | Permission set | Grants the page and the tab |

There is no Apex.

## Install

Requires the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli).

```sh
git clone https://github.com/patrickdereed/rally-legends.git
cd rally-legends

# Log in to the target org (use --instance-url https://test.salesforce.com for a sandbox)
sf org login web --alias my-org

# Deploy (there are no Apex tests in this package)
sf project deploy start --target-org my-org --test-level NoTestRun

# Give yourself (or other players) access
sf org assign permset --name Rally_Legends --target-org my-org
```

Then open the App Launcher and search for **Rally Legends**.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Throttle / brake | ↑ ↓ or W S | RT / LT |
| Steer | ← → or A D | Left stick |
| Handbrake | Space | A / X |
| Shift up / down (manual) | E or Shift / Q or Ctrl | RB / LB |
| Toggle automatic / manual | G | |
| Reset to the road (+5 s) | R | Back |
| Camera | C | Y |
| Pause | Esc or P | Start |
| Mute | M | |

Phones and tablets get on-screen controls. The game needs WebGL; lower the graphics quality in Settings if it runs slowly.

## Developing

`force-app/main/default/staticresources/RallyLegends/` holds the unzipped bundle; the CLI zips it on deploy.

| File | What it does |
|---|---|
| `data.js` | The catalogue: classes, cars, parts, liveries, rallies, championships, rivals, economy |
| `track.js` | Stage generator: centreline, elevation, surfaces, terrain grid, walls, pace notes, scenery placement |
| `physics.js` | Vehicle dynamics and the reference-time model |
| `career.js` | Saves, economy, garage, championships, records and ghosts |
| `car.js` | Car models: lofted bodies or modelled ones ("kits"), cabins, lamps, wheels, liveries and decals |
| `world.js` | Sky, lighting, terrain, roads, vegetation, crowds and props |
| `race.js`, `hud.js`, `fx.js`, `audio.js`, `input.js` | Running a stage |
| `ui.js`, `showroom.js`, `main.js` | Menus, the garage showroom and the main loop |

`track.js`, `physics.js`, `career.js` and `bot.js` have no browser dependencies, so the tests run in Node:

```sh
node test/track.test.js          # generate every stage
node test/drive.test.js all      # the built-in driver completes stage 1 of every rally in five cars
node test/career.test.js         # car stats, costs and a simulated championship
node test/retry.test.js          # stage retry restores the career state
node test/economy.sim.js 0 amateur   # full-career balance simulation
```

To play locally without Salesforce, run `node test/serve.mjs` and open http://localhost:8787.

### Modelled car bodies

A car with `mesh: "<name>"` in `data.js` loads `<name>.glb` from the car pack that `kits.js` names instead of its lofted body (it falls back to the lofted one if the file doesn't load). Physics is unaffected: it keeps using the numbers in `data.js`. The GLBs are built from source models that aren't in the repo:

1. Download the model from Sketchfab as GLB and save it as `models-src/<name>/source.glb`. Only use CC BY or CC0 models, and add them to `CREDITS.md` and `RallyLegendsCars/CREDITS.txt`.
2. Add an entry to `MODELS` in `tools/build-cars.mjs`: its pack, which axis is the front, the scale, the paint material's name (`node tools/inspect.mjs <file>` lists the parts and materials) and the credit.
3. `cd tools && npm install && cd .. && node tools/build-cars.mjs <name>`

The build removes the model's wheels (the game fits its own, so rim colours and tyre and brake upgrades still show), tags the paint and lamps, adds the livery UVs, shrinks the textures and records the axles, wheel size, cabin and belt line that `car.js` uses for the wheels, crew, decals and cameras. Each pack is its own static resource and must stay under 5 MB; the build warns when one is too big, and it regenerates `kits.js`, each pack's `CREDITS.txt` and metadata, and the pack URLs in the Visualforce page.
