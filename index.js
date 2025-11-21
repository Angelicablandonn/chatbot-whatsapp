/*
  Chatbot de Transporte Progreso del Chocó - VERSIÓN OPTIMIZADA PARA SERVIDOR
*/

require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const XLSX = require('xlsx');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// ------------------------- CONFIG MEJORADA -------------------------
const ARCHIVO_VENTAS = 'ventas_diarias.xlsx';
const LOG_METRICAS = 'metrics.json';
const CARPETA_COMPROBANTES = 'comprobantes_pago';

// Crear carpeta de comprobantes si no existe
if (!fs.existsSync(CARPETA_COMPROBANTES)) {
    fs.mkdirSync(CARPETA_COMPROBANTES);
}

// Configuración de email mejorada
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Verificar conexión de email
transporter.verify(function(error, success) {
    if (error) {
        console.log('❌ Error configuración email:', error.message);
    } else {
        console.log('✅ Servidor de email listo');
    }
});

// ------------------------- DATOS COMPLETOS -------------------------
const rutas = {
    "quibdó → istmina": { tarifa: 30000, horarios: ["6:00 a.m.", "10:00 a.m.", "4:00 p.m."] },
    "quibdó → bahía solano": { tarifa: 90000, horarios: ["7:00 a.m.", "2:00 p.m."] },
    "quibdó → medellín": { tarifa: 120000, horarios: ["5:00 a.m.", "1:00 p.m."] },
    "quibdó → acandí": { tarifa: 95000, horarios: ["6:30 a.m.", "12:00 p.m."] },
    "quibdó → tadó": { tarifa: 25000, horarios: ["8:00 a.m.", "2:30 p.m.", "6:00 p.m."] },
    "quibdó → belén de bajirá": { tarifa: 40000, horarios: ["5:30 a.m.", "12:30 p.m."] },
    "medellín → quibdó": { tarifa: 120000, horarios: ["6:00 a.m.", "2:00 p.m."] },
};

const servicios = `\n📦 *Encomiendas*: envíos seguros a todo el Chocó.\n🚐 *Viajes privados*: conductor exclusivo por hora o destino.\n🏠 *Puerta a puerta Medellín - Pereira*: recogemos y entregamos en tu domicilio.`;

// ------------------------- UTILIDADES MEJORADAS -------------------------
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

// Guardar comprobante de pago
async function guardarComprobante(media, documento, destino) {
    try {
        const extension = media.mimetype.split('/')[1];
        const nombreArchivo = `comprobante_${documento}_${Date.now()}.${extension}`;
        const rutaCompleta = path.join(CARPETA_COMPROBANTES, nombreArchivo);
        
        // Guardar el archivo
        const buffer = Buffer.from(media.data, 'base64');
        fs.writeFileSync(rutaCompleta, buffer);
        
        return nombreArchivo;
    } catch (error) {
        console.error('Error guardando comprobante:', error);
        return null;
    }
}

// ------------------------- MANEJO DE SESIONES MEJORADO -------------------------
const usuarios = {};
const SESSION_TIMEOUT_MS = 1000 * 60 * 60;

function limpiarSesiones() {
    const ahoraMs = Date.now();
    for (const key of Object.keys(usuarios)) {
        if (ahoraMs - usuarios[key].lastActivity > SESSION_TIMEOUT_MS) delete usuarios[key];
    }
}
setInterval(limpiarSesiones, 1000 * 60 * 5);

// ------------------------- CONTROLADORES COMPLETOS MEJORADOS -------------------------
async function manejarSaludo(message, user) {
    user.estado = 'menu';
    user.lastActivity = Date.now();

    const menuPrincipal = `👋 ¡Bienvenido a *Transporte Progreso del Chocó*! 

¿Qué necesitas? Responde con el número:

🚌 *1* - Ver tarifas y rutas
🕒 *2* - Ver horarios de salida  
🎫 *3* - Reservar viaje
📦 *4* - Otros servicios
📞 *5* - Contacto e información

*Ejemplo:* Escribe "1" para ver tarifas`;

    await message.reply(menuPrincipal);
}

