// Copie Leaflet + Chart.js depuis node_modules vers vendor/ (auto-hébergement, aucun CDN requis).
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('vendor/leaflet', { recursive: true });
cpSync('node_modules/leaflet/dist/leaflet.js', 'vendor/leaflet/leaflet.js');
cpSync('node_modules/leaflet/dist/leaflet.css', 'vendor/leaflet/leaflet.css');
cpSync('node_modules/leaflet/dist/images', 'vendor/leaflet/images', { recursive: true });
cpSync('node_modules/chart.js/dist/chart.umd.js', 'vendor/chart.umd.js');
console.log('vendor/ ok');
