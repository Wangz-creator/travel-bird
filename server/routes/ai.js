const express = require('express');
const router = express.Router();
const { Settings } = require('../db');
const { WebSocket } = require('ws');
const zlib = require('zlib');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

const gzip = promisify(zlib.gzip);

function normalizeUtteranceText(text) {
  return String(text || '')
    .trim()
    .replace(/[。！？!?]+$/g, '')
    .replace(/\s+/g, '');
}

function buildTextFromUtterances(utterances) {
  let out = '';
  for (let i = 0; i < utterances.length; i += 1) {
    const current = utterances[i];
    const body = normalizeUtteranceText(current.text);
    if (!body) continue;
    if (!out) {
      out = body;
      continue;
    }
    const prev = utterances[i - 1];
    const gap = prev && prev.end != null && current.start != null ? current.start - prev.end : null;
    if (gap != null && gap >= 700) out += '。';
    out += body;
  }
  if (out && !/[。！？!?]$/.test(out)) out += '。';
  return out;
}

// 将任意格式音频转为 16kHz 单声道 WAV
function convertToWav(inputBuf, inputExt) {
  return new Promise((resolve, reject) => {
    const tmpIn  = path.join(os.tmpdir(), `vc_in_${Date.now()}.${inputExt}`);
    const tmpOut = path.join(os.tmpdir(), `vc_out_${Date.now()}.wav`);
    fs.writeFileSync(tmpIn, inputBuf);
    ffmpeg(tmpIn)
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('end', () => {
        const buf = fs.readFileSync(tmpOut);
        fs.unlinkSync(tmpIn);
        fs.unlinkSync(tmpOut);
        resolve(buf);
      })
      .on('error', (e) => {
        try { fs.unlinkSync(tmpIn); } catch(_) {}
        try { fs.unlinkSync(tmpOut); } catch(_) {}
        reject(e);
      })
      .save(tmpOut);
  });
}

function getAssistantConfig() {
  return {
    provider:    Settings.get('assistant_provider')    || 'openai',
    endpoint:    Settings.get('assistant_endpoint')    || '',
    apiKey:      Settings.get('assistant_api_key')     || '',
    model:       Settings.get('assistant_model')       || '',
    temperature: Settings.get('assistant_temperature') ?? 0.7,
    maxTokens:   Settings.get('assistant_max_tokens')  ?? 4096,
  };
}

/** Node/undici 的 fetch 失败常为 TypeError「fetch failed」，真实原因在 cause 链（如 ETIMEDOUT、ENOTFOUND） */
function formatNodeFetchError(err) {
  const parts = [];
  let e = err;
  const seen = new Set();
  while (e && typeof e === 'object' && !seen.has(e)) {
    seen.add(e);
    if (e.message) parts.push(String(e.message));
    if (e.code && typeof e.code === 'string') parts.push(e.code);
    e = e.cause;
  }
  const s = parts.filter(Boolean).join(' — ');
  return s || String(err);
}

/** 将上游 JSON/HTML 错误正文压成可读短句（OpenAI 兼容常见 { error: { message } }） */
function formatUpstreamErrorBody(raw) {
  const s = String(raw || '').trim();
  if (!s) return '上游请求失败';
  try {
    const j = JSON.parse(s);
    const inner = j.error;
    const msg = inner && typeof inner.message === 'string' ? inner.message : '';
    if (msg) {
      if (/model not exist|model_not_found|model does not exist|invalid model/i.test(msg)) {
        return `${msg}（请到「个人资料 → 模型设置」填写该服务商文档中的模型 ID）`;
      }
      return msg;
    }
    if (inner && typeof inner.type === 'string') return inner.type;
  } catch (_) { /* 非 JSON 则退回原文 */ }
  return s.length > 600 ? `${s.slice(0, 600)}…` : s;
}

function extractOpenAITextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.text === 'string') return item.text;
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

