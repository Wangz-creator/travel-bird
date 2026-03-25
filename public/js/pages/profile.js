App.Pages.profile = {
  _icon(name, className, options) {
    return App.UI.Icons.render(name, className || '', options || {});
  },

  _statCard(value, label, toneClass) {
    return `
      <div class="profile-stat-card">
        <div class="profile-stat-value ${toneClass || ''}">${value}</div>
        <div class="profile-stat-label">${label}</div>
      </div>
    `;
  },

  _menuRow(action, icon, title, badge, tone) {
    return `
      <button type="button" class="profile-menu-item" data-action="${action}">
        <span class="profile-menu-icon ${tone || ''}">
          ${this._icon(icon, 'profile-menu-icon-svg', { size: 18, strokeWidth: 2 })}
        </span>
        <span class="label">${title}</span>
        ${badge ? `<span class="profile-menu-badge">${badge}</span>` : ''}
        <span class="arrow">${this._icon('chevronRight', 'profile-chevron-icon', { size: 18, strokeWidth: 2 })}</span>
      </button>
    `;
  },

  render(container) {
    container.innerHTML = `
      <div class="profile-page">
        <div class="profile-header-card">
          <div class="profile-avatar">${this._icon('profile', 'profile-avatar-icon', { size: 30, strokeWidth: 1.9 })}</div>
          <div class="profile-info">
            <div class="name">旅行的鸽子</div>
            <div class="stats">正在整理你的旅程统计...</div>
          </div>
        </div>
        <div class="profile-stats-grid">
          ${this._statCard('--', '总记录', 'profile-stat-value-primary')}
          ${this._statCard('--', '日记存档', 'profile-stat-value-primary')}
          ${this._statCard('--', '旅行天数', 'profile-stat-value-primary')}
        </div>
        <div class="profile-menu">
          <div class="profile-section">
            <div class="profile-section-title">我的</div>
            <div class="profile-menu-group">
              ${this._menuRow('diary', 'book', '我的日记', '', 'tone-amber')}
              ${this._menuRow('about', 'file', '导出与关于', '', 'tone-emerald')}
            </div>
          </div>

          <div class="profile-section">
            <div class="profile-section-title">大模型配置</div>
            <div class="profile-menu-group">
              ${this._menuRow('model', 'mic', '语音转文字模型', '可配置', 'tone-purple')}
              ${this._menuRow('prompt', 'wand', 'Prompt 模板设置', '已接入', 'tone-blue')}
            </div>
          </div>

          <div class="profile-section">
            <div class="profile-section-title">系统设置</div>
            <div class="profile-menu-group">
              ${this._menuRow('notify', 'bell', '通知设置', '', 'tone-indigo')}
              ${this._menuRow('location', 'location', '定位权限', '', 'tone-cyan')}
              ${this._menuRow('storage', 'database', '存储与数据库', '', 'tone-slate')}
              ${this._menuRow('privacy', 'shield', '隐私与安全', '', 'tone-slate')}
            </div>
          </div>

          <div class="profile-footer-mark">
            ${this._icon('wand', 'profile-footer-icon', { size: 22, strokeWidth: 1.8 })}
            <span>旅行的鸽子 v1.0</span>
          </div>
        </div>
      </div>
    `;

    // 异步加载统计
    App.API.Stats.get().then(stats => {
      const el = container.querySelector('.stats');
      if (el) el.textContent = `已记录 ${stats.recordCount} 条内容 · 陪伴 ${stats.dayCount} 天`;
      const cards = container.querySelectorAll('.profile-stat-value');
      if (cards[0]) cards[0].textContent = stats.recordCount;
      if (cards[1]) cards[1].textContent = stats.diaryCount;
      if (cards[2]) cards[2].textContent = stats.dayCount;
    }).catch(() => {});

    container.querySelectorAll('.profile-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        if (action === 'diary') App.Router.pushPage('diaryList', {});
        else if (action === 'model') App.Router.pushPage('modelSettings', {});
        else if (action === 'prompt') App.Router.pushPage('promptList', {});
        else if (action === 'about') App.UI.Toast.show('旅行的鸽子 v1.0 · 记录每一段旅程', 'info');
        else if (action === 'notify') App.UI.Toast.show('通知设置即将开放', 'info');
        else if (action === 'location') App.UI.Toast.show('请在系统设置中管理定位权限', 'info');
        else if (action === 'storage') App.UI.Toast.show('数据库与存储管理功能即将开放', 'info');
        else if (action === 'privacy') App.UI.Toast.show('隐私与安全说明即将开放', 'info');
      });
    });

    return { destroy() {} };
  }
};
