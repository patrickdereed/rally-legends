// Game catalog. Everything the season, garage, dealership and stage generator need is data here,
// so adding a car, a part level, a livery or a rally is an edit to this file only.
// Car and team names are original; rally and stage names are the real places they are set in.

// ---------- Classes (eras). The season unlocks them in order by reputation level. ----------
export const CLASSES = [
  { id: "H", tier: 0, name: "Heritage", era: "1960s", title: "Heritage Cup", repReq: 1, color: "#d9b26a",
    blurb: "Skinny tyres, carburettors and pure momentum. Learn to carry speed and never lift." },
  { id: "G4", tier: 1, name: "Group 4", era: "1970s", title: "Group 4 Series", repReq: 5, color: "#e2733c",
    blurb: "Rear-wheel drive, sideways everywhere, and the first purpose-built rally cars." },
  { id: "GB", tier: 2, name: "Group B", era: "1980s", title: "Group B Masters", repReq: 11, color: "#d8413f",
    blurb: "Turbocharged four-wheel-drive monsters with huge lag and no mercy. The fastest era of all." },
  { id: "WRC", tier: 3, name: "World Rally Car", era: "1990s–2000s", title: "World Rally Era", repReq: 18, color: "#3f7fe3",
    blurb: "Active diffs, anti-lag and big wings. Precise, brutal and endlessly tunable." },
  { id: "R1", tier: 4, name: "Rally1 Hybrid", era: "2020s", title: "Rally1 Hybrid Championship", repReq: 26, color: "#2fc191",
    blurb: "Hybrid boost, sequential gearboxes and serious aero. The modern top flight." }
];
export const CLASS_BY_ID = Object.fromEntries(CLASSES.map(c => [c.id, c]));

