import * as THREE from './build/three.module.js'
import TWEEN from './build/tween.esm.js'

import Stats from './jsm/libs/stats.module.js'
import { GUI } from './jsm/libs/dat.gui.module.js'

import { GPUComputationRenderer } from './jsm/misc/GPUComputationRenderer.js'
import { SimplexNoise } from './jsm/math/SimplexNoise.js'
import { OrbitControls } from './jsm/controls/OrbitControls.js'

import { BoxLineGeometry } from './jsm/geometries/BoxLineGeometry.js'
import { VRButton } from './jsm/webxr/VRButton.js'
import { XRControllerModelFactory } from './jsm/webxr/XRControllerModelFactory.js'

import { MTLLoader } from './jsm/loaders/MTLLoader.js'
import { OBJLoader } from './jsm/loaders/OBJLoader.js'

import heightmapFragShader from './shaders/heightmapSand.frag.js'
import smoothFragShader from './shaders/smooth.frag.js'
import waterVertexShader from './shaders/water.vert.js'
import waterLevelFragShader from './shaders/waterLevel.frag.js'

console.log(`THREE v${THREE.REVISION}`)

// Texture width for simulation
const WIDTH = 512

// Water size in system units
const BOUNDS = 1024
const BOUNDS_HALF = BOUNDS * 0.5

let container, splash, stats
let camera, scene, renderer, controls
let controller1, controller2
let controllerGrip1, controllerGrip2

let userGroup
let mouseMoved = false
const mouseCoords = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
const intersected = []
const tempMatrix = new THREE.Matrix4()
const clock = new THREE.Clock()

let globalScale = 0.005

let waterMesh
let meshRay
let rockReticle

let gpuCompute
let heightmapVariable
let waterUniforms
let smoothShader
let readWaterLevelShader
let readWaterLevelRenderTarget
let readWaterLevelImage
const waterNormal = new THREE.Vector3()

const simplex = new SimplexNoise()

// Rocks
const rockObj = './models/rock/rock_1.obj'
const rockMtl = './models/rock/rock_1.mtl'
let rock
let mouseOnRock = false
let rockRotationSpeed = 1.0
let rockPosition
const rockScale = 70 * globalScale
const rockPositionY = -11
let rockScaleAni
let rockRotateAni
let rockAngle = 0
const rockRotate = { value: 0 }


// Circular Wave
let circularWavePosition = [
  // Default
  new THREE.Vector3(0.1, 0.2, 1.0),
  new THREE.Vector3(0.8, 0.4, 1.0),
  new THREE.Vector3(0.3, 0.8, 1.0),
]
let circularWaveRadius
let masterScaleAni
let layoutChanging = false

// load progress
let manager

init()
animate()

function init() {
  initLoadingManager()
  initScene()
  initStatsAndGUI()
  initReticle()
  initVRControllers()
  initNotVRControl()
  initLayout()

  initHeightMap()
  initWater()
  initModels()

  initAnimations()
}

function initScene() {
  container = document.createElement('div')
  container.id = 'container'
  document.body.appendChild(container)

  splash = document.getElementById('splash')

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000)
  camera.position.set(0, 4.5, 0)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x111111)

  const room = new THREE.LineSegments(new BoxLineGeometry(10, 10, 10, 10, 10, 10), new THREE.LineBasicMaterial({ color: 0x808080 }))
  room.geometry.translate(0, 3, 0)
  scene.add(room)

  // scene.add(new THREE.HemisphereLight(0x606060, 0x404040));

  const sun1 = new THREE.DirectionalLight(0xffffff, 1.0)
  sun1.position.set(2, 2, 3)
  sun1.castShadow = true
  sun1.shadow.mapSize.width = 512
  sun1.shadow.mapSize.height = 512
  sun1.shadow.camera.near = 0.5
  sun1.shadow.camera.far = 500
  scene.add(sun1)

  const sun2 = new THREE.DirectionalLight(0x444444, 0.3)
  sun2.position.set(-1, 5, -2)
  sun2.castShadow = true
  scene.add(sun2)

  const frameGeo = new THREE.TorusGeometry((BOUNDS * globalScale) / 1.414, 0.08, 6, 4)
  const texture = new THREE.TextureLoader(manager).load('./assets/wood.jpg')
  texture.wrapS = THREE.MirroredRepeatWrapping
  texture.wrapT = THREE.MirroredRepeatWrapping
  texture.rotation = Math.PI / 2
  texture.repeat.set(2, 20)
  const frameMtl = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0.0,
    map: texture,
  })
  frameMtl.color.convertSRGBToLinear()
  const frame = new THREE.Mesh(frameGeo, frameMtl)
  frame.rotation.x = -Math.PI / 2
  frame.rotation.z = Math.PI / 4

  frame.castShadow = true
  frame.receiveShadow = true

  scene.add(frame)

  renderer = new THREE.WebGLRenderer()
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  // renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.xr.enabled = true
  // renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement)

  // window resize
  window.addEventListener('resize', onWindowResize)

  stats = new Stats()
  container.appendChild(stats.dom)
}

