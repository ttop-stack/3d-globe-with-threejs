import * as THREE from "three";
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import getStarfield from "./src/getStarfield.js";
import { drawThreeGeo } from "./src/threeGeoJSON.js";

// === PERFORMANCE VARIABLES ===
let frameCount = 0; // Add missing frameCount variable
let isRendering2D = false; // Prevent concurrent renders
let animationId = null; // For proper cleanup


const w = window.innerWidth;
const h = window.innerHeight;

// === 3D GLOBE SETUP (EXISTING) ===
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.3);
const camera = new THREE.PerspectiveCamera(75, w / h, 1, 100);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);

// === 2D MAP SETUP (NEW) ===
const canvas2D = document.createElement('canvas');
canvas2D.width = w;
canvas2D.height = h;
canvas2D.style.position = 'absolute';
canvas2D.style.top = '0';
canvas2D.style.left = '0';
canvas2D.style.display = 'none'; // Hidden by default
document.body.appendChild(canvas2D);
const ctx2D = canvas2D.getContext('2d');

// Offscreen canvas for pre-rendering
const offscreenCanvas = document.createElement('canvas');
offscreenCanvas.width = w;
offscreenCanvas.height = h;
const offscreenCtx = offscreenCanvas.getContext('2d');

// State management
let is3D = true;
let landData = null;
let outlineData = null;
let map2DRendered = false;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const geometry = new THREE.SphereGeometry(2);
const lineMat = new THREE.LineBasicMaterial({ 
  color: 0xffffff,
  transparent: true,
  opacity: 0.4, 
});
const edges = new THREE.EdgesGeometry(geometry, 1);
const line = new THREE.LineSegments(edges, lineMat);
scene.add(line);

const stars = getStarfield({ numStars: 1000, fog: false });
scene.add(stars);

// === 2D MAP PROJECTION FUNCTIONS ===
function latLonToXY(lat, lon, width, height) {
  // Equirectangular projection
  const x = (lon + 180) * (width / 360);
  const y = (90 - lat) * (height / 180);
  return { x, y };
}

function render2DMapOffscreen() {
  if (!landData || !outlineData || map2DRendered) return;
  
  console.log('Pre-rendering 2D map offscreen...');
  
  // Clear offscreen canvas with ocean blue
  offscreenCtx.fillStyle = '#4A90E2';
  offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
  
  // Draw land areas (green fill)
  drawLandAreas();
  
  // Draw country borders (black lines)
  drawCountryBorders();
  
  map2DRendered = true;
  console.log('2D map pre-rendering completed');
}

function drawLandAreas() {
  if (!landData.features) return;
  
  offscreenCtx.fillStyle = '#90EE90'; // Light green
  offscreenCtx.strokeStyle = 'transparent';
  
  landData.features.forEach((feature, index) => {
    if (!feature.geometry) return;
    
    try {
      offscreenCtx.beginPath();
      drawGeometryPath(feature.geometry, offscreenCtx);
      offscreenCtx.fill();
    } catch (error) {
      console.warn(`Error drawing land feature ${index}:`, error);
    }
  });
}

function drawCountryBorders() {
  if (!outlineData.features) return;
  
  offscreenCtx.strokeStyle = '#000000'; // Black borders
  offscreenCtx.fillStyle = 'transparent';
  offscreenCtx.lineWidth = 1;
  
  outlineData.features.forEach((feature, index) => {
    if (!feature.geometry) return;
    
    try {
      offscreenCtx.beginPath();
      drawGeometryPath(feature.geometry, offscreenCtx);
      offscreenCtx.stroke();
    } catch (error) {
      console.warn(`Error drawing country border ${index}:`, error);
    }
  });
}

function drawGeometryPath(geometry, context) {
  const { type, coordinates } = geometry;
  
  switch (type) {
    case 'Polygon':
      drawPolygonPath(coordinates, context);
      break;
    case 'MultiPolygon':
      coordinates.forEach(polygon => drawPolygonPath(polygon, context));
      break;
    case 'LineString':
      drawLineStringPath(coordinates, context);
      break;
    case 'MultiLineString':
      coordinates.forEach(lineString => drawLineStringPath(lineString, context));
      break;
  }
}

function drawPolygonPath(coordinates, context) {
  coordinates.forEach(ring => {
    if (ring.length < 3) return;
    
    let firstPoint = true;
    ring.forEach(coord => {
      if (!coord || coord.length < 2) return;
      
      const { x, y } = latLonToXY(coord[1], coord[0], offscreenCanvas.width, offscreenCanvas.height);
      
      if (firstPoint) {
        context.moveTo(x, y);
        firstPoint = false;
      } else {
        context.lineTo(x, y);
      }
    });
    context.closePath();
  });
}

function drawLineStringPath(coordinates, context) {
  if (coordinates.length < 2) return;
  
  let firstPoint = true;
  coordinates.forEach(coord => {
    if (!coord || coord.length < 2) return;
    
    const { x, y } = latLonToXY(coord[1], coord[0], offscreenCanvas.width, offscreenCanvas.height);
    
    if (firstPoint) {
      context.moveTo(x, y);
      firstPoint = false;
    } else {
      context.lineTo(x, y);
    }
  });
}