// POST /api/ai/chat-stream  (SSE)
router.post('/chat-stream', async (req, res) => {
  const config = getAssistantConfig();
  if (!config.apiKey)   return res.status(400).json({ error: '请先配置 API Key' });
  if (!config.endpoint) return res.status(400).json({ error: '请先配置 API 地址' });

  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  let sentDone = false;
  const sendDone = () => {
    if (sentDone) return;
    sentDone = true;
    send({ done: true });
  };

  try {
    let upstreamRes;
    const base = config.endpoint.replace(/\/+$/, '');
    if (config.provider === 'anthropic') {
      const systemEntry = messages.find(m => m.role === 'system');
      const systemMsg = systemEntry ? (systemEntry.content ?? '') : '';
      const chatMsgs  = messages.filter(m => m.role !== 'system');
      upstreamRes = await fetch(`${base}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          system: systemMsg,
          messages: chatMsgs,
          stream: true,
        }),
      });
    } else {
      upstreamRes = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          stream: true,
        }),
      });
    }

    if (!upstreamRes.ok) {
      const err = await upstreamRes.text();
      send({ error: formatUpstreamErrorBody(err) });
      return res.end();
    }

    const reader = upstreamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') { sendDone(); continue; }
        try {
          const event = JSON.parse(data);
          if (config.provider === 'anthropic') {
            const chunk = event.delta?.text;
            if (chunk) send({ chunk });
          } else {
            const chunk = event.choices?.[0]?.delta?.content;
            if (chunk) send({ chunk });
          }
        } catch (_) {}
      }
    }
    sendDone();
    res.end();
  } catch (e) {
    const detail = formatNodeFetchError(e);
    send({ error: detail });
    res.end();
  }
});

// POST /api/ai/chat  (非流式)
router.post('/chat', async (req, res) => {
  const config = getAssistantConfig();
  if (!config.apiKey)   return res.status(400).json({ error: '请先配置 API Key' });
  if (!config.endpoint) return res.status(400).json({ error: '请先配置 API 地址' });

  const { messages } = req.body;
  try {
    const base = config.endpoint.replace(/\/+$/, '');
    let text = '';
    if (config.provider === 'anthropic') {
      const systemEntry = messages.find(m => m.role === 'system');
      const systemMsg = systemEntry ? (systemEntry.content ?? '') : '';
      const chatMsgs  = messages.filter(m => m.role !== 'system');
      const r = await fetch(`${base}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model, max_tokens: config.maxTokens,
          temperature: config.temperature, system: systemMsg, messages: chatMsgs,
        }),
      });
      const raw = await r.text();
      if (!r.ok) return res.status(r.status).json({ error: formatUpstreamErrorBody(raw) });
      const d = JSON.parse(raw);
      text = (d.content || [])
        .map((item) => (item && typeof item.text === 'string' ? item.text : ''))
        .join('')
        .trim();
    } else {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model, messages,
          temperature: config.temperature, max_tokens: config.maxTokens,
        }),
      });
      const raw = await r.text();
      if (!r.ok) return res.status(r.status).json({ error: formatUpstreamErrorBody(raw) });
      const d = JSON.parse(raw);
      text = extractOpenAITextContent(d.choices?.[0]?.message?.content);
    }
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: formatNodeFetchError(e) });
  }
});