// ---------- Cars ----------
// Physics: hp, mass (kg), drive, cgFront (static weight share on the front axle), wheelbase/track (m),
// hCG (m), cdA/clA (m^2), gearTop (m/s at the limiter in top gear), grip/brake multipliers, steerMax (rad),
// turbo {lag (s), depth (0..1 torque lost off-boost)}, hybridKw, shiftT (s).
// body: geometry for car.js. low = lower-body stations [t 0=nose..1=tail, half-width fraction, bottom y, top y].
export const CARS = [
  {
    id: "mosquito", cls: "H", name: "Mosquito 1275 S", maker: "Kestrel", year: 1965, price: 12000, starter: true,
    blurb: "A tiny front-drive giant-killer. Weighs nothing, turns on a coin, and loves to be thrown at snow banks.",
    hp: 92, mass: 690, drive: "FWD", cgFront: 0.62, wheelbase: 2.04, track: 1.24, hCG: 0.5, cdA: 0.62, clA: 0,
    cyl: 4, rpmIdle: 900, rpmMax: 7200, gears: 4, gearTop: 44, grip: 0.92, brake: 0.86, steerMax: 0.62, turbo: null, hybridKw: 0, shiftT: 0.3,
    body: { L: 3.05, W: 1.42, wheelR: 0.27, wheelW: 0.17, axF: 0.5,
      low: [[0, 0.86, 0.26, 0.62], [0.05, 0.97, 0.22, 0.76], [0.25, 1, 0.2, 0.871], [0.8, 1, 0.2, 0.875], [0.96, 0.97, 0.22, 0.798], [1, 0.88, 0.27, 0.64]],
      cab: { t0: 0.175, r0: 0.34, r1: 0.86, t1: 0.95, roofY: 1.35, hwBot: 0.95, hwTop: 0.74, roofDrop: 0 , aPil: 0.016, bPil: 0.009 },
      archTrim: true, roofLip: true, rim: "minilite", roofRack: true, sliding: true, flares: 0, wing: "none", lamps: "pod4", lights: "round" },
    livery: { design: "roof", colors: ["#b3141c", "#f3efe2", "#151515"], number: 37, rim: "gold" }
  },
  {
    id: "berlinette", cls: "H", name: "Berlinette 1600 S", maker: "Alpenne", year: 1968, price: 15000, starter: true,
    blurb: "Rear-engined, featherweight and low as a skate. Rotates beautifully, punishes a lift mid-corner.",
    hp: 128, mass: 720, drive: "RWD", cgFront: 0.38, wheelbase: 2.1, track: 1.3, hCG: 0.42, cdA: 0.52, clA: 0,
    cyl: 4, rpmIdle: 950, rpmMax: 7400, gears: 5, gearTop: 49, grip: 0.94, brake: 0.88, steerMax: 0.6, turbo: null, hybridKw: 0, shiftT: 0.28,
    body: { L: 3.85, W: 1.52, wheelR: 0.29, wheelW: 0.18, axF: 0.85,
      low: [[0, 0.6, 0.26, 0.44], [0.08, 0.9, 0.22, 0.587], [0.3, 1, 0.2, 0.735], [0.75, 1, 0.2, 0.795], [0.95, 0.95, 0.25, 0.727], [1, 0.8, 0.3, 0.6]],
      cab: { t0: 0.275, r0: 0.5, r1: 0.64, t1: 0.98, roofY: 1.13, hwBot: 0.9, hwTop: 0.7, roofDrop: 0 , aPil: 0.016, bPil: 0.009 },
      rim: "minilite", flares: 0, wing: "none", lamps: "pod2", lights: "round" },
    livery: { design: "solid", colors: ["#1f4fa8", "#f2f2f2", "#d01f2a"], number: 18, rim: "silver" }
  },
  {
    id: "stiletto", cls: "G4", name: "Stiletto HF", maker: "Lanza", year: 1974, price: 42000,
    blurb: "A mid-engined wedge built for one job. Short wheelbase, savage V6 and a tail that wants to lead.",
    hp: 275, mass: 980, drive: "RWD", cgFront: 0.42, wheelbase: 2.18, track: 1.43, hCG: 0.44, cdA: 0.66, clA: 0.1,
    cyl: 6, rpmIdle: 1000, rpmMax: 8000, gears: 5, gearTop: 54, grip: 0.98, brake: 0.95, steerMax: 0.58, turbo: null, hybridKw: 0, shiftT: 0.24,
    body: { L: 3.71, W: 1.75, wheelR: 0.31, wheelW: 0.22, axF: 0.78,
      low: [[0, 0.72, 0.24, 0.38], [0.1, 0.92, 0.2, 0.565], [0.3, 1, 0.18, 0.735], [0.8, 1, 0.18, 0.795], [0.97, 0.96, 0.22, 0.728], [1, 0.9, 0.28, 0.64]],
      cab: { t0: 0.155, r0: 0.45, r1: 0.62, t1: 0.82, roofY: 1.11, hwBot: 0.9, hwTop: 0.66, roofDrop: 0.02 , aPil: 0.016, bPil: 0.009 },
      rim: "minilite", flares: 1, wing: "roof", lamps: "pod4", lights: "none" },
    livery: { design: "chevron", colors: ["#f4f4f0", "#178a4a", "#d0242c"], number: 1, rim: "gold" }
  },
  {
    id: "pennine", cls: "G4", name: "Pennine RS1800", maker: "Albion", year: 1977, price: 38000,
    blurb: "The privateer's favourite: simple, tough, front-engined and always sideways. Forgiving at the limit.",
    hp: 245, mass: 960, drive: "RWD", cgFront: 0.53, wheelbase: 2.4, track: 1.36, hCG: 0.5, cdA: 0.72, clA: 0,
    cyl: 4, rpmIdle: 1000, rpmMax: 8500, gears: 5, gearTop: 53, grip: 0.97, brake: 0.95, steerMax: 0.6, turbo: null, hybridKw: 0, shiftT: 0.24,
    body: { L: 4.05, W: 1.6, wheelR: 0.3, wheelW: 0.21, axF: 0.78,
      low: [[0, 0.9, 0.26, 0.66], [0.04, 0.98, 0.22, 0.76], [0.25, 1, 0.2, 0.871], [0.78, 1, 0.2, 0.895], [0.97, 0.98, 0.22, 0.808], [1, 0.9, 0.27, 0.7]],
      cab: { t0: 0.255, r0: 0.42, r1: 0.66, t1: 0.79, roofY: 1.4, hwBot: 0.94, hwTop: 0.74, roofDrop: 0.02 , aPil: 0.016, bPil: 0.009 },
      rim: "minilite", flares: 1, wing: "duck", lamps: "pod4", lights: "round" },
    livery: { design: "tristripe", colors: ["#f5f5f2", "#13265c", "#d32630"], number: 6, rim: "white" }
  },
  {
    id: "vierring", cls: "GB", name: "Vierring Quattro S1", maker: "Vierring", year: 1985, price: 115000,
    blurb: "Five cylinders, a turbo the size of a bucket and four-wheel drive. Lag, then a wall of thrust.",
    hp: 520, mass: 1100, drive: "AWD", awdRear: 0.5, cgFront: 0.6, wheelbase: 2.22, track: 1.52, hCG: 0.48, cdA: 0.82, clA: 0.6,
    cyl: 5, rpmIdle: 1100, rpmMax: 8000, gears: 5, gearTop: 59, grip: 1.0, brake: 1.0, steerMax: 0.56, turbo: { lag: 0.75, depth: 0.55 }, hybridKw: 0, shiftT: 0.2,
    body: { L: 4.24, W: 1.86, wheelR: 0.32, wheelW: 0.25, axF: 1.05,
      low: [[0, 0.85, 0.22, 0.5], [0.08, 0.98, 0.18, 0.707], [0.3, 1, 0.18, 0.855], [0.8, 1, 0.18, 0.875], [0.97, 0.98, 0.22, 0.808], [1, 0.9, 0.3, 0.72]],
      cab: { t0: 0.295, r0: 0.45, r1: 0.66, t1: 0.8, roofY: 1.34, hwBot: 0.9, hwTop: 0.74, roofDrop: 0.03 },
      rim: "turbine", flares: 2, wing: "gb", lamps: "pod2", lights: "rect" },
    livery: { design: "split", colors: ["#f4f4f1", "#c3202a", "#d9a92b"], number: 2, rim: "white" }
  },
  {
    id: "lionne", cls: "GB", name: "Lionne 205 T16", maker: "Lionne", year: 1985, price: 105000,
    blurb: "A shopping hatch in silhouette only. Mid-engined, short, and unbelievably agile on loose gravel.",
    hp: 470, mass: 920, drive: "AWD", awdRear: 0.6, cgFront: 0.44, wheelbase: 2.54, track: 1.44, hCG: 0.46, cdA: 0.74, clA: 0.5,
    cyl: 4, rpmIdle: 1100, rpmMax: 8000, gears: 5, gearTop: 57, grip: 1.0, brake: 1.0, steerMax: 0.58, turbo: { lag: 0.6, depth: 0.5 }, hybridKw: 0, shiftT: 0.2,
    body: { L: 3.83, W: 1.67, wheelR: 0.31, wheelW: 0.24, axF: 0.66,
      low: [[0, 0.88, 0.22, 0.56], [0.05, 0.98, 0.2, 0.7], [0.3, 1, 0.18, 0.855], [0.85, 1, 0.18, 0.915], [0.98, 0.98, 0.22, 0.819], [1, 0.9, 0.26, 0.72]],
      cab: { t0: 0.215, r0: 0.4, r1: 0.8, t1: 0.96, roofY: 1.35, hwBot: 0.9, hwTop: 0.74, roofDrop: 0.07 },
      blackPillars: true, rim: "turbine", flares: 2, wing: "roof", lamps: "pod4", lights: "rect" },
    livery: { design: "slashes", colors: ["#f5f5f3", "#1d3f9c", "#e2b821"], number: 5, rim: "white" }
  },
  {
    id: "pleiad", cls: "WRC", name: "Pleiad WRX '98", maker: "Pleiad", year: 1998, price: 210000,
    blurb: "Flat-four rumble, gold wheels and a chassis that does what you ask. The benchmark of its era.",
    hp: 300, mass: 1230, drive: "AWD", awdRear: 0.55, cgFront: 0.57, wheelbase: 2.52, track: 1.5, hCG: 0.46, cdA: 0.8, clA: 0.9,
    cyl: 4, rpmIdle: 1000, rpmMax: 7500, gears: 6, gearTop: 57, grip: 1.06, brake: 1.06, steerMax: 0.56, turbo: { lag: 0.35, depth: 0.3 }, hybridKw: 0, shiftT: 0.12,
    body: { L: 4.34, W: 1.77, wheelR: 0.33, wheelW: 0.24, axF: 0.85,
      low: [[0, 0.85, 0.2, 0.56], [0.05, 0.97, 0.16, 0.7], [0.3, 1, 0.16, 0.855], [0.8, 1, 0.16, 0.875], [0.97, 0.96, 0.2, 0.808], [1, 0.88, 0.26, 0.7]],
      cab: { t0: 0.255, r0: 0.42, r1: 0.66, t1: 0.82, roofY: 1.39, hwBot: 0.9, hwTop: 0.74, roofDrop: 0.03 },
      rim: "mesh", flares: 2, wing: "tall", scoop: true, lamps: "none", lights: "rect" },
    livery: { design: "stars", colors: ["#1b3f95", "#f2c418", "#ffffff"], number: 3, rim: "gold" }
  },
  {
    id: "ronin", cls: "WRC", name: "Ronin Evo VI", maker: "Ronin", year: 1999, price: 220000,
    blurb: "An angry turbo saloon with a twin-plane wing. More torque than the Pleiad, a little less finesse.",
    hp: 310, mass: 1250, drive: "AWD", awdRear: 0.6, cgFront: 0.58, wheelbase: 2.51, track: 1.52, hCG: 0.47, cdA: 0.82, clA: 1.0,
    cyl: 4, rpmIdle: 1000, rpmMax: 7600, gears: 6, gearTop: 58, grip: 1.05, brake: 1.08, steerMax: 0.55, turbo: { lag: 0.38, depth: 0.32 }, hybridKw: 0, shiftT: 0.12,
    body: { L: 4.35, W: 1.77, wheelR: 0.33, wheelW: 0.24, axF: 0.86,
      low: [[0, 0.9, 0.18, 0.58], [0.05, 0.98, 0.15, 0.72], [0.3, 1, 0.15, 0.865], [0.8, 1, 0.15, 0.875], [0.97, 0.96, 0.2, 0.808], [1, 0.9, 0.26, 0.72]],
      cab: { t0: 0.265, r0: 0.43, r1: 0.66, t1: 0.81, roofY: 1.41, hwBot: 0.9, hwTop: 0.74, roofDrop: 0.03 },
      rim: "mesh", flares: 2, wing: "twin", scoop: true, lamps: "none", lights: "rect" },
    livery: { design: "diagonal", colors: ["#f1f1ee", "#c6161f", "#111111"], number: 7, rim: "white" }
  },
  {
    id: "kaze", cls: "R1", name: "Kaze R1 Hybrid", maker: "Kaze", year: 2022, price: 400000,
    blurb: "A compact hatch hiding a tubular chassis, 100 kW of hybrid boost and enough aero to bend air.",
    hp: 380, mass: 1260, drive: "AWD", awdRear: 0.5, cgFront: 0.55, wheelbase: 2.63, track: 1.6, hCG: 0.44, cdA: 0.88, clA: 1.7,
    cyl: 4, rpmIdle: 1200, rpmMax: 7800, gears: 5, gearTop: 56, grip: 1.12, brake: 1.12, steerMax: 0.56, turbo: { lag: 0.18, depth: 0.15 }, hybridKw: 100, shiftT: 0.05,
    body: { L: 4.1, W: 1.88, wheelR: 0.34, wheelW: 0.25, axF: 0.8,
      low: [[0, 0.9, 0.16, 0.58], [0.05, 0.99, 0.14, 0.72], [0.3, 1, 0.14, 0.875], [0.85, 1, 0.14, 0.895], [0.98, 0.98, 0.18, 0.819], [1, 0.9, 0.22, 0.72]],
      cab: { t0: 0.225, r0: 0.42, r1: 0.76, t1: 0.94, roofY: 1.3, hwBot: 0.86, hwTop: 0.74, roofDrop: 0.1 },
      blackPillars: true, archTrim: true, rim: "twin", flares: 2, wing: "r1", scoop: true, lamps: "none", lights: "slim" },
    livery: { design: "shards", colors: ["#f4f4f4", "#d01d27", "#141414"], number: 69, rim: "black" }
  },
  {
    id: "ferox", cls: "R1", name: "Ferox Rally1 Hybrid", maker: "Albion", year: 2023, price: 420000,
    blurb: "Crossover silhouette, longest wheelbase in the field. Ultra-stable at speed and easy on its tyres.",
    hp: 380, mass: 1270, drive: "AWD", awdRear: 0.55, cgFront: 0.56, wheelbase: 2.68, track: 1.6, hCG: 0.46, cdA: 0.9, clA: 1.8,
    cyl: 4, rpmIdle: 1200, rpmMax: 7700, gears: 5, gearTop: 56, grip: 1.11, brake: 1.12, steerMax: 0.55, turbo: { lag: 0.2, depth: 0.15 }, hybridKw: 100, shiftT: 0.05,
    body: { L: 4.2, W: 1.88, wheelR: 0.34, wheelW: 0.25, axF: 0.78,
      low: [[0, 0.9, 0.18, 0.62], [0.05, 0.99, 0.15, 0.78], [0.3, 1, 0.15, 0.955], [0.85, 1, 0.15, 0.975], [0.98, 0.97, 0.2, 0.879], [1, 0.9, 0.26, 0.76]],
      cab: { t0: 0.235, r0: 0.43, r1: 0.72, t1: 0.95, roofY: 1.42, hwBot: 0.86, hwTop: 0.74, roofDrop: 0.12 },
      blackPillars: true, archTrim: true, rim: "twin", flares: 2, wing: "r1", scoop: true, lamps: "none", lights: "slim" },
    livery: { design: "fade", colors: ["#173a8c", "#21c6c9", "#ffffff"], number: 16, rim: "black" }
  }
];
export const CAR_BY_ID = Object.fromEntries(CARS.map(c => [c.id, c]));
export function carsInClass(cls) { return CARS.filter(c => c.cls === cls); }