function initStatsAndGUI() {
  // Stats
  stats = new Stats()
  container.appendChild(stats.dom)

  container.style.touchAction = 'none'
  container.addEventListener('pointermove', onPointerMove)

  document.addEventListener('keydown', function ({ key }) {
    if (key === ' ') {
      changeLayout()
    }
  })

  // data.gui
  const gui = new GUI()

  const effectController = {
    rockRotationSpeed: 0.1,
  }

  const valuesChanger = () => {
    rockRotationSpeed = effectController.rockRotationSpeed
  }

  gui.add(effectController, 'rockRotationSpeed', -1.0, 1.0, 0.02).onChange(valuesChanger)

  const buttons = {
    changeLayout: () => {
      changeLayout()
    },
    toggleWireframe: false,
  }
  gui.add(buttons, 'changeLayout')
  gui.add(buttons, 'toggleWireframe').onChange(toggleWireframe)

  valuesChanger()
}

function initVRControllers() {
  container.appendChild(VRButton.createButton(renderer))

  // controllers
  function onSelectStart() {
    this.userData.isSelecting = true
    
    if (this.name === 'controller2') {
      
      // rock is a THREE.Group, so you should check rock.children
      const intersections = getIntersections(this, rock.children)
      if (intersections.length > 0) {
        rockReticle.visible = true
        console.log('intersections', intersections)
      }
    }
  }

  function onSelectEnd() {
    this.userData.isSelecting = false
    
    const { reticle } = this.userData

    if (this.name === 'controller1' && reticle.visible) {
      userGroup.position.x = reticle.position.x
      userGroup.position.z = reticle.position.z
      resetUserGroupPositions()
    }

    if (this.name === 'controller2') {
      if (rockReticle.visible) {
        rockReticle.visible = false
      } else {
        changeLayout()  
      }
    }
  }

  controller1 = renderer.xr.getController(0)
  controller1.name = 'controller1'
  controller1.userData.reticle = createReticle(0xffffff)
  controller1.addEventListener('selectstart', onSelectStart)
  controller1.addEventListener('selectend', onSelectEnd)
  controller1.position.set(0.5, 1.5, -1)

  controller2 = renderer.xr.getController(1)
  controller2.name = 'controller2'
  controller2.userData.reticle = createReticle(0xff00ff)
  controller2.addEventListener('selectstart', onSelectStart)
  controller2.addEventListener('selectend', onSelectEnd)
  controller2.position.set(-0.5, 1.5, -1)
  
  console.log(controller1, controller2)

  // The XRControllerModelFactory will automatically fetch controller models
  // that match what the user is holding as closely as possible. The models
  // should be attached to the object returned from getControllerGrip in
  // order to match the orientation of the held device.

  const controllerModelFactory = new XRControllerModelFactory()

  controllerGrip1 = renderer.xr.getControllerGrip(0)
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1))
  scene.add(controllerGrip1)

  controllerGrip2 = renderer.xr.getControllerGrip(1)
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2))
  scene.add(controllerGrip2)

  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]))
  line.name = 'line'
  line.scale.z = 5

  controller1.add(line.clone())
  controller2.add(line.clone())

  // UserGroup
  userGroup = new THREE.Group()
  userGroup.position.set(0, 0, 0)
  userGroup.add(camera)
  userGroup.add(controllerGrip1)
  userGroup.add(controller1)
  userGroup.add(controllerGrip2)
  userGroup.add(controller2)
  scene.add(userGroup)
}