function display2DMap() {
  // Simply copy the pre-rendered offscreen canvas to visible canvas
  ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);
  ctx2D.drawImage(offscreenCanvas, 0, 0);
  console.log('2D map displayed');
}

// check here for more datasets ... https://github.com/martynafford/natural-earth-geojson
// non-geojson datasets: https://www.naturalearthdata.com/downloads/
fetch('./geojson/ne_110m_land.json')
  .then(response => response.text())
  .then(text => {
    const data = JSON.parse(text);
    landData = data; // Store for 2D rendering
    
    // Render 3D globe (existing code)
    const countries = drawThreeGeo({
      json: data,
      radius: 2,
      materalOptions: {
        color: 0x80FF80,
      },
    });
    scene.add(countries);
    
    // Pre-render 2D map if both datasets loaded
    if (outlineData) {
      setTimeout(() => render2DMapOffscreen(), 100);
    }
  });

// Add country outlines
fetch('./geojson/countries.json')
  .then(response => response.text())
  .then(text => {
    const data = JSON.parse(text);
    outlineData = data; // Store for 2D rendering
    
    // Render 3D outlines (existing code)
    const outlines = drawThreeGeo({
      json: data,
      radius: 2.01, // Slightly above the surface
      materalOptions: {
        color: 0x000000,
        linewidth: 2,
        opacity: 0.7,
        transparent: true,
      },
    });
    scene.add(outlines);
    
    // Pre-render 2D map if both datasets loaded
    if (landData) {
      setTimeout(() => render2DMapOffscreen(), 100);
    }
  });

function animate() {
 
  
  // Add this line to increment frame count
  frameCount++;
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  controls.update();
}

animate();

// === 2D/3D TOGGLE SYSTEM ===
function cleanupCanvas2D() {
  // Clear both canvases to free memory
  ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);
  // Reset canvas state
  ctx2D.setTransform(1, 0, 0, 1, 0, 0);
}

function toggle2D3D() {
  const button = document.getElementById('toggle-button');
  
  // Prevent rapid clicking
  if (button.disabled) return;
  
  button.disabled = true;
  button.textContent = 'Switching...';
  
  // Use requestAnimationFrame for smooth transition
  requestAnimationFrame(() => {
    try {
      is3D = !is3D;
      
      if (is3D) {
        // Switching to 3D
        console.log('Switching to 3D mode...');
        cleanupCanvas2D(); // Clean up 2D resources
        renderer.domElement.style.display = 'block';
        canvas2D.style.display = 'none';
        
      } else {
        // Switching to 2D
        console.log('Switching to 2D mode...');
        renderer.domElement.style.display = 'none';
        canvas2D.style.display = 'block';
        
        // Display the pre-rendered map (instant!)
        if (map2DRendered) {
          display2DMap();
        } else {
          // Fallback: render now if not pre-rendered
          ctx2D.fillStyle = '#4A90E2';
          ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height);
          ctx2D.fillStyle = 'white';
          ctx2D.font = '24px Arial';
          ctx2D.textAlign = 'center';
          ctx2D.fillText('2D Map Loading...', canvas2D.width/2, canvas2D.height/2);
          
          setTimeout(() => {
            render2DMapOffscreen();
            display2DMap();
          }, 100);
        }
      }
      
      // Re-enable button
      button.disabled = false;
      button.textContent = is3D ? 'Switch to 2D Map' : 'Switch to 3D Globe';
      
    } catch (error) {
      console.error('Error during toggle:', error);
      button.disabled = false;
      button.textContent = 'Toggle Failed - Try Again';
    }
  });
}

// Create toggle button
const toggleButton = document.createElement('button');
toggleButton.id = 'toggle-button';
toggleButton.textContent = 'Switch to 2D Map';
toggleButton.style.position = 'absolute';
toggleButton.style.top = '20px';
toggleButton.style.left = '20px';
toggleButton.style.padding = '12px 24px';
toggleButton.style.fontSize = '16px';
toggleButton.style.fontWeight = 'bold';
toggleButton.style.backgroundColor = '#333';
toggleButton.style.color = 'white';
toggleButton.style.border = '2px solid #555';
toggleButton.style.borderRadius = '8px';
toggleButton.style.cursor = 'pointer';
toggleButton.style.zIndex = '1000';
toggleButton.style.transition = 'all 0.3s ease';

toggleButton.addEventListener('click', toggle2D3D);
toggleButton.addEventListener('mouseenter', () => {
  toggleButton.style.backgroundColor = '#555';
});
toggleButton.addEventListener('mouseleave', () => {
  toggleButton.style.backgroundColor = '#333';
});
document.body.appendChild(toggleButton);

function handleWindowResize () {
  const newWidth = window.innerWidth;
  const newHeight = window.innerHeight;
  
  // Update 3D renderer
  camera.aspect = newWidth / newHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(newWidth, newHeight);
  
  // Update 2D canvases
  canvas2D.width = newWidth;
  canvas2D.height = newHeight;
  offscreenCanvas.width = newWidth;
  offscreenCanvas.height = newHeight;
  
  // Mark 2D map as needing re-render
  map2DRendered = false;
  
  // Re-render 2D map if currently visible
  if (!is3D && landData && outlineData) {
    setTimeout(() => {
      render2DMapOffscreen();
      display2DMap();
    }, 100);
  }
}
window.addEventListener('resize', handleWindowResize, false);