// ---------- Upgrades ----------
// Each category has six levels bought strictly in series (you need level 3 before level 4).
// gains[] are cumulative fractions at levels 0..6.
export const PART_LEVELS = ["Stock", "Street", "Sport", "Rally", "Pro", "Works", "Legend"];
export const PART_LEVEL_COST = [0, 1, 1.7, 2.7, 4.2, 6.2, 13];
export const PART_CATS = [
  { id: "engine", name: "Engine", stat: "Power", desc: "Cams, pistons, ECU and exhaust. Raises peak power.",
    gains: { power: [0, 0.06, 0.12, 0.19, 0.27, 0.36, 0.46] }, costMul: 1.2 },
  { id: "drivetrain", name: "Drivetrain", stat: "Acceleration", desc: "Close-ratio gearbox, uprated clutch and limited-slip diffs. Harder launches, faster shifts, a little more top speed.",
    gains: { torque: [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.19], shift: [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4], top: [0, 0.01, 0.02, 0.035, 0.05, 0.065, 0.08] }, costMul: 1.0 },
  { id: "tyres", name: "Tyres", stat: "Grip", desc: "Softer compounds and better carcasses for every surface.",
    gains: { grip: [0, 0.035, 0.07, 0.105, 0.14, 0.175, 0.22] }, costMul: 0.7 },
  { id: "suspension", name: "Suspension", stat: "Handling", desc: "Longer travel, better dampers. More grip over rough ground, softer landings, less damage from jumps.",
    gains: { grip: [0, 0.015, 0.03, 0.045, 0.06, 0.075, 0.095], landing: [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72], steer: [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12] }, costMul: 0.9 },
  { id: "brakes", name: "Brakes", stat: "Braking", desc: "Bigger discs, multi-piston callipers and better pads.",
    gains: { brake: [0, 0.1, 0.2, 0.32, 0.45, 0.6, 0.78] }, costMul: 0.6 },
  { id: "weight", name: "Weight Reduction", stat: "Weight", desc: "Thinner panels, polycarbonate glass and carbon parts. Everything improves a little.",
    gains: { mass: [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.13] }, costMul: 1.1 }
];
export const PART_BY_ID = Object.fromEntries(PART_CATS.map(p => [p.id, p]));
export const PART_BASE_COST = 0.036; // fraction of car price for a level-1 part before multipliers
// Levels 4 and 5 need reputation above the class requirement; Legend parts need that class's championship won.
export const PART_REP_EXTRA = [0, 0, 0, 0, 2, 4, 0];