function initNotVRControl() {
  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement)
  // controls.maxDistance = 1500;
  // controls.minDistance = 600;
  controls.maxPolarAngle = Math.PI * 0.45
}

function initLayout() {
  // Circular Wave
  circularWavePosition = [
    new THREE.Vector3(lerp(0, 1, 0.2, 0.25, Math.random()), lerp(0, 1, 0.1, 0.7, Math.random()), 1.0),
    new THREE.Vector3(lerp(0, 1, 0.7, 0.9, Math.random()), lerp(0, 1, 0.3, 0.5, Math.random()), 1.0),
    new THREE.Vector3(lerp(0, 1, 0.2, 0.8, Math.random()), lerp(0, 1, 0.3, 0.9, Math.random()), 1.0),
  ]
  circularWaveRadius = [new THREE.Vector2(0.2, 0.05), new THREE.Vector2(0.1, 0.0), new THREE.Vector2(0.3, 0.03)]

  const index = 2
  const rockX = lerp(0, 1.0, -BOUNDS_HALF, BOUNDS_HALF, circularWavePosition[index].x)
  const rockZ = lerp(0, 1.0, BOUNDS_HALF, -BOUNDS_HALF, circularWavePosition[index].y)
  rockPosition = new THREE.Vector3(rockX * globalScale, rockPositionY * globalScale, rockZ * globalScale)
}

function initLoadingManager() {
  manager = new THREE.LoadingManager()
  manager.onProgress = (item, loaded, total) => {
    console.log(item, `${loaded} / ${total}`)
  }
  manager.onLoad = () => {
    console.log('Loading complete!')
    splash.style.display = 'none'
  }
  manager.onError = (url) => {
    console.log('There was an error loading ' + url)
  }
}

function initHeightMap() {
  // Creates the gpu computation class and sets it up

  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer)

  if (isSafari()) {
    gpuCompute.setDataType(THREE.HalfFloatType)
  }

  const heightmap0 = gpuCompute.createTexture()

  fillTexture(heightmap0)

  heightmapVariable = gpuCompute.addVariable('heightmap', heightmapFragShader, heightmap0)

  gpuCompute.setVariableDependencies(heightmapVariable, [heightmapVariable])

  heightmapVariable.material.uniforms['uMasterScale'] = { value: 1.0 }
  heightmapVariable.material.uniforms['uBackgroundWaveScale'] = { value: 1.0 }
  heightmapVariable.material.uniforms['uCircularWave'] = {
    value: circularWavePosition,
  }
  heightmapVariable.material.uniforms['uCircularWaveRadius'] = {
    value: circularWaveRadius,
  }
  heightmapVariable.material.uniforms['uGridUnit'] = { value: 1.0 }
  heightmapVariable.material.uniforms['uWaveTransform'] = {
    value: [0.8, 0.6, -0.6, 0.8],
  }
  heightmapVariable.material.uniforms['uWaveStart'] = { value: -20.0 }
  heightmapVariable.material.uniforms['uTime'] = { value: 0 }

  heightmapVariable.material.uniforms['mousePos'] = {
    value: new THREE.Vector2(10000, 10000),
  }
  heightmapVariable.material.uniforms['mouseSize'] = { value: 20.0 }
  heightmapVariable.material.uniforms['viscosityConstant'] = { value: 0.98 }
  heightmapVariable.material.uniforms['heightCompensation'] = { value: 0 }
  heightmapVariable.material.defines.BOUNDS = BOUNDS.toFixed(1)

  const error = gpuCompute.init()
  if (error !== null) {
    console.error(error)
  }

  // Create compute shader to smooth the water surface and velocity
  smoothShader = gpuCompute.createShaderMaterial(smoothFragShader, {
    smoothTexture: { value: null },
  })

  // Create compute shader to read water level
  readWaterLevelShader = gpuCompute.createShaderMaterial(waterLevelFragShader, {
    point1: { value: new THREE.Vector2() },
    levelTexture: { value: null },
  })
  readWaterLevelShader.defines.WIDTH = WIDTH.toFixed(1)
  readWaterLevelShader.defines.BOUNDS = BOUNDS.toFixed(1)

  // Create a 4x1 pixel image and a render target (Uint8, 4 channels, 1 byte per channel) to read water height and orientation
  readWaterLevelImage = new Uint8Array(4 * 1 * 4)

  readWaterLevelRenderTarget = new THREE.WebGLRenderTarget(4, 1, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
  })
}

