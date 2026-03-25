App.Pages.promptList = {
  render(container) {
    const prompts = [
      { key: 'p1_assistant', name: '🕊️ 助手开场提问' },
      { key: 'p2_supplement', name: '📝 补充信息提炼' },
      { key: 'p3_xiaohongshu', name: '📕 小红书文案' },
      { key: 'p4_moments', name: '💬 朋友圈文案' },
      { key: 'p5_diary', name: '📔 日记生成' },
      { key: 'p6_optimize', name: '✨ 内容优化' },
    ];

    container.innerHTML = `
      <div class="prompt-list-page">
        <div class="page-header">
          <button class="back-btn" id="pl-back">←</button>
          <span class="title">Prompt 设置</span>
        </div>
        <div class="prompt-list-content" id="pl-list"></div>
      </div>
    `;
    container.querySelector('#pl-back').addEventListener('click', () => App.Router.popPage());

    const listEl = container.querySelector('#pl-list');
    prompts.forEach(p => {
      const item = document.createElement('div');
      item.className = 'prompt-item';
      item.innerHTML = `
        <div class="prompt-item-info">
          <div class="prompt-key">${p.key}</div>
          <div class="prompt-name">${p.name}</div>
        </div>
        <span class="arrow">›</span>
      `;
      item.addEventListener('click', () => App.Router.pushPage('promptEdit', { promptKey: p.key, promptName: p.name }));
      listEl.appendChild(item);
    });

    return { destroy() {} };
  }
};