// ---------- Liveries ----------
// Every design comes in four colourways; any design can also be painted in custom colours at the paint shop.
export const LIVERY_DESIGNS = [
  { id: "solid", name: "Solid", price: 0.4, rep: 0, roof: 0,
    ways: [["#e8e6df", "#e8e6df", "#222"], ["#c2121b", "#c2121b", "#111"], ["#14213d", "#14213d", "#fca311"], ["#2d6a4f", "#2d6a4f", "#f4f1de"]] },
  { id: "roof", name: "Contrast Roof", price: 0.5, rep: 0, roof: 1,
    ways: [["#b3141c", "#f3efe2", "#151515"], ["#0f4c3a", "#f3efe2", "#151515"], ["#f2c230", "#121212", "#121212"], ["#3b6fb6", "#f3efe2", "#151515"]] },
  { id: "stripes", name: "Twin Stripes", price: 0.6, rep: 1, roof: 0,
    ways: [["#1b3c8c", "#f4f4f4", "#c8102e"], ["#111111", "#d4a017", "#d4a017"], ["#f4f4f4", "#c8102e", "#14213d"], ["#ff7a00", "#111111", "#111111"]] },
  { id: "tristripe", name: "Tricolour Stripe", price: 0.7, rep: 2, roof: 0,
    ways: [["#f5f5f2", "#13265c", "#d32630"], ["#111111", "#e63946", "#f1faee"], ["#f5f5f2", "#2a9d8f", "#e76f51"], ["#0b132b", "#5bc0be", "#f4d35e"]] },
  { id: "chevron", name: "Chevron", price: 0.7, rep: 2, roof: 0,
    ways: [["#f4f4f0", "#178a4a", "#d0242c"], ["#101820", "#fee715", "#fee715"], ["#f4f4f0", "#1d3557", "#e63946"], ["#6a040f", "#ffba08", "#faa307"]] },
  { id: "split", name: "Two-Tone Split", price: 0.6, rep: 1, roof: 0,
    ways: [["#f4f4f1", "#c3202a", "#d9a92b"], ["#f4f4f1", "#1f3b73", "#9db4d8"], ["#222222", "#e9c46a", "#e76f51"], ["#ededed", "#0a9396", "#ee9b00"]] },
  { id: "diagonal", name: "Diagonal", price: 0.7, rep: 3, roof: 0,
    ways: [["#f1f1ee", "#c6161f", "#111111"], ["#0d1b2a", "#e0e1dd", "#e63946"], ["#ffbe0b", "#3a0ca3", "#ffffff"], ["#f1f1ee", "#2b9348", "#111111"]] },
  { id: "slashes", name: "Speed Slashes", price: 0.8, rep: 3, roof: 0,
    ways: [["#f5f5f3", "#1d3f9c", "#e2b821"], ["#111111", "#ff006e", "#3a86ff"], ["#f5f5f3", "#d62828", "#003049"], ["#283618", "#dda15e", "#fefae0"]] },
  { id: "checker", name: "Chequered", price: 0.8, rep: 4, roof: 0,
    ways: [["#f4f4f4", "#111111", "#d90429"], ["#ffd60a", "#000814", "#000814"], ["#3a0ca3", "#f72585", "#ffffff"], ["#e5e5e5", "#14213d", "#fca311"]] },
  { id: "fade", name: "Gradient Fade", price: 0.9, rep: 5, roof: 0,
    ways: [["#173a8c", "#21c6c9", "#ffffff"], ["#f72585", "#ffbe0b", "#111111"], ["#10002b", "#e0aaff", "#ffffff"], ["#d00000", "#ffba08", "#111111"]] },
  { id: "shards", name: "Shards", price: 1.0, rep: 7, roof: 0,
    ways: [["#f4f4f4", "#d01d27", "#141414"], ["#0b090a", "#00f5d4", "#f15bb5"], ["#f4f4f4", "#005f73", "#ee9b00"], ["#14213d", "#e5e5e5", "#fca311"]] },
  { id: "stars", name: "Stars", price: 0.9, rep: 6, roof: 0,
    ways: [["#1b3f95", "#f2c418", "#ffffff"], ["#111111", "#f4f4f4", "#e63946"], ["#7b2cbf", "#ffd60a", "#ffffff"], ["#f4f4f4", "#1b3f95", "#e63946"]] },
  { id: "camo", name: "Camouflage", price: 0.9, rep: 6, roof: 0,
    ways: [["#4b5320", "#6b705c", "#2f3e1f"], ["#d6ccc2", "#a68a64", "#7f5539"], ["#e0e1dd", "#9aa5b1", "#5c677d"], ["#1b263b", "#415a77", "#0d1b2a"]] },
  { id: "lightning", name: "Lightning", price: 1.0, rep: 8, roof: 0,
    ways: [["#111111", "#ffd60a", "#ffffff"], ["#f4f4f4", "#3a86ff", "#111111"], ["#560bad", "#4cc9f0", "#ffffff"], ["#d62828", "#fcbf49", "#111111"]] },
  { id: "sunset", name: "Retro Sunset", price: 1.0, rep: 5, roof: 0,
    ways: [["#f3ead8", "#ff7b00", "#9d0208"], ["#1a1a1a", "#ffb703", "#fb5607"], ["#f3ead8", "#2a9d8f", "#264653"], ["#ffffff", "#ff006e", "#8338ec"]] },
  { id: "carbon", name: "Carbon", price: 1.2, rep: 10, roof: 0, dark: true,
    ways: [["#1b1b1d", "#e63946", "#ffffff"], ["#1b1b1d", "#00b4d8", "#ffffff"], ["#1b1b1d", "#ffd60a", "#ffffff"], ["#1b1b1d", "#80ed99", "#ffffff"]] },
  { id: "heritage", name: "Heritage", price: 1.1, rep: 9, roof: 1,
    ways: [["#0f3b2e", "#f1e6c8", "#c9a227"], ["#f1e6c8", "#7b1e1e", "#1b1b1b"], ["#1d2d50", "#f1e6c8", "#c9a227"], ["#5b3a29", "#f1e6c8", "#d4a373"]] }
];
export const LIVERY_BY_ID = Object.fromEntries(LIVERY_DESIGNS.map(d => [d.id, d]));
export const LIVERY_BASE_COST = 0.07;   // fraction of car price, times the design's price factor
export const CUSTOM_PAINT_COST = 0.06;  // fraction of car price for a custom-colour paint job
export const RIMS = [
  { id: "silver", name: "Silver", color: "#c9ccd1", price: 0 },
  { id: "white", name: "White", color: "#f3f3f3", price: 400 },
  { id: "gold", name: "Gold", color: "#c9a227", price: 900 },
  { id: "black", name: "Black", color: "#1c1c1e", price: 600 },
  { id: "bronze", name: "Bronze", color: "#8c6239", price: 900 },
  { id: "gunmetal", name: "Gunmetal", color: "#4a4f57", price: 700 }
];
export const RIM_BY_ID = Object.fromEntries(RIMS.map(r => [r.id, r]));
export const SPONSORS = ["ASOKA", "MERIDIAN", "APEX OIL", "NORDLINE", "VELOCE", "SUMMIT TYRES", "PIPELINE", "CLOUD NINE"];

