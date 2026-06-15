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
// 🎯 พิกัดกล้องเริ่มต้นที่คุณตั้งไว้
camera.position.set(8, 5, 6)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
// 🎯 จุดโฟกัสเริ่มต้นจริงของโมเดลคุณ
controls.target.set(2.5, 0.8, 2.5)
controls.update()

// ====================
// สถานะ (State) และ ระบบสี
// ====================
// 🎯 ปรับตรงนี้ให้เท่ากับค่าเริ่มต้นด้านบนแล้ว เพื่อไม่ให้กล้องกระตุกตอนเริ่มใช้งาน
const cameraTargetPos = new THREE.Vector3(8, 5, 6)
const lookTarget = new THREE.Vector3(2.5, 0.8, 2.5) 
let isTweening = false
let selectedObject = null
let warehouse = null

const barcodeReader =
  new BrowserMultiFormatReader()




const BASE_COLOR = new THREE.Color(0xe6eaf0)
const HIGHLIGHT_COLOR = new THREE.Color(0x4f8cff)

// ====================
// ฟังก์ชันจัดการโมเดลและ UI
// ====================

function resetWarehouseColors() {
  if (!warehouse) return
  warehouse.traverse((c) => {
    if (c.isMesh && c.material) {
      c.material.color.copy(BASE_COLOR)
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

// ฟังก์ชันโฟกัสวัตถุเมื่อเสิร์ชเจอ
function focusObject(object) {
  const box = new THREE.Box3().setFromObject(object)
  const center = new THREE.Vector3()
  box.getCenter(center)

  // วิ่งเข้าไปหาวัตถุโดยอิงระยะจากมุมตรงหน้า
  cameraTargetPos.set(center.x, center.y + 1.5, center.z + 2.5)
  lookTarget.copy(center)
  isTweening = true
}

// ฟังก์ชันแสดงผลบน UI
function updateInfoPanel(itemData = null, defaultName = "ข้อมูลสิ่งอุปกรณ์") {
  if (!itemData) {
    infoPanel.innerHTML = `
      <h3 style="margin-top:0; color:#333; font-size:18px; border-bottom:2px solid #4f8cff; padding-bottom:8px;">${defaultName}</h3>
      <p style="color:#666; font-style:italic; margin-top:15px;">กรอกเลข Serial เพื่อค้นหาตำแหน่ง สิ่งอุปกรณ์</p>
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
    <h3 style="margin-top:0; color:#333; font-size:18px; border-bottom:2px solid #4f8cff; padding-bottom:8px;">${deviceName}</h3>
    <div style="margin-top:12px; font-size:14px; line-height:1.6; color:#444;">
      <p style="margin:6px 0;"><b>เลข Serial No.:</b> <span style="color:#111; font-weight:bold;">${serialNo}</span></p>
      <p style="margin:6px 0;"><b>Status:</b> <span style="padding:2px 6px; background:#e3faf2; color:#0ca678; border-radius:4px; font-weight:bold;">${status}</span></p>
      <p style="margin:6px 0;"><b>Location:</b> <span style="color:#4f8cff; font-weight:bold;">${location}</span></p>
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
// การสร้างหน้าต่าง UI (HTML Elements)
// ====================
const input = document.createElement('input')
input.placeholder = 'กรอก Serial Number...'
Object.assign(input.style, { position: 'absolute', top: '20px', left: '20px', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', zIndex: 10 })
document.body.appendChild(input)

const button = document.createElement('button')
button.innerText = 'ค้นหา'
Object.assign(button.style, { position: 'absolute', top: '20px', left: '240px', padding: '10px 20px', backgroundColor: '#4f8cff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', zIndex: 10 })
document.body.appendChild(button)

const resetBtn = document.createElement('button')
resetBtn.innerText = 'ย้อนกลับ'
Object.assign(resetBtn.style, { position: 'absolute', top: '20px', left: '325px', padding: '10px 20px', backgroundColor: '#8e9aa8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', zIndex: 10 })
document.body.appendChild(resetBtn)
const scanBtn = document.createElement('button')

scanBtn.innerText = '📷 Scan Barcode'

Object.assign(scanBtn.style, {
  position: 'absolute',
  top: '20px',
  left: '450px',
  padding: '10px 20px',
  backgroundColor: '#28a745',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  zIndex: 10
})

document.body.appendChild(scanBtn)


const infoPanel = document.createElement('div')
Object.assign(infoPanel.style, { 
    position: 'absolute', top: '20px', right: '20px', width: '300px', 
    backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: '24px', 
    borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', 
    backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.5)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', zIndex: 10 
})
updateInfoPanel(null, "ข้อมูลสิ่งอุปกรณ์")
document.body.appendChild(infoPanel)
const video = document.createElement('video')

Object.assign(video.style, {
  position: 'absolute',
  left: '20px',
  top: '80px',
  width: '320px',
  border: '2px solid #4f8cff',
  borderRadius: '10px',
  backgroundColor: '#000',
  display: 'none',
  zIndex: 999
})

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
// 🎯 ระบบทำงานของปุ่ม ย้อนกลับ (ใช้พิกัดแท้จริงตามที่คุณตั้งค่ามา)
// ====================
resetBtn.onclick = () => {
  input.value = '' 
  selectedObject = null
  resetWarehouseColors() 
  updateInfoPanel(null, "ข้อมูลสิ่งอุปกรณ์") 
  
  // 🎯 ดึงกลับมาที่มุมกล่อง (0, 3.5, 5) และหันไปโฟกัสที่ (5, -2, -1) ตามที่คุณเซ็ตไว้ตอนแรกเป๊ะๆ
  cameraTargetPos.set(8, 5, 6)
  lookTarget.set(2.5, 0.8, 2.5)
  isTweening = true
}
scanBtn.onclick = async () => {

  try {

    video.style.display = 'block'

    const devices =
      await BrowserMultiFormatReader.listVideoInputDevices()

    if (!devices.length) {

      alert('ไม่พบกล้อง')
      return

    }

    const deviceId =
      devices[0].deviceId

    barcodeReader.decodeFromVideoDevice(
      deviceId,
      video,
      (result) => {

        if (result) {

          const serial =
            result.getText()

          console.log(
            'Barcode:',
            serial
          )

          input.value =
            serial

          barcodeReader.reset()

          video.style.display =
            'none'

          button.click()

        }

      }
    )

  }
  catch (err) {

    console.error(err)

    alert('เปิดกล้องไม่ได้')

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