App.AI = App.AI || {};
App.AI.ASSISTANT_BOOTSTRAP_USER_MESSAGE = '我选好了要聊的记录，请你先开口和我聊聊这些记录吧。';

// ===== 核心 AI 调用（通过后端代理）=====
App.AI.chatStream = async function({ messages, onChunk, onDone, onError }) {
  try {
    const res = await fetch('/api/ai/chat-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let doneCalled = false;
    const finish = () => {
      if (doneCalled) return;
      doneCalled = true;
      onDone(fullText);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.error) { onError(new Error(event.error)); return; }
          if (event.chunk) { fullText += event.chunk; onChunk(event.chunk, fullText); }
          if (event.done) { finish(); }
        } catch (_) {}
      }
    }
    finish();
  } catch (e) {
    onError(e);
  }
};

App.AI.chat = async function({ messages }) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });
  if (!res.ok) throw new Error('AI 请求失败');
  const data = await res.json();
  return data.text || '';
};

App.AI.describePhoto = async function(filename) {
  if (!filename) return '';
  const provider = App.API.Settings.get('assistant_provider') || 'openai';
  const image = await App.API.FileStore.getImagePayload(filename);
  const prompt = [
    '请根据这张照片生成一段中文画面总结。',
    '要求：',
    '1. 只描述画面里清晰可见的内容，不要编造',
    '2. 控制在 30-50 字左右',
    '3. 适合直接作为照片上方说明，语气自然',
    '4. 不要使用标题、引号、项目符号或 markdown',
  ].join('\n');
  const messages = provider === 'anthropic'
    ? [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mimeType,
                data: image.base64
              }
            }
          ]
        }
      ]
    : [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: image.dataUrl }
            }
          ]
        }
      ];
  const raw = await App.AI.chat({ messages });
  return App.AI.normalizePhotoSummary(raw);
};

App.AI.normalizePhotoSummary = function(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  const fence = text.match(/^```(?:text)?\s*([\s\S]*?)```$/m);
  if (fence) text = fence[1].trim();
  text = text
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 80) text = text.slice(0, 80).trim();
  return text;
};

App.AI.hasMeaningfulSupplementInput = function(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?~～…“”"'‘’（）()\[\]【】\-—]/g, '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  const fillerSet = new Set([
    '嗯', '恩', '噢', '哦', '啊', '额', '唉', '哈', '哈哈', '哈哈哈',
    '行', '可以', '好的', '好', '是', '是的', '对', '对的', '对啊',
    '还行', '还好', '不错', '一般', '没有', '没了', '没事', '就这样'
  ]);
  if (fillerSet.has(normalized)) return false;
  return normalized.length >= 4;
};

App.AI.fillPhotoCaptionIfNeeded = async function({ recordId, filename, caption, voiceMediaFilename }) {
  if (!recordId || !filename) return '';
  if (String(caption || '').trim()) return '';
  if (voiceMediaFilename) return '';
  try {
    const summary = await App.AI.describePhoto(filename);
    if (!summary) return '';
    const latest = await App.API.Records.queryByIds([recordId]);
    const current = latest && latest[0];
    if (!current || String(current.caption || '').trim()) return '';
    await App.API.Records.update(recordId, { caption: summary });
    if (App.Pages.timeline && App.Pages.timeline._renderList) {
      App.Pages.timeline._renderList();
    }
    return summary;
  } catch (e) {
    console.warn('photo caption autofill skipped:', e);
    return '';
  }
};