// ---------- Surfaces ----------
// mu = peak friction, B/C = tyre curve stiffness/shape, crr = rolling resistance, rough = vibration.
export const SURFACES = {
  tarmac:   { mu: 1.0,  B: 23, C: 1.35, crr: 0.013, rough: 0.02, fx: "smoke", label: "Tarmac" },
  concrete: { mu: 0.95, B: 22, C: 1.33, crr: 0.012, rough: 0.06, fx: "smoke", label: "Concrete" },
  gravel:   { mu: 0.8,  B: 17, C: 1.22, crr: 0.022, rough: 0.25, fx: "dust", label: "Gravel" },
  snow:     { mu: 0.6,  B: 13, C: 1.18, crr: 0.03,  rough: 0.12, fx: "snow", label: "Snow" },
  ice:      { mu: 0.34, B: 12, C: 1.15, crr: 0.012, rough: 0.02, fx: "snow", label: "Ice" },
  mud:      { mu: 0.64, B: 13, C: 1.2,  crr: 0.034, rough: 0.3,  fx: "mud", label: "Mud" },
  sand:     { mu: 0.74, B: 15, C: 1.2,  crr: 0.03,  rough: 0.22, fx: "dust", label: "Sand" },
  grass:    { mu: 0.55, B: 12, C: 1.2,  crr: 0.07,  rough: 0.5,  fx: "grass", label: "Grass" },
  deepsnow: { mu: 0.42, B: 10, C: 1.15, crr: 0.14,  rough: 0.3,  fx: "snow", label: "Deep snow" },
  rock:     { mu: 0.62, B: 14, C: 1.2,  crr: 0.05,  rough: 0.7,  fx: "dust", label: "Rocks" },
  scrub:    { mu: 0.55, B: 12, C: 1.2,  crr: 0.08,  rough: 0.5,  fx: "dust", label: "Scrub" },
  water:    { mu: 0.3,  B: 10, C: 1.1,  crr: 0.6,   rough: 0.4,  fx: "splash", label: "Water" }
};

