// ============================================================
//  WalkWorld 3D — world.js  (IMPROVED GRAPHICS)
// ============================================================

export const WORLD_SIZE = 200;
export const HALF       = WORLD_SIZE / 2;
export const WATER_Y    = -0.35;
export const SPAWN      = { x: 0, y: 2.0, z: 5 };

export const scene = new THREE.Scene();

const SEGS  = 120;
const HSTEP = WORLD_SIZE / SEGS;

let _hmap = null;

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

export function getZoneName(x, z) {
  if (x < -25 && z < 18)                      return 'Forest';
  if (x > 40  && z > 16)                       return 'Lake';
  if (x > 30  && z < -30)                      return 'Cabin';
  if (Math.abs(x) <= 22 && Math.abs(z) <= 18)  return 'Plaza';
  return 'Plains';
}

function _noise(x, z) {
  return (
    Math.sin(x * 0.070 + 0.40) * Math.cos(z * 0.060 + 0.80) * 2.2 +
    Math.sin(x * 0.130 + z * 0.110 - 0.30) * 1.1 +
    Math.cos(x * 0.040 - z * 0.080 + 1.40) * 1.6 +
    Math.sin(x * 0.220 + z * 0.190 + 0.70) * 0.4
  );
}

function _targetHeight(x, z) {
  const zone = getZoneName(x, z);
  if (zone === 'Plaza') return 0.08;
  if (zone === 'Cabin') return 0.22;
  if (zone === 'Lake') {
    const dx = x - 62, dz = z - 52;
    const d  = Math.sqrt(dx * dx + dz * dz);
    return Math.max(-4.5, -0.9 - d * 0.13);
  }
  const n = _noise(x, z);
  if (zone === 'Forest') return n * 0.55 + 1.0;
  return n * 0.70 + 0.30;
}

function _buildHeightmap() {
  _hmap = [];
  for (let iz = 0; iz <= SEGS; iz++) {
    const row = [];
    for (let ix = 0; ix <= SEGS; ix++) {
      row.push(_targetHeight(-HALF + ix * HSTEP, -HALF + iz * HSTEP));
    }
    _hmap.push(row);
  }
}

export function getHeightAt(x, z) {
  if (!_hmap) return 0;
  const fx = (x + HALF) / HSTEP;
  const fz = (z + HALF) / HSTEP;
  const ix = Math.max(0, Math.min(SEGS - 1, Math.floor(fx)));
  const iz = Math.max(0, Math.min(SEGS - 1, Math.floor(fz)));
  const tx = fx - ix;
  const tz = fz - iz;
  const h00 = _hmap[iz][ix];
  const h10 = _hmap[iz][ix + 1]             ?? h00;
  const h01 = (_hmap[iz + 1] || [])[ix]     ?? h00;
  const h11 = (_hmap[iz + 1] || [])[ix + 1] ?? h00;
  return h00*(1-tx)*(1-tz) + h10*tx*(1-tz) + h01*(1-tx)*tz + h11*tx*tz;
}

export function isBlocked(x, z) {
  if (Math.abs(x) >= HALF - 1.5) return true;
  if (Math.abs(z) >= HALF - 1.5) return true;
  return getZoneName(x, z) === 'Lake';
}

// ── Richer terrain palette ────────────────────────────────────
function _terrainColour(x, z, h) {
  const zone = getZoneName(x, z);
  switch (zone) {
    case 'Lake':
      return [0.08, 0.30, 0.62];
    case 'Plaza':
      return [0.44, 0.44, 0.52];
    case 'Cabin':
      return [0.48, 0.34, 0.16];
    case 'Forest':
      if (h > 2.4) return [0.20, 0.38, 0.14];
      return [0.14, 0.30, 0.10];
    default: // Plains
      if (h > 3.2) return [0.68, 0.62, 0.48]; // rocky high ground
      if (h > 1.8) return [0.38, 0.60, 0.22]; // bright mid grass
      if (h > 0.6) return [0.28, 0.56, 0.18]; // lush low grass
      return [0.25, 0.50, 0.16];               // very low ground
  }
}