function initWater() {
  // texture
  const texture = new THREE.TextureLoader(manager).load('./assets/sand.jpg')
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(100, 100)
  texture.updateMatrix()

  const geometry = new THREE.PlaneGeometry(BOUNDS, BOUNDS, WIDTH - 1, WIDTH - 1)

  // material: make a THREE.ShaderMaterial clone of THREE.MeshPhongMaterial, with customized vertex shader
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      THREE.ShaderLib['phong'].uniforms,
      {
        shininess: { value: 0 },
        heightmap: { value: null },
      },
    ]),
    defines: {
      USE_MAP: '',
      WIDTH: WIDTH.toFixed(1),
      BOUNDS: BOUNDS.toFixed(1),
    },
    vertexShader: waterVertexShader,
    fragmentShader: THREE.ShaderChunk['meshphong_frag'],
    lights: true,
  })

  // Sets the uniforms with the material values
  material.map = texture
  material.uniforms['map'].value = texture
  material.uniforms['specular'].value = new THREE.Color(0x010101)
  material.uniforms['heightmap'].value = gpuCompute.getCurrentRenderTarget(heightmapVariable).texture

  waterUniforms = material.uniforms

  waterMesh = new THREE.Mesh(geometry, material)
  waterMesh.scale.set(globalScale, globalScale, globalScale)
  waterMesh.rotation.x = -Math.PI / 2
  waterMesh.castShadow = true
  waterMesh.receiveShadow = true
  waterMesh.material.needsUpdate = true
  waterMesh.matrixAutoUpdate = false
  waterMesh.updateMatrix()

  scene.add(waterMesh)

  // THREE.Mesh just for mouse raycasting
  const geometryRay = new THREE.PlaneGeometry(BOUNDS, BOUNDS, 1, 1)
  meshRay = new THREE.Mesh(geometryRay, new THREE.MeshBasicMaterial({ color: 0xffffff, visible: false }))
  meshRay.rotation.x = -Math.PI / 2
  meshRay.scale.set(globalScale, globalScale, globalScale)
  meshRay.position.y = 0.1
  meshRay.matrixAutoUpdate = false
  meshRay.updateMatrix()
  meshRay.name = 'meshRay'
  scene.add(meshRay)
}

function initModels() {
  const onProgress = (xhr) => {
    if (xhr.lengthComputable) {
      const percentComplete = (xhr.loaded / xhr.total) * 100
      console.log(`[rock.obj loaded..${Math.round(percentComplete, 2)}%]`)
    }
  }
  const onError = (err) => {
    console.log('Error while loading rock model: ', err)
  }

  const onLoadedObj = (object) => {
    rock = object
    rock.name = 'rockGroup'

    const { children } = rock
    children[0].castShadow = true
    children[0].receiveShadow = true

    scene.add(rock)
    rock.scale.set(rockScale, rockScale, rockScale)
    rock.position.set(rockPosition.x, rockPosition.y, rockPosition.z)
  }

  const mtlLoader = new MTLLoader(manager)
  mtlLoader.load(rockMtl, (materials) => {
    materials.preload()
    const objLoader = new OBJLoader(manager)
    objLoader.setMaterials(materials)
    objLoader.load(rockObj, onLoadedObj, onProgress, onError)
  })
}