// ---------- Rallies ----------
// gen: centreline generator. pieces are weighted segment types; minClear keeps legs apart; maxR bounds the stage.
// elev: terrain height field. crests: humps and jumps per km. veg: vegetation near the road (n per km) and far (per km^2).
// pal: palette for a clear day; world.js derives dusk, night, rain and fog from it.
// mix: road surfaces that alternate along each stage (section lengths 150-650 m), first entry = main surface.
export const LOCATIONS = [
  {
    id: "monte", name: "Monte-Carlo", country: "Monaco · France", code: "MC", surface: "tarmac", offroad: "rock",
    blurb: "Alpine hairpins above the Riviera. Dry tarmac, then ice in the shadows. The Col de Turini at night is the most famous stage in rallying.",
    roadW: 7, crowd: 1.0, walls: "stone", barriers: true, houses: 0.6, poles: 0,
    mix: [["tarmac", 6], ["concrete", 1.5], ["gravel", 1]],
    gen: { minClear: 22, maxR: 900, pieces: [
      { w: 3, type: "straight", len: [40, 160] }, { w: 4, type: "corner", R: [30, 90], ang: [40, 110] },
      { w: 3, type: "switchback", R: [11, 15], len: [50, 110] }, { w: 2, type: "hairpin", R: [11, 16] }, { w: 2, type: "esses", R: [35, 70], ang: [35, 70] }] },
    elev: { amp: 150, scale: 0.0011, ridge: 60, maxGrade: 0.1, smooth: 50 },
    crests: { perKm: 0.4, h: [0.8, 1.5], w: [22, 30] },
    veg: [{ type: "pine", n: 70, far: 260, dmin: 6 }, { type: "bush", n: 60, far: 120, dmin: 4.5 }, { type: "rock", n: 26, far: 80, dmin: 5 }],
    pal: { zenith: "#3f6fb4", horizon: "#b9cde3", sun: "#fff1d8", sunElev: 28, sunAz: 210, grass: ["#5d6b3a", "#717a45"], dry: "#8b8461", dirt: "#7b6f60", rock: "#8d8a84", snow: "#eef2f6", mountain: "#7d8ea6", fog: 0.0011, exposure: 1.0 },
    stages: [
      { name: "Col de Turini", len: 2900, time: "night", weather: "clear", ice: 1.6, snowEdges: true },
      { name: "La Bollène-Vésubie", len: 3100, time: "dusk", weather: "clear", ice: 0.5 },
      { name: "Sisteron", len: 3400, time: "day", weather: "clear", ice: 0 }
    ]
  },
  {
    id: "sweden", name: "Rally Sweden", country: "Värmland · Sweden", code: "SE", surface: "snow", offroad: "deepsnow",
    blurb: "Compacted snow between towering snow banks. Lean on the banks if you must, but the trees behind them are real.",
    roadW: 7.5, crowd: 0.6, walls: "snowbank", barriers: false, houses: 0.3, poles: 0.4,
    mix: [["snow", 7], ["gravel", 1.5]],
    gen: { minClear: 45, maxR: 1200, pieces: [
      { w: 4, type: "straight", len: [80, 320] }, { w: 5, type: "corner", R: [60, 200], ang: [30, 95] },
      { w: 2, type: "corner", R: [30, 55], ang: [60, 100] }, { w: 2, type: "esses", R: [70, 140], ang: [25, 50] }] },
    elev: { amp: 40, scale: 0.0016, ridge: 10, maxGrade: 0.07, smooth: 60 },
    crests: { perKm: 1.4, h: [1.2, 2.6], w: [20, 30] },
    veg: [{ type: "spruce", n: 260, far: 900, dmin: 5.5, snowy: true }, { type: "birch", n: 60, far: 160, dmin: 5.5, snowy: true }],
    pal: { zenith: "#6f8fb8", horizon: "#d8e2ee", sun: "#ffe9cc", sunElev: 9, sunAz: 160, grass: ["#e9eef4", "#dfe6ef"], dry: "#d7dee8", dirt: "#c9d1db", rock: "#9aa3ad", snow: "#f3f6fa", mountain: "#9cabc0", fog: 0.0016, exposure: 0.92 },
    stages: [
      { name: "Vargåsen", len: 4600, time: "day", weather: "overcast", ice: 0.4 },
      { name: "Torsby", len: 4400, time: "dawn", weather: "snow", ice: 0.6 },
      { name: "Likenäs", len: 4800, time: "day", weather: "clear", ice: 0.3 }
    ]
  },
  {
    id: "finland", name: "Rally Finland", country: "Jyväskylä · Finland", code: "FI", surface: "gravel", offroad: "grass",
    blurb: "Fast, flowing gravel through the lakes and forests. Blind crests send you flying. Commit, or lose a second a kilometre.",
    roadW: 7, crowd: 0.7, walls: null, barriers: false, houses: 0.35, poles: 0.6,
    mix: [["gravel", 7], ["tarmac", 1.2], ["concrete", 0.6]],
    gen: { minClear: 50, maxR: 1300, pieces: [
      { w: 4, type: "straight", len: [100, 360] }, { w: 6, type: "corner", R: [70, 260], ang: [20, 75] },
      { w: 2, type: "corner", R: [35, 60], ang: [60, 95] }, { w: 3, type: "esses", R: [90, 180], ang: [20, 45] }] },
    elev: { amp: 55, scale: 0.0018, ridge: 15, maxGrade: 0.09, smooth: 45 },
    crests: { perKm: 3.0, h: [1.4, 2.9], w: [22, 34] },
    veg: [{ type: "pine", n: 230, far: 950, dmin: 5 }, { type: "birch", n: 110, far: 380, dmin: 5 }, { type: "rock", n: 14, far: 30, dmin: 5 }],
    water: 0.22,
    pal: { zenith: "#3e74c4", horizon: "#c4d7ea", sun: "#fff3da", sunElev: 32, sunAz: 140, grass: ["#4f6a2c", "#64803a"], dry: "#8a8a52", dirt: "#8a7151", rock: "#7d7a74", snow: "#eef2f6", mountain: "#5f7a8f", fog: 0.0012, exposure: 1.0 },
    stages: [
      { name: "Ouninpohja", len: 5200, time: "day", weather: "clear" },
      { name: "Ruuhimäki", len: 4600, time: "dusk", weather: "clear" },
      { name: "Päijälä", len: 4900, time: "day", weather: "overcast" }
    ]
  },
  {
    id: "wales", name: "Wales Rally GB", country: "Mid Wales · United Kingdom", code: "GB", surface: "mud", offroad: "grass",
    blurb: "Slippery forest tracks in the Cambrian mountains. Rain, fog and mud, with drainage ditches waiting on every exit.",
    roadW: 6.5, crowd: 0.5, walls: null, barriers: false, houses: 0.2, poles: 0.4,
    mix: [["mud", 5], ["gravel", 4], ["concrete", 0.8]],
    gen: { minClear: 40, maxR: 1100, pieces: [
      { w: 3, type: "straight", len: [60, 220] }, { w: 6, type: "corner", R: [35, 130], ang: [35, 100] },
      { w: 2, type: "hairpin", R: [14, 20] }, { w: 3, type: "esses", R: [45, 90], ang: [30, 60] }] },
    elev: { amp: 70, scale: 0.0016, ridge: 25, maxGrade: 0.1, smooth: 40 },
    crests: { perKm: 1.6, h: [1.0, 2.2], w: [20, 28] },
    veg: [{ type: "spruce", n: 320, far: 1100, dmin: 4.6 }, { type: "bush", n: 50, far: 60, dmin: 4 }],
    pal: { zenith: "#71849a", horizon: "#b9c3cc", sun: "#fff4e0", sunElev: 24, sunAz: 200, grass: ["#3f5a2a", "#56703a"], dry: "#6f7a45", dirt: "#5b4632", rock: "#6c6a64", snow: "#eef2f6", mountain: "#6c7d70", fog: 0.0022, exposure: 0.95 },
    stages: [
      { name: "Sweet Lamb", len: 3800, time: "day", weather: "rain" },
      { name: "Hafren", len: 4300, time: "day", weather: "fog" },
      { name: "Myherin", len: 4100, time: "dusk", weather: "rain" }
    ]
  },
  {
    id: "portugal", name: "Rally de Portugal", country: "Fafe · Portugal", code: "PT", surface: "gravel", offroad: "scrub",
    blurb: "Loose gravel through eucalyptus and pine, packed with fans. Fafe's famous jump comes late in the stage, full throttle.",
    roadW: 7, crowd: 1.6, walls: null, barriers: false, houses: 0.4, poles: 0.3,
    mix: [["gravel", 6], ["tarmac", 1.5], ["mud", 1.2]],
    gen: { minClear: 40, maxR: 1100, pieces: [
      { w: 3, type: "straight", len: [70, 240] }, { w: 6, type: "corner", R: [35, 140], ang: [35, 100] },
      { w: 2, type: "hairpin", R: [13, 18] }, { w: 3, type: "esses", R: [45, 90], ang: [30, 60] }] },
    elev: { amp: 80, scale: 0.0015, ridge: 30, maxGrade: 0.1, smooth: 45 },
    crests: { perKm: 1.5, h: [1.3, 2.5], w: [20, 28] },
    veg: [{ type: "eucalyptus", n: 150, far: 520, dmin: 5 }, { type: "pine", n: 80, far: 300, dmin: 5 }, { type: "bush", n: 70, far: 90, dmin: 4.2 }, { type: "rock", n: 16, far: 30, dmin: 5 }],
    pal: { zenith: "#3b6fc0", horizon: "#cbd9e6", sun: "#fff0d2", sunElev: 40, sunAz: 150, grass: ["#5d6a31", "#78803e"], dry: "#9c8f57", dirt: "#9c7a55", rock: "#8d8577", snow: "#eef2f6", mountain: "#6f8299", fog: 0.0011, exposure: 1.0 },
    stages: [
      { name: "Fafe", len: 4000, time: "day", weather: "clear", bigJump: true },
      { name: "Arganil", len: 4400, time: "day", weather: "clear" },
      { name: "Ponte de Lima", len: 4200, time: "day", weather: "overcast" }
    ]
  },
  {
    id: "kenya", name: "Safari Rally", country: "Naivasha · Kenya", code: "KE", surface: "sand", offroad: "scrub",
    blurb: "Red dust, long straights and the Great Rift Valley. The fastest average speeds of the season and soft sand traps off line.",
    roadW: 8, crowd: 0.5, walls: null, barriers: false, houses: 0.15, poles: 0.5,
    mix: [["sand", 6], ["gravel", 2], ["mud", 0.8]],
    gen: { minClear: 60, maxR: 1500, pieces: [
      { w: 6, type: "straight", len: [150, 520] }, { w: 5, type: "corner", R: [60, 220], ang: [25, 85] },
      { w: 2, type: "corner", R: [30, 55], ang: [60, 100] }] },
    elev: { amp: 45, scale: 0.0012, ridge: 20, maxGrade: 0.07, smooth: 70 },
    crests: { perKm: 1.2, h: [1.2, 2.4], w: [22, 32] },
    veg: [{ type: "acacia", n: 40, far: 160, dmin: 7 }, { type: "bush", n: 90, far: 260, dmin: 4.5 }, { type: "rock", n: 10, far: 30, dmin: 6 }],
    pal: { zenith: "#3c79c9", horizon: "#e6dcc7", sun: "#fff0cc", sunElev: 48, sunAz: 120, grass: ["#a39255", "#b8a464"], dry: "#c2a86d", dirt: "#b4673a", rock: "#8c6f5a", snow: "#eef2f6", mountain: "#8f8fa6", fog: 0.0009, exposure: 1.03 },
    stages: [
      { name: "Hell's Gate", len: 5600, time: "day", weather: "clear" },
      { name: "Kedong", len: 5200, time: "dusk", weather: "clear" },
      { name: "Sleeping Warrior", len: 5400, time: "day", weather: "clear" }
    ]
  },
  {
    id: "greece", name: "Acropolis Rally", country: "Loutraki · Greece", code: "GR", surface: "gravel", offroad: "rock",
    blurb: "Rough, rocky mountain roads baked white by the sun. Brutal on cars: watch your damage between stages.",
    roadW: 7, crowd: 0.6, walls: null, barriers: false, houses: 0.3, poles: 0.3,
    mix: [["gravel", 7], ["concrete", 1], ["tarmac", 1]],
    gen: { minClear: 35, maxR: 1100, pieces: [
      { w: 3, type: "straight", len: [60, 220] }, { w: 5, type: "corner", R: [30, 110], ang: [40, 110] },
      { w: 2, type: "switchback", R: [12, 17], len: [60, 120] }, { w: 2, type: "hairpin", R: [12, 18] }] },
    elev: { amp: 110, scale: 0.0013, ridge: 50, maxGrade: 0.1, smooth: 45 },
    crests: { perKm: 0.9, h: [1.2, 2.4], w: [16, 24] },
    veg: [{ type: "olive", n: 60, far: 200, dmin: 5.5 }, { type: "bush", n: 110, far: 300, dmin: 4.2 }, { type: "pine", n: 30, far: 120, dmin: 6 }, { type: "rock", n: 40, far: 120, dmin: 4.5 }],
    pal: { zenith: "#3a76cc", horizon: "#d7dfe8", sun: "#fff3d6", sunElev: 52, sunAz: 170, grass: ["#8c8a55", "#a39c63"], dry: "#bdb08a", dirt: "#b9a888", rock: "#a8a196", snow: "#eef2f6", mountain: "#8796ab", fog: 0.001, exposure: 1.02 },
    stages: [
      { name: "Loutraki", len: 3900, time: "day", weather: "clear" },
      { name: "Bauxites", len: 4200, time: "day", weather: "clear" },
      { name: "Elatia", len: 4000, time: "dusk", weather: "clear" }
    ]
  },
  {
    id: "corsica", name: "Tour de Corse", country: "Corsica · France", code: "FR", surface: "tarmac", offroad: "scrub",
    blurb: "The rally of ten thousand corners. Narrow, bumpy tarmac clinging to the cliffs above the Mediterranean.",
    roadW: 6.5, crowd: 0.7, walls: "stone", barriers: true, houses: 0.5, poles: 0.2,
    mix: [["tarmac", 7], ["concrete", 1.5], ["gravel", 0.6]],
    gen: { minClear: 26, maxR: 1000, pieces: [
      { w: 2, type: "straight", len: [40, 140] }, { w: 7, type: "corner", R: [25, 110], ang: [35, 110] },
      { w: 4, type: "esses", R: [30, 70], ang: [35, 70] }, { w: 1, type: "hairpin", R: [12, 16] }] },
    elev: { amp: 120, scale: 0.0012, ridge: 40, maxGrade: 0.09, smooth: 45 },
    crests: { perKm: 0.6, h: [0.8, 1.6], w: [18, 26] },
    veg: [{ type: "bush", n: 160, far: 420, dmin: 4.2 }, { type: "broadleaf", n: 50, far: 220, dmin: 5.5 }, { type: "pine", n: 30, far: 140, dmin: 6 }, { type: "rock", n: 20, far: 60, dmin: 5 }],
    water: "sea",
    pal: { zenith: "#2f6dc7", horizon: "#cfe0ef", sun: "#fff3da", sunElev: 44, sunAz: 200, grass: ["#5b6b34", "#6f7c40"], dry: "#9a9060", dirt: "#8d7c62", rock: "#9a948a", snow: "#eef2f6", mountain: "#7a92b0", fog: 0.001, exposure: 1.0 },
    stages: [
      { name: "Castagniccia", len: 3800, time: "day", weather: "clear" },
      { name: "Cap Corse", len: 4000, time: "day", weather: "clear" },
      { name: "Vero", len: 3700, time: "dusk", weather: "clear" }
    ]
  },
  {
    id: "argentina", name: "Rally Argentina", country: "Córdoba · Argentina", code: "AR", surface: "gravel", offroad: "rock",
    blurb: "High-altitude gravel across the Traslasierra plateau. Huge skies, water splashes and the El Cóndor descent.",
    roadW: 7.5, crowd: 0.8, walls: null, barriers: false, houses: 0.15, poles: 0.3,
    mix: [["gravel", 6], ["sand", 1.2], ["mud", 1], ["concrete", 0.5]],
    gen: { minClear: 45, maxR: 1300, pieces: [
      { w: 4, type: "straight", len: [90, 300] }, { w: 5, type: "corner", R: [40, 170], ang: [30, 100] },
      { w: 1, type: "hairpin", R: [13, 18] }, { w: 3, type: "esses", R: [60, 120], ang: [25, 55] }] },
    elev: { amp: 100, scale: 0.0011, ridge: 60, maxGrade: 0.09, smooth: 55 },
    crests: { perKm: 1.4, h: [1.3, 2.6], w: [20, 30] },
    veg: [{ type: "bush", n: 120, far: 380, dmin: 4.5 }, { type: "cactus", n: 30, far: 90, dmin: 5 }, { type: "rock", n: 50, far: 160, dmin: 4.5 }, { type: "broadleaf", n: 12, far: 40, dmin: 7 }],
    pal: { zenith: "#2d66c4", horizon: "#d5dde6", sun: "#fff6e0", sunElev: 46, sunAz: 30, grass: ["#8f8a52", "#a39b5e"], dry: "#b4a274", dirt: "#9a7b5c", rock: "#857b70", snow: "#eef2f6", mountain: "#7e86a3", fog: 0.0008, exposure: 1.02 },
    stages: [
      { name: "El Cóndor", len: 4800, time: "day", weather: "clear" },
      { name: "Mina Clavero", len: 4500, time: "day", weather: "clear" },
      { name: "Giulio Cesare", len: 4700, time: "dusk", weather: "clear" }
    ]
  }
];
export const LOC_BY_ID = Object.fromEntries(LOCATIONS.map(l => [l.id, l]));
export const ROAD_SURFACES = ["tarmac", "concrete", "gravel", "mud", "sand", "snow"];

