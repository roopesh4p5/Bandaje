// Chapter 2, after the games: night falls at the stay. Everyone sits on camping chairs in a ring
// around a campfire, then leans back to gaze at the stars. Pure function of the clock, like games.js.
import * as THREE from 'three';
import { part, toon } from './characters.js';
import { softTex } from './textures.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const sm = k => k * k * (3 - 2 * k);

export function makeCampfire(scene, world, people, games) {
  const H = (x, z) => world.heightAt(x, z);
  const F = games.P(-3, 21.5);                       // just in front of the stay, past the spectator line
  const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const root = new THREE.Group(); root.visible = false; scene.add(root);

  // ---- fire pit: stone ring, crossed logs, flames, embers, warm light ----
  const pit = new THREE.Group(); pit.position.copy(F); root.add(pit);
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2, s = part(new THREE.DodecahedronGeometry(.17 + (i % 3) * .03, 0), i % 2 ? '#6f6a63' : '#57534d', pit, { outline: false });
    s.position.set(Math.cos(a) * .72, .08, Math.sin(a) * .72); s.rotation.set(i, i * 2, 0); s.scale.y = .7;
  }
  const logGeo = new THREE.CylinderGeometry(.07, .08, 1.1, 7).rotateZ(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const l = part(logGeo, '#4a2e1a', pit, { outline: false });
    l.rotation.set(0, i / 5 * Math.PI * 2, .55); l.position.set(0, .28, 0);
    l.translateX(.26);
  }
  const coals = new THREE.Mesh(new THREE.CircleGeometry(.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: .85 }));
  coals.position.y = .05; pit.add(coals);

  const flameMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec2 vUv; attribute float aPh;
      void main(){ vUv = uv; vec3 p = position;
        float k = uv.y; p.x += sin(uTime * 7. + aPh + k * 5.) * .07 * k; p.z += cos(uTime * 6. + aPh * 2. + k * 4.) * .06 * k;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ float k = vUv.y; float edge = 1. - abs(vUv.x - .5) * 2.;
        float a = smoothstep(0., .35, edge) * (1. - smoothstep(.45, 1., k)) * (.75 + .25 * sin(uTime * 13. + vUv.x * 9.));
        vec3 c = mix(vec3(1., .85, .45), vec3(1., .32, .05), k);
        gl_FragColor = vec4(c * a * 1.6, a); }`,
  });
  const flames = [];
  for (let i = 0; i < 6; i++) {
    const h = i ? .9 + (i % 3) * .25 : 1.5, g = new THREE.ConeGeometry(i ? .2 : .3, h, 10, 6, true).translate(0, h / 2, 0);
    g.setAttribute('aPh', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(i * 1.7), 1));
    const f = new THREE.Mesh(g, flameMat);
    const a = i / 5 * Math.PI * 2; f.position.set(i ? Math.cos(a) * .17 : 0, .12, i ? Math.sin(a) * .17 : 0);
    f.userData = { h, ph: i * 1.3 }; pit.add(f); flames.push(f);
  }
  const tex = softTex();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff8a3a, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.y = .8; glow.scale.setScalar(4.2); pit.add(glow);
  const sparks = Array.from({ length: 34 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb04a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.userData = { ph: i / 34, a: i * 2.4, r: .1 + (i * 37 % 10) / 30, sp: .7 + (i * 13 % 7) / 10 };
    pit.add(s); return s;
  });
  // the lights live outside the hidden group (intensity 0 by day) so toggling never recompiles shaders
  const light = new THREE.PointLight(0xff8a3a, 0, 26, 1.7); light.position.copy(F).add(new THREE.Vector3(0, 1.1, 0)); scene.add(light);
  const fill = new THREE.PointLight(0xff6a2a, 0, 9, 2); fill.position.copy(F).add(new THREE.Vector3(0, .4, 0)); scene.add(fill);

  // ---- a ring of folding camp chairs, one per person ----
  const R = 3.7, n = people.length, seats = [];
  const frameC = '#2a2c30', clothC = ['#1f5f8b', '#2f6e3f', '#8a2f2f', '#3a3a6a', '#7a5a1f'];
  people.forEach((p, i) => {
    const a = i / n * Math.PI * 2 + .12, r = R + (i % 2) * .5;
    const x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r, pos = new THREE.Vector3(x, H(x, z), z);
    const yaw = yawTo(pos, F) + (p.jit * .25);
    const ch = new THREE.Group(); ch.position.copy(pos); ch.rotation.y = yaw; root.add(ch);
    const cloth = clothC[i % clothC.length];
    part(new THREE.BoxGeometry(.56, .05, .5), cloth, ch).position.set(0, .42, .02);                  // seat
    const back = part(new THREE.BoxGeometry(.56, .62, .05), cloth, ch); back.position.set(0, .74, -.25); back.rotation.x = -.18; // backrest
    for (const sx of [-1, 1]) {
      part(new THREE.BoxGeometry(.05, .04, .48), frameC, ch, { outline: false }).position.set(sx * .3, .6, .02); // armrests
      for (const sz of [-1, 1]) {
        const leg = part(new THREE.CylinderGeometry(.018, .018, .62, 5), frameC, ch, { outline: false });
        leg.position.set(sx * .27, .3, sz * .2); leg.rotation.x = sz * .25;
      }
    }
    seats.push({ pos, yaw, a });
  });

  // a cooler box and a guitar leaning on one chair for the vibe
  const cooler = part(new THREE.BoxGeometry(.6, .4, .4), '#2c7fb8', root); cooler.position.copy(games.P(-3 + 5.4, 21.5 + 1.2, .2));
  const guitar = new THREE.Group(); root.add(guitar);
  part(new THREE.SphereGeometry(.2, 12, 10).scale(1, 1.2, .35), '#a5652a', guitar).position.y = .25;
  part(new THREE.BoxGeometry(.06, .55, .03), '#3a2414', guitar).position.y = .7;
  const gs = seats[3]; guitar.position.copy(gs.pos).add(new THREE.Vector3(Math.cos(gs.a + 1.57) * .45, 0, Math.sin(gs.a + 1.57) * .45)); guitar.rotation.set(0, gs.yaw, .25);

  // ---- poses ----
  function sit(p, t, gaze, i) {
    const k = p.ph, g = gaze;
    p.hips.position.y = .5 + Math.sin(t * 1.4 + k) * .004; p.hips.rotation.y = 0;
    p.spine.rotation.set(lerp(.12, -.38, g) + Math.sin(t * .9 + k) * .02, Math.sin(t * .3 + k) * .08 * (1 - g), 0);
    p.neck.rotation.set(lerp(.12 + Math.sin(t * .6 + k) * .05, -.75 - p.jit * .2, g), Math.sin(t * .4 + k * 2) * lerp(.4, .15, g), 0);
    const spread = .08 + p.rnd * .1;
    p.legs.forEach((l, j) => { l.hp.rotation.set(-1.45 - (p.jit > .25 ? .15 : 0), 0, (j ? -1 : 1) * -spread); l.kn.rotation.x = 1.35 + (j ? p.jit : -p.jit) * .3; });
    p.phone.visible = false;
    const style = (i * 7 + Math.floor(p.rnd * 10)) % 6;
    if (g > .5 && style === 0) { // pointing out a constellation
      p.arms[1].sh.rotation.set(-2.6 + Math.sin(t * .8 + k) * .15, 0, .25); p.arms[1].el.rotation.set(-.05, 0, 0);
      p.arms[0].sh.rotation.set(-.6, 0, -.35); p.arms[0].el.rotation.set(-.9, 0, 0);
    } else if (g > .5 && style === 1) { // phone up, shooting the Milky Way
      p.arms[1].sh.rotation.set(-2.2, 0, .2); p.arms[1].el.rotation.set(-.6, 0, 0); p.phone.visible = true;
      p.arms[0].sh.rotation.set(-2.0, 0, -.2); p.arms[0].el.rotation.set(-.7, 0, 0);
    } else if (g > .5 && style < 4) { // hands behind the head
      p.arms.forEach((a, j) => { a.sh.rotation.set(-2.7, 0, (j ? 1 : -1) * .55); a.el.rotation.set(-2.1, 0, 0); });
    } else if (style === 4 && g <= .5) { // warming hands towards the fire
      p.arms.forEach((a, j) => { a.sh.rotation.set(-1.25 + Math.sin(t * 1.1 + k) * .05, 0, (j ? 1 : -1) * .12); a.el.rotation.set(-.15, 0, 0); });
    } else { // resting on the armrests
      p.arms.forEach((a, j) => { a.sh.rotation.set(-.35, 0, (j ? 1 : -1) * .3); a.el.rotation.set(-1.05, 0, 0); });
    }
  }

  return {
    center: () => F.clone(),
    fire: F,
    update(mode, L, t) {
      root.visible = true;
      const gaze = mode === 'stargaze' ? sm(clamp((L - .6) / 2.2, 0, 1)) : 0;
      people.forEach((p, i) => {
        if (p.root.parent !== scene) scene.add(p.root);
        const s = seats[i]; p.root.position.copy(s.pos); p.root.rotation.set(0, s.yaw, 0);
        sit(p, t, gaze * (.75 + p.rnd * .25), i);
      });
      flameMat.uniforms.uTime.value = t;
      flames.forEach((f, i) => { const q = .85 + .2 * Math.sin(t * 9 + f.userData.ph) + .1 * Math.sin(t * 23 + i); f.scale.set(1, q, 1); });
      const fl = .82 + .12 * Math.sin(t * 11) + .08 * Math.sin(t * 27 + 1) + .05 * Math.sin(t * 5.3);
      light.intensity = 60 * fl; fill.intensity = 12 * fl; glow.material.opacity = .45 + .15 * fl; coals.material.opacity = .7 + .2 * fl;
      sparks.forEach(s => {
        const u = s.userData, k = (t * .35 * u.sp + u.ph) % 1;
        s.position.set(Math.cos(u.a + k * 3) * u.r * (1 + k * 2), .5 + k * 4.2, Math.sin(u.a + k * 3) * u.r * (1 + k * 2));
        s.scale.setScalar(.09 * (1 - k * .6)); s.material.opacity = Math.sin(k * Math.PI) * (1 - k) * 1.6;
      });
    },
    hide() { root.visible = false; light.intensity = fill.intensity = 0; },
  };
}