async function manejarTarifas(message, user) {
    let lista = '🚌 *Tarifas disponibles:*\n\n';
    for (const [r, d] of Object.entries(rutas)) {
        lista += `• ${r.toUpperCase()}: $${d.tarifa.toLocaleString()}\n`;
    }
    lista += '\n¿Deseas conocer los horarios (escribe "horarios") o hacer una reserva (escribe "reservar")?';
    await message.reply(lista);
    user.lastActivity = Date.now();
}

async function manejarHorarios(message, user) {
    let horarios = '🕒 *Horarios disponibles:*\n\n';
    for (const [r, d] of Object.entries(rutas)) {
        horarios += `• ${r.toUpperCase()}: ${d.horarios.join(', ')}\n`;
    }
    await message.reply(horarios + '\n¿Quieres hacer una reserva? Escribe "reservar"');
    user.lastActivity = Date.now();
}

async function manejarServicios(message, user) {
    await message.reply(servicios);
    user.lastActivity = Date.now();
}

async function manejarContacto(message, user) {
    await message.reply('📞 *Tel:* 312-000-1111\n📧 *Email:* transporteprogreso@gmail.com\n🏢 *Dirección:* Calle 25 #4-60, Quibdó, Chocó.');
    user.lastActivity = Date.now();
}

async function iniciarReserva(message, user) {
    user.estado = 'reserva_nombre';
    user.datos = {};
    user.lastActivity = Date.now();
    
    await message.reply('📝 *INICIANDO RESERVA*\n\nPor favor, escribe tu *nombre completo*:');
}

async function procesarReserva(message, user, texto) {
    user.lastActivity = Date.now();

    if (user.estado === 'reserva_nombre') {
        user.datos.nombre = texto.trim();
        user.estado = 'reserva_documento';
        await message.reply('📋 *Nombre registrado:* ' + texto + '\n\nAhora escribe tu *número de documento*:');
        return;
    }

    if (user.estado === 'reserva_documento') {
        const doc = texto.replace(/\D/g, '');
        if (doc.length < 6 || doc.length > 12) {
            await message.reply('❌ Documento inválido. Debe tener entre 6 y 12 dígitos. Intenta nuevamente:');
            return;
        }
        user.datos.documento = doc;
        user.estado = 'reserva_destino';
        
        let destinos = '📍 *Selecciona tu destino escribe el número:*\n\n';
        const rutasArray = Object.keys(rutas);
        rutasArray.forEach((ruta, index) => {
            destinos += `${index + 1}. ${ruta} - $${rutas[ruta].tarifa.toLocaleString()}\n`;
        });
        destinos += '\n*Ejemplo:* Escribe "1" para Quibdó → Istmina';
        
        await message.reply(destinos);
        return;
    }

    if (user.estado === 'reserva_destino') {
        const num = parseInt(texto);
        const rutasArray = Object.keys(rutas);
        
        if (isNaN(num) || num < 1 || num > rutasArray.length) {
            await message.reply(`❌ Número inválido. Escribe un número entre 1 y ${rutasArray.length}:`);
            return;
        }
        
        user.datos.destino = rutasArray[num - 1];
        user.estado = 'reserva_horario';
        
        const horarios = rutas[user.datos.destino].horarios;
        let horariosMsg = `🕒 *Horarios para ${user.datos.destino}:*\n\n`;
        horarios.forEach((horario, index) => {
            horariosMsg += `${index + 1}. ${horario}\n`;
        });
        horariosMsg += '\n*Escribe el número del horario que prefieres:*';
        
        await message.reply(horariosMsg);
        return;
    }

    if (user.estado === 'reserva_horario') {
        const num = parseInt(texto);
        const horarios = rutas[user.datos.destino].horarios;
        
        if (isNaN(num) || num < 1 || num > horarios.length) {
            await message.reply(`❌ Número inválido. Escribe un número entre 1 y ${horarios.length}:`);
            return;
        }
        
        user.datos.horario = horarios[num - 1];
        user.datos.tarifa = rutas[user.datos.destino].tarifa;
        user.estado = 'reserva_completa';
        
        // COMPLETAR RESERVA
        const venta = {
            Fecha: ahora(),
            Nombre: user.datos.nombre,
            Documento: user.datos.documento,
            Destino: user.datos.destino,
            Horario: user.datos.horario,
            Valor: user.datos.tarifa,
            Estado: 'Pago pendiente',
            Comprobante: null
        };
        
        appendVenta(venta);
        
        const confirmacion = `✅ *RESERVA REGISTRADA EXITOSAMENTE*\n
📋 *Resumen:*
👤 Nombre: ${user.datos.nombre}
📄 Documento: ${user.datos.documento}  
📍 Ruta: ${user.datos.destino}
🕒 Horario: ${user.datos.horario}
💰 Total: $${user.datos.tarifa.toLocaleString()}

💳 *Para confirmar tu reserva:*
1. Realiza el pago por *$${user.datos.tarifa.toLocaleString()}* a:
   📱 *Nequi:* 3127592870
   
2. *Toma una captura* del comprobante de pago

3. *Responde a este mensaje* adjuntando la imagen del comprobante
   o escribe *"confirmar pago"* si ya realizaste la transferencia

¡Tu asiento está reservado por 24 horas!`;
        
        await message.reply(confirmacion);
        return;
    }
}

