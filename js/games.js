// Chapter 2: the playing ground beside the stay — a cricket match, then a round of lagori (seven stones).
// Everything is a pure function of the clock (no simulation), so restarts / scrubbing stay in sync.
import * as THREE from 'three';
import { poseWalk, poseIdle, part, toon } from './characters.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sm = k => k * k * (3 - 2 * k);
const rnd = (() => { let s = 777; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

export const CRICKET_PERIOD = 3.8;

export function makeGames(scene, world, people) {
  const G = world.groundCenter.clone();
  const V = world.homeCenter.clone().sub(G).setY(0).normalize();        // +v points towards the stay (spectator side)
  const U = new THREE.Vector3(-V.z, 0, V.x);                             // pitch axis
  const H = (x, z) => world.heightAt(x, z);
  const P = (u, v, y = 0) => { const x = G.x + U.x * u + V.x * v, z = G.z + U.z * u + V.z * v; return new THREE.Vector3(x, H(x, z) + y, z); };
  const yawDir = d => Math.atan2(d.x, d.z);
  const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const yawU = yawDir(U), yawV = yawDir(V);

  // ---- props ----
  const props = new THREE.Group(); scene.add(props);
  const pitchMat = new THREE.MeshStandardMaterial({ color: 0xa0784e, roughness: 1 });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 21).rotateX(-Math.PI / 2), pitchMat);
  pitch.position.copy(P(0, 0, .05)); pitch.rotation.y = yawU; pitch.receiveShadow = true; props.add(pitch);
  for (const end of [-1, 1]) { // crease lines + stumps
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .06).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2efe2 }));
    line.position.copy(P(end * 9, 0, .07)); line.rotation.y = yawU; props.add(line);
    for (const k of [-1, 0, 1]) {
      const st = part(new THREE.CylinderGeometry(.02, .02, .72, 6), '#e8dcc0', props, { outline: false });
      st.position.copy(P(end * 10.06, k * .11, .36));
    }
  }
  const mkBat = () => {
    const g = new THREE.Group();
    part(new THREE.BoxGeometry(.1, .52, .035).translate(0, -.42, 0), '#d9b77a', g);
    part(new THREE.CylinderGeometry(.018, .018, .2, 6).translate(0, -.08, 0), '#3a2a1a', g, { outline: false });
    g.position.y = -.26; g.rotation.x = .25; g.visible = false;
    return g;
  };
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 10), toon('#f2f5e8'));
  ball.castShadow = true; ball.visible = false; scene.add(ball);
  const stones = Array.from({ length: 7 }, (_, k) => {
    const r = .34 - k * .033;
    const m = part(new THREE.CylinderGeometry(r, r * 1.05, .075, 10), new THREE.Color().setHSL(.08, .08, .38 + rnd() * .2).getHex(), scene);
    m.castShadow = true; m.visible = false;
    m.userData = { vel: new THREE.Vector3(Math.cos(k * 2.3 + .4), 0, Math.sin(k * 2.3 + .4)).multiplyScalar(2.2 + rnd() * 2.6), vy: 1.6 + rnd() * 1.8, spin: rnd() * 6 };
    return m;
  });

  // ---- roles ----
  const batsman = people[0], runner = people[1], bowler = people[2], keeper = people[3];
  const fielders = people.slice(4, 11), crowd = people.slice(11);
  const bat1 = mkBat(), bat2 = mkBat(); batsman.arms[1].el.add(bat1); runner.arms[1].el.add(bat2);
  const F = [[3, -14], [14, -9], [17, 5], [5, 13], [-7, -12], [-15, 8], [-19, -4]];
  const shots = [ // d % 3: ground drive to a fielder, a six over the crowd, a catch
    { to: [4, 11.2], dur: 1.1, arc: .8, endY: .08, chaser: 3 },
    { to: [9, 36], dur: 2.0, arc: 14, endY: .08, six: true },
    { to: [13.4, -8.6], dur: 1.3, arc: 6.5, endY: 1.35, chaser: 1, catch: true },
  ];
  const teamA = people.slice(0, 6), teamB = people.slice(6, 12), lagCrowd = people.slice(12);
  const SP = P(-2, 9), stackY = SP.y;
  const crowdSpot = i => P(-9 + i * 2.3 + (i % 2) * .4, 19.5 + (i % 2) * 1.2);

  // ---- helpers ----
  function place(pp, pos, yaw) {
    if (pp.root.parent !== scene) scene.add(pp.root);
    pp.root.position.copy(pos); pp.root.rotation.set(0, yaw, 0);
  }
  function travel(pp, A, B, k, run = true) { // A→B with eased progress k, legs matched to the distance covered
    const e = sm(k), pos = A.clone().lerp(B, e); pos.y = H(pos.x, pos.z);
    place(pp, pos, yawTo(A, B));
    if (k > 0 && k < 1) poseWalk(pp, pp.ph + e * A.distanceTo(B) / pp.stride * Math.PI, run ? 1.35 : 1);
    return k > 0 && k < 1;
  }
  function base(p) {
    p.hips.position.y = .95; p.hips.rotation.y = 0; p.spine.rotation.set(0, 0, 0); p.neck.rotation.set(-.05, 0, 0);
    p.legs.forEach((l, i) => { l.hp.rotation.set(0, 0, (i ? -1 : 1) * -.06); l.kn.rotation.x = .04; });
    p.arms.forEach((a, i) => { a.sh.rotation.set(0, 0, (i ? 1 : -1) * .14); a.el.rotation.set(-.15, 0, 0); });
    p.phone.visible = false;
  }
  function ready(p, t) { // fielder's crouch, hands near the knees
    base(p); p.hips.position.y = .86 + Math.sin(t * 3 + p.ph) * .01; p.spine.rotation.x = .38;
    p.legs.forEach((l, i) => { l.hp.rotation.x = -.35; l.hp.rotation.z = (i ? -1 : 1) * -.14; l.kn.rotation.x = .55; });
    p.arms.forEach((a, i) => { a.sh.rotation.set(-.6, 0, (i ? 1 : -1) * .1); a.el.rotation.set(-.25, 0, 0); });
  }
  function crouch(p, t, busy) { // wicket-keeper / stacking stones
    base(p); p.hips.position.y = .55; p.spine.rotation.x = .55;
    p.legs.forEach((l, i) => { l.hp.rotation.x = -1.3; l.hp.rotation.z = (i ? -1 : 1) * -.3; l.kn.rotation.x = 2.0; });
    p.arms.forEach((a, i) => { a.sh.rotation.set(-1.0 + (busy ? Math.sin(t * 7 + i * 2) * .3 : 0), 0, (i ? 1 : -1) * .15); a.el.rotation.set(-.3, 0, 0); });
  }
  function batPose(p, k, t) { // k < 0: stance; 0..1: backlift → drive → follow-through
    base(p); p.hips.position.y = .9; p.spine.rotation.x = .25; p.neck.rotation.set(0, -.6, 0);
    p.legs.forEach((l, i) => { l.hp.rotation.x = -.2; l.hp.rotation.z = (i ? -1 : 1) * -.18; l.kn.rotation.x = .3; });
    let twist = .55, raise = -.45;
    if (k >= 0) {
      if (k < .35) { const q = sm(k / .35); twist = lerp(.55, 1.15, q); raise = lerp(-.45, -1.5, q); }
      else { const q = sm((k - .35) / .65); twist = lerp(1.15, -1.1, q); raise = lerp(-1.5, -2.1, q) + Math.sin(q * Math.PI) * 1.1; }
    } else raise += Math.sin(t * 2 + p.ph) * .04;
    p.spine.rotation.y = twist;
    p.arms[0].sh.rotation.set(raise, 0, .45); p.arms[1].sh.rotation.set(raise, 0, -.25);
    p.arms.forEach(a => a.el.rotation.set(-.45, 0, 0));
  }
  function bowlPose(p, k) { // windmill over the top
    base(p); p.spine.rotation.x = .1 + .35 * k;
    p.arms[1].sh.rotation.set(.3 - k * Math.PI * 2, 0, .1); p.arms[1].el.rotation.set(-.05, 0, 0);
    p.arms[0].sh.rotation.set(-2.6 * (1 - k) - .2, 0, -.2);
    p.legs[0].hp.rotation.x = -.6 * (1 - k); p.legs[1].hp.rotation.x = .4 * (1 - k); p.legs[0].kn.rotation.x = .3;
  }
  function throwPose(p, k) { // overarm throw: wind up to k=.6, release at 1
    base(p);
    const w = k < .6 ? sm(k / .6) : 1, r = k < .6 ? 0 : sm((k - .6) / .4);
    p.arms[1].sh.rotation.set(lerp(0, -2.9, w) + r * 2.0, 0, .2); p.arms[1].el.rotation.set(lerp(-.2, -1.4, w) + r * 1.3, 0, 0);
    p.arms[0].sh.rotation.set(-1.3 * w * (1 - r), 0, -.3);
    p.spine.rotation.set(-.1 * w + .35 * r, .5 * w - .9 * r, 0);
    p.legs[0].hp.rotation.x = -.45 * w; p.legs[1].hp.rotation.x = .3 * w;
  }
  const hand = pp => { pp.root.updateMatrixWorld(true); return pp.arms[1].el.localToWorld(new THREE.Vector3(0, -.3, .02)); };
  const arc = (A, B, k, h) => { const p = A.clone().lerp(B, k); p.y += h * 4 * k * (1 - k); return p; };

  // ---- cricket ----
  function cricket(c, t) {
    const d = c < 0 ? -1 : Math.floor(c / CRICKET_PERIOD), c0 = c < 0 ? -1 : c - d * CRICKET_PERIOD;
    const shot = shots[((d % 3) + 3) % 3], prev = shots[(((d - 1) % 3) + 3) % 3];
    bat1.visible = bat2.visible = true;
    // batsmen + keeper
    const swing = seg(c0, 1.68, 2.05);
    place(batsman, P(-9.3, -.35), yawU); batPose(batsman, c0 >= 1.68 && c0 <= 2.6 ? swing : -1, t);
    if (shot.catch && c0 > 2.9) { batsman.neck.rotation.x = .45; }
    place(runner, P(9.6, 1.1), yawU + Math.PI); poseIdle(runner, t, 'none'); runner.arms[1].sh.rotation.set(-.3, 0, .3);
    place(keeper, P(-12.2, -.1), yawU); crouch(keeper, t, false);
    // bowler: run-up, delivery, follow-through, walk back
    if (c0 < 0) { place(bowler, P(18, .6), yawU + Math.PI); poseIdle(bowler, t, 'none'); }
    else if (c0 < 1.3) travel(bowler, P(18, .6), P(10.8, .5), c0 / 1.3);
    else if (c0 < 1.75) { place(bowler, P(10.8, .5).lerp(P(10, .45), seg(c0, 1.3, 1.75)), yawU + Math.PI); bowlPose(bowler, seg(c0, 1.3, 1.75)); }
    else if (c0 < 2.3) travel(bowler, P(10, .45), P(8.6, .4), seg(c0, 1.75, 2.3), false);
    else if (c0 < 3.6) travel(bowler, P(8.6, .4), P(18, .6), seg(c0, 2.3, 3.6), false);
    else { place(bowler, P(18, .6), yawU + Math.PI); poseIdle(bowler, t, 'none'); }
    // fielders
    fielders.forEach((f, i) => {
      const home = P(...F[i]);
      const cheer = shot.catch && c0 > 3.2;
      if (shot.chaser === i && c0 >= 1.9) {
        const tgt = P(...shot.to);
        if (!travel(f, home, tgt, seg(c0, 1.9, 2.95))) { place(f, tgt, yawTo(tgt, P(-9, 0))); if (shot.catch) poseIdle(f, t, 'cheer'); else if (c0 < 3.6) throwPose(f, seg(c0, 3.0, 3.45)); else ready(f, t); }
      } else if (prev.chaser === i && c0 >= 0 && c0 < 1.0) {
        travel(f, P(...prev.to), home, seg(c0, 0, .9), false);
      } else { place(f, home, yawTo(home, P(-9, 0))); cheer ? poseIdle(f, t, 'cheer') : ready(f, t); }
    });
    // crowd beside the stay
    const crowdCheer = (shot.six && c0 > 2.4) || (shot.catch && c0 > 3.15);
    crowd.forEach((p, i) => { const at = crowdSpot(i); place(p, at, yawTo(at, P(0, 0))); poseIdle(p, t, crowdCheer ? 'cheer' : 'none'); });
    // ball
    ball.visible = true;
    if (c0 < 1.3) ball.position.copy(hand(bowler));
    else if (c0 < 1.62) ball.position.copy(arc(P(10.2, .3, 2.2), P(-4, 0, .06), seg(c0, 1.3, 1.62), .35));
    else if (c0 < 1.85) ball.position.copy(arc(P(-4, 0, .06), P(-8.8, -.15, .75), seg(c0, 1.62, 1.85), .45));
    else {
      const A = P(-8.8, -.15, .75), B = P(shot.to[0], shot.to[1], shot.endY), k = seg(c0, 1.85, 1.85 + shot.dur);
      ball.position.copy(arc(A, B, k, shot.arc));
      if (shot.chaser !== undefined && !shot.catch && c0 > 2.95) {
        const f = fielders[shot.chaser], from = hand(f), to = P(-11.9, -.1, .9);
        ball.position.copy(c0 < 3.45 ? from : arc(from, to, seg(c0, 3.45, 3.75), 1.2));
      }
      if (shot.catch && c0 > 1.85 + shot.dur) ball.position.copy(hand(fielders[shot.chaser]));
      if (shot.six && k >= 1) ball.visible = false;
    }
    stones.forEach(s => s.visible = false);
  }

  // ---- lagori ----
  const A0 = P(-2, 2.2);
  const runAngles = [0, 0, 0, 1.1, 2.6, 4.2], bHome = [[-2, 12.6], [-6.5, 11], [2.5, 11.4], [-5, 14.5], [1.5, 15], [-2, 16]];
  const circle = (i, L) => { // dodging runners circle the stack
    const w = (i % 2 ? -.55 : .5), tt = clamp(L, 2.6, 9.3) - 2.6, a = runAngles[i] + w * tt, r = 6.2 + Math.sin(tt * 1.3 + i) * .8;
    return { pos: new THREE.Vector3(SP.x + Math.cos(a) * r, 0, SP.z + Math.sin(a) * r), dist: Math.abs(w) * r * tt, a, w };
  };
  function lagori(L, t) {
    bat1.visible = bat2.visible = false;
    const won = L > 9.1;
    // team A: thrower, two stackers, three dodgers
    teamA.forEach((p, i) => {
      const startAt = i === 0 ? A0 : P(-4.6 + i * 1.3, .4 - (i % 2));
      if (L < 1.4) {
        place(p, startAt, yawV);
        if (i === 0) throwPose(p, seg(L, 0, .9) * (L < .9 ? 1 : 0) + (L >= .9 ? 1 : 0)); else ready(p, t);
        if (L > 1.3 && i) poseIdle(p, t, 'cheer');
        return;
      }
      if (i === 1 || i === 2) { // stackers run to the pile and rebuild it
        const at = SP.clone().addScaledVector(U, i === 1 ? -.75 : .75).addScaledVector(V, -.2);
        if (!travel(p, startAt, at, seg(L, 1.4, 2.6))) { place(p, at, yawTo(at, SP)); won ? poseIdle(p, t, 'cheer') : crouch(p, t, L > 2.6); }
        return;
      }
      const c = circle(i, L), first = c.pos.clone();
      if (L < 2.6) { travel(p, startAt, first, seg(L, 1.4, 2.6)); return; }
      first.y = H(first.x, first.z);
      const tangent = Math.atan2(-Math.sin(c.a) * c.w, Math.cos(c.a) * c.w);
      place(p, first, won ? yawTo(first, SP) : tangent);
      if (won) poseIdle(p, t, 'cheer'); else poseWalk(p, p.ph + c.dist / p.stride * Math.PI, 1.35);
    });
    // team B: catcher grabs the rebound, everyone chases a dodger, one throw misses
    const chase = [3, 0, 4, 5, 3, 4];
    teamB.forEach((p, j) => {
      const home = P(...bHome[j]);
      if (L < 2.0) { place(p, home, yawTo(home, SP)); ready(p, t); return; }
      const tgt = circle(chase[j], L - .9).pos.lerp(SP, .18); tgt.y = H(tgt.x, tgt.z);
      if (j === 0 && L > 5.4 && L < 6.6) { place(p, p.root.position.clone(), yawTo(p.root.position, circle(3, 6).pos)); throwPose(p, seg(L, 5.4, 6.05)); return; }
      if (j === 2 && L > 6.4) { // fetches the missed throw
        const miss = circle(3, 6).pos.addScaledVector(V, 2.2); miss.y = H(miss.x, miss.z);
        const from = circle(4, 5.4).pos.lerp(SP, .18); from.y = H(from.x, from.z);
        if (!travel(p, from, miss, seg(L, 6.4, 7.4))) { place(p, miss, yawTo(miss, SP)); won ? poseIdle(p, t, 'none') : ready(p, t); }
        return;
      }
      if (won) { place(p, p.root.position.clone(), yawTo(p.root.position, SP)); poseIdle(p, t, 'none'); p.arms.forEach((a, i) => { a.sh.rotation.set(.1, 0, (i ? 1 : -1) * .55); a.el.rotation.set(-.3, 0, (i ? -1 : 1) * 1.5); }); return; }
      const k = seg(L, 2.0, 3.2), pos = home.clone().lerp(tgt, sm(k)); pos.y = H(pos.x, pos.z);
      const prev = p.root.position.clone();
      place(p, pos, prev.distanceToSquared(pos) > 1e-4 ? yawTo(prev, pos) : p.root.rotation.y);
      poseWalk(p, p.ph + L * 5.2, 1.3);
    });
    lagCrowd.forEach((p, i) => { const at = crowdSpot(i + 1); place(p, at, yawTo(at, SP)); poseIdle(p, t, won || (L > 1.3 && L < 2.4) ? 'cheer' : 'none'); });
    // stones: stacked → scattered by the ball → put back one by one
    stones.forEach((s, k) => {
      s.visible = true;
      const slot = SP.clone(); slot.y = stackY + .04 + k * .075;
      const u = s.userData, tau = Math.max(0, L - 1.3), tl = (u.vy + Math.sqrt(u.vy * u.vy + 2 * 9.8 * (slot.y - stackY))) / 9.8;
      const flight = Math.min(tau, tl), land = slot.clone().addScaledVector(u.vel, tl); land.y = H(land.x, land.z) + .04;
      const scat = slot.clone().addScaledVector(u.vel, flight); scat.y = tau < tl ? slot.y + u.vy * flight - 4.9 * flight * flight : land.y;
      if (tau >= tl) scat.addScaledVector(u.vel, Math.min(.12, (tau - tl) * .3));
      const back = 2.9 + k * .9, kb = seg(L, back, back + .55);
      if (L < 1.3) { s.position.copy(slot); s.rotation.set(0, 0, 0); }
      else if (kb <= 0) { s.position.copy(scat); s.rotation.set(Math.min(tau, tl) * u.spin, 0, tau < tl ? tau * 3 : .3); }
      else { s.position.copy(arc(scat, slot, sm(kb), .9)); s.rotation.set(0, 0, 0); }
    });
    // ball: thrower → stack → rebound to the catcher → thrown at a dodger (miss) → fetched
    ball.visible = true;
    const B0 = teamB[0];
    if (L < .9) ball.position.copy(hand(teamA[0]));
    else if (L < 1.3) ball.position.copy(arc(hand(teamA[0]), SP.clone().setY(stackY + .3), seg(L, .9, 1.3), .5));
    else if (L < 2.0) ball.position.copy(arc(SP.clone().setY(stackY + .3), hand(B0), seg(L, 1.3, 2.0), 1.4));
    else if (L < 6.05) ball.position.copy(hand(B0));
    else {
      const miss = circle(3, 6).pos.addScaledVector(V, 2.2); miss.y = H(miss.x, miss.z) + .07;
      if (L < 6.6) ball.position.copy(arc(hand(B0), miss, seg(L, 6.05, 6.6), 1.2));
      else if (L < 7.4) ball.position.copy(miss);
      else ball.position.copy(hand(teamB[2]));
    }
  }

  return {
    G, U, V, P, stack: SP,
    update(mode, clock, t) { mode === 'lagori' ? lagori(clock, t) : cricket(clock, t); },
    hide() { bat1.visible = bat2.visible = false; ball.visible = false; stones.forEach(s => s.visible = false); },
    center() { return G.clone(); },
  };
}
