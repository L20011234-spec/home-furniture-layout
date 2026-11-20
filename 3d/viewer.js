const { THREE, OrbitControls, GLTFLoader, RoomEnvironment } = Layout3D;

const canvas = document.querySelector('#canvas');
const viewport = document.querySelector('#viewport');
const state = document.querySelector('#state');
const progress = document.querySelector('#progress');
const retry = document.querySelector('#retry');
const choose = document.querySelector('#open-model');
const file = document.querySelector('#local-file');
const buttons = [...document.querySelectorAll('[data-action]')];
const modelUrl = '../assets/whole-home.glb';
let renderer;

function message(text, allowRetry = false, allowFile = false) {
  state.hidden = false;
  document.querySelector('#message').textContent = text;
  progress.hidden = true;
  retry.hidden = !allowRetry;
  choose.hidden = !allowFile;
  document.querySelector('#recovery').hidden = !allowRetry && !allowFile;
}

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  message('此设备暂时无法启动 WebGL 三维显示。可返回首页查看全屋效果图。');
}

if (renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, .02, 150);
  const controls = new OrbitControls(camera, canvas);
  const center = new THREE.Vector3();
  const extent = new THREE.Vector3();
  const wideDirection = new THREE.Vector3(.26, 2.34, .82).normalize();
  const tallDirection = new THREE.Vector3(.18, 2.64, .81).normalize();
  const loader = new GLTFLoader();
  let model, frame = 0, contextLost = false, loading = false;
  let fittedAspect = 1;

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
  renderer.setClearColor(0xf1eee5);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment, .045).texture;
  scene.environmentIntensity = .48;
  environment.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff6e7, 0xcac9bc, .82));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -.00018;
  sun.shadow.normalBias = .008;
  scene.add(sun, sun.target);
  controls.maxPolarAngle = Math.PI * .47;
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.addEventListener('change', invalidate);
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    message('三维显示已暂停，恢复后会重新绘制。');
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  function invalidate() {
    if (frame || !model || contextLost) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderer.render(scene, camera);
    });
  }

  function homeDirection(aspect) {
    return aspect < .8 ? tallDirection : wideDirection;
  }

  function distanceFor(aspect, direction = homeDirection(aspect)) {
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, direction).normalize();
    up.crossVectors(direction, right);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let distance = 0;
    for (const sx of [-.5, .5]) for (const sy of [-.5, .5]) for (const sz of [-.5, .5]) {
      const point = new THREE.Vector3(sx * extent.x, sy * extent.y, sz * extent.z);
      const projected = Math.max(Math.abs(point.dot(right)) / aspect, Math.abs(point.dot(up)));
      distance = Math.max(distance, projected / tan + point.dot(direction));
    }
    return distance * 1.07;
  }

  function reset() {
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(homeDirection(camera.aspect), distanceFor(camera.aspect));
    controls.update();
    invalidate();
  }

  function resize() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (model && Math.abs(Math.log(camera.aspect / fittedAspect)) > .015) {
      const offset = camera.position.clone().sub(controls.target);
      const axis = offset.clone().normalize();
      const atHome = controls.target.distanceTo(center) < .001 && axis.dot(homeDirection(fittedAspect)) > .99999 &&
        Math.abs(offset.length() / distanceFor(fittedAspect) - 1) < .001;
      if (atHome) reset();
      else {
        camera.position.copy(controls.target).addScaledVector(offset, distanceFor(camera.aspect, axis) / distanceFor(fittedAspect, axis));
        controls.update();
      }
    }
    fittedAspect = camera.aspect;
    invalidate();
  }
  new ResizeObserver(resize).observe(viewport);
  resize();

  function act(action) {
    if (!model) return;
    if (action === 'reset') return reset();
    if (action === 'plan') {
      const northUp = new THREE.Vector3(0,1,.0001).normalize();
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(northUp,distanceFor(camera.aspect,northUp));
      controls.update();
      invalidate();
      return;
    }
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (action === 'left') spherical.theta -= Math.PI / 12;
    if (action === 'right') spherical.theta += Math.PI / 12;
    if (action === 'up') spherical.phi -= Math.PI / 16;
    if (action === 'down') spherical.phi += Math.PI / 16;
    if (action === 'in') spherical.radius /= 1.23;
    if (action === 'out') spherical.radius *= 1.23;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, .015, controls.maxPolarAngle);
    spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
    invalidate();
  }
  for (const button of buttons) button.addEventListener('click', () => act(button.dataset.action));
  const keys = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down', '+':'in', '=':'in', '-':'out', p:'plan', P:'plan', r:'reset', R:'reset', Home:'reset' };
  canvas.addEventListener('keydown', event => {
    if (!model || event.altKey || event.ctrlKey || event.metaKey || !keys[event.key]) return;
    event.preventDefault();
    if (event.shiftKey && event.key.startsWith('Arrow')) {
      const horizontal = ['ArrowLeft','ArrowRight'].includes(event.key);
      const step = controls.getDistance() * .045 * (['ArrowRight','ArrowUp'].includes(event.key) ? 1 : -1);
      const shift = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, horizontal ? 0 : 1).multiplyScalar(step);
      controls.target.add(shift);
      camera.position.add(shift);
      controls.update();
    } else act(keys[event.key]);
  });

  function install(gltf) {
    const bounds = new THREE.Box3().setFromObject(gltf.scene, true);
    if (bounds.isEmpty()) throw new Error('Empty GLB');
    bounds.getCenter(center);
    bounds.getSize(extent);
    const span = extent.length();
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.castShadow = materials.every(m => !m.name.includes('向内剖面') && !m.transparent && !(m.transmission > .05));
      object.receiveShadow = true;
    });
    model = gltf.scene;
    scene.add(model);
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(new THREE.Vector3(-.65, 1.8, 1.2), span);
    Object.assign(sun.shadow.camera, { left:-span/2, right:span/2, top:span/2, bottom:-span/2, near:.1, far:span*4 });
    sun.shadow.camera.updateProjectionMatrix();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 15, span * 15),
      new THREE.ShadowMaterial({ color: 0x555247, opacity: .12, depthWrite:false }));
    ground.rotation.x = -Math.PI/2;
    ground.position.set(center.x, bounds.min.y - .006, center.z);
    ground.receiveShadow = true;
    scene.add(ground);
    renderer.shadowMap.needsUpdate = true;
    controls.minDistance = span * .12;
    controls.maxDistance = Math.max(span*5, distanceFor(.40)*1.25);
    controls.cursor.copy(center);
    controls.maxTargetRadius = span * .9;
    camera.far = span * 15;
    camera.near = Math.max(.008, span / 1200);
    camera.updateProjectionMatrix();
    reset();
    renderer.render(scene, camera);
    buttons.forEach(button => button.disabled = false);
    canvas.dataset.ready = 'true';
    state.hidden = true;
  }

  async function load(url) {
    if (loading) return;
    loading = true;
    message('正在加载全屋模型…');
    progress.hidden = false;
    progress.removeAttribute('value');
    try {
      const gltf = await loader.loadAsync(url, event => {
        if (event.lengthComputable && event.total > 0) progress.value = event.loaded / event.total;
      });
      install(gltf);
    } catch {
      message('模型暂时未能载入，可重试或选择随项目提供的 whole-home.glb。', true, true);
    } finally {
      loading = false;
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }
  retry.addEventListener('click', () => load(modelUrl));
  choose.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    if (file.files[0]) load(URL.createObjectURL(file.files[0]));
    file.value = '';
  });
  if (location.protocol === 'file:') {
    message('从本地打开时，请选择同一项目 assets 文件夹中的 whole-home.glb。', false, true);
  } else load(modelUrl);
}
