import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { findBySerial } from './airtable.js'
import { BrowserMultiFormatReader } from '@zxing/browser'

// ====================
// การตั้งค่า Scene และกล้อง
// ====================
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf0f0f0)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(8, 5, 6)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.target.set(2.5, 0.8, 2.5)
controls.update()

// ====================
// สถานะ (State) และ ระบบสี
// ====================
const cameraTargetPos = new THREE.Vector3(8, 5, 6)
const lookTarget = new THREE.Vector3(2.5, 0.8, 2.5) 
let isTweening = false
let selectedObject = null
let warehouse = null
let isScanning = false 

const barcodeReader = new BrowserMultiFormatReader()

const BASE_COLOR = new THREE.Color(0xe6eaf0)
const HIGHLIGHT_COLOR = new THREE.Color(0x4f8cff)

// ====================
// ฟังก์ชันจัดการโมเดลและ UI
// ====================

function resetWarehouseColors() {
  if (!warehouse) return
  warehouse.traverse((c) => {
    if (c.isMesh && c.material) {
      if (c.userData.originalColor) {
        c.material.color.copy(c.userData.originalColor)
      } else {
        c.material.color.copy(BASE_COLOR)
      }
    }
  })
}

function highlightObject(object) {
  resetWarehouseColors()
  object.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.color.copy(HIGHLIGHT_COLOR)
    }
  })
}

function focusObject(object) {
  const box = new THREE.Box3().setFromObject(object)
  const center = new THREE.Vector3()
  box.getCenter(center)

  cameraTargetPos.set(center.x, center.y + 1.5, center.z + 2.5)
  lookTarget.copy(center)
  
  controls.enabled = false
  isTweening = true
}

function updateInfoPanel(itemData = null, defaultName = "ข้อมูลสิ่งอุปกรณ์") {
  if (!itemData) {
    infoPanel.innerHTML = `
      <h3 style="margin-top:0; color:#333; font-size:16px; border-bottom:2px solid #4f8cff; padding-bottom:6px; margin-bottom:8px;">${defaultName}</h3>
      <p style="color:#666; font-style:italic; margin:0; font-size:13px;">กรอกหรือสแกนเลข Serial เพื่อค้นหาตำแหน่ง</p>
    `
    return
  }
  
  const deviceName = Array.isArray(itemData["ชื่ออุปกรณ์ (from Item)"]) 
    ? itemData["ชื่ออุปกรณ์ (from Item)"][0] 
    : (itemData["ชื่ออุปกรณ์ (from Item)"] || itemData.name || "ไม่ระบุชื่ออุปกรณ์");

  let serialNo = "-";
  let rawSerial = itemData["เลข Serial No."] || itemData.Serial;

  if (rawSerial) {
    if (Array.isArray(rawSerial)) {
      const firstEl = rawSerial[0];
      if (firstEl && typeof firstEl === 'object' && firstEl.text) {
        serialNo = firstEl.text;
      } else if (firstEl && typeof firstEl === 'object') {
        serialNo = firstEl.name || JSON.stringify(firstEl);
      } else {
        serialNo = firstEl;
      }
    } else if (typeof rawSerial === 'object') {
      serialNo = rawSerial.text || rawSerial.name || JSON.stringify(rawSerial);
    } else if (typeof rawSerial === 'string') {
      if (rawSerial.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawSerial);
          serialNo = parsed.text || rawSerial;
        } catch(e) {
          serialNo = rawSerial;
        }
      } else {
        serialNo = rawSerial;
      }
    } else {
      serialNo = rawSerial;
    }
  }

  const status = itemData.Status || "-";
  const location = itemData.Location || "-";

  infoPanel.innerHTML = `
    <h3 style="margin-top:0; color:#333; font-size:16px; border-bottom:2px solid #4f8cff; padding-bottom:6px; margin-bottom:10px;">${deviceName}</h3>
    <div style="font-size:13px; line-height:1.5; color:#444;">
      <p style="margin:4px 0;"><b>Serial No.:</b> <span style="color:#111; font-weight:bold;">${serialNo}</span></p>
      <p style="margin:4px 0;"><b>Status:</b> <span style="padding:2px 6px; background:#e3faf2; color:#0ca678; border-radius:4px; font-weight:bold;">${status}</span></p>
      <p style="margin:4px 0;"><b>Location:</b> <span style="color:#4f8cff; font-weight:bold;">${location}</span></p>
    </div>
  `
}