App.AI.DiaryMedia = {
  markerFor(filename) {
    return `[[image:${String(filename || '').trim()}]]`;
  },

  isMarker(line) {
    return /^\[\[image:[^\]\n]+\]\]$/.test(String(line || '').trim());
  },

  parseMarker(line) {
    const match = String(line || '').trim().match(/^\[\[image:([^\]\n]+)\]\]$/);
    return match ? match[1].trim() : '';
  },

  collectPhotoFilenames(records) {
    const seen = new Set();
    const filenames = [];
    (records || []).forEach((record) => {
      const mediaList = Array.isArray(record.media_filenames) ? record.media_filenames : [];
      mediaList.forEach((filename) => {
        const name = String(filename || '').trim();
        if (!name || seen.has(name)) return;
        seen.add(name);
        filenames.push(name);
      });
      if (record?.type === 'photo') {
        const single = String(record.media_filename || '').trim();
        if (single && !seen.has(single)) {
          seen.add(single);
          filenames.push(single);
        }
      }
    });
    return filenames;
  },

  injectImageMarkers(content, records) {
    const text = String(content || '').trim();
    const filenames = this.collectPhotoFilenames(records);
    if (!filenames.length) return text;
    if (!text) {
      return filenames.map((filename) => this.markerFor(filename)).join('\n\n');
    }
    const paragraphs = text.split(/\n\s*\n+/).map((item) => item.trim()).filter(Boolean);
    if (!paragraphs.length) {
      return [text, ...filenames.map((filename) => this.markerFor(filename))].join('\n\n');
    }
    const inserts = new Map();
    filenames.forEach((filename, index) => {
      const slot = Math.max(1, Math.ceil(((index + 1) * paragraphs.length) / filenames.length));
      if (!inserts.has(slot)) inserts.set(slot, []);
      inserts.get(slot).push(this.markerFor(filename));
    });
    const blocks = [];
    paragraphs.forEach((paragraph, index) => {
      const position = index + 1;
      blocks.push(paragraph);
      const markerLines = inserts.get(position) || [];
      markerLines.forEach((marker) => blocks.push(marker));
    });
    return blocks.join('\n\n');
  },

  parseContent(content) {
    const blocks = [];
    const markerRe = /\[\[image:([^\]\n]+)\]\]/g;
    const source = String(content || '');
    let lastIndex = 0;
    let match;
    while ((match = markerRe.exec(source))) {
      const text = source.slice(lastIndex, match.index).trim();
      if (text) blocks.push({ type: 'text', text });
      const filename = String(match[1] || '').trim();
      if (filename) blocks.push({ type: 'image', filename });
      lastIndex = match.index + match[0].length;
    }
    const tail = source.slice(lastIndex).trim();
    if (tail) blocks.push({ type: 'text', text: tail });
    if (!blocks.length) blocks.push({ type: 'text', text: source.trim() });
    return blocks;
  },

  toPlainText(content) {
    return this.parseContent(content)
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }
};

/** 解析按记录拆分的补充 JSON；成功返回 { parsed:true, map }，否则 { parsed:false } */
App.AI.parseSupplementMap = function (raw, validIds) {
  const idSet = new Set(validIds.map(String));
  let s = (raw || '').trim();
  if (!s) return { parsed: false };
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence) s = fence[1].trim();
  const i0 = s.indexOf('{');
  const i1 = s.lastIndexOf('}');
  if (i0 !== -1 && i1 > i0) s = s.slice(i0, i1 + 1);
  try {
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { parsed: false };
    const map = {};
    for (const id of idSet) {
      if (!Object.prototype.hasOwnProperty.call(obj, id)) continue;
      const v = obj[id];
      if (v != null && String(v).trim()) map[id] = String(v).trim();
    }
    return { parsed: true, map };
  } catch (_) {
    return { parsed: false };
  }
};

App.AI.transcribeAudio = async function(audioBlob) {
  const mimeType = audioBlob.type || 'audio/mp4';
  const res = await fetch('/api/ai/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
    body: audioBlob
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '转写失败');
  }
  const data = await res.json();
  return data.text || '';
};