// FUNCIÓN MEJORADA: Manejar confirmación de pago con imagen
async function manejarConfirmacionPago(message, user, media = null) {
    const ventas = leerVentas();
    const reservaIndex = ventas.findIndex(v => 
        v.Documento && user.datos && v.Documento == user.datos.documento && v.Estado === 'Pago pendiente'
    );
    
    if (reservaIndex === -1) {
        await message.reply('❌ No encontré reservas pendientes de pago. Escribe "reservar" para iniciar una nueva reserva.');
        return;
    }
    
    const reserva = ventas[reservaIndex];
    let nombreComprobante = null;
    
    // Si hay imagen adjunta, guardarla
    if (media) {
        nombreComprobante = await guardarComprobante(media, user.datos.documento, user.datos.destino);
        if (nombreComprobante) {
            reserva.Comprobante = nombreComprobante;
        }
    }
    
    // Actualizar estado de la reserva
    reserva.Estado = 'Pago confirmado';
    reserva.FechaConfirmacion = ahora();
    
    guardarVentas(ventas);
    
    // ENVIAR CORREO DE CONFIRMACIÓN (con manejo de errores)
    try {
        await enviarCorreoConfirmacion(reserva, nombreComprobante);
    } catch (emailError) {
        console.log('⚠️ Correo no enviado, pero reserva confirmada');
    }
    
    const mensajeConfirmacion = `✅ *¡PAGO CONFIRMADO!*

Tu reserva para *${reserva.Destino}* está *CONFIRMADA*.

📅 *Presenta tu documento 30 minutos antes de la salida*
🕒 Horario: ${reserva.Horario}
📍 Punto de encuentro: Terminal de Transporte Progreso

${nombreComprobante ? '📎 *Comprobante recibido correctamente*' : ''}

¡Gracias por preferirnos! 🚌✨`;
    
    await message.reply(mensajeConfirmacion);
    user.estado = 'menu';
    user.datos = {};
}

