/*
  Chatbot de Transporte Progreso del Chocó - VERSIÓN BAILEYS PARA RAILWAY
*/
// FIX para Railway: habilitar crypto antes de cargar Baileys
const crypto = require("crypto");
global.crypto = crypto.webcrypto || crypto;

require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const XLSX = require('xlsx');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ------------------------- CONFIGURACIÓN -------------------------
const ARCHIVO_VENTAS = 'ventas_diarias.xlsx';
const CARPETA_COMPROBANTES = 'comprobantes_pago';

// Crear carpetas necesarias
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

// ------------------------- FUNCIONES DE MENÚ -------------------------
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

function getHorarios() {
    let horarios = '🕒 *Horarios disponibles:*\n\n';
    for (const [r, d] of Object.entries(rutas)) {
        horarios += `• ${r.toUpperCase()}: ${d.horarios.join(', ')}\n`;
    }
    return horarios;
}

// ------------------------- INICIALIZACIÓN BOT -------------------------
async function startBot() {
    console.log('🚀 Iniciando Bot con Baileys para Railway...');
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        // Configuración optimizada para Railway
        browser: ['Transporte Progreso Chocó', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
    });

    // Manejar actualización de credenciales
    sock.ev.on('creds.update', saveCreds);

    // Manejar conexión
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 ESCANEA ESTE CÓDIGO QR:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log('🔌 Conexión cerrada, reconectando...', lastDisconnect.error);
            
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ BOT CONECTADO - Transporte Progreso del Chocó');
            console.log('🚀 Bot listo para recibir mensajes');
        }
    });

    // Manejar mensajes
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const message = messages[0];
            
            // Ignorar mensajes de grupos y sin contenido
            if (!message.message || message.key.remoteJid.includes('@g.us')) return;

            const from = message.key.remoteJid;
            const texto = message.message.conversation || 
                         message.message.extendedTextMessage?.text || 
                         '';

            if (!texto.trim()) return;

            console.log(`📨 Mensaje de ${from}: ${texto}`);

            // Inicializar usuario si no existe
            if (!usuarios[from]) {
                usuarios[from] = { estado: 'menu' };
            }

            const user = usuarios[from];

            // Manejar según el estado o comando
            if (texto.toLowerCase().includes('hola')) {
                await sock.sendMessage(from, { text: getMenuPrincipal() });
            } else if (texto === '1') {
                await sock.sendMessage(from, { text: getTarifas() });
            } else if (texto === '2') {
                await sock.sendMessage(from, { text: getHorarios() });
            } else if (texto === '3') {
                user.estado = 'reserva_nombre';
                user.datos = {};
                await sock.sendMessage(from, { 
                    text: '📝 *INICIANDO RESERVA*\n\nPor favor, escribe tu *nombre completo*:' 
                });
            } else if (user.estado === 'reserva_nombre') {
                user.datos.nombre = texto;
                user.estado = 'reserva_documento';
                await sock.sendMessage(from, { 
                    text: '📋 *Nombre registrado*\n\nAhora escribe tu *número de documento*:' 
                });
            } else if (user.estado === 'reserva_documento') {
                user.datos.documento = texto;
                user.estado = 'menu';
                
                // Simular reserva
                const venta = {
                    Fecha: ahora(),
                    Nombre: user.datos.nombre,
                    Documento: user.datos.documento,
                    Destino: "quibdó → medellín",
                    Horario: "6:00 a.m.",
                    Valor: 120000,
                    Estado: 'Pago pendiente'
                };
                
                // Guardar en Excel
                const ventas = leerVentas();
                ventas.push(venta);
                guardarVentas(ventas);
                
                await sock.sendMessage(from, { 
                    text: `✅ *RESERVA REGISTRADA*\n\nNombre: ${user.datos.nombre}\nDocumento: ${user.datos.documento}\n\nPara confirmar realiza el pago y envía el comprobante.` 
                });
            } else {
                await sock.sendMessage(from, { text: getMenuPrincipal() });
            }

        } catch (error) {
            console.error('❌ Error procesando mensaje:', error);
            try {
                await sock.sendMessage(from, { 
                    text: '❌ Ocurrió un error. Por favor, intenta nuevamente.' 
                });
            } catch (e) {
                console.error('Error enviando mensaje de error:', e);
            }
        }
    });

    return sock;
}

// ------------------------- INICIALIZACIÓN -------------------------
console.log('🚀 Iniciando Bot Optimizado para Railway...');
console.log('📧 Email configurado');
console.log('📊 Sistema de reservas activo');

// Iniciar bot
startBot().catch(console.error);

// Manejo de cierre
process.on('SIGINT', async () => {
    console.log('🛑 Cerrando bot...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
});