// ===== Context 构建 =====
App.AI.Context = {
  async buildInitialContext(selectedRecords) {
    const recordTexts = [];
    for (const r of selectedRecords) {
      let desc = `[${r.type}] ${new Date(r.created_at).toLocaleString('zh-CN')}`;
      if (r.address) desc += ` @ ${r.address}`;
      if (r.type === 'text') desc += `\n内容：${r.content}`;
      if (r.type === 'voice') desc += `\n语音转写：${r.content}`;
      if (r.type === 'photo') {
        desc += `\n[照片]`;
        if (r.caption) desc += `\n说明：${r.caption}`;
      }
      if (r.ai_supplement) desc += `\n[AI补充]：${r.ai_supplement}`;
      recordTexts.push(desc);
    }
    return recordTexts.join('\n---\n');
  },

  /** 单行摘要，供补充信息按记录分拣时标识各条记录 */
  buildRecordsIndexForSupplement(selectedRecords) {
    const oneLine = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 150);
    return selectedRecords
      .map((r) => {
        const parts = [`ID:${r.record_id}`, `[${r.type}]`, new Date(r.created_at).toLocaleString('zh-CN')];
        if (r.address) parts.push(`@${r.address}`);
        if (r.type === 'text') parts.push(oneLine(r.content));
        else if (r.type === 'voice') parts.push(`语音:${oneLine(r.content)}`);
        else if (r.type === 'photo') parts.push(r.caption ? oneLine(r.caption) : '[照片]');
        return parts.join(' ');
      })
      .join('\n');
  },

  renderPrompt(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
  }
};

