const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const fs = require('fs');

const app = express();
const HTTP_PORT  = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// ===== 中间件 =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// /api/ai/transcribe 需要接收原始二进制，不用 json 解析
app.use('/api/ai/transcribe', (req, res, next) => {
  express.raw({ type: '*/*', limit: '50mb' })(req, res, next);
});

// ===== API 路由 =====
app.use('/api/records',  require('./routes/records'));
app.use('/api/diaries',  require('./routes/diaries'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/prompts',  require('./routes/prompts'));
app.use('/api/media',    require('./routes/media'));
app.use('/api/ai',       require('./routes/ai'));

// ===== 静态前端文件 =====
app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  lastModified: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ===== 打印局域网地址 =====
// 部分环境（沙盒、权限、VPN）下 os.networkInterfaces() 会抛错，不得因此退出进程
function eachLanIPv4(fn) {
  let interfaces;
  try {
    interfaces = os.networkInterfaces();
  } catch (e) {
    console.log('  （无法读取网卡信息，仍可使用 localhost；手机访问请自行查本机 IP）');
    return;
  }
  for (const addrs of Object.values(interfaces || {})) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) fn(addr.address);
    }
  }
}

function printHttpsLan() {
  eachLanIPv4((ip) => {
    console.log(`  局域网（手机用这个）：https://${ip}:${HTTPS_PORT}`);
  });
}

function printHttpLan() {
  eachLanIPv4((ip) => {
    console.log(`  局域网 HTTP：http://${ip}:${HTTP_PORT}`);
  });
}

function printAddresses(httpsReady) {
  console.log('\n🕊️  旅行的鸽子 已启动\n');
  console.log(`  本机 HTTP ：http://localhost:${HTTP_PORT}`);
  if (httpsReady) {
    console.log(`  本机 HTTPS：https://localhost:${HTTPS_PORT}`);
    printHttpsLan();
  }
  if (httpsReady) {
    console.log('\n  ⚠️  手机首次访问 HTTPS 地址时，需点击「高级」→「继续访问」忽略证书警告\n');
  } else {
    console.log('\n  ⚠️  无 TLS 证书时手机麦克风不可用；可在 server/certs 生成 cert.pem / key.pem 后重启\n');
  }
}

function startHttpServer() {
  const srv = http.createServer(app);
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ⚠️  HTTP 端口 ${HTTP_PORT} 已被占用，已跳过本机 HTTP（HTTPS 与手机访问不受影响）。\n`);
      return;
    }
    throw err;
  });
  srv.listen(HTTP_PORT, '0.0.0.0', () => {
    printHttpLan();
  });
}

const certDir = path.join(__dirname, 'certs');
const certPath = path.join(certDir, 'cert.pem');
const keyPath  = path.join(certDir, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsOptions = {
    cert: fs.readFileSync(certPath),
    key:  fs.readFileSync(keyPath),
  };
  const httpsSrv = https.createServer(httpsOptions, app);
  httpsSrv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  HTTPS 端口 ${HTTPS_PORT} 已被占用，无法启动。可设置环境变量 HTTPS_PORT 换端口后重试。\n`);
      process.exit(1);
    }
    throw err;
  });
  // 先起 HTTPS：避免本机 HTTP 端口被其他项目占用时进程在绑定 3000 处崩溃，导致 3443 从未监听
  httpsSrv.listen(HTTPS_PORT, '0.0.0.0', () => {
    printAddresses(true);
    startHttpServer();
  });
} else {
  console.log('\n🕊️  旅行的鸽子 已启动（仅 HTTP，麦克风在手机上不可用）\n');
  const srv = http.createServer(app);
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  HTTP 端口 ${HTTP_PORT} 已被占用。可设置环境变量 PORT 换端口，或结束占用该端口的进程。\n`);
    }
    throw err;
  });
  srv.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`  本机访问：http://localhost:${HTTP_PORT}`);
    printHttpLan();
    console.log('');
  });
}
