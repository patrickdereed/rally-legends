import { LOCATIONS } from "../force-app/main/default/staticresources/RallyLegends/data.js";
import { buildStage, noteText } from "../force-app/main/default/staticresources/RallyLegends/track.js";
let fail = 0;
for (const loc of LOCATIONS) for (let i = 0; i < loc.stages.length; i++) {
  const t0 = performance.now();
  try {
    const st = buildStage(loc, i, { cell: 6 });
    const ms = (performance.now() - t0).toFixed(0);
    const corners = st.notes.filter(n => n.kind === "corner");
    const hp = corners.filter(n => n.grade === "H").length;
    let maxGrade = 0; for (let j = 1; j < st.n; j++) maxGrade = Math.max(maxGrade, Math.abs(st.y[j] - st.y[j-1]) / 2);
    console.log(`${loc.id.padEnd(9)} ${st.name.padEnd(20)} L=${st.L.toFixed(0)} ${ms}ms grid=${st.grid.nx}x${st.grid.nz}@${st.grid.cell.toFixed(1)} notes=${st.notes.length} hairpins=${hp} crests=${st.crests.length} trees=${st.trees.length} obs=${st.obstacles.length} crowd=${st.crowds.length} props=${st.props.length} water=${st.waterY==null?'-':st.waterY.toFixed(1)} maxGrade=${(maxGrade*100).toFixed(1)}% walls=${[...st.wallL].filter(Boolean).length+[...st.wallR].filter(Boolean).length}`);
    if (i === 0 && loc.id === "monte") console.log("   notes:", st.notes.slice(0, 8).map(noteText).join(" | "));
  } catch (e) { fail++; console.log(loc.id, i, "FAILED", e.stack); }
}
process.exit(fail ? 1 : 0);
