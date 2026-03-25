/**
 * 权限管理模块
 * 统一处理录音（麦克风）、位置信息等浏览器权限的申请与状态管理
 */
App.Permissions = {
  // 权限配置
  _permissions: [
    {
      id: 'microphone',
      name: '麦克风',
      desc: '用于语音记录和语音转文字',
      icon: 'mic',
      apiName: 'microphone',  // Permissions API name
      async request() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      }
    },
    {
      id: 'location',
      name: '位置信息',
      desc: '用于记录旅行足迹和地点',
      icon: 'map-pin',
      apiName: 'geolocation',
      async request() {
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('浏览器不支持定位'));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            (err) => reject(err),
            { timeout: 8000, maximumAge: 60000 }
          );
        });
      }
    },
    {
      id: 'camera',
      name: '相机',
      desc: '用于拍照记录旅途风景',
      icon: 'camera',
      apiName: 'camera',
      async request() {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
      }
    }
  ],

  /**
   * 查询单个权限的当前状态
   * @returns 'granted' | 'denied' | 'prompt' | 'unsupported'
   */
  async queryStatus(apiName) {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: apiName });
        return result.state; // 'granted' | 'denied' | 'prompt'
      }
    } catch (e) {
      // 有些浏览器不支持某些权限的查询（如 camera）
      // 返回 'unsupported' 表示无法通过 API 查询，不代表未授权
    }
    return 'unsupported';
  },

  /**
   * 查询所有权限状态
   * @returns { microphone: 'granted', location: 'prompt', camera: 'denied' }
   */
  async queryAll() {
    const result = {};
    for (const perm of this._permissions) {
      result[perm.id] = await this.queryStatus(perm.apiName);
    }
    return result;
  },

  /**
   * 判断是否需要显示权限引导弹窗
   * 策略：
   *  1. 如果用户从未完成过引导（localStorage 没有标记），始终弹出
   *  2. 如果已完成过引导，仅当有明确为 'prompt' 状态的权限时才弹出
   *     （'unsupported' 不算未授权，因为浏览器无法查询不代表未授权）
   */
  async needsGuide() {
    const guideCompleted = localStorage.getItem('permission_guide_completed');

    // 首次访问，从未完成过引导 → 必须弹出
    if (!guideCompleted) {
      return true;
    }

    // 已完成过引导，仅当有明确处于 'prompt' 的权限时才弹出
    // 'unsupported' 的权限（如 camera）浏览器无法查询，视为已处理
    const states = await this.queryAll();
    return Object.values(states).some(s => s === 'prompt');
  },

  /**
   * 标记权限引导已完成
   */
  _markGuideCompleted() {
    localStorage.setItem('permission_guide_completed', Date.now().toString());
  },

  /**
   * 显示权限引导弹窗
   * @returns Promise<void> - 用户关闭弹窗后 resolve
   */
  showGuide() {
    return new Promise(async (resolve) => {
      const states = await this.queryAll();

      const overlay = document.createElement('div');
      overlay.className = 'permission-guide-overlay';
      overlay.innerHTML = `
        <div class="permission-guide-card">
          <div class="permission-guide-header">
            <div class="permission-guide-emoji">🕊️</div>
            <h2 class="permission-guide-title">开启旅行权限</h2>
            <p class="permission-guide-subtitle">为了更好地记录你的旅程，鸽子需要以下权限</p>
          </div>
          <div class="permission-guide-list">
            ${this._permissions.map(p => `
              <div class="permission-guide-item" data-id="${p.id}">
                <div class="permission-guide-item-icon">
                  ${App.UI.Icons.render(p.icon, 'permission-icon', { size: 22, strokeWidth: 2.2 })}
                </div>
                <div class="permission-guide-item-info">
                  <div class="permission-guide-item-name">${p.name}</div>
                  <div class="permission-guide-item-desc">${p.desc}</div>
                </div>
                <div class="permission-guide-item-status" data-status-id="${p.id}">
                  ${this._renderStatus(states[p.id])}
                </div>
              </div>
            `).join('')}
          </div>
          <div class="permission-guide-actions">
            <button class="permission-guide-btn-all" id="permission-grant-all">一键授权全部</button>
            <button class="permission-guide-btn-skip" id="permission-skip">稍后再说</button>
          </div>
          <p class="permission-guide-footnote">你可以随时在浏览器设置中管理权限</p>
        </div>
      `;
      document.body.appendChild(overlay);

      // 入场动画
      requestAnimationFrame(() => overlay.classList.add('visible'));

      const updateStatusUI = async () => {
        const newStates = await this.queryAll();
        this._permissions.forEach(p => {
          const el = overlay.querySelector(`[data-status-id="${p.id}"]`);
          if (el) el.innerHTML = this._renderStatus(newStates[p.id]);
        });
        return newStates;
      };

      // 单个权限点击
      overlay.querySelectorAll('.permission-guide-item').forEach(item => {
        item.addEventListener('click', async () => {
          const id = item.dataset.id;
          const perm = this._permissions.find(p => p.id === id);
          if (!perm) return;
          const statusEl = overlay.querySelector(`[data-status-id="${id}"]`);
          if (statusEl) statusEl.innerHTML = this._renderStatus('requesting');
          try {
            await perm.request();
          } catch (e) {
            console.warn(`权限 ${perm.name} 获取失败:`, e.message);
          }
          await updateStatusUI();
        });
      });

      // 一键授权
      const grantAllBtn = overlay.querySelector('#permission-grant-all');
      grantAllBtn.addEventListener('click', async () => {
        grantAllBtn.disabled = true;
        grantAllBtn.textContent = '正在请求权限...';
        for (const perm of this._permissions) {
          const currentState = await this.queryStatus(perm.apiName);
          // 只跳过已明确授权或明确拒绝的权限
          if (currentState === 'granted' || currentState === 'denied') continue;
          // 'prompt' 和 'unsupported' 都尝试请求
          const statusEl = overlay.querySelector(`[data-status-id="${perm.id}"]`);
          if (statusEl) statusEl.innerHTML = this._renderStatus('requesting');
          try {
            await perm.request();
          } catch (e) {
            console.warn(`权限 ${perm.name} 获取失败:`, e.message);
          }
          await updateStatusUI();
        }
        grantAllBtn.textContent = '授权完成 ✓';
        setTimeout(() => {
          close();
        }, 600);
      });

      // 跳过
      overlay.querySelector('#permission-skip').addEventListener('click', () => {
        close();
      });

      const close = () => {
        this._markGuideCompleted();
        overlay.classList.remove('visible');
        overlay.classList.add('closing');
        setTimeout(() => {
          overlay.remove();
          resolve();
        }, 300);
      };
    });
  },

  _renderStatus(state) {
    switch (state) {
      case 'granted':
      case 'unsupported':
        // 'unsupported' 表示浏览器无法查询该权限状态（如 camera），
        // 实际请求时才知道；对用户显示为"已就绪"避免混淆
        return '<span class="permission-status granted">已授权</span>';
      case 'denied':
        return '<span class="permission-status denied">已拒绝</span>';
      case 'requesting':
        return '<span class="permission-status requesting">请求中...</span>';
      case 'prompt':
      default:
        return '<span class="permission-status prompt">待授权</span>';
    }
  }
};