// POST /api/ai/transcribe  (字节跳动 WS 语音转写，后端代理)
router.post('/transcribe', async (req, res) => {
  const apiKey = Settings.get('voice_api_key') || '';
  if (!apiKey) return res.status(400).json({ error: '请先配置语音转文字 API Key' });

  // express.raw 已将 body 解析为 Buffer
  const audioBytes = req.body;
  if (!audioBytes || audioBytes.length === 0) {
    return res.status(400).json({ error: '未收到音频数据' });
  }

  // 从 Content-Type 推断音频格式
  const ct = (req.headers['content-type'] || '').toLowerCase();
  let audioFormat = 'mp4';
  if (ct.includes('webm')) audioFormat = 'webm';
  else if (ct.includes('ogg')) audioFormat = 'ogg';
  else if (ct.includes('wav')) audioFormat = 'wav';
  else if (ct.includes('mp4') || ct.includes('m4a') || ct.includes('aac')) audioFormat = 'mp4';

  // 将音频转换为 16kHz 单声道 WAV（火山引擎只支持 pcm/wav/ogg/mp3）
  let wavBytes;
  try {
    wavBytes = await convertToWav(audioBytes, audioFormat);
  } catch (e) {
    console.error('[transcribe] convertToWav error:', e.message);
    return res.status(500).json({ error: '音频转换失败: ' + e.message });
  }

  const connectId = crypto.randomUUID();
  const wsUrl = `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`;

  const ws = new WebSocket(wsUrl, {
    headers: {
      'x-api-key': apiKey,
      'X-Api-Resource-Id': 'volc.seedasr.sauc.duration',
      'X-Api-Connect-Id': connectId,
    }
  });
  const texts = [];
  const utteranceKeys = new Set();
  const collectedUtterances = [];
  let latestResultText = '';
  let responded = false;
  const getFinalText = () => buildTextFromUtterances(collectedUtterances) || latestResultText || texts.join('');
  const done = (result) => {
    if (responded) return;
    responded = true;
    ws.terminate();
    res.json(result);
  };

  // 超时保护 30s
  const timeout = setTimeout(() => done({ text: getFinalText() }), 30000);

  ws.on('open', async () => {
    try {
      const configJson = JSON.stringify({
        audio: { format: 'wav', rate: 16000, bits: 16, channel: 1 },
        request: { model_name: 'bigmodel', enable_itn: true, enable_punc: false }
      });
      // 发送明文 JSON，不压缩
      // byte2: serialization=1(JSON) 高4位, compression=0(none) 低4位 => 0x10
      const configBuf = Buffer.from(configJson);
      const firstHeader = Buffer.from([0x11, 0x10, 0x10, 0x00]);
      const firstLen = Buffer.alloc(4);
      firstLen.writeUInt32BE(configBuf.length, 0);
      ws.send(Buffer.concat([firstHeader, firstLen, configBuf]));

      const CHUNK_SIZE = 25600;
      for (let i = 0; i < wavBytes.length; i += CHUNK_SIZE) {
        const isLast = (i + CHUNK_SIZE >= wavBytes.length);
        const chunk = wavBytes.subarray(i, i + CHUNK_SIZE);
        // byte1: message_type=2(audio-only) 高4位, specific_flags=2(last) 低4位
        const byte1 = isLast ? 0x22 : 0x20;
        const header = Buffer.from([0x11, byte1, 0x00, 0x00]);
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(chunk.length, 0);
        ws.send(Buffer.concat([header, lenBuf, chunk]));
      }
    } catch (e) {
      clearTimeout(timeout);
      done({ error: e.message });
    }
  });

  ws.on('message', (data) => {
    try {
      // 火山引擎服务端响应帧格式：
      // byte0: protocol_version(4b) + header_size(4b)   => headerSize = (byte0 & 0x0F) * 4
      // byte1: message_type(4b) + message_type_specific_flags(4b)
      // byte2: serialization_method(4b) + message_compression(4b)
      // byte3: reserved
      // bytes[headerSize .. headerSize+3]: sequence (int32 big-endian)
      // bytes[headerSize+4 .. headerSize+7]: payload_size (uint32 big-endian)
      // bytes[headerSize+8 ..]: payload
      const headerSize = (data[0] & 0x0F) * 4;
      const msgType = (data[1] >> 4) & 0x0F;
      const compression = data[2] & 0x0F;
      const payloadSize = data.readUInt32BE(headerSize + 4);
      const payloadBuf = data.subarray(headerSize + 8, headerSize + 8 + payloadSize);

      // msgType=0xF 表示错误帧
      if (msgType === 0x0F) {
        const errStr = payloadBuf.toString('utf8');
        console.error('[transcribe] server error frame:', errStr);
        clearTimeout(timeout);
        done({ error: errStr });
        return;
      }

      let json;
      // compression=1 表示 gzip，否则明文 JSON
      try {
        if (compression === 1) {
          const unzipped = zlib.gunzipSync(payloadBuf);
          json = JSON.parse(unzipped.toString('utf8'));
        } else {
          json = JSON.parse(payloadBuf.toString('utf8'));
        }
      } catch (_) {
        // 降级：尝试两种方式
        try { json = JSON.parse(payloadBuf.toString('utf8')); }
        catch (_2) {
          const unzipped = zlib.gunzipSync(payloadBuf);
          json = JSON.parse(unzipped.toString('utf8'));
        }
      }

      if (json.result) {
        const utterances = json.result.utterances || [];
        const resultText = (json.result.text || '').trim();

        if (resultText) {
          latestResultText = resultText;
        }

        for (const u of utterances) {
          if (u.definite && u.text) {
            const utteranceKey = `${u.start_time ?? ''}:${u.end_time ?? ''}:${u.text}`;
            if (utteranceKeys.has(utteranceKey)) continue;
            utteranceKeys.add(utteranceKey);
            texts.push(u.text);
            collectedUtterances.push({
              text: u.text,
              start: Number.isFinite(u.start_time) ? u.start_time : null,
              end: Number.isFinite(u.end_time) ? u.end_time : null
            });
          }
        }
      }
      if (json.is_final || json.result?.is_final) {
        clearTimeout(timeout);
        done({ text: getFinalText() });
      }
    } catch (e) {
      console.error('[transcribe] parse error:', e.message, data.slice(0, 16));
    }
  });

  ws.on('error', (e) => {
    console.error('[transcribe] ws error:', e.message);
    clearTimeout(timeout);
    done({ error: 'WebSocket 连接失败: ' + e.message });
  });

  ws.on('close', () => {
    clearTimeout(timeout);
    done({ text: getFinalText() });
  });
});

module.exports = router;