// ---------- Championships (one per class) ----------
// rounds: [locationId, number of stages]. The last stage of every round is the Power Stage (3/2/1 bonus points).
export const CHAMPIONSHIPS = {
  H: { rounds: [["wales", 2], ["monte", 2], ["finland", 2], ["corsica", 2]] },
  G4: { rounds: [["portugal", 2], ["kenya", 2], ["greece", 2], ["sweden", 2], ["corsica", 2]] },
  GB: { rounds: [["monte", 3], ["portugal", 3], ["finland", 3], ["argentina", 3], ["wales", 3]] },
  WRC: { rounds: [["sweden", 3], ["kenya", 3], ["greece", 3], ["finland", 3], ["argentina", 3], ["corsica", 3]] },
  R1: { rounds: [["monte", 3], ["sweden", 3], ["portugal", 3], ["kenya", 3], ["finland", 3], ["wales", 3]] }
};
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4];
export const POWER_POINTS = [3, 2, 1];

// ---------- Economy ----------
export const START_CREDITS = 6000;
export const TIER_PRIZE = [2800, 7200, 17500, 33500, 60000];     // event win prize per tier
export const TIER_CHAMP = [16000, 40000, 96000, 176000, 320000]; // championship win bonus per tier
export const TIER_XP = [1, 1.8, 3, 4.6, 6.5];
export const POS_PRIZE = [1, 0.7, 0.55, 0.42, 0.32, 0.24, 0.17, 0.12];
export const POS_XP = [300, 220, 180, 150, 120, 100, 80, 60];
export const STAGE_WIN_FRAC = 0.12;  // of the tier's event prize
export const REPAIR_FRAC = 0.05;     // of car price, at 100% damage
export const RESET_PENALTY = 5, AUTO_RESET_PENALTY = 10;
export function xpForLevel(n) { return Math.round(380 * Math.pow(n, 1.22)); } // XP needed to go from level n to n+1
export const MAX_LEVEL = 50;

