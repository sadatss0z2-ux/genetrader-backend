"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const router = (0, express_1.Router)();

const NIM_KEYS = [
    process.env.NVIDIA_NIM_API_KEY,
    process.env.NVIDIA_NIM_API_KEY_02,
    process.env.NVIDIA_NIM_API_KEY_03,
].filter(Boolean);

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? '';

const SYSTEM_PROMPT =
    'You are a concise crypto trading assistant for the GeneTrader app. ' +
    'Answer in 2-3 sentences max. Be direct and practical.';

async function callLlm(question) {
    const isNim = NIM_KEYS.length > 0;
    const keys = isNim ? NIM_KEYS : (OPENROUTER_KEY ? [OPENROUTER_KEY] : []);
    if (keys.length === 0) {
        return 'AI assistant is not configured on the server. Contact support.';
    }
    for (let i = 0; i < keys.length; i++) {
        try {
            const res = await fetch(
                isNim
                    ? 'https://integrate.api.nvidia.com/v1/chat/completions'
                    : 'https://openrouter.ai/api/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${keys[i]}`,
                        ...(isNim ? {} : { 'HTTP-Referer': 'https://genetrader.app', 'X-Title': 'GeneTrader' }),
                    },
                    body: JSON.stringify({
                        model: isNim ? 'meta/llama-3.1-8b-instruct' : 'mistralai/mistral-7b-instruct:free',
                        messages: [
                            { role: 'system', content: SYSTEM_PROMPT },
                            { role: 'user', content: question },
                        ],
                        max_tokens: 150,
                        temperature: 0.6,
                        top_p: 0.9,
                    }),
                    signal: AbortSignal.timeout(15000),
                }
            );
            if (res.status === 429 && i < keys.length - 1) continue;
            if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
            const data = await res.json();
            const reply = data?.choices?.[0]?.message?.content?.trim();
            return reply || 'No response from AI.';
        } catch (err) {
            if (i < keys.length - 1) continue;
        }
    }
    return 'AI is temporarily unavailable. Please try again shortly.';
}

router.post(
    '/chat',
    (0, express_validator_1.body)('question')
        .isString()
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage('question must be 1-500 characters'),
    async (req, res, next) => {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ error: errors.array()[0]?.msg ?? 'Invalid input' });
            return;
        }
        try {
            const { question } = req.body;
            const reply = await callLlm(question);
            res.json({ reply });
        } catch (err) {
            next(err);
        }
    }
);

exports.default = router;
