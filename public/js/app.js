async function doInit() {
  document.getElementById('app').innerHTML = `
    <div class="loading-screen">
      <div class="loading-video-wrap">
        <video class="loading-video" autoplay loop muted playsinline>
          <source src="/img/pigeon-flap.mp4" type="video/mp4">
        </video>
      </div>
      <div class="text">旅行的鸽子 · 正在起飞...</div>
    </div>
  `;

  // 从服务端加载设置缓存，供同步 Settings.get() 使用
  await App.API.init();

  // 主动申请麦克风权限（触发系统弹窗）
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
  } catch (e) {
    // 权限被拒绝或不支持，不阻塞启动，录音时再提示
    console.warn('麦克风权限未授权:', e.message);
  }

  // 初始化路由和渲染
  App.Router.init();
  App.Router.switchTab('home');
}

doInit().catch(e => {
  console.error('启动失败:', e);
  document.getElementById('app').innerHTML = `
    <div class="error-screen">
      <h2>启动失败</h2>
      <p>${e.message}</p>
      <button onclick="location.reload()">重试</button>
    </div>
  `;
});