// ===== 默认 Prompts =====
App.AI.DefaultPrompts = {
  p1_assistant: `你是「旅行的鸽子」的AI助手，一只温柔、机灵、很会陪人回忆细节的小鸽子。

你的目标：基于用户选中的旅行/生活记录，用 2-3 轮简短对话，帮用户补出之后写文案最有用的真实细节，例如场景、人物、动作、味道、情绪、转折和印象最深的瞬间。

当前记录上下文：
{{records}}

{{multi_record_note}}

对话要求：
1. 你负责先开口。第一条消息必须控制在 50 字以内，只问 1 个最值得展开的问题，不要寒暄，不要先总结一大段。
2. 后续每次只问 1 个问题，优先追问最能让内容变具体的细节，不要连问，不要像采访提纲。
3. 问题必须贴着记录来问，尽量点明时间、地点、事件、照片内容或用户原话，帮助用户回到当时的画面里。
4. 优先深挖这些信息：发生了什么、最有记忆点的细节、和谁在一起、看到了什么/吃到了什么/听到了什么、为什么印象深、当时心情如何。
5. 如果用户回答很短，就顺着那一点继续问；如果用户说想不起来、没了、跳过或明显不想多聊，不要硬追问。
6. 信息已经够用、聊了 2-3 轮、或用户不想继续时，友好地告诉用户"素材已经差不多了，可以点右上角的「跳过」按钮来选择生成方式"，然后等待用户操作，不要继续追问。
7. 不要在对话里直接替用户写成完整文案，不要虚构用户没说过的事实。
8. 语气像朋友聊天，轻松、真诚、自然。`,

  p2_supplement: `你是一个记录整理助手。请根据下列「记录列表」和「用户补充内容」，把用户新说出的事实细节按记录 ID 归档。

记录列表（JSON 的键必须与下列 ID 完全一致）：
{{records_index}}

用户补充内容（以下每行均为用户本人说的话，不含 AI 回复）：
{{conversation}}

规则：
1. 只提取用户新说出的信息；记录原文里已经有的内容不要重复。
2. 只保留事实性细节（人物、地点、感受、细节描述等），不要推测，不要扩写成文案。
3. 多条记录时，若某条信息无法明确对应到某一条，就不要硬分配；只有一条记录时直接归入该条。
4. 每个值都用简短自然中文，尽量 10-40 字，最多 50 字。
5. 只输出一个 JSON 对象，不要 markdown，不要解释，不要额外文本。
6. 键必须是记录 ID 字符串；某条没有新增信息时填空字符串 ""。
7. 如果所有内容都没有有效新增信息，输出 {}。`,

  p3_xiaohongshu: `你是一位擅长把真实经历写成「有分享感、不过分用力」的小红书文案助手。请根据以下记录和对话内容，生成一篇可直接发布的小红书图文笔记。

记录内容：
{{records}}

对话补充：
{{conversation}}

输出要求：
1. 标题不超过 18 字，可带 0-1 个 emoji，像真实分享，不要标题党。
2. 正文控制在 150-250 字左右，分 2-4 小段，重点写具体体验和真实感受。
3. 正文优先写清楚：去了哪里/做了什么、最有画面的细节、个人感受或一句真诚建议。
4. 语气自然、有分享欲，像刚旅行回来发笔记，不要广告腔，不要空话套话。
5. 结尾加一句轻互动即可，不要太刻意。
6. 标签写 3-6 个，紧扣地点、玩法或主题，使用 # 格式。
7. 只能基于现有记录和对话写，不要编造价格、路线、店名、天气等未出现的信息。
8. 必须输出完整成稿，不要半截句子，不要解释说明。

输出格式：
【标题】
（标题内容）

【正文】
（正文内容）

【标签】
（标签内容）`,

  p4_moments: `请根据以下记录和对话内容，生成一条可直接发布的微信朋友圈文案。

记录内容：
{{records}}

对话补充：
{{conversation}}

输出要求：
1. 控制在 100-180 字左右，像当天随手发的真实分享。
2. 口语化、有生活感，既写见闻，也带一点当下心情。
3. 可带 0-2 个表情，但不要太多，不要浮夸。
4. 不要标题，不要标签，不要分点。
5. 可以有一点幽默或感慨，但不要写成旅游宣传文案。
6. 只基于已有信息组织内容，不要编造没出现过的事实。
7. 必须是一条完整文案，有自然收尾。

直接输出文案内容，不要加任何格式标记。`,

  p5_diary: `你是一位擅长整理个人经历的日记助手。请把这些记录和对话补充，整理成一篇可直接保存的中文日记。

记录内容：
{{records}}

对话补充：
{{conversation}}

日期：{{date}}

输出要求：
1. 用第一人称书写，像我在当天晚上认真写下来的日记，真实、不端着。
2. 按当天经历自然展开，可按时间线，也可按“开始-经过-收尾”组织，但要连贯好读。
3. 写出具体细节：地点氛围、食物/天气/声音、路上看到的人和事、让我记住的瞬间。
4. 写出情绪变化、当时的小念头，以及一天结束后的回味。
5. 正文控制在 600-900 字左右；素材较少时可以略短，但仍要有完整开头、经过、结尾。
6. 不要在正文第一句重复日期（日期已单独标注），直接从当天的内容写起。
7. 只基于已有信息合理组织，不要编造明确事实。
8. 不要标题，不要标签，不要解释，直接输出日记正文。`,

  p6_optimize: `你是「旅行的鸽子」结果页的文案优化助手。用户会给你一段已经生成的内容和一条优化指令，请输出修改后的完整成稿。

当前内容：
{{content}}

平台：{{platform}}

用户指令：{{instruction}}

要求：
1. 优先执行用户指令，但尽量保留原文里已经明确的事实信息，不要新增未提供的事实。
2. 如果用户没有要求大改，就不要擅自改变原文的核心经历、情绪和表达重心。
3. 保持原有平台风格：
   - xiaohongshu：保留【标题】【正文】【标签】结构；若用户未另行指定，正文尽量仍保持 150-250 字左右。
   - moments：保持朋友圈口吻，不要加标题和标签。
   - diary：保持日记口吻和完整叙述，不要加标题和标签。
4. 如果用户只要求调整语气、字数、顺序、精简或润色，就只做对应修改，不要额外发挥。
5. 直接输出修改后的完整内容，不要解释修改思路，不要使用 markdown 代码块。`,
};