// ====================
// ระบบแสงสว่าง (Lighting)
// ====================
const dirLight = new THREE.DirectionalLight(0xffffff, 2)
dirLight.position.set(10, 20, 10)
scene.add(dirLight)
scene.add(new THREE.AmbientLight(0xffffff, 1.5))

// ====================
// การสร้างหน้าต่าง UI โครงสร้างใหม่แบบ Responsive
// ====================

// 1. สไตล์ชีตหลักสำหรับคุม Layout ทั่วทั้งหน้าจอ
const styleSheet = document.createElement("style")
styleSheet.innerText = `
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  
  /* กล่องรวมปุ่มค้นหาและอินพุต */
  .control-panel {
    position: absolute; top: 16px; left: 16px; z-index: 10;
    display: flex; flex-wrap: wrap; gap: 8px; max-width: 480px;
    background: rgba(255, 255, 255, 0.9); padding: 12px; border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08); backdrop-filter: blur(8px);
  }
  .control-panel input {
    flex: 1; min-width: 160px; padding: 10px; border-radius: 6px;
    border: 1px solid #ccc; outline: none; font-size: 14px;
  }
  .btn {
    padding: 10px 16px; border: none; border-radius: 6px;
    cursor: pointer; font-weight: bold; font-size: 14px; transition: opacity 0.2s;
  }
  .btn:hover { opacity: 0.9; }
  .btn-search { background-color: #4f8cff; color: white; }
  .btn-reset { background-color: #8e9aa8; color: white; }
  .btn-scan { background-color: #28a745; color: white; }

  /* กล่องแสดงข้อมูลสิ่งอุปกรณ์ */
  .info-panel {
    position: absolute; top: 16px; right: 16px; width: 300px; z-index: 10;
    background: rgba(255, 255, 255, 0.95); padding: 18px; border-radius: 14px;
    box-shadow: 0 8px 25px rgba(0,0,0,0.08); backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.5);
  }

  /* หน้าต่างสตรีมวิดีโอกล้อง */
  .video-preview {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: 90%; max-width: 400px; aspect-ratio: 4/3; border: 3px solid #4f8cff;
    border-radius: 12px; background-color: #000; display: none; z-index: 999;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  }

  /* 📱 ปรับหน้าตาอัตโนมัติเมื่อเปิดบนมือถือและแท็บเล็ตแนวตั้ง (หน้าจอกว้างน้อยกว่า 768px) */
  @media (max-width: 768px) {
    .control-panel {
      top: 10px; left: 10px; right: 10px; max-width: none;
      padding: 8px; gap: 6px; border-radius: 8px;
    }
    .control-panel input { font-size: 13px; padding: 8px; }
    .btn { padding: 8px 12px; font-size: 13px; }
    
    /* ผลักกล่องข้อมูลไปไว้ด้านล่างสุดของหน้าจอ เพื่อไม่ให้บังปุ่มและโมเดล */
    .info-panel {
      top: auto; bottom: 20px; left: 10px; right: 10px;
      width: auto; padding: 14px; border-radius: 10px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
    }
  }
`
document.head.appendChild(styleSheet)

// 2. สร้าง Elements เข้าสู่หน้า DOMตามลำดับชั้นโครงสร้างใหม่
const controlPanel = document.createElement('div')
controlPanel.className = 'control-panel'

const input = document.createElement('input')
input.placeholder = 'กรอก Serial Number...'
controlPanel.appendChild(input)

const button = document.createElement('button')
button.className = 'btn btn-search'
button.innerText = 'ค้นหา'
controlPanel.appendChild(button)

const resetBtn = document.createElement('button')
resetBtn.className = 'btn btn-reset'
resetBtn.innerText = 'ย้อนกลับ'
controlPanel.appendChild(resetBtn)

const scanBtn = document.createElement('button')
scanBtn.className = 'btn btn-scan'
scanBtn.innerText = '📷 Scan'
controlPanel.appendChild(scanBtn)

document.body.appendChild(controlPanel)

