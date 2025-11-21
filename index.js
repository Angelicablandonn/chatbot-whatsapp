/*
  Chatbot de Transporte Progreso del Chocó - VERSIÓN RAILWAY OPTIMIZADA
*/

require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const XLSX = require('xlsx');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
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

// ------------------------- CLIENTE WHATSAPP OPTIMIZADO -------------------------
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'transporte-progreso-railway'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--single-process',
            '--no-zygote'
        ]
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

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

// ------------------------- MANEJO DE MENSAJES -------------------------
client.on('qr', (qr) => {
    console.log('📱 ESCANEA ESTE CÓDIGO QR:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ BOT CONECTADO - Transporte Progreso del Chocó');
    console.log('🚀 Bot listo para recibir mensajes');
});

client.on('message', async (message) => {
    try {
        if (message.from.includes('@g.us')) return;

        const from = message.from;
        const texto = message.body ? message.body.trim() : '';
        
        if (!texto) return;

        console.log(`📨 Mensaje de ${from}: ${texto}`);

        // Inicializar usuario si no existe
        if (!usuarios[from]) {
            usuarios[from] = { estado: 'menu' };
        }

        const user = usuarios[from];

        // Manejar según el estado o comando
        if (texto.toLowerCase().includes('hola')) {
            await message.reply(getMenuPrincipal());
        } else if (texto === '1') {
            await message.reply(getTarifas());
        } else if (texto === '2') {
            await message.reply(getHorarios());
        } else if (texto === '3') {
            user.estado = 'reserva_nombre';
            user.datos = {};
            await message.reply('📝 *INICIANDO RESERVA*\n\nPor favor, escribe tu *nombre completo*:');
        } else if (user.estado === 'reserva_nombre') {
            user.datos.nombre = texto;
            user.estado = 'reserva_documento';
            await message.reply('📋 *Nombre registrado*\n\nAhora escribe tu *número de documento*:');
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
            
            await message.reply(`✅ *RESERVA REGISTRADA*\n\nNombre: ${user.datos.nombre}\nDocumento: ${user.datos.documento}\n\nPara confirmar realiza el pago y envía el comprobante.`);
        } else {
            await message.reply(getMenuPrincipal());
        }

    } catch (error) {
        console.error('❌ Error:', error);
        await message.reply('❌ Ocurrió un error. Por favor, intenta nuevamente.');
    }
});

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

// ------------------------- INICIALIZACIÓN -------------------------
console.log('🚀 Iniciando Bot Optimizado para Railway...');
console.log('📧 Email configurado');
console.log('📊 Sistema de reservas activo');

client.initialize();

// Manejo de cierre
process.on('SIGINT', async () => {
    console.log('🛑 Cerrando bot...');
    await client.destroy();
    process.exit(0);
});
