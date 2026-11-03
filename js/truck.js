// Cel-shaded white pickup (generic, unbranded) that carries the group from the homestay
// through the tea estate. Local axes: +z = forward, wheels on the ground at y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { part, toon } from './characters.js';

const WHITE = '#f3f3ef', BLACK = '#1c1d20', GREY = '#9ea3a8', GLASS = '#2a3a48';
export const BED = { x0: -.82, x1: .82, z0: -2.55, z1: .05, floor: 1.02 }; // standing area in the bed

export function makeTruck() {
  const truck = new THREE.Group();       // follows the road (position + yaw)
  const body = new THREE.Group();        // suspension: pitch / roll / shake
  truck.add(body);
  const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);

  // chassis + under-run
  part(new THREE.BoxGeometry(1.1, .22, 4.9), BLACK, body).position.set(0, .62, -.35);
  // cab
  const cab = part(rb(1.84, 1.25, 1.55, .12), WHITE, body); cab.position.set(0, 1.55, .95);
  part(rb(1.86, .12, 1.45, .05), WHITE, body).position.set(0, 2.2, .9);                      // roof cap
  const ws = part(new THREE.PlaneGeometry(1.6, .82), GLASS, body, { outline: false }); ws.position.set(0, 1.78, 1.74); ws.rotation.x = -.22;
  for (const s of [-1, 1]) {
    const win = part(new THREE.PlaneGeometry(1.15, .62), GLASS, body, { outline: false }); win.position.set(s * .925, 1.8, .9); win.rotation.y = s * Math.PI / 2;
    part(new THREE.BoxGeometry(.02, .02, .55), BLACK, body, { outline: false }).position.set(s * .93, 1.38, 1.2);  // door handle line
    const stripe = part(new THREE.BoxGeometry(.015, .07, 1.1), '#2f8fe0', body, { outline: false }); stripe.position.set(s * .93, 1.18, .95);
    const st2 = part(new THREE.BoxGeometry(.015, .035, .7), '#7cc8ff', body, { outline: false }); st2.position.set(s * .93, 1.08, .85);
    const mirror = part(rb(.08, .26, .18, .03), BLACK, body); mirror.position.set(s * 1.05, 1.75, 1.62);
    part(new THREE.BoxGeometry(.18, .03, .03), BLACK, body).position.set(s * .97, 1.68, 1.62);
  }
  const back = part(new THREE.PlaneGeometry(1.4, .45), GLASS, body, { outline: false }); back.position.set(0, 1.85, .16); back.rotation.y = Math.PI;
  // hood + front
  const hood = part(rb(1.84, .78, 1.2, .14), WHITE, body); hood.position.set(0, 1.22, 2.25);
  const grille = part(rb(1.05, .42, .06, .02), BLACK, body); grille.position.set(0, 1.3, 2.86);
  for (let i = -3; i <= 3; i++) part(new THREE.BoxGeometry(.035, .36, .03), '#c9ced3', body, { outline: false }).position.set(i * .13, 1.3, 2.9);
  for (const s of [-1, 1]) {
    const hl = part(rb(.3, .22, .06, .04), '#e8f4ff', body); hl.position.set(s * .72, 1.34, 2.84);
    hl.material = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
    part(rb(.14, .07, .04, .02), '#f0a020', body, { outline: false }).position.set(s * .75, 1.1, 2.86);
  }
  part(rb(1.95, .26, .3, .08), GREY, body).position.set(0, .88, 2.9);                     // bumper
  part(new THREE.BoxGeometry(.5, .13, .02), '#f2c230', body, { outline: false }).position.set(0, .88, 3.06); // blank plate
  // fenders
  for (const [z, s] of [[2.05, 1], [2.05, -1], [-1.55, 1], [-1.55, -1]]) {
    const f = part(new THREE.CylinderGeometry(.58, .58, .3, 16, 1, true, 0, Math.PI), BLACK, body); f.rotation.set(0, 0, Math.PI / 2); f.position.set(s * .86, .5, z);
  }
  // load bed with ribbed side panels + tailgate + steel rail frame people hold on to
  part(new THREE.BoxGeometry(1.9, .1, 2.75), '#d8d8d2', body).position.set(0, .97, -1.25);
  for (const s of [-1, 1]) {
    part(rb(.07, .55, 2.75, .02), WHITE, body).position.set(s * .93, 1.27, -1.25);
    for (let k = 0; k < 3; k++) part(new THREE.BoxGeometry(.02, .035, 2.7), '#d6d6d0', body, { outline: false }).position.set(s * .97, 1.1 + k * .14, -1.25);
  }
  part(rb(1.9, .55, .07, .02), WHITE, body).position.set(0, 1.27, -2.62);
  part(rb(1.9, .55, .07, .02), WHITE, body).position.set(0, 1.27, .12);
  const rail = '#3a3d42', tube = (a, b) => {
    const d = b.clone().sub(a), m = part(new THREE.CylinderGeometry(.025, .025, d.length(), 6), rail, body, { outline: false });
    m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const s of [-.93, .93]) { tube(V(s, 1.5, -2.6), V(s, 2.25, -2.6)); tube(V(s, 1.5, .1), V(s, 2.25, .1)); tube(V(s, 1.5, -1.25), V(s, 2.25, -1.25)); tube(V(s, 2.25, -2.6), V(s, 2.25, .1)); }
  tube(V(-.93, 2.25, .1), V(.93, 2.25, .1)); tube(V(-.93, 2.25, -2.6), V(.93, 2.25, -2.6));
  // wheels
  const wheels = [];
  for (const [x, z] of [[.86, 2.05], [-.86, 2.05], [.86, -1.55], [-.86, -1.55]]) {
    const hub = new THREE.Group(); hub.position.set(x, .45, z); truck.add(hub);
    const spin = new THREE.Group(); hub.add(spin);
    const tyre = part(new THREE.TorusGeometry(.33, .13, 10, 24), '#202124', spin); tyre.rotation.y = Math.PI / 2;
    const rim = part(new THREE.CylinderGeometry(.24, .24, .2, 16), '#e4e6e8', spin); rim.rotation.z = Math.PI / 2;
    for (let k = 0; k < 5; k++) { const hole = new THREE.Mesh(new THREE.BoxGeometry(.21, .05, .05), toon('#8a8f96')); hole.position.x = Math.sign(x) * .01; hole.rotation.x = k / 5 * Math.PI; spin.add(hole); }
    wheels.push(spin);
  }
  truck.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return { truck, body, wheels, hubs: wheels.map(w => w.parent) };
}