const infoPanel = document.createElement('div')
infoPanel.className = 'info-panel'
document.body.appendChild(infoPanel)
updateInfoPanel(null, "ข้อมูลสิ่งอุปกรณ์")

const video = document.createElement('video')
video.className = 'video-preview'
document.body.appendChild(video)

// ====================
// โหลดโมเดล 3D คลังสินค้า
// ====================
const loader = new GLTFLoader()
loader.load('/scene.glb', (gltf) => {
  warehouse = gltf.scene
  scene.add(warehouse)

  warehouse.traverse((c) => {
    if (c.isMesh && c.material) {
      c.material = c.material.clone() 
      c.userData.originalColor = c.material.color.clone()
      c.material.color.copy(BASE_COLOR)
    }
  })
}, undefined, (error) => console.error(error))

// ====================
// ระบบค้นหาผ่านช่อง Input
// ====================
button.onclick = async () => {
  const serial = input.value.trim()
  if (!serial) return
  
  updateInfoPanel(null, "กำลังค้นหาข้อมูล...")
  
  try {
    const item = await findBySerial(serial)
    if (!item) {
      updateInfoPanel(null, "ข้อมูลสิ่งอุปกรณ์")
      return alert('ไม่พบข้อมูล Serial นี้ในฐานข้อมูล')
    }

    const targetObjectName = (item.Location || serial).trim()
    
    let object = null
    if (warehouse) {
      warehouse.traverse((child) => {
        if (child.name && child.name.trim().toLowerCase() === targetObjectName.toLowerCase()) {
          object = child
        }
      })
    }
    
    if (!object) {
      updateInfoPanel(item)
      return alert(`พบข้อมูลพิกัด "${targetObjectName}" ใน Airtable แต่ชื่อนี้ไม่ตรงกับโมเดล 3D ชิ้นใดเลย`)
    }

    selectedObject = object
    highlightObject(object)
    focusObject(object)
    updateInfoPanel(item)

  } catch (err) {
    console.error("Search Error:", err)
    updateInfoPanel(null, "เกิดข้อผิดพลาด")
    alert('เกิดข้อผิดพลาดในการค้นหาข้อมูล')
  }
}

// ====================
// ระบบทำงานของปุ่ม ย้อนกลับ
// ====================
resetBtn.onclick = () => {
  input.value = '' 
  selectedObject = null
  resetWarehouseColors() 
  updateInfoPanel(null, "ข้อมูลสิ่งอุปกรณ์") 
  
  cameraTargetPos.set(8, 5, 6)
  lookTarget.set(2.5, 0.8, 2.5)
  controls.enabled = false 
  isTweening = true
}

// ====================
// ระบบสแกนบาร์โค้ด
// ====================
function stopScanning() {
  barcodeReader.reset()
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop()) 
  }
  video.style.display = 'none'
  scanBtn.innerText = '📷 Scan'
  scanBtn.style.backgroundColor = '#28a745'
  isScanning = false
}

scanBtn.onclick = async () => {
  if (isScanning) {
    stopScanning()
    return
  }

  try {
    video.style.display = 'block'
    scanBtn.innerText = '🛑 Stop'
    scanBtn.style.backgroundColor = '#dc3545'
    isScanning = true

    const constraints = {
      video: { facingMode: { ideal: "environment" } }
    }

    await barcodeReader.decodeFromConstraints(constraints, video, (result, error) => {
      if (result) {
        const serial = result.getText()
        console.log('Barcode Scanned:', serial)
        
        input.value = serial
        stopScanning()
        button.click()
      }
    })

  } catch (err) {
    console.error("Camera error:", err)
    alert('ไม่สามารถเข้าถึงกล้องหลังของอุปกรณ์ได้')
    stopScanning()
  }
}

// ====================
// อนิเมชันลูป (Animation Loop)
// ====================
function animate() {
  requestAnimationFrame(animate)

  if (isTweening) {
    camera.position.lerp(cameraTargetPos, 0.08)
    controls.target.lerp(lookTarget, 0.08)

    if (camera.position.distanceTo(cameraTargetPos) < 0.03) {
      isTweening = false
      controls.enabled = true 
    }
  }

  controls.update()
  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()