// ===== Assistant 状态机 =====
App.AI.Assistant = {
  _messages: [],
  _selectedRecords: [],
  _recordsContext: '',
  _abortController: null,
  _lastSupplementConversation: '',

  async init(selectedRecords) {
    this._selectedRecords = selectedRecords;
    this._messages = [];
    this._recordsContext = await App.AI.Context.buildInitialContext(selectedRecords);
    this._lastSupplementConversation = '';
    App.State.set('assistantPhase', 'understanding');
    App.State.set('assistantMessages', []);
    await this.startChatPhase();
  },

  async startChatPhase() {
    App.State.set('assistantPhase', 'chatting');
    const promptTemplate = (await App.API.Prompts.get('p1_assistant')) || App.AI.DefaultPrompts.p1_assistant;
    const n = this._selectedRecords.length;
    const multiRecordNote =
      n > 1
        ? `【多选记录】用户一次选中了 ${n} 条。追问时请用记录里的时间、地点、类型或原文中的关键词点明你在问哪一条；优先分轮深挖（先聊透一条再自然过渡到下一条）。若用户把多条混在一起回答，下一轮可温和确认「这段主要是在说……那条对吧？」便于把细节对应到各条记录。`
        : '';
    const systemPrompt = App.AI.Context.renderPrompt(promptTemplate, {
      records: this._recordsContext,
      multi_record_note: multiRecordNote,
    });
    // 部分上游（如 LiteLLM / 通义等）要求 messages 中至少含一条 role=user，仅 system 会报 InvalidParameter
    this._messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: App.AI.ASSISTANT_BOOTSTRAP_USER_MESSAGE }
    ];
    await this._getAIResponse();
  },

  async sendMessage(text) {
    this._messages.push({ role: 'user', content: text });
    App.State.set('assistantMessages', [...App.State.get('assistantMessages'), { role: 'user', content: text }]);
    await this._getAIResponse();
    await this._maybeWriteBackSupplement();
  },

  async _getAIResponse() {
    this._abortController = new AbortController();
    App.State.set('assistantMessages', [
      ...App.State.get('assistantMessages'),
      { role: 'assistant', content: '', isStreaming: true }
    ]);
    await App.AI.chatStream({
      messages: this._messages,
      onChunk: (chunk, full) => {
        const msgs = App.State.get('assistantMessages');
        msgs[msgs.length - 1] = { role: 'assistant', content: full, isStreaming: true };
        App.State.set('assistantMessages', [...msgs]);
      },
      onDone: (full) => {
        this._messages.push({ role: 'assistant', content: full });
        const msgs = App.State.get('assistantMessages');
        msgs[msgs.length - 1] = { role: 'assistant', content: full, isStreaming: false };
        App.State.set('assistantMessages', [...msgs]);
      },
      onError: (e) => {
        App.UI.Toast.show('AI 调用失败：' + e.message, 'error');
      }
    });
  },

  enterPlatformSelection() {
    App.State.set('assistantPhase', 'platform');
  },

  /** 从「选择平台」回到对话（不关闭助手页） */
  backToChatFromPlatform() {
    if (App.State.get('assistantPhase') !== 'platform') return;
    App.State.set('assistantPhase', 'chatting');
  },

  async generateContent(platform) {
    App.State.set('assistantPhase', 'generating');
    const conversationText = this._messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}：${m.content}`)
      .join('\n');

    const promptMap = { xiaohongshu: 'p3_xiaohongshu', moments: 'p4_moments', diary: 'p5_diary' };
    const promptKey = promptMap[platform];
    const promptTemplate = (await App.API.Prompts.get(promptKey)) || App.AI.DefaultPrompts[promptKey];
    const systemPrompt = App.AI.Context.renderPrompt(promptTemplate, {
      records: this._recordsContext,
      conversation: conversationText,
      platform,
      date: new Date().toLocaleDateString('zh-CN'),
    });

    await App.AI.chatStream({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请开始生成。' }
      ],
      onChunk: (chunk, full) => {
        App.State.set('generatedContent', { platform, content: full, isStreaming: true });
      },
      onDone: async (full) => {
        App.State.set('generatedContent', { platform, content: full, isStreaming: false });
        App.State.set('contentVersionStack', [full]);
        App.State.set('assistantPhase', 'done');
        await this._maybeWriteBackSupplement();
        if (platform === 'diary') {
          const diaryContent = App.AI.DiaryMedia.injectImageMarkers(full, this._selectedRecords);
          const diaryId = await App.API.Diaries.create({
            title: new Date().toLocaleDateString('zh-CN') + ' 日记',
            content: diaryContent,
            recordIds: this._selectedRecords.map(r => r.record_id),
            platform: 'diary',
          });
          App.UI.Toast.show('已存入日记', 'success', {
            action: { text: '点击查看', onClick: () => App.Router.pushPage('diaryDetail', { diaryId }) }
          });
        }
      },
      onError: (e) => {
        App.UI.Toast.show('内容生成失败：' + e.message, 'error');
      }
    });
  },

  _buildMeaningfulUserConversation() {
    const userInputs = this._messages
      .filter((m) => m.role === 'user')
      .map((m) => String(m.content || '').trim())
      .filter((text) => text && text !== App.AI.ASSISTANT_BOOTSTRAP_USER_MESSAGE)
      .filter((text) => App.AI.hasMeaningfulSupplementInput(text));
    if (!userInputs.length) return '';
    return userInputs.map((text) => `用户：${text}`).join('\n');
  },

  async _maybeWriteBackSupplement() {
    const userConversationText = this._buildMeaningfulUserConversation();
    if (!userConversationText) return;
    if (userConversationText === this._lastSupplementConversation) return;
    await this._extractAndWriteBack(userConversationText);
    this._lastSupplementConversation = userConversationText;
  },

  async _extractAndWriteBack(userConversationText) {
    const recordsIndex = App.AI.Context.buildRecordsIndexForSupplement(this._selectedRecords);
    const promptTemplate = (await App.API.Prompts.get('p2_supplement')) || App.AI.DefaultPrompts.p2_supplement;
    const systemPrompt = App.AI.Context.renderPrompt(promptTemplate, {
      conversation: userConversationText,
      records_index: recordsIndex,
    });
    const supplementRaw = await App.AI.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请按记录输出 JSON。' }
      ]
    });
    const ids = this._selectedRecords.map((r) => r.record_id);
    const { parsed, map } = App.AI.parseSupplementMap(supplementRaw, ids);
    if (parsed) {
      for (const r of this._selectedRecords) {
        const v = map[String(r.record_id)];
        if (v) await App.API.Records.updateSupplement(r.record_id, v);
      }
      if (App.Pages.timeline && App.Pages.timeline._renderList) App.Pages.timeline._renderList();
      return;
    }
    const legacy = (supplementRaw || '').trim();
    if (!legacy) return;
    if (this._selectedRecords.length === 1) {
      await App.API.Records.updateSupplement(this._selectedRecords[0].record_id, legacy);
      if (App.Pages.timeline && App.Pages.timeline._renderList) App.Pages.timeline._renderList();
      return;
    }
    App.UI.Toast.show('未能按记录拆分补充信息（需 JSON）。可在提示词中保留 {{records_index}} 并重试。', 'warning');
  },

  async optimizeContent(instruction) {
    const current = App.State.get('generatedContent');
    const promptTemplate = (await App.API.Prompts.get('p6_optimize')) || App.AI.DefaultPrompts.p6_optimize;
    const systemPrompt = App.AI.Context.renderPrompt(promptTemplate, {
      content: current.content,
      platform: current.platform,
      instruction,
    });
    const stack = App.State.get('contentVersionStack');
    stack.push(current.content);
    App.State.set('contentVersionStack', [...stack]);
    await App.AI.chatStream({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: instruction }
      ],
      onChunk: (chunk, full) => {
        App.State.set('generatedContent', { ...current, content: full, isStreaming: true });
      },
      onDone: (full) => {
        App.State.set('generatedContent', { ...current, content: full, isStreaming: false });
      },
      onError: (e) => {
        App.UI.Toast.show('优化失败：' + e.message, 'error');
      }
    });
  },

  undoOptimize() {
    const stack = App.State.get('contentVersionStack');
    if (stack.length <= 1) return;
    stack.pop();
    const previous = stack[stack.length - 1];
    const current = App.State.get('generatedContent');
    App.State.set('generatedContent', { ...current, content: previous });
    App.State.set('contentVersionStack', [...stack]);
  },

  abort() {
    this._abortController?.abort();
  }
};
