/*
  Chatbot de Transporte Progreso del Chocó - VERSIÓN CON BAILEYS
*/

require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const XLSX = require('xlsx');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// ------------------------- CONFIG MEJORADA -------------------------
const ARCHIVO_VENTAS = 'ventas_diarias.xlsx';
const CARPETA_COMPROBANTES = 'comprobantes_pago';

// Crear carpeta de comprobantes si no existe
if (!fs.existsSync(CARPETA_COMPROBANTES)) {
    fs.mkdirSync(CARPETA_COMPROBANTES);
}

// Configuración de email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    }
});

// ------------------------- DATOS -------------------------
const rutas = {
    "quibdó → istmina": { tarifa: 30000, horarios: ["6:00 a.m.", "10:00 a.m.", "4:00 p.m."] },
    "quibdó → bahía solano": { tarifa: 90000, horarios: ["7:00 a.m.", "2:00 p.m."] },
    "quibdó → medellín": { tarifa: 120000, horarios: ["5:00 a.m.", "1:00 p.m."] },
    "quibdó → acandí": { tarifa: 95000, horarios: ["6:30 a.m.", "12:00 p.m."] },
    "quibdó → tadó": { tarifa: 25000, horarios: ["8:00 a.m.", "2:30 p.m.", "6:00 p.m."] },
    "quibdó → belén de bajirá": { tarifa: 40000, horarios: ["5:30 a.m.", "12:30 p.m."] },
    "medellín → quibdó": { tarifa: 120000, horarios: ["6:00 a.m.", "2:00 p.m."] },
};

// ------------------------- MANEJO DE SESIONES -------------------------
const usuarios = {};
const SESSION_TIMEOUT_MS = 1000 * 60 * 60;

function limpiarSesiones() {
    const ahoraMs = Date.now();
    for (const key of Object.keys(usuarios)) {
        if (ahoraMs - usuarios[key].lastActivity > SESSION_TIMEOUT_MS) delete usuarios[key];
    }
}
setInterval(limpiarSesiones, 1000 * 60 * 5);

// ------------------------- FUNCIONES UTILITARIAS -------------------------
function ahora() { return new Date().toLocaleString(); }

function leerVentas() {
    if (!fs.existsSync(ARCHIVO_VENTAS)) return [];
    const wb = XLSX.readFile(ARCHIVO_VENTAS);
    const ws = wb.Sheets['Ventas'];
    return ws ? XLSX.utils.sheet_to_json(ws) : [];
}

function guardarVentas(ventas) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(ventas);
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
    XLSX.writeFile(wb, ARCHIVO_VENTAS);
}

function appendVenta(venta) {
    const ventas = leerVentas();
    ventas.push(venta);
    guardarVentas(ventas);
}

// ------------------------- MANEJO DE MENSAJES -------------------------
async function manejarMensaje(sock, message, user) {
    const from = message.key.remoteJid;
    const texto = message.message?.conversation || message.message?.extendedTextMessage?.text || '';

    if (!texto) return;

    console.log(`📨 Mensaje de ${from}: ${texto}`);

    if (!usuarios[from]) {
        usuarios[from] = { estado: 'menu', lastActivity: Date.now(), datos: {} };
    }
    
    const usuario = usuarios[from];
    usuario.lastActivity = Date.now();

    // Detectar intención
    const intencion = detectarIntencion(texto);

    switch (intencion) {
        case 'saludo':
            await sock.sendMessage(from, { text: getMenuPrincipal() });
            break;
        case 'tarifas':
            await sock.sendMessage(from, { text: getTarifas() });
            break;
        case 'reserva':
            usuario.estado = 'reserva_nombre';
            usuario.datos = {};
            await sock.sendMessage(from, { text: '📝 *INICIANDO RESERVA*\n\nPor favor, escribe tu *nombre completo*:' });
            break;
        default:
            await sock.sendMessage(from, { text: getMenuPrincipal() });
            break;
    }
}

function detectarIntencion(texto) {
    texto = texto.toLowerCase().trim();
    
    if (texto.match(/^(hola|hi|hey|buenas|buen día)/)) return 'saludo';
    if (texto.match(/^(1|tarifa|precio|valor|cuanto|costos)/)) return 'tarifas';
    if (texto.match(/^(3|reservar|reserva|viaje|boleto|tiquete)/)) return 'reserva';
    
    return 'saludo';
}

function getMenuPrincipal() {
    return `👋 ¡Bienvenido a *Transporte Progreso del Chocó*! 

¿Qué necesitas? Responde con el número:

🚌 *1* - Ver tarifas y rutas
🕒 *2* - Ver horarios de salida  
🎫 *3* - Reservar viaje
📦 *4* - Otros servicios
📞 *5* - Contacto e información

*Ejemplo:* Escribe "1" para ver tarifas`;
}

function getTarifas() {
    let lista = '🚌 *Tarifas disponibles:*\n\n';
    for (const [r, d] of Object.entries(rutas)) {
        lista += `• ${r.toUpperCase()}: $${d.tarifa.toLocaleString()}\n`;
    }
    lista += '\n¿Quieres hacer una reserva? Escribe "3"';
    return lista;
}

// ------------------------- CONEXIÓN WHATSAPP -------------------------
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        version: [2, 2413, 1],
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.ubuntu('Chrome')
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 ESCANEA ESTE CÓDIGO QR:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔌 Conexión cerrada, reconectando...', lastDisconnect?.error);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ BOT CONECTADO - Transporte Progreso del Chocó');
            console.log('🚀 Bot listo para recibir mensajes');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.key.fromMe && m.type === 'notify') {
            await manejarMensaje(sock, message);
        }
    });

    return sock;
}

// ------------------------- INICIALIZACIÓN -------------------------
console.log('🚀 Iniciando Bot con Baileys - Transporte Progreso del Chocó...');
console.log('📧 Servicio de email: Gmail');
console.log('🖥️  Configuración optimizada para servidor');

connectToWhatsApp().catch(err => {
    console.error('❌ Error al conectar:', err);
    console.log('🔄 Reiniciando en 5 segundos...');
    setTimeout(connectToWhatsApp, 5000);
});
