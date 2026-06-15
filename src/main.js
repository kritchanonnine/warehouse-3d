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
// ระบบสไตล์ CSS แบบ Responsive
// ====================
const styleSheet = document.createElement("style")
styleSheet.innerText = `
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  
  /* 💻 สำหรับหน้าจอคอมพิวเตอร์ Desktop */
  .control-panel {
    position: absolute !important; top: 20px !important; left: 20px !important; z-index: 100 !important;
    display: grid !important; 
    grid-template-columns: 200px auto auto auto !important; 
    align-items: center !important; 
    gap: 10px !important;
    width: auto !important;
    background: rgba(255, 255, 255, 0.95) !important; padding: 12px 16px !important; border-radius: 12px !important;
    box-shadow: 0 6px 25px rgba(0,0,0,0.1) !important; backdrop-filter: blur(8px) !important;
    border: 1px solid rgba(255,255,255,0.6) !important;
  }
  
  .control-panel input {
    position: static !important; 
    width: 100% !important; padding: 10px 12px !important; border-radius: 8px !important;
    border: 1px solid #ccd1d9 !important; outline: none !important; font-size: 14px !important;
  }

  .btn-group-container {
    display: contents !important; 
  }

  .btn {
    position: static !important; 
    padding: 10px 18px !important; border: none !important; border-radius: 8px !important;
    cursor: pointer !important; font-weight: bold !important; font-size: 14px !important; 
    white-space: nowrap !important; text-align: center !important;
  }
  .btn-search { background-color: #4f8cff !important; color: white !important; }
  .btn-reset { background-color: #8e9aa8 !important; color: white !important; }
  .btn-scan { background-color: #28a745 !important; color: white !important; }

  /* กล่องแสดงข้อมูลสิ่งอุปกรณ์ฝั่งขวา */
  .info-panel {
    position: absolute !important; top: 20px !important; right: 20px !important; width: 320px !important; z-index: 100 !important;
    background: rgba(255, 255, 255, 0.95) !important; padding: 20px !important; border-radius: 16px !important;
    box-shadow: 0 8px 30px rgba(0,0,0,0.08) !important; backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255,255,255,0.5) !important;
  }

  /* หน้าต่างสตรีมวิดีโอกล้องหลักของเรา */
  .video-preview-active {
    position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important;
    width: 85% !important; max-width: 360px !important; aspect-ratio: 4/3 !important; border: 4px solid #4f8cff !important;
    border-radius: 16px !important; background-color: #000 !important; z-index: 9999 !important;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5) !important; object-fit: cover !important;
  }

  /* 📱 ปรับเลย์เอาต์อัตโนมัติบน มือถือ และ ไอแพด (จอเล็กกว่า 768px) */
  @media (max-width: 768px) {
    .control-panel {
      top: 12px !important; left: 12px !important; right: 12px !important;
      grid-template-columns: 100% !important; 
      gap: 8px !important; padding: 12px !important; border-radius: 14px !important;
    }
    
    .btn-group-container {
      display: grid !important; 
      grid-template-columns: 1fr 1fr 1.2fr !important; 
      gap: 6px !important; width: 100% !important;
    }
    
    .btn-group-container .btn { 
      padding: 11px 4px !important; font-size: 13px !important; 
    }
    
    .info-panel {
      top: auto !important; bottom: 24px !important; left: 12px !important; right: 12px !important;
      width: auto !important; padding: 16px !important; border-radius: 14px !important;
    }

    .video-preview-active {
      width: 75% !important; max-width: 290px !important;
    }
  }
`
document.head.appendChild(styleSheet)

// สร้างแผงควบคุมหลัก
const controlPanel = document.createElement('div')
controlPanel.className = 'control-panel'

// ช่องอินพุต
const input = document.createElement('input')
input.placeholder = 'กรอก Serial Number...'
controlPanel.appendChild(input)

// สร้างกล่องครอบปุ่ม
const btnGroupContainer = document.createElement('div')
btnGroupContainer.className = 'btn-group-container'

const button = document.createElement('button')
button.className = 'btn btn-search'
button.innerText = 'ค้นหา'
btnGroupContainer.appendChild(button)

const resetBtn = document.createElement('button')
resetBtn.className = 'btn btn-reset'
resetBtn.innerText = 'ย้อนกลับ'
btnGroupContainer.appendChild(resetBtn)

const scanBtn = document.createElement('button')
scanBtn.className = 'btn btn-scan'
scanBtn.innerText = '📷 Scan'
btnGroupContainer.appendChild(scanBtn)

controlPanel.appendChild(btnGroupContainer)
document.body.appendChild(controlPanel)

// หน้าต่างแสดงข้อมูล
const infoPanel = document.createElement('div')
infoPanel.className = 'info-panel'
document.body.appendChild(infoPanel)
updateInfoPanel(null, "ข้อมูลสิ่งอุปกรณ์")


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
// 🎯 ปรับปรุงฟังก์ชันหยุดสแกนแบบล้างบาง (ลบแท็กวิดีโอแปลกปลอมทุกชิ้นในเว็บ)
// ====================
function stopScanning() {
  try {
    barcodeReader.reset()
  } catch (e) {
    console.log("Reader reset soft bypass")
  }
  
  // 1. ค้นหาแท็ก <video> ทุกชิ้นที่หลงเหลืออยู่ในระบบเว็บทั้งหมด (ไม่ว่าจะชื่อคลาสอะไร) แล้วสั่งปิดสตรีมกล้อง
  const allVideos = document.querySelectorAll('video')
  allVideos.forEach(v => {
    try {
      if (v.srcObject) {
        v.srcObject.getTracks().forEach(track => track.stop())
      }
    } catch (err) {
      console.error("Error stopping video track:", err)
    }
    v.remove() // 🎯 ระเบิดทิ้งออกจากหน้าเว็บถาวร
  })

  // 2. ดักสแกนคลาสวิดีโอเก่าที่เคยกำหนดไว้ในเวอร์ชันแรกๆ เพื่อความมั่นใจว่าไม่ตกค้าง
  const oldPreviews = document.querySelectorAll('.video-preview, .video-preview-active')
  oldPreviews.forEach(el => el.remove())

  scanBtn.innerText = '📷 Scan'
  scanBtn.style.setProperty('background-color', '#28a745', 'important')
  isScanning = false
}

scanBtn.onclick = async () => {
  if (isScanning) {
    stopScanning()
    return
  }

  try {
    // ก่อนเปิดกล้องใหม่ ให้ล้างระบบวิดีโอเก่าๆ ที่อาจจะค้างอยู่ก่อนหน้านี้ให้หมดจด
    stopScanning()

    isScanning = true
    scanBtn.innerText = '🛑 Stop'
    scanBtn.style.setProperty('background-color', '#dc3545', 'important')

    // สร้างแท็กวิดีโอของเราขึ้นมาใหม่สดๆ
    const videoEl = document.createElement('video')
    videoEl.className = 'video-preview-active'
    document.body.appendChild(videoEl)

    const constraints = {
      video: { facingMode: { ideal: "environment" } }
    }

    await barcodeReader.decodeFromConstraints(constraints, videoEl, (result, error) => {
      if (result) {
        const serial = result.getText()
        console.log('Barcode Scanned:', serial)
        
        input.value = serial
        stopScanning() // เจอผลลัพธ์แล้ว สั่งกวาดล้างกล่องวิดีโอทันที
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