function initAnimations() {
  const rockPositionYDisplace = -200
  const scale = { value: 1 }
  const { uniforms } = heightmapVariable.material
  const rockEasingIn = TWEEN.Easing.Quadratic.In
  const rockEasingOut = TWEEN.Easing.Quadratic.Out
  const sandEasingIn = TWEEN.Easing.Quintic.In
  const sandEasingOut = TWEEN.Easing.Quintic.Out
  // const sandEasingIn = TWEEN.Easing.Back.In;
  // const sandEasingOut = TWEEN.Easing.Back.Out;

  const threshold = (rockPositionY * globalScale - rockPositionYDisplace * globalScale) * 0.5

  const rockScaleAniBack = new TWEEN.Tween(scale)
    .easing(rockEasingOut)
    .to({ value: 1 }, 400)
    .onUpdate((scale) => {
      const scl = rockScale * scale.value
      rock.scale.set(scl, scl, scl)
      rock.position.setY(lerp(1, 0, rockPositionY * globalScale, rockPositionYDisplace * globalScale, scale.value))

      if (rockPositionY * globalScale - rock.position.y < threshold) {
        rock.visible = true
      }
    })

  rockScaleAni = new TWEEN.Tween(scale)
    .easing(rockEasingIn)
    .to({ value: 0 }, 900)
    .onUpdate((scale) => {
      const scl = rockScale * (scale.value * 0.5 + 0.5)
      rock.scale.set(scl, scl, scl)
      rock.position.setY(lerp(1, 0, rockPositionY * globalScale, rockPositionYDisplace * globalScale, scale.value))

      if (rockPositionY * globalScale - rock.position.y > threshold) {
        rock.visible = false
      }
    })
    .onComplete(() => {
      rock.position.setX(rockPosition.x)
      rock.position.setZ(rockPosition.z)
    })
    .chain(rockScaleAniBack)

  rockRotateAni = new TWEEN.Tween(rockRotate)
    .easing(TWEEN.Easing.Back.Out)
    .to({ value: 1 }, 900)
    .onUpdate((rockRotate) => {
      const rate = rockAngle + Math.PI * (rockRotate.value * 0.5)
      rock.rotation.y = rate
    })
    .onComplete(() => {
      rockAngle = rock.rotation.y
      rockRotate.value = 0
    })

  const masterScaleAniBack = new TWEEN.Tween(uniforms.uMasterScale)
    .easing(sandEasingOut)
    .to({ value: 1 }, 900)
    .onComplete(() => {
      layoutChanging = false
    })

  masterScaleAni = new TWEEN.Tween(uniforms.uMasterScale)
    .easing(sandEasingIn)
    .to({ value: 0 }, 1000)
    .chain(masterScaleAniBack)
    .onComplete(() => {
      changeGridUnit()
      uniforms.uCircularWave.value = circularWavePosition
      uniforms.uCircularWaveRadius.value = circularWaveRadius
    })
}

function initReticle() {
  
  
  const g = new THREE.IcosahedronGeometry(0.1, 8)
  const m = new THREE.MeshStandardMaterial({
    color: 0xff00ff,
    roughness: 0.7,
    metalness: 0.0,
  })
  rockReticle = new THREE.Mesh(g, m)
  rockReticle.castShadow = true
  rockReticle.receiveShadow = true
  rockReticle.position.set(0, 1, 0)
  rockReticle.visible = false
  
  scene.add(rockReticle)
  
}

function createReticle(color = 0xffffff) {
  const rg = new THREE.IcosahedronGeometry(0.02, 8)
  const rm = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.0,
  })
  const reticle = new THREE.Mesh(rg, rm)

  reticle.castShadow = true
  reticle.receiveShadow = true
  reticle.position.set(0, .2, 0)
  reticle.visible = false
  
  scene.add(reticle)

  return reticle
}

function changeLayout() {
  if (!layoutChanging) {
    layoutChanging = true
    initLayout()
    rockScaleAni.start()
    masterScaleAni.start()
  }
}

function changeGridUnit() {
  const { uniforms } = heightmapVariable.material
  const { value } = uniforms.uGridUnit
  if (value > 1.0) {
    uniforms.uGridUnit.value = 1.0
  } else {
    uniforms.uGridUnit.value = Math.random() * 5 + 4.0
  }

  const angle = Math.random() * Math.PI * 2
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  uniforms.uWaveTransform.value = [c, s, -s, c]
}

