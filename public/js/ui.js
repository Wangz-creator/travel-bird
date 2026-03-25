App.UI = App.UI || {};

App.UI.Toast = {
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  show(message, type = 'info', options = {}) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);
    if (options.action) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = options.action.text;
      btn.onclick = () => {
        options.action.onClick();
        toast.remove();
      };
      toast.appendChild(btn);
    }
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
};

App.UI.Modal = {
  confirm(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-box">
          <div class="modal-title">${title}</div>
          <div class="modal-message">${message}</div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-cancel">取消</button>
            <button type="button" class="modal-btn modal-btn-confirm">确定</button>
          </div>
        </div>
      `;
      const close = (value) => {
        overlay.remove();
        resolve(value);
      };
      overlay.addEventListener('click', (e) => e.stopPropagation());
      overlay.querySelector('.modal-btn-cancel').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      };
      overlay.querySelector('.modal-btn-confirm').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      };
      document.body.appendChild(overlay);
    });
  }
};

App.UI.Icons = {
  render(name, className = '', options = {}) {
    const strokeWidth = options.strokeWidth || 1.8;
    const size = options.size || 24;
    const filled = options.filled ? ' fill="currentColor"' : '';
    const paths = {
      home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
      timeline: '<path d="M8 7h13"/><path d="M8 12h13"/><path d="M8 17h13"/><path d="M3.5 7h.01"/><path d="M3.5 12h.01"/><path d="M3.5 17h.01"/>',
      profile: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 20a8 8 0 0 1 16 0"/>',
      mic: '<path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/><path d="M8 21h8"/>',
      camera: '<path d="M4 8h3l2-2h6l2 2h3v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.5"/>',
      pen: '<path d="m12 20 7-7"/><path d="M4 20l3.5-.7L18 8.8 15.2 6 4.7 16.5 4 20Z"/><path d="m13.8 7.3 2.9 2.9"/>',
      book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21Z"/><path d="M5 5.5V21"/><path d="M9 7h7"/>',
      file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/>',
      wand: '<path d="m7 21 10-10"/><path d="m15 5 1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/><path d="m5 13 1.2-2.3L8.5 9.5l-2.3-1.2L5 6l-1.2 2.3L1.5 9.5l2.3 1.2L5 13Z"/>',
      settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2H9a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6Z"/>',
      bell: '<path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"/><path d="M10 17a2 2 0 0 0 4 0"/>',
      location: '<path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z"/><circle cx="12" cy="10" r="2.3"/>',
      database: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
      shield: '<path d="M12 3 5 6v5c0 5 3.4 8.6 7 10 3.6-1.4 7-5 7-10V6l-7-3Z"/><path d="m9.5 12 1.7 1.7 3.3-3.3"/>',
      chevronRight: '<path d="m9 6 6 6-6 6"/>',
      send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4 18-7Z"/>',
      text: '<path d="M5 6h14"/><path d="M8 6v12"/><path d="M16 6v12"/><path d="M9 18h6"/>',
      photo: '<path d="M4 6h16v12H4z"/><circle cx="9" cy="10" r="1.5"/><path d="m20 15-4.5-4.5L8 18"/>'
    };
    const path = paths[name] || paths.home;
    const classAttr = className ? ` class="${className}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg"${classAttr} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${filled}>${path}</svg>`;
  }
};

App.UI.GestureRecognizer = {
  attach(element, handlers) {
    const SWIPE_THRESHOLD = 80;       // 上滑距离阈值（px）
    const LONG_PRESS_DELAY = 600;     // 长按触发时间（ms）
    const MOVE_CANCEL_DIST = 15;      // 移动超过此距离取消长按等待

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let longPressTimer = null;
    let isLongPress = false;
    let isSwiping = false;
    let gestureAborted = false;        // 手指大幅移动，放弃手势识别

    element.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      isLongPress = false;
      isSwiping = false;
      gestureAborted = false;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        handlers.onLongPressStart?.();
      }, LONG_PRESS_DELAY);
    });

    element.addEventListener('touchmove', (e) => {
      if (gestureAborted) return;
      const curX = e.touches[0].clientX;
      const curY = e.touches[0].clientY;
      const deltaY = touchStartY - curY;           // 正值=向上
      const absDeltaX = Math.abs(curX - touchStartX);

      // 如果水平移动比垂直移动大，说明是横向滑动，放弃手势
      if (absDeltaX > Math.abs(deltaY) && absDeltaX > MOVE_CANCEL_DIST) {
        clearTimeout(longPressTimer);
        if (isLongPress) { handlers.onLongPressCancel?.(); isLongPress = false; }
        gestureAborted = true;
        return;
      }

      // 长按中：如果手指移动较远，取消录音
      if (isLongPress && (deltaY > SWIPE_THRESHOLD || Math.abs(deltaY) > MOVE_CANCEL_DIST * 3)) {
        handlers.onLongPressCancel?.();
        isLongPress = false;
        clearTimeout(longPressTimer);
        return;
      }

      // 非长按：手指移动超过小距离就取消长按计时
      if (!isLongPress && Math.abs(deltaY) > MOVE_CANCEL_DIST) {
        clearTimeout(longPressTimer);
      }

      // 检测上滑手势（必须是明确的向上滑动，且垂直为主）
      if (!isLongPress && deltaY > SWIPE_THRESHOLD && deltaY > absDeltaX * 1.5) {
        if (!isSwiping) isSwiping = true;
      }
    });

    const onTouchFinish = ({ cancelled = false } = {}) => {
      clearTimeout(longPressTimer);
      if (gestureAborted) return;
      if (isLongPress) {
        isLongPress = false;
        handlers.onLongPressEnd?.();
      } else if (!cancelled && isSwiping) {
        handlers.onSwipeUp?.();
      } else if (!isSwiping) {
        const elapsed = Date.now() - touchStartTime;
        if (elapsed < LONG_PRESS_DELAY) handlers.onTap?.();
      }
    };
    element.addEventListener('touchend', () => onTouchFinish());
    element.addEventListener('touchcancel', () => onTouchFinish({ cancelled: true }));

    // 鼠标兼容（PC 调试）
    let mouseDown = false;
    let mouseAborted = false;
    element.addEventListener('mousedown', (e) => {
      mouseDown = true;
      mouseAborted = false;
      touchStartX = e.clientX;
      touchStartY = e.clientY;
      touchStartTime = Date.now();
      isLongPress = false;
      isSwiping = false;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        handlers.onLongPressStart?.();
      }, LONG_PRESS_DELAY);
    });
    element.addEventListener('mousemove', (e) => {
      if (!mouseDown || mouseAborted) return;
      const deltaY = touchStartY - e.clientY;
      const absDeltaX = Math.abs(e.clientX - touchStartX);
      if (absDeltaX > Math.abs(deltaY) && absDeltaX > MOVE_CANCEL_DIST) {
        clearTimeout(longPressTimer);
        mouseAborted = true;
        return;
      }
      if (!isLongPress && deltaY > SWIPE_THRESHOLD && deltaY > absDeltaX * 1.5) {
        clearTimeout(longPressTimer);
        if (!isSwiping) { isSwiping = true; handlers.onSwipeUp?.(); mouseDown = false; }
      }
    });
    element.addEventListener('mouseup', () => {
      if (!mouseDown) return;
      mouseDown = false;
      clearTimeout(longPressTimer);
      if (mouseAborted) return;
      if (isLongPress) {
        handlers.onLongPressEnd?.();
      } else if (!isSwiping) {
        const elapsed = Date.now() - touchStartTime;
        if (elapsed < LONG_PRESS_DELAY) handlers.onTap?.();
      }
    });
  }
};

App.UI.StreamRenderer = {
  create(container) {
    return {
      _el: container,
      append(text) {
        this._el.textContent += text;
        this._el.scrollTop = this._el.scrollHeight;
      },
      reset() { this._el.textContent = ''; },
      setFull(text) { this._el.textContent = text; }
    };
  }
};

App.UI.Recorder = {
  _mediaRecorder: null,
  _chunks: [],
  _stream: null,

  _getMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  },

  async start() {
    this._chunks = [];
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = this._getMimeType();
    this._mediaRecorder = new MediaRecorder(this._stream, mimeType ? { mimeType } : {});
    this._mimeType = this._mediaRecorder.mimeType || mimeType || 'audio/webm';
    this._mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };
    this._mediaRecorder.start(100);
  },

  stop() {
    return new Promise((resolve) => {
      if (!this._mediaRecorder || this._mediaRecorder.state !== 'recording') {
        resolve(null); return;
      }
      this._mediaRecorder.onstop = () => {
        const blob = new Blob(this._chunks, { type: this._mimeType });
        this._stream.getTracks().forEach(t => t.stop());
        resolve(blob);
      };
      this._mediaRecorder.stop();
    });
  },

  cancel() {
    if (this._mediaRecorder?.state === 'recording') this._mediaRecorder.stop();
    this._stream?.getTracks().forEach(t => t.stop());
    this._chunks = [];
  }
};