// NUEVA FUNCIÓN: Enviar correo de confirmación
async function enviarCorreoConfirmacion(reserva, nombreComprobante) {
    try {
        const asunto = `✅ Confirmación de Reserva - ${reserva.Nombre} - ${reserva.Destino}`;
        
        let cuerpoCorreo = `
CONFIRMACIÓN DE RESERVA - TRANSPORTE PROGRESO DEL CHOCÓ

📋 DETALLES DE LA RESERVA:
-----------------------------
👤 Pasajero: ${reserva.Nombre}
📄 Documento: ${reserva.Documento}
📍 Ruta: ${reserva.Destino}
🕒 Horario: ${reserva.Horario}
💰 Valor Pagado: $${reserva.Valor?.toLocaleString()}
📅 Fecha de Reserva: ${reserva.Fecha}
✅ Estado: CONFIRMADO

📍 PUNTO DE ENCUENTRO:
Terminal de Transporte Progreso
Calle 25 #4-60, Quibdó, Chocó

⏰ RECOMENDACIONES:
• Presentarse 30 minutos antes de la salida
• Llevar documento de identidad original
• Tener a mano el comprobante de pago

📞 CONTACTO:
Tel: 312-000-1111
Email: transporteprogreso@gmail.com

¡Gracias por preferir Transporte Progreso del Chocó!
        `;

        const adjuntos = [];
        
        // Adjuntar archivo de ventas
        if (fs.existsSync(ARCHIVO_VENTAS)) {
            adjuntos.push({
                filename: 'registro_ventas.xlsx',
                path: ARCHIVO_VENTAS
            });
        }
        
        // Adjuntar comprobante si existe
        if (nombreComprobante) {
            const rutaComprobante = path.join(CARPETA_COMPROBANTES, nombreComprobante);
            if (fs.existsSync(rutaComprobante)) {
                adjuntos.push({
                    filename: `comprobante_${reserva.Documento}.jpg`,
                    path: rutaComprobante
                });
            }
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: asunto,
            text: cuerpoCorreo,
            attachments: adjuntos
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Correo de confirmación enviado para ${reserva.Nombre}`);
        
    } catch (error) {
        console.error('❌ Error enviando correo de confirmación:', error);
        throw error;
    }
}

// ------------------------- DETECCIÓN DE INTENCIONES COMPLETA -------------------------
function detectarIntencion(texto) {
    texto = texto.toLowerCase().trim();
    
    if (texto.match(/^(hola|hi|hey|buenas|buen día)/)) return 'saludo';
    if (texto.match(/^(1|tarifa|precio|valor|cuanto|costos)/)) return 'tarifas';
    if (texto.match(/^(2|horario|hora|salida|cuando)/)) return 'horarios';
    if (texto.match(/^(3|reservar|reserva|viaje|boleto|tiquete)/)) return 'reserva';
    if (texto.match(/^(4|servicio|servicios|encomienda|privado)/)) return 'servicios';
    if (texto.match(/^(5|contacto|tel|telefono|direccion|ubicacion)/)) return 'contacto';
    if (texto.match(/^(gracias|chao|adiós|bye|nos vemos)/)) return 'despedida';
    if (texto.match(/confirmar pago/)) return 'confirmar_pago';
    
    return null;
}

// ------------------------- WHATSAPP CLIENT OPTIMIZADO PARA SERVIDOR -------------------------
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'transporte-progreso',
        dataPath: './.wwebjs_auth/'
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

client.on('qr', (qr) => {
    console.log('📱 ESCANEA ESTE CÓDIGO QR:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ BOT CONECTADO - Transporte Progreso del Chocó');
    console.log('📎 Funcionalidad de comprobantes activada');
    console.log('🚀 Bot listo para recibir mensajes');
});

client.on('authenticated', () => {
    console.log('🔐 Autenticación exitosa');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Error de autenticación:', msg);
});

client.on('disconnected', (reason) => {
    console.log('🔌 Bot desconectado:', reason);
});

// ------------------------- MANEJO DE MENSAJES MEJORADO Y COMPLETO -------------------------
client.on('message', async (message) => {
    try {
        // Ignorar mensajes de grupos y estados
        if (message.from.includes('@g.us') || message.isStatus) return;

        const from = message.from;
        const texto = message.body ? message.body.trim() : '';
        
        if (!texto && !message.hasMedia) return;

        console.log(`📨 Mensaje de ${from}: ${texto || 'MEDIA'}`);

        // Inicializar usuario si no existe
        if (!usuarios[from]) {
            usuarios[from] = { estado: 'menu', lastActivity: Date.now(), datos: {} };
        }
        
        const user = usuarios[from];
        user.lastActivity = Date.now();

        // MANEJO DE IMÁGENES/MEDIA PARA COMPROBANTES
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            
            if (user.estado === 'reserva_completa') {
                await message.reply('📎 *Procesando tu comprobante de pago...*');
                await manejarConfirmacionPago(message, user, media);
                return;
            } else {
                await message.reply('📎 He recibido tu imagen. Si es un comprobante de pago, primero completa tu reserva escribiendo "reservar".');
                return;
            }
        }

        // Manejar estados de reserva primero
        if (user.estado.startsWith('reserva_')) {
            await procesarReserva(message, user, texto);
            return;
        }

        // Detectar intención
        const intencion = detectarIntencion(texto);

        if (intencion === 'confirmar_pago') {
            if (user.estado === 'reserva_completa') {
                await message.reply('💳 *Confirmación de pago*\n\nPor favor, adjunta la imagen del comprobante de pago o escribe "cancelar" para volver al menú.');
                return;
            } else {
                await manejarConfirmacionPago(message, user);
                return;
            }
        }

        switch (intencion) {
            case 'saludo':
                await manejarSaludo(message, user);
                break;
            case 'tarifas':
                await manejarTarifas(message, user);
                break;
            case 'horarios':
                await manejarHorarios(message, user);
                break;
            case 'reserva':
                await iniciarReserva(message, user);
                break;
            case 'servicios':
                await manejarServicios(message, user);
                break;
            case 'contacto':
                await manejarContacto(message, user);
                break;
            case 'despedida':
                await message.reply('🙂 ¡Gracias! Escribe "hola" cuando necesites algo más.');
                break;
            default:
                // Si no se reconoce, mostrar ayuda
                await message.reply(`🤔 No entendí. Escribe:\n• "1" para tarifas\n• "2" para horarios\n• "3" para reservar\n• "hola" para ver el menú completo`);
                break;
        }

    } catch (error) {
        console.error('❌ Error:', error);
        try {
            await message.reply('❌ Ocurrió un error. Por favor, intenta nuevamente.');
        } catch (e) {
            console.error('Error al enviar mensaje de error:', e);
        }
    }
});

// ------------------------- REPORTE DIARIO MEJORADO -------------------------
async function enviarReporteDiario() {
    try {
        if (!fs.existsSync(ARCHIVO_VENTAS)) return;
        
        const ventas = leerVentas();
        if (ventas.length === 0) return;
        
        const total = ventas.reduce((acc, v) => acc + (v.Valor || 0), 0);
        const confirmadas = ventas.filter(v => v.Estado === 'Pago confirmado').length;
        const pendientes = ventas.filter(v => v.Estado === 'Pago pendiente').length;

        let resumen = `📊 REPORTE DIARIO - Transporte Progreso del Chocó\n\n`;
        resumen += `💰 Total: $${total.toLocaleString()}\n`;
        resumen += `✅ Confirmadas: ${confirmadas}\n`;
        resumen += `⏳ Pendientes: ${pendientes}\n`;
        resumen += `📋 Total: ${ventas.length}\n\n`;
        
        ventas.forEach((v, i) => { 
            resumen += `${i + 1}. ${v.Nombre} - ${v.Destino} - $${v.Valor} - ${v.Estado} ${v.Comprobante ? '📎' : ''}\n`; 
        });

        const adjuntos = [
            { filename: ARCHIVO_VENTAS, path: `./${ARCHIVO_VENTAS}` }
        ];

        // Adjuntar comprobantes del día
        const hoy = new Date().toISOString().split('T')[0];
        const comprobantesHoy = ventas
            .filter(v => v.Comprobante && v.FechaConfirmacion && v.FechaConfirmacion.includes(hoy))
            .map(v => v.Comprobante);

        for (const comp of comprobantesHoy) {
            const rutaComprobante = path.join(CARPETA_COMPROBANTES, comp);
            if (fs.existsSync(rutaComprobante)) {
                adjuntos.push({
                    filename: comp,
                    path: rutaComprobante
                });
            }
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `📈 Reporte diario - ${new Date().toLocaleDateString()}`,
            text: resumen,
            attachments: adjuntos
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Reporte diario enviado con comprobantes');
        
        // Backup y limpiar
        const backupName = `backup_${new Date().toISOString().split('T')[0]}.xlsx`;
        fs.copyFileSync(ARCHIVO_VENTAS, backupName);
        guardarVentas([]);
    } catch (err) {
        console.error('❌ Error enviando reporte:', err);
    }
}

const CRON_EXPR = process.env.REPORT_CRON || '59 23 * * *';
cron.schedule(CRON_EXPR, () => {
    console.log('⏰ Enviando reporte diario con comprobantes...');
    enviarReporteDiario();
});

// ------------------------- INICIALIZACIÓN -------------------------
client.initialize();

console.log('🚀 Iniciando Bot Optimizado de Transporte Progreso del Chocó...');
console.log('📁 Carpeta comprobantes:', CARPETA_COMPROBANTES);
console.log('📧 Servicio de email: Gmail');
console.log('🖥️  Configurado para servidor: ✅');
console.log('🚌 Todas las funcionalidades integradas: ✅');

// Manejo graceful de cierre
process.on('SIGINT', async () => {
    console.log('🛑 Cerrando bot...');
    await client.destroy();
    process.exit(0);
});