function toggleWireframe() {
  waterMesh.material.wireframe = !waterMesh.material.wireframe
  waterMesh.material.needsUpdate = true
}

function fillTexture(texture) {
  const waterMaxHeight = 10

  function noise(x, y) {
    let multR = waterMaxHeight
    let mult = 0.025
    let r = 0
    for (let i = 0; i < 15; i++) {
      r += multR * simplex.noise(x * mult, y * mult)
      multR *= 0.53 + 0.025 * i
      mult *= 1.25
    }

    return r
  }

  const pixels = texture.image.data

  let p = 0
  for (let j = 0; j < WIDTH; j++) {
    for (let i = 0; i < WIDTH; i++) {
      const x = (i * 128) / WIDTH
      const y = (j * 128) / WIDTH

      pixels[p + 0] = noise(x, y)
      pixels[p + 1] = pixels[p + 0]
      pixels[p + 2] = 0
      pixels[p + 3] = 1

      p += 4
    }
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()

  renderer.setSize(window.innerWidth, window.innerHeight)
}

function setMouseCoords(x, y) {
  mouseCoords.set((x / renderer.domElement.clientWidth) * 2 - 1, -(y / renderer.domElement.clientHeight) * 2 + 1)
  mouseMoved = true
}

function onPointerMove(event) {
  if (event.isPrimary === false) return

  setMouseCoords(event.clientX, event.clientY)
}

function buildController(data) {
  let geometry, material

  switch (data.targetRayMode) {
    case 'tracked-pointer':
      geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3))

      material = new THREE.LineBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
      })

      return new THREE.Line(geometry, material)

    case 'gaze':
      geometry = new THREE.RingGeometry(0.02, 0.04, 32).translate(0, 0, -1)
      material = new THREE.MeshBasicMaterial({
        opacity: 0.5,
        transparent: true,
      })
      return new THREE.Mesh(geometry, material)
  }
}

function getIntersections(controller, objectsArray) {
  tempMatrix.identity().extractRotation(controller.matrixWorld)

  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld)
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix)

  return raycaster.intersectObjects(objectsArray)
}

function intersectObjects(controller) {
  const line = controller.getObjectByName('line')
  
  const objects = []
  if (meshRay) {
    objects.push(meshRay)
  }
  if (rock) {
    objects.push(rock.children[0])
  }
  
  const intersections = getIntersections(controller, objects)
  const { reticle } = controller.userData

  if (intersections.length > 0) {
    const intersection = intersections[0]

    reticle.visible = true
    reticle.position.copy(intersection.point)
    
    line.scale.z = intersection.distance
  } else {
    line.scale.z = 5
    reticle.visible = false
  }
}

function resetUserGroupPositions() {
  camera.position.set(0, 1.6, 0)
  controller1.position.set(0.5, 1.5, -1)
  controller2.position.set(-0.5, 1.5, -1)
}

function animate() {
  renderer.setAnimationLoop(render)
  render()
}

function sceneUpdate(deltaTime, elapsedTime) {
  if (heightmapVariable.material.uniforms && heightmapVariable.material.uniforms.uTime) {
    const { uTime } = heightmapVariable.material.uniforms
    uTime.value += deltaTime
  }

  if (rock) {
    rock.rotation.y += deltaTime * rockRotationSpeed
  }
}

function render() {
  stats.begin()

  
  // intersectObjects(controller1)
  if (renderer.xr.isPresenting) {
    intersectObjects(controller1)  
    intersectObjects(controller2)
  }
  
  

  // TWEEN
  TWEEN.update()

  // Do the gpu computation
  gpuCompute.compute()

  // Get compute output in custom uniform
  // waterUniforms['heightmap'].value = gpuCompute.getCurrentRenderTarget(heightmapVariable).texture

  sceneUpdate(clock.getDelta(), clock.getElapsedTime())

  // Render
  renderer.render(scene, camera)

  stats.end()
}

/* helper function */

function lerp(low, high, from, to, v) {
  const ratio = (v - low) / (high - low)
  return from + (to - from) * ratio
}

function isSafari() {
  return !!navigator.userAgent.match(/Safari/i) && !navigator.userAgent.match(/Chrome/i)
}