// pace multiplies the benchmark time (the built-in driver in a stock class car) to give the class pace.
export const DIFFICULTIES = [
  { id: "rookie", name: "Rookie", pace: 1.12, pay: 0.8, desc: "Rivals leave room for mistakes." },
  { id: "amateur", name: "Amateur", pace: 1.04, pay: 1.0, desc: "A fair fight for a tidy driver." },
  { id: "pro", name: "Pro", pace: 0.98, pay: 1.25, desc: "Clean, committed runs needed to win." },
  { id: "expert", name: "Expert", pace: 0.935, pay: 1.5, desc: "Near-perfect stages and upgraded cars." },
  { id: "legend", name: "Legend", pace: 0.895, pay: 1.9, desc: "Only maxed cars and flawless driving." }
];
export const DIFF_BY_ID = Object.fromEntries(DIFFICULTIES.map(d => [d.id, d]));

// Sponsor objectives offered with each round. Met objectives pay a bonus share of the round prize.
export const OBJECTIVES = [
  { id: "clean", text: "Finish the round without a reset", bonus: 0.25 },
  { id: "podium", text: "Finish the round on the podium", bonus: 0.3 },
  { id: "stagewin", text: "Win at least one stage", bonus: 0.3 },
  { id: "lowdmg", text: "Finish with less than 25% damage", bonus: 0.2 },
  { id: "power", text: "Score Power Stage points", bonus: 0.3 }
];

// ---------- Rivals (seven per class). skill: fraction slower (+) or faster (-) than the class pace. ----------
// Three front-runners set the title pace; the back four are spread out so a newer driver can score
// solid points and climb the order before their car and driving catch up.
export const RIVALS = {
  H: [["Léon Duval", "FR", -0.012], ["Siobhan Hale", "GB", -0.004], ["Timo Rautio", "FI", 0.0], ["Lars Ekholm", "SE", 0.015], ["Giulia Ferraro", "IT", 0.027], ["Pedro Alves", "PT", 0.0425], ["Ewan Price", "GB", 0.0625]],
  G4: [["Pekka Salo", "FI", -0.014], ["Bernard Laffont", "FR", -0.006], ["Walter Brandt", "DE", 0.0], ["Aiko Mori", "JP", 0.015], ["Björn Strand", "SE", 0.027], ["Raúl Benítez", "AR", 0.042], ["Kofi Mensah", "KE", 0.0615]],
  GB: [["Jari Kallio", "FI", -0.015], ["Claire Arnaud", "FR", -0.007], ["Hannes Vogt", "DE", -0.001], ["Nils Halvorsen", "SE", 0.015], ["Massimo Rinaldi", "IT", 0.027], ["Joaquim Sá", "PT", 0.0425], ["Dermot Quinn", "IE", 0.0615]],
  WRC: [["Callum Barr", "GB", -0.016], ["Jussi Lahti", "FI", -0.008], ["Carlos Ortega", "ES", -0.002], ["Didier Aubert", "FR", 0.0145], ["Kenji Arai", "JP", 0.0265], ["Petter Lund", "NO", 0.0415], ["Richard Byrne", "NZ", 0.0605]],
  R1: [["Eero Virtanen", "FI", -0.017], ["Lucien Lamy", "FR", -0.009], ["Pieter Mertens", "BE", -0.003], ["Gareth Rhys", "GB", 0.014], ["Rasmus Kask", "EE", 0.026], ["Takumi Kato", "JP", 0.041], ["Dani Solano", "ES", 0.06]]
};
