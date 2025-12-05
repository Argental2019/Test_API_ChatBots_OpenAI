// backend/api/index.js
import express from 'express';
import voiceHandler from './voice-chat.js';

const router = express.Router();

// ... tus otras rutas existentes ...

// Ruta para voice-chat
router.post('/voice-chat', voiceHandler);

export default router;