export function initWorld() {
  // ── Sky: richer gradient blue ──────────────────────────────
  scene.background = new THREE.Color(0x5ba8d8);

  // ── Atmospheric fog: slightly denser for depth ─────────────
  scene.fog = new THREE.FogExp2(0x8ec8e8, 0.0078);

  // ── Ambient: slightly warmer golden-hour tone ─────────────
  scene.add(new THREE.AmbientLight(0xfff4cc, 0.60));

  // ── Sun: brighter, more golden ────────────────────────────
  const sun = new THREE.DirectionalLight(0xfffae8, 1.35);
  sun.position.set(80, 150, 65);
  scene.add(sun);

  // ── Sky hemisphere: richer sky-blue / earth-green contrast ─
  scene.add(new THREE.HemisphereLight(0x7ad4f0, 0x336622, 0.50));

  // ── Subtle fill from opposite side (bounce light) ─────────
  const fill = new THREE.DirectionalLight(0xc0d8ff, 0.22);
  fill.position.set(-60, 40, -80);
  scene.add(fill);

  // ── Build terrain ──────────────────────────────────────────
  _buildHeightmap();

  const geoT = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEGS, SEGS);
  geoT.rotateX(-Math.PI / 2);

  const posAttr = geoT.attributes.position;
  const colBuf  = new Float32Array(posAttr.count * 3);

  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i);
    const wz = posAttr.getZ(i);
    const h  = getHeightAt(wx, wz);
    posAttr.setY(i, h);
    const [r, g, b] = _terrainColour(wx, wz, h);
    colBuf[i*3] = r; colBuf[i*3+1] = g; colBuf[i*3+2] = b;
  }

  posAttr.needsUpdate = true;
  geoT.computeVertexNormals();
  geoT.setAttribute('color', new THREE.BufferAttribute(colBuf, 3));

  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(geoT, terrainMat));

  // ── Water: richer blue, slightly more opaque ──────────────
  const waterMat = new THREE.MeshLambertMaterial({
    color: 0x1660c0,
    transparent: true,
    opacity: 0.82,
  });
  _addWater(60, 50, 44, 36, waterMat);
  _addWater(-60, 38, 18, 14, waterMat);

  // ── Underground fill (visible when camera dips low) ───────
  const underGeo = new THREE.PlaneGeometry(WORLD_SIZE + 80, WORLD_SIZE + 80);
  underGeo.rotateX(-Math.PI / 2);
  const under = new THREE.Mesh(underGeo, new THREE.MeshLambertMaterial({ color: 0x0e2208 }));
  under.position.y = -5.2;
  scene.add(under);

  // ── Sky dome: large sphere coloured for atmospheric depth ──
  _buildSkyDome();

  // ── Horizon mountains ─────────────────────────────────────
  _buildHorizon();

  return scene;
}

function _addWater(cx, cz, w, d, mat) {
  const geo = new THREE.PlaneGeometry(w, d, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, WATER_Y, cz);
  scene.add(mesh);
}

// ── Sky dome: simple large sphere with gradient via vertex colors
function _buildSkyDome() {
  const geo = new THREE.SphereGeometry(420, 12, 8);
  // Flip normals inward
  geo.scale(-1, 1, 1);

  const posAttr = geo.attributes.position;
  const colBuf  = new Float32Array(posAttr.count * 3);

  // Sky gradient: top = deep blue, horizon = pale sky
  const topCol  = new THREE.Color(0x3a7fc8);   // deep sky
  const midCol  = new THREE.Color(0x8ec8e8);   // mid sky
  const horizCol = new THREE.Color(0xc4e4f4);  // horizon haze

  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const r = 420;
    // Normalise: 1 = top, 0 = horizon
    const t = Math.max(0, Math.min(1, (y + r) / (2 * r)));

    let col;
    if (t > 0.18) {
      // lerp topCol → midCol
      const f = (t - 0.18) / 0.82;
      col = topCol.clone().lerp(midCol, 1 - f);
    } else {
      // lerp midCol → horizCol
      const f = t / 0.18;
      col = midCol.clone().lerp(horizCol, 1 - f);
    }
    colBuf[i*3]     = col.r;
    colBuf[i*3 + 1] = col.g;
    colBuf[i*3 + 2] = col.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colBuf, 3));

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.position.y = -30;
  scene.add(dome);
}

function _buildHorizon() {
  const mat = new THREE.MeshLambertMaterial({ color: 0x1a4016 });
  const rng = makeRng(0xF00DCAFE);
  const COUNT = 30;
  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * Math.PI * 2 + rng() * 0.18;
    const dist  = HALF + 9 + rng() * 12;
    const cx    = Math.cos(angle) * dist;
    const cz    = Math.sin(angle) * dist;
    const w     = 14 + rng() * 22;
    const h     = 9  + rng() * 16;
    const segs  = 4 + Math.floor(rng() * 3);
    const cone  = new THREE.Mesh(new THREE.ConeGeometry(w, h, segs), mat);
    cone.position.set(cx, h * 0.28 - 1.5, cz);
    cone.rotation.y = rng() * Math.PI * 2;
    scene.add(cone);
  }
